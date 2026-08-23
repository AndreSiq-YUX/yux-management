import { formatScaledDecimal, parseScaledDecimal } from './economics.js'
import type { Queryable } from './repository.js'

export const BUDGET_ALERT_THRESHOLDS = [50, 80, 95] as const
export type BudgetAlertThreshold = typeof BUDGET_ALERT_THRESHOLDS[number]

export type BudgetCostEntry = {
  id: string
  nature: 'reserved' | 'actual' | 'reversal'
  amountBrl: string
  reversesEntryId?: string | null
  currencyOriginal?: string
}

export type MissionBudgetBurnDown = {
  currency: 'BRL'
  envelopeVersion: number
  actualCostBrl: string
  reservedCostBrl: string
  consumedCostBrl: string
  remainingCostBrl: string
  maximumCostBrl: string
  consumedPercent: string
  alertThresholds: BudgetAlertThreshold[]
  nextAlertThreshold?: BudgetAlertThreshold
  exhausted: boolean
}

export function calculateMissionBudgetBurnDown(input: {
  maximumCostBrl: string
  envelopeVersion: number
  entries: BudgetCostEntry[]
  emittedThresholds?: readonly number[]
}): MissionBudgetBurnDown & { newlyCrossedThresholds: BudgetAlertThreshold[] } {
  const maximum = parseScaledDecimal(input.maximumCostBrl, 6)
  if (maximum <= 0n) throw new Error('mission_budget_maximum_invalid')
  const byId = new Map(input.entries.map(entry => [entry.id, entry]))
  const reversed = new Set(input.entries.filter(entry => entry.nature === 'reversal' && entry.reversesEntryId).map(entry => entry.reversesEntryId!))
  const actual = input.entries.reduce((sum, entry) => {
    if (entry.nature === 'actual') return sum + parseScaledDecimal(entry.amountBrl, 6)
    if (entry.nature === 'reversal' && entry.reversesEntryId && byId.get(entry.reversesEntryId)?.nature === 'actual') return sum + parseScaledDecimal(entry.amountBrl, 6)
    return sum
  }, 0n)
  const reserved = input.entries.reduce((sum, entry) => entry.nature === 'reserved' && !reversed.has(entry.id) ? sum + parseScaledDecimal(entry.amountBrl, 6) : sum, 0n)
  const consumed = actual + reserved
  const percentage = consumed <= 0n ? 0n : (consumed * 10_000n + maximum / 2n) / maximum
  const crossed = BUDGET_ALERT_THRESHOLDS.filter(threshold => percentage >= BigInt(threshold * 100))
  const emitted = new Set(input.emittedThresholds ?? [])
  const newlyCrossedThresholds = crossed.filter(threshold => !emitted.has(threshold))
  const alertThresholds = BUDGET_ALERT_THRESHOLDS.filter(threshold => emitted.has(threshold) || crossed.includes(threshold))
  const nextAlertThreshold = BUDGET_ALERT_THRESHOLDS.find(threshold => !alertThresholds.includes(threshold))
  return {
    currency: 'BRL', envelopeVersion: input.envelopeVersion,
    actualCostBrl: formatScaledDecimal(actual, 6), reservedCostBrl: formatScaledDecimal(reserved, 6),
    consumedCostBrl: formatScaledDecimal(consumed, 6), remainingCostBrl: formatScaledDecimal(maximum > consumed ? maximum - consumed : 0n, 6),
    maximumCostBrl: formatScaledDecimal(maximum, 6), consumedPercent: formatScaledDecimal(percentage, 2),
    alertThresholds, ...(nextAlertThreshold ? { nextAlertThreshold } : {}), exhausted: consumed >= maximum,
    newlyCrossedThresholds,
  }
}

export async function collectMissionBudgetBurnDown(client: Queryable, missionId: string, organizationId: string): Promise<MissionBudgetBurnDown> {
  const [missionResult, entryResult, alertResult] = await Promise.all([
    client.query<{ maximum_cost_brl: string; envelope_version: number | string }>(
      `SELECT COALESCE(autonomy_envelope->>'maxTotalCostBrl', budget->>'maxTotalCostBrl') AS maximum_cost_brl,
              COALESCE((budget->>'envelopeVersion')::INT, 1) AS envelope_version
         FROM public.action_missions WHERE id = $1 AND organization_id = $2 LIMIT 1`, [missionId, organizationId]),
    client.query<{ id: string; nature: BudgetCostEntry['nature']; amount_brl: string; reverses_entry_id: string | null }>(
      `SELECT id, nature, amount_brl::TEXT, reverses_entry_id FROM public.action_cost_entries
        WHERE mission_id = $1 AND organization_id = $2 AND nature IN ('reserved','actual','reversal')
        ORDER BY occurred_at, id`, [missionId, organizationId]),
    client.query<{ threshold_percent: number | string }>(
      `SELECT threshold_percent FROM public.action_budget_alerts
        WHERE mission_id = $1 AND organization_id = $2 AND envelope_version = COALESCE(
          (SELECT (budget->>'envelopeVersion')::INT FROM public.action_missions WHERE id = $1 AND organization_id = $2), 1)`, [missionId, organizationId]),
  ])
  const mission = missionResult.rows[0]
  if (!mission?.maximum_cost_brl) throw new Error('mission_not_found')
  const burnDown = calculateMissionBudgetBurnDown({
    maximumCostBrl: mission.maximum_cost_brl, envelopeVersion: Number(mission.envelope_version),
    entries: entryResult.rows.map(row => ({ id: row.id, nature: row.nature, amountBrl: row.amount_brl, reversesEntryId: row.reverses_entry_id })),
    emittedThresholds: alertResult.rows.map(row => Number(row.threshold_percent)),
  })
  for (const threshold of burnDown.newlyCrossedThresholds) {
    await client.query(
      `INSERT INTO public.action_budget_alerts (organization_id, mission_id, envelope_version, threshold_percent, consumed_brl, maximum_brl)
       VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (mission_id, envelope_version, threshold_percent) DO NOTHING`,
      [organizationId, missionId, burnDown.envelopeVersion, threshold, burnDown.consumedCostBrl, burnDown.maximumCostBrl],
    )
  }
  const { newlyCrossedThresholds: _new, ...result } = burnDown
  return result
}
