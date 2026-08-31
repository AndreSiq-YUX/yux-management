import { recordCostEntry, type Queryable } from './repository.js'
import type { AutonomyUsageSnapshot } from './autonomous-preflight.js'

export type CostCategory = 'ai' | 'provider' | 'media' | 'human' | 'external_service' | 'infrastructure_variable'
export type CostNature = 'estimated' | 'reserved' | 'actual' | 'reversal'

export type CostEntryInput = {
  organizationId: string; missionId: string; runId?: string; attemptId?: string;
  category: CostCategory; nature: CostNature; sourceType: string; sourceRecordId: string;
  sourceEventKey: string; idempotencyKey: string; amountOriginal: string; currencyOriginal: string;
  exchangeRateToBrl: string; amountBrl: string; humanMinutes?: string; humanHourlyRateBrl?: string;
  reversesEntryId?: string; metadata?: Record<string, unknown>
}

export type MissionEconomics = {
  producedValueBrl: string
  totalExecutionCostBrl: string
  netValueBrl: string
  valueCostRatio: string | 'not_applicable'
  valuePerHumanHourBrl: string | 'not_applicable'
  humanFreeExecutionRate: string | 'not_applicable'
}

export function parseScaledDecimal(value: string, scale: number): bigint {
  if (!Number.isInteger(scale) || scale < 0) throw new Error('decimal_scale_invalid')
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(value.trim())
  if (!match) throw new Error('decimal_invalid')
  const sign = match[1] === '-' ? -1n : 1n
  const fraction = match[3] ?? ''
  const kept = fraction.slice(0, scale).padEnd(scale, '0')
  const next = fraction[scale]
  let result = BigInt(match[2]) * (10n ** BigInt(scale)) + BigInt(kept || '0')
  if (next && next >= '5') result += 1n
  return result * sign
}

export function formatScaledDecimal(value: bigint, scale: number): string {
  const sign = value < 0n ? '-' : ''
  const absolute = value < 0n ? -value : value
  if (scale === 0) return `${sign}${absolute}`
  const divisor = 10n ** BigInt(scale)
  return `${sign}${absolute / divisor}.${(absolute % divisor).toString().padStart(scale, '0')}`
}

export function multiplyScaled(left: bigint, right: bigint, scale: number): bigint {
  const divisor = 10n ** BigInt(scale)
  const product = left * right
  const absolute = product < 0n ? -product : product
  const rounded = (absolute + divisor / 2n) / divisor
  return product < 0n ? -rounded : rounded
}

export function divideScaled(numerator: bigint, denominator: bigint, scale: number): bigint {
  if (denominator === 0n) throw new Error('decimal_division_by_zero')
  const scaled = numerator * (10n ** BigInt(scale))
  const sign = (scaled < 0n) !== (denominator < 0n) ? -1n : 1n
  const absoluteNumerator = scaled < 0n ? -scaled : scaled
  const absoluteDenominator = denominator < 0n ? -denominator : denominator
  return sign * ((absoluteNumerator + absoluteDenominator / 2n) / absoluteDenominator)
}

export function calculateMissionEconomics(input: {
  value: string; costs: string[]; humanHours: string; completedActions: number; humanActions: number
}): MissionEconomics {
  const value = parseScaledDecimal(input.value, 2)
  const total = input.costs.reduce((sum, cost) => sum + parseScaledDecimal(cost, 2), 0n)
  const humanHours = parseScaledDecimal(input.humanHours, 2)
  const completed = BigInt(Math.max(0, Math.trunc(input.completedActions)))
  const humanActions = BigInt(Math.max(0, Math.min(Math.trunc(input.humanActions), Number(completed))))
  return {
    producedValueBrl: formatScaledDecimal(value, 2),
    totalExecutionCostBrl: formatScaledDecimal(total, 2),
    netValueBrl: formatScaledDecimal(value - total, 2),
    valueCostRatio: total === 0n ? 'not_applicable' : formatScaledDecimal(divideScaled(value, total, 4), 4),
    valuePerHumanHourBrl: humanHours === 0n ? 'not_applicable' : formatScaledDecimal(divideScaled(value, humanHours, 2), 2),
    humanFreeExecutionRate: completed === 0n ? 'not_applicable' : formatScaledDecimal(divideScaled(completed - humanActions, completed, 4), 4),
  }
}

