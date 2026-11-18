import { createHash } from 'node:crypto'
import type { Queryable } from './repository.js'

export type PlanningCycleBudget = {
  maxCalls: number
  maxInputTokens: number
  maxOutputTokens: number
  maxCostBrl: string
  maxLatencyMs: number
}

export type PlanningUsage = {
  calls: number
  inputTokens: number
  outputTokens: number
  costBrl: string
  latencyMs: number
}

export type PlanningReservation = PlanningUsage

// The planning worker is allowed to run for 180 seconds. Recheck after that
// window, without reissuing a request whose outcome is still unknown.
export const PLANNING_RECHECK_WINDOW_MS = 190_000

/** Read only while holding the cycle lock, until the owner has reserved. */
export async function getPlanningReservationAge(client: Queryable, cycleId: string, organizationId: string) {
  const prior = await client.query<{ age_ms: number }>(
    `SELECT LEAST($3, GREATEST(0, EXTRACT(EPOCH FROM (clock_timestamp() - MIN(created_at))) * 1000))::INT AS age_ms
       FROM public.action_planning_usage_entries
      WHERE cycle_id = $1 AND organization_id = $2 AND nature = 'reservation'
     HAVING COUNT(*) > 0`,
    [cycleId, organizationId, PLANNING_RECHECK_WINDOW_MS],
  )
  return prior.rows[0]?.age_ms ?? null
}

export function normalizePlanningMeasurements(value: unknown) {
  const validAmount = (amount: unknown) => typeof amount === 'number' && Number.isFinite(amount) && amount >= 0 ? amount : null
  const validCount = (count: unknown) => typeof count === 'number' && Number.isSafeInteger(count) && count >= 0 && count <= 2_147_483_647 ? count : null
  return (Array.isArray(value) ? value : []).map(item => {
    const row = item && typeof item === 'object' ? item as Record<string, unknown> : {}
    const attemptsWithoutCost = validCount(row.attemptsWithoutCost)
    const reportedCostUsd = attemptsWithoutCost ? null : validAmount(row.reportedCostUsd)
    return {
      node: typeof row.node === 'string' && /^[a-z0-9_.-]{1,80}$/.test(row.node) ? row.node : null,
      attemptCount: validCount(row.attemptCount),
      inputTokens: validCount(row.inputTokens),
      outputTokens: validCount(row.outputTokens),
      reasoningTokens: validCount(row.reasoningTokens),
      knownInputTokens: validCount(row.inputTokens) ?? validCount(row.knownInputTokens),
      knownOutputTokens: validCount(row.outputTokens) ?? validCount(row.knownOutputTokens),
      knownReasoningTokens: validCount(row.reasoningTokens) ?? validCount(row.knownReasoningTokens),
      attemptsWithoutCost,
      reportedCostUsd,
      knownCostSubtotalUsd: reportedCostUsd ?? validAmount(row.knownCostSubtotalUsd),
      ...(typeof row.requestFingerprint === 'string' && /^[a-f0-9]{64}$/.test(row.requestFingerprint)
        ? { requestFingerprint: row.requestFingerprint } : {}),
    }
  })
}

export function reconcilePlanningCost(value: unknown, reservedBrl: string) {
  const stages = normalizePlanningMeasurements(value)
  const amounts = stages.map(stage => stage.reportedCostUsd)
  const reportedCostUsd = amounts.length && amounts.every(amount => amount !== null)
    ? amounts.reduce((total, amount) => total + amount, 0) : null
  const knownCosts = stages.flatMap(stage => stage.knownCostSubtotalUsd === null ? [] : [stage.knownCostSubtotalUsd])
  const knownCostSubtotalUsd = knownCosts.length ? knownCosts.reduce((total, amount) => total + amount, 0) : null
  const recognizedCostBrl = reportedCostUsd === 0 ? '0' : null
  return {
    budgetCostBrl: recognizedCostBrl ?? reservedBrl,
    measurements: { stages, reportedCostUsd, knownCostSubtotalUsd, recognizedCostBrl, pendingReconciliation: recognizedCostBrl === null },
  }
}

export function reconcilePlanningUsage(cost: ReturnType<typeof reconcilePlanningCost>, reserved: PlanningUsage, latencyMs: number): PlanningUsage {
  const { stages } = cost.measurements
  function tokens(field: 'inputTokens' | 'outputTokens', knownField: 'knownInputTokens' | 'knownOutputTokens') {
    const known = stages.reduce((total, stage) => total + (stage[knownField] ?? 0), 0)
    return stages.length && stages.every(stage => stage[field] !== null) ? known : Math.max(known, reserved[field])
  }
  return {
    calls: stages.length ? stages.reduce((total, stage) => total + Math.max(1, stage.attemptCount ?? 1), 0) : reserved.calls,
    inputTokens: tokens('inputTokens', 'knownInputTokens'), outputTokens: tokens('outputTokens', 'knownOutputTokens'),
    costBrl: cost.budgetCostBrl, latencyMs,
  }
}

