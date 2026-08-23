import { createHash } from 'node:crypto'
import type { MetricValue } from '../types.js'
import type { Queryable } from '../repository.js'

export type AttributionPolicy = {
  version: number
  model: 'first_touch' | 'last_touch' | 'linear'
  windowDays: number
  eligibleEventTypes: string[]
  identityResolution: 'exact_contact' | 'exact_lead' | 'declared_binding'
  currency: 'BRL'
  lateEvents: 'ignore' | 'reopen_evaluation'
}

export type AttributionEvent = {
  id: string
  eventType: string
  occurredAt: string
  observedAt?: string
  contactId?: string
  leadId?: string
  bindingId?: string
  amount?: string
  currency?: string
}

export type AttributionCredit = { touchEventId: string; revenueEventId: string; amountBrl: string }

export type AttributionResult = {
  metric: MetricValue
  policyHash?: string
  policyVersion?: number
  eventIds: string[]
  credits: AttributionCredit[]
}

export function hashAttributionPolicy(policy: AttributionPolicy): string {
  validatePolicy(policy)
  return createHash('sha256').update(stableSerialize({
    ...policy,
    eligibleEventTypes: [...new Set(policy.eligibleEventTypes)].sort(),
  })).digest('hex')
}

export function attributeMissionValue(input: {
  policy?: AttributionPolicy
  missionStartedAt: string
  evaluatedAt: string
  touches: AttributionEvent[]
  revenueEvents: AttributionEvent[]
}): AttributionResult {
  if (!input.policy) return unknown('attribution_policy_missing')
  const policy = input.policy
  validatePolicy(policy)
  const policyHash = hashAttributionPolicy(policy)
  const startedAt = time(input.missionStartedAt)
  const windowEndsAt = startedAt + policy.windowDays * 86_400_000
  const evaluatedAt = time(input.evaluatedAt)
  const touchEvents = deduplicate(input.touches)
    .filter((event) => policy.eligibleEventTypes.includes(event.eventType))
    .filter((event) => time(event.occurredAt) >= startedAt && time(event.occurredAt) <= windowEndsAt)
    .sort(compareEvents)
  const revenueEvents = deduplicate(input.revenueEvents)
    .filter((event) => time(event.occurredAt) >= startedAt && time(event.occurredAt) <= windowEndsAt)
    .filter((event) => policy.lateEvents === 'reopen_evaluation' || time(event.observedAt ?? event.occurredAt) <= evaluatedAt)
    .sort(compareEvents)

  const credits: AttributionCredit[] = []
  for (const revenue of revenueEvents) {
    if (revenue.currency !== policy.currency) return unknown('attribution_currency_mismatch', policy)
    const revenueIdentity = identity(revenue, policy.identityResolution)
    if (!revenueIdentity) return unknown('attribution_identity_unresolved', policy)
    const matches = touchEvents.filter((touch) =>
      identity(touch, policy.identityResolution) === revenueIdentity && time(touch.occurredAt) <= time(revenue.occurredAt))
    if (matches.some((touch) => !identity(touch, policy.identityResolution))) {
      return unknown('attribution_identity_unresolved', policy)
    }
    if (matches.length === 0) continue
    const amount = parseDecimal(revenue.amount ?? '0')
    if (policy.model === 'first_touch') credits.push(credit(matches[0]!, revenue, amount))
    else if (policy.model === 'last_touch') credits.push(credit(matches[matches.length - 1]!, revenue, amount))
    else {
      const share = amount / BigInt(matches.length)
      let remainder = amount - share * BigInt(matches.length)
      for (const touch of matches) {
        const allocated = share + (remainder > 0n ? 1n : 0n)
        if (remainder > 0n) remainder -= 1n
        credits.push(credit(touch, revenue, allocated))
      }
    }
  }
  const value = credits.reduce((total, item) => total + parseDecimal(item.amountBrl), 0n)
  return {
    metric: { kind: 'known', value: formatDecimal(value) as `${number}`, unit: policy.currency },
    policyHash,
    policyVersion: policy.version,
    eventIds: [...new Set(credits.flatMap((item) => [item.touchEventId, item.revenueEventId]))],
    credits,
  }
}

export async function persistAttributedMissionValue(client: Queryable, input: {
  organizationId: string
  missionId: string
  metricKey: string
  result: AttributionResult
  measuredAt: string
}): Promise<void> {
  if (!input.result.policyHash || !input.result.policyVersion) throw new Error('attribution_policy_missing')
  const metric = input.result.metric
  await client.query(
    `INSERT INTO public.action_mission_metrics (
       organization_id, mission_id, metric_key, value_kind, numeric_value, unit, reason,
       source_type, measured_at, attribution_status, attribution_policy_version,
       attribution_policy_hash, attribution_event_ids
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,'versioned_attribution',$8,'versioned',$9,$10,$11)`,
    [input.organizationId, input.missionId, input.metricKey, metric.kind,
      metric.kind === 'known' ? metric.value : null, metric.unit,
      metric.kind === 'known' ? null : metric.reason, input.measuredAt,
      input.result.policyVersion, input.result.policyHash, input.result.eventIds],
  )
}

function unknown(reason: string, policy?: AttributionPolicy): AttributionResult {
  return {
    metric: { kind: 'unknown', reason, unit: policy?.currency ?? 'BRL' },
    ...(policy ? { policyHash: hashAttributionPolicy(policy), policyVersion: policy.version } : {}),
    eventIds: [], credits: [],
  }
}

function validatePolicy(policy: AttributionPolicy): void {
  if (!Number.isInteger(policy.version) || policy.version < 1 || !Number.isInteger(policy.windowDays) || policy.windowDays < 1 || policy.windowDays > 3650) {
    throw new Error('attribution_policy_invalid')
  }
  if (policy.eligibleEventTypes.length === 0 || policy.eligibleEventTypes.some((item) => !item.trim())) throw new Error('attribution_policy_invalid')
}

function identity(event: AttributionEvent, strategy: AttributionPolicy['identityResolution']): string | null {
  const value = strategy === 'exact_contact' ? event.contactId : strategy === 'exact_lead' ? event.leadId : event.bindingId
  return value?.trim() || null
}

function deduplicate(events: AttributionEvent[]): AttributionEvent[] {
  const unique = new Map<string, AttributionEvent>()
  for (const event of events) if (!unique.has(event.id)) unique.set(event.id, event)
  return [...unique.values()]
}

function compareEvents(left: AttributionEvent, right: AttributionEvent): number {
  return time(left.occurredAt) - time(right.occurredAt) || left.id.localeCompare(right.id)
}

function credit(touch: AttributionEvent, revenue: AttributionEvent, amount: bigint): AttributionCredit {
  return { touchEventId: touch.id, revenueEventId: revenue.id, amountBrl: formatDecimal(amount) }
}

function time(value: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('attribution_event_time_invalid')
  return parsed
}

function parseDecimal(value: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error('attribution_amount_invalid')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

function formatDecimal(value: bigint): string {
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${value / 1_000_000n}.${fraction}` : String(value / 1_000_000n)
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  return JSON.stringify(value)
}