export function calculateHumanCost(minutes: string, hourlyRateBrl: string): string {
  const minuteValue = parseScaledDecimal(minutes, 2)
  const hourlyRate = parseScaledDecimal(hourlyRateBrl, 2)
  const amountScale4 = minuteValue * hourlyRate / 60n
  return formatScaledDecimal((amountScale4 + 50n) / 100n, 2)
}

export async function collectMissionEconomics(
  client: Queryable,
  missionId: string,
  organizationId: string,
  overrides?: { producedValueBrl?: string; mediaSpendBrl?: string },
): Promise<MissionEconomics> {
  const [metric, costs, actionCounts] = await Promise.all([
    client.query<{ numeric_value: string | null }>(
      `SELECT numeric_value::TEXT FROM public.action_mission_metrics
       WHERE mission_id = $1 AND organization_id = $2 AND metric_key = 'signed_revenue' AND value_kind = 'known' AND is_demo = FALSE
       ORDER BY measured_at DESC LIMIT 1`, [missionId, organizationId],
    ),
    client.query<{ amount_brl: string; category: CostCategory }>(
      `SELECT amount_brl::TEXT,category FROM public.action_cost_entries
       WHERE mission_id = $1 AND organization_id = $2 AND nature IN ('actual','reversal')`, [missionId, organizationId],
    ),
    client.query<{ completed: number | string; human: number | string; human_minutes: string | null }>(
      `SELECT COUNT(*) FILTER (WHERE run.status = 'succeeded')::INT AS completed,
              COUNT(*) FILTER (WHERE run.status = 'succeeded' AND step.capability_key = 'human.task.create')::INT AS human,
              (SELECT SUM(COALESCE(entry.human_minutes,0))::TEXT FROM public.action_cost_entries entry
               WHERE entry.mission_id = $1 AND entry.organization_id = $2 AND entry.nature IN ('actual','reversal')) AS human_minutes
       FROM public.action_runs run JOIN public.action_plan_steps step ON step.id = run.plan_step_id
       WHERE run.mission_id = $1 AND run.organization_id = $2`, [missionId, organizationId],
    ),
  ])
  const minutes = parseScaledDecimal(String(actionCounts.rows[0]?.human_minutes ?? '0'), 2)
  const humanHours = formatScaledDecimal(divideScaled(minutes, parseScaledDecimal('60', 2), 2), 2)
  return calculateMissionEconomics({
    value: overrides?.producedValueBrl ?? metric.rows[0]?.numeric_value ?? '0',
    costs: costs.rows
      .filter(row => !overrides?.mediaSpendBrl || row.category !== 'media')
      .map(row => row.amount_brl)
      .concat(overrides?.mediaSpendBrl ? [overrides.mediaSpendBrl] : []),
    humanHours,
    completedActions: Number(actionCounts.rows[0]?.completed ?? 0),
    humanActions: Number(actionCounts.rows[0]?.human ?? 0),
  })
}