export type PlanningReservationDecision =
  | { allowed: true; projected: PlanningUsage }
  | { allowed: false; reason: string; projected: PlanningUsage }

export function hashPlanningContext(value: unknown): string {
  return createHash('sha256').update(stableSerialize(value)).digest('hex')
}

export function evaluatePlanningReservation(
  budget: PlanningCycleBudget,
  usage: PlanningUsage,
  reservation: PlanningReservation,
): PlanningReservationDecision {
  const projected: PlanningUsage = {
    calls: usage.calls + reservation.calls,
    inputTokens: usage.inputTokens + reservation.inputTokens,
    outputTokens: usage.outputTokens + reservation.outputTokens,
    costBrl: addDecimal(usage.costBrl, reservation.costBrl),
    latencyMs: usage.latencyMs + reservation.latencyMs,
  }
  const dimensions: Array<[keyof PlanningUsage, number]> = [
    ['calls', budget.maxCalls], ['inputTokens', budget.maxInputTokens],
    ['outputTokens', budget.maxOutputTokens], ['latencyMs', budget.maxLatencyMs],
  ]
  for (const [key, ceiling] of dimensions) {
    if (Number(projected[key]) > ceiling) return { allowed: false, reason: `planning_budget_${key}_exhausted`, projected }
  }
  if (compareDecimal(projected.costBrl, budget.maxCostBrl) > 0) {
    return { allowed: false, reason: 'planning_budget_costBrl_exhausted', projected }
  }
  return { allowed: true, projected }
}

export function shouldRunSpecialist(input: {
  requiredWhen?: { field: string; equals?: unknown; includes?: unknown }
  context: Record<string, unknown>
  artifactValid: boolean
}): boolean {
  if (input.artifactValid) return false
  if (!input.requiredWhen) return true
  const actual = input.context[input.requiredWhen.field]
  if ('equals' in input.requiredWhen) return Object.is(actual, input.requiredWhen.equals)
  if ('includes' in input.requiredWhen) return Array.isArray(actual) && actual.includes(input.requiredWhen.includes)
  return false
}

