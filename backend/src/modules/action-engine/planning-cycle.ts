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
       calls, input_tokens, output_tokens, cost_brl, latency_ms
     ) VALUES ($1,$2,$3,$4,'reservation',$5,$6,$7,$8,$9) RETURNING id`,
    [input.organizationId, input.cycleId, input.specialistProfile, input.specialistVersion,
      input.reservation.calls, input.reservation.inputTokens, input.reservation.outputTokens,
      input.reservation.costBrl, input.reservation.latencyMs],
  )
  await client.query(
    `UPDATE public.action_planning_cycles SET usage = $3::jsonb, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [input.cycleId, input.organizationId, decision.projected],
  )
  if (!reservation.rows[0]) throw new Error('planning_reservation_failed')
  return { reservationId: reservation.rows[0].id, projected: decision.projected }
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

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  return JSON.stringify(value)
}