export async function collectAutonomyUsage(
  client: Queryable,
  missionId: string,
  organizationId: string,
  currentRunId?: string,
): Promise<AutonomyUsageSnapshot> {
  const [ledger, contacts, capabilityCounts, unresolved] = await Promise.all([
    client.query<{ cost_brl: string | null; human_minutes: string | null }>(
      `SELECT COALESCE(SUM(amount_brl),0)::TEXT AS cost_brl,
              COALESCE(SUM(COALESCE(human_minutes,0)),0)::TEXT AS human_minutes
       FROM public.action_cost_entries
       WHERE mission_id = $1 AND organization_id = $2
         AND nature IN ('reserved','actual','reversal')`,
      [missionId, organizationId],
    ),
    client.query<{ count: number | string }>(
      `SELECT GREATEST(
         (SELECT COUNT(*) FROM public.action_observations
          WHERE mission_id = $1 AND organization_id = $2 AND observation_type = 'external_message_sent'),
         (SELECT COUNT(*) FROM public.action_runs run
          JOIN public.action_plan_steps step ON step.id = run.plan_step_id
          WHERE run.mission_id = $1 AND run.organization_id = $2 AND run.status = 'succeeded'
            AND step.capability_key IN ('email.message.queue','whatsapp.template.queue')),
         (SELECT COUNT(*) FROM public.action_external_effects effect
          WHERE effect.mission_id = $1 AND effect.organization_id = $2 AND effect.status = 'confirmed_created'
            AND effect.capability_key IN ('email.message.queue','whatsapp.template.queue'))
       )::INT AS count`,
      [missionId, organizationId],
    ),
    client.query<{ capability_key: string; count: number | string }>(
      `SELECT step.capability_key,COUNT(*)::INT AS count
       FROM public.action_runs run JOIN public.action_plan_steps step ON step.id = run.plan_step_id
       WHERE run.mission_id = $1 AND run.organization_id = $2 AND run.status = 'succeeded'
       GROUP BY step.capability_key`,
      [missionId, organizationId],
    ),
    client.query<{ count: number | string }>(
      `SELECT COUNT(*)::INT AS count FROM public.action_external_effects
       WHERE mission_id = $1 AND organization_id = $2
         AND status IN ('reserved','dispatched','unknown','reconciling','manual_review')
         AND ($3::UUID IS NULL OR run_id <> $3)`,
      [missionId, organizationId, currentRunId ?? null],
    ),
  ])
  return {
    costBrl: String(ledger.rows[0]?.cost_brl ?? '0'),
    humanMinutes: String(ledger.rows[0]?.human_minutes ?? '0'),
    externalContacts: Number(contacts.rows[0]?.count ?? 0),
    capabilityCounts: Object.fromEntries(capabilityCounts.rows.map((row) => [row.capability_key, Number(row.count)])),
    unresolvedExternalEffects: Number(unresolved.rows[0]?.count ?? 0),
  }
}

export async function reserveAutonomyUsage(client: Queryable, input: {
  organizationId: string
  missionId: string
  runId: string
  attemptId: string
  capabilityKey: string
  costBrl: string
  humanMinutes: string
}) {
  if (parseScaledDecimal(input.costBrl, 6) === 0n && parseScaledDecimal(input.humanMinutes, 2) === 0n) return null
  return recordCostEntry(client, {
    organizationId: input.organizationId,
    missionId: input.missionId,
    runId: input.runId,
    attemptId: input.attemptId,
    category: parseScaledDecimal(input.humanMinutes, 2) > 0n ? 'human' : 'external_service',
    nature: 'reserved',
    sourceType: 'autonomy_preflight',
    sourceRecordId: input.attemptId,
    sourceEventKey: `${input.attemptId}:autonomy-usage:reserved`,
    idempotencyKey: `${input.attemptId}:autonomy-usage:reserved`,
    amountOriginal: input.costBrl,
    currencyOriginal: 'BRL',
    exchangeRateToBrl: '1',
    amountBrl: input.costBrl,
    humanMinutes: input.humanMinutes,
    metadata: { capabilityKey: input.capabilityKey, finalPreflight: true },
  })
}

