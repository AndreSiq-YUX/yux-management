import { recordCostEntry, type Queryable } from './repository.js'

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

export async function collectMissionEconomics(client: Queryable, missionId: string, organizationId: string): Promise<MissionEconomics> {
  const [metric, costs, actionCounts] = await Promise.all([
    client.query<{ numeric_value: string | null }>(
      `SELECT numeric_value::TEXT FROM public.action_mission_metrics
       WHERE mission_id = $1 AND organization_id = $2 AND metric_key = 'signed_revenue' AND value_kind = 'known'
       ORDER BY measured_at DESC LIMIT 1`, [missionId, organizationId],
    ),
    client.query<{ amount_brl: string }>(
      `SELECT amount_brl::TEXT FROM public.action_cost_entries
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
    value: metric.rows[0]?.numeric_value ?? '0',
    costs: costs.rows.map((row) => row.amount_brl),
    humanHours,
    completedActions: Number(actionCounts.rows[0]?.completed ?? 0),
    humanActions: Number(actionCounts.rows[0]?.human ?? 0),
  })
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