export async function reservePlanningCall(client: Queryable, input: {
  cycleId: string
  organizationId: string
  specialistProfile: string
  specialistVersion: number
  reservation: PlanningReservation
  metadata?: Record<string, unknown>
}): Promise<{ reservationId: string; projected: PlanningUsage }> {
  const cycle = await client.query<{ budget: PlanningCycleBudget; usage: PlanningUsage; status: string }>(
    `SELECT budget, usage, status FROM public.action_planning_cycles
     WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [input.cycleId, input.organizationId],
  )
  const row = cycle.rows[0]
  if (!row || row.status !== 'active') throw new Error('planning_cycle_unavailable')
  const decision = evaluatePlanningReservation(row.budget, row.usage, input.reservation)
  if (!decision.allowed) {
    await client.query(
      `UPDATE public.action_planning_cycles SET status = 'exhausted', terminal_reason = $3, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [input.cycleId, input.organizationId, decision.reason],
    )
    throw new Error('planning_budget_exhausted')
  }
  const reservation = await client.query<{ id: string }>(
    `INSERT INTO public.action_planning_usage_entries (
       organization_id, cycle_id, specialist_profile, specialist_version, nature,
       calls, input_tokens, output_tokens, cost_brl, latency_ms, metadata
     ) VALUES ($1,$2,$3,$4,'reservation',$5,$6,$7,$8,$9,$10) RETURNING id`,
    [input.organizationId, input.cycleId, input.specialistProfile, input.specialistVersion,
      input.reservation.calls, input.reservation.inputTokens, input.reservation.outputTokens,
      input.reservation.costBrl, input.reservation.latencyMs, input.metadata ?? {}],
  )
  await client.query(
    `UPDATE public.action_planning_cycles SET usage = $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [input.cycleId, input.organizationId, decision.projected],
  )
  if (!reservation.rows[0]) throw new Error('planning_reservation_failed')
  return { reservationId: reservation.rows[0].id, projected: decision.projected }
}

export async function settlePlanningCall(client: Queryable, input: {
  cycleId: string
  organizationId: string
  reservationId: string
  providerModelId?: string
  metadata?: Record<string, unknown>
  recordBudgetOverage?: boolean
} & ({ actual: PlanningUsage; confirmedNotStarted?: false } | { confirmedNotStarted: true })): Promise<{ usage: PlanningUsage; budgetExceeded: boolean }> {
  const result = await client.query<{
    budget: PlanningCycleBudget; usage: PlanningUsage; status: string;
    calls: number; input_tokens: number; output_tokens: number; cost_brl: string; latency_ms: number;
  }>(
    `SELECT cycle.budget, cycle.usage, cycle.status, reservation.calls,
            reservation.input_tokens, reservation.output_tokens, reservation.cost_brl::TEXT, reservation.latency_ms
     FROM public.action_planning_cycles cycle
     JOIN public.action_planning_usage_entries reservation ON reservation.id = $3 AND reservation.cycle_id = cycle.id
       AND reservation.organization_id = cycle.organization_id AND reservation.nature = 'reservation'
     WHERE cycle.id = $1 AND cycle.organization_id = $2 FOR UPDATE OF cycle`,
    [input.cycleId, input.organizationId, input.reservationId],
  )
  const row = result.rows[0]
  if (!row) throw new Error('planning_reservation_unavailable')
  // Read after locking the cycle so a concurrent settlement has committed.
  const prior = await client.query<{ nature: string }>(
    `SELECT nature FROM public.action_planning_usage_entries
     WHERE cycle_id = $1 AND organization_id = $2 AND reservation_id = $3
       AND nature IN ('actual', 'release') LIMIT 1`,
    [input.cycleId, input.organizationId, input.reservationId],
  )
  const nature = input.confirmedNotStarted ? 'release' : 'actual'
  if (prior.rows[0]?.nature === nature) return { usage: row.usage, budgetExceeded: row.status === 'exhausted' }
  if (prior.rows.length || row.status !== 'active') throw new Error('planning_reservation_unavailable')
  const reserved: PlanningUsage = {
    calls: Number(row.calls), inputTokens: Number(row.input_tokens), outputTokens: Number(row.output_tokens),
    costBrl: String(row.cost_brl), latencyMs: Number(row.latency_ms),
  }
  const base = subtractUsage(row.usage, reserved)
  const actual = input.confirmedNotStarted ? { calls: 0, inputTokens: 0, outputTokens: 0, costBrl: '0', latencyMs: 0 } : input.actual
  const decision = evaluatePlanningReservation(row.budget, base, actual)
  if (!decision.allowed && !input.recordBudgetOverage) throw new Error('planning_actual_budget_exhausted')
  await client.query(
    `INSERT INTO public.action_planning_usage_entries (
       organization_id, cycle_id, specialist_profile, specialist_version, nature,
       calls, input_tokens, output_tokens, cost_brl, latency_ms, reservation_id, provider_model_id, metadata
     ) SELECT organization_id, cycle_id, specialist_profile, specialist_version, $11,
              $4,$5,$6,$7,$8,id,$9,$10
       FROM public.action_planning_usage_entries WHERE id = $3 AND organization_id = $2 AND cycle_id = $1`,
    [input.cycleId, input.organizationId, input.reservationId, actual.calls, actual.inputTokens,
      actual.outputTokens, actual.costBrl, actual.latencyMs, input.providerModelId ?? null, input.metadata ?? {}, nature],
  )
  await client.query(
    `UPDATE public.action_planning_cycles SET usage = $3::jsonb,
         status = CASE WHEN $4::text IS NULL THEN status ELSE 'exhausted' END,
         terminal_reason = COALESCE($4, terminal_reason), updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [input.cycleId, input.organizationId, decision.projected, decision.allowed ? null : decision.reason],
  )
  return { usage: decision.projected, budgetExceeded: !decision.allowed }
}

function parseDecimal(value: string): bigint {
  if (!/^\d+(\.\d{1,6})?$/.test(value)) throw new Error('planning_decimal_invalid')
  const [whole, fraction = ''] = value.split('.')
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'))
}

function formatDecimal(value: bigint): string {
  const whole = value / 1_000_000n
  const fraction = (value % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : String(whole)
}

function addDecimal(left: string, right: string): string { return formatDecimal(parseDecimal(left) + parseDecimal(right)) }
function compareDecimal(left: string, right: string): number { return Number(parseDecimal(left) - parseDecimal(right)) }

function subtractUsage(total: PlanningUsage, reserved: PlanningUsage): PlanningUsage {
  return {
    calls: Math.max(0, total.calls - reserved.calls),
    inputTokens: Math.max(0, total.inputTokens - reserved.inputTokens),
    outputTokens: Math.max(0, total.outputTokens - reserved.outputTokens),
    costBrl: formatDecimal(parseDecimal(total.costBrl) > parseDecimal(reserved.costBrl)
      ? parseDecimal(total.costBrl) - parseDecimal(reserved.costBrl) : 0n),
    latencyMs: Math.max(0, total.latencyMs - reserved.latencyMs),
  }
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  return JSON.stringify(value)
}