export async function releaseAutonomyUsageReservations(client: Queryable, input: {
  organizationId: string
  runId: string
  reason: string
  actorId?: string
}) {
  const reservations = await client.query<{
    id: string; organization_id: string; mission_id: string; run_id: string | null; attempt_id: string | null;
    category: CostCategory; source_type: string; source_record_id: string; source_event_key: string;
    amount_original: string; currency_original: string; exchange_rate_to_brl: string; amount_brl: string;
    human_minutes: string | null; human_hourly_rate_brl: string | null; metadata: Record<string, unknown>;
  }>(
    `SELECT entry.id,entry.organization_id,entry.mission_id,entry.run_id,entry.attempt_id,entry.category,
            entry.source_type,entry.source_record_id,entry.source_event_key,entry.amount_original::TEXT,
            entry.currency_original,entry.exchange_rate_to_brl::TEXT,entry.amount_brl::TEXT,
            entry.human_minutes::TEXT,entry.human_hourly_rate_brl::TEXT,entry.metadata
     FROM public.action_cost_entries entry
     WHERE entry.organization_id = $1 AND entry.run_id = $2 AND entry.nature = 'reserved'
       AND entry.source_type = 'autonomy_preflight'
       AND NOT EXISTS (SELECT 1 FROM public.action_cost_entries reversal WHERE reversal.reverses_entry_id = entry.id)
     FOR UPDATE OF entry`,
    [input.organizationId, input.runId],
  )
  for (const row of reservations.rows) {
    await reverseCostEntry(client, {
      original: {
        id: row.id, organizationId: row.organization_id, missionId: row.mission_id,
        ...(row.run_id ? { runId: row.run_id } : {}), ...(row.attempt_id ? { attemptId: row.attempt_id } : {}),
        category: row.category, nature: 'reserved', sourceType: row.source_type,
        sourceRecordId: row.source_record_id, sourceEventKey: row.source_event_key,
        idempotencyKey: `${row.id}:original`, amountOriginal: row.amount_original,
        currencyOriginal: row.currency_original, exchangeRateToBrl: row.exchange_rate_to_brl,
        amountBrl: row.amount_brl, ...(row.human_minutes ? { humanMinutes: row.human_minutes } : {}),
        ...(row.human_hourly_rate_brl ? { humanHourlyRateBrl: row.human_hourly_rate_brl } : {}),
        metadata: row.metadata,
      },
      sourceEventKey: `${row.id}:autonomy-usage:released`,
      idempotencyKey: `${row.id}:autonomy-usage:released`,
      actorId: input.actorId ?? 'system',
    })
  }
  return { released: reservations.rows.length, reason: input.reason }
}

export async function recordCapabilityCosts(client: Queryable, entries: CostEntryInput[]) {
  const recorded: Array<{ id: string }> = []
  for (const entry of entries) recorded.push(await recordCostEntry(client, entry))
  return recorded
}

export async function recordHumanTaskCost(client: Queryable, input: Omit<CostEntryInput, 'category' | 'nature' | 'amountOriginal' | 'currencyOriginal' | 'exchangeRateToBrl' | 'amountBrl'> & { actualMinutes: string; humanHourlyRateBrl: string }) {
  const amountBrl = calculateHumanCost(input.actualMinutes, input.humanHourlyRateBrl)
  return recordCostEntry(client, {
    ...input, category: 'human', nature: 'actual', amountOriginal: amountBrl, currencyOriginal: 'BRL',
    exchangeRateToBrl: '1', amountBrl, humanMinutes: input.actualMinutes, humanHourlyRateBrl: input.humanHourlyRateBrl,
  })
}

export async function reverseCostEntry(client: Queryable, input: {
  original: CostEntryInput & { id: string }; sourceEventKey: string; idempotencyKey: string; actorId: string
}) {
  return recordCostEntry(client, {
    ...input.original, nature: 'reversal', sourceEventKey: input.sourceEventKey, idempotencyKey: input.idempotencyKey,
    amountOriginal: negate(input.original.amountOriginal), amountBrl: negate(input.original.amountBrl),
    reversesEntryId: input.original.id, metadata: { ...(input.original.metadata ?? {}), reversedBy: input.actorId },
  })
}

function negate(value: string): string {
  return value.startsWith('-') ? value.slice(1) : `-${value}`
}
