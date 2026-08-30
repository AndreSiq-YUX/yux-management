import { calculateMissionEconomics, type MissionEconomics } from './economics.js'
import { getMission, recordEvaluation, type Queryable } from './repository.js'
import type { MetricValue } from './types.js'

export type EvaluationConclusion = 'continue' | 'pause' | 'block' | 'propose_replan' | 'succeed' | 'fail' | 'expire'

export type MissionEvaluationInput = {
  targetRevenueBrl: string
  signedRevenue: MetricValue
  deadlineAt?: string
  now: string
  criticalGuardrailBreached: boolean
  killSwitchActive: boolean
  minimumSampleReached: boolean
  offTrack: boolean
  requiredMetricUnknownIsBlocking: boolean
}

export function decideMissionConclusion(input: MissionEvaluationInput): { conclusion: EvaluationConclusion; reasons: string[] } {
  if (input.criticalGuardrailBreached) return { conclusion: 'pause', reasons: ['critical_guardrail_breached'] }
  if (input.killSwitchActive) return { conclusion: 'pause', reasons: ['kill_switch_active'] }
  if (input.signedRevenue.kind === 'known' && decimalAtLeast(input.signedRevenue.value, input.targetRevenueBrl)) {
    return { conclusion: 'succeed', reasons: ['success_target_met'] }
  }
  if (input.deadlineAt && Date.parse(input.now) > Date.parse(input.deadlineAt)) return { conclusion: 'expire', reasons: ['deadline_passed'] }
  if (input.signedRevenue.kind === 'unknown' && input.requiredMetricUnknownIsBlocking) return { conclusion: 'block', reasons: ['required_metric_unknown'] }
  if (input.minimumSampleReached && input.offTrack) return { conclusion: 'propose_replan', reasons: ['trajectory_off_track'] }
  return { conclusion: 'continue', reasons: input.signedRevenue.kind === 'unknown' ? ['metric_unknown_continue_observing'] : ['trajectory_acceptable'] }
}

export async function collectMissionMetrics(client: Queryable, missionId: string, organizationId: string) {
  const [counts, persisted, human] = await Promise.all([
    client.query<{ observation_type: string; count: number | string }>(
      `SELECT observation_type, COUNT(*)::INT AS count FROM public.action_observations
       WHERE mission_id = $1 AND organization_id = $2 GROUP BY observation_type`, [missionId, organizationId],
    ),
    client.query<{ metric_key: string; value_kind: MetricValue['kind']; numeric_value: string | null; unit: string; reason: string | null; measured_at: string | Date; attribution_status: string }>(
      `SELECT DISTINCT ON (metric_key) metric_key, value_kind, numeric_value::TEXT, unit, reason, measured_at, attribution_status
       FROM public.action_mission_metrics WHERE mission_id = $1 AND organization_id = $2 AND is_demo = FALSE
       ORDER BY metric_key, measured_at DESC`, [missionId, organizationId],
    ),
    client.query<{ minutes: string | null }>(
      `SELECT SUM(COALESCE(human_minutes, 0))::TEXT AS minutes FROM public.action_cost_entries
       WHERE mission_id = $1 AND organization_id = $2 AND nature IN ('actual','reversal')`, [missionId, organizationId],
    ),
  ])
  const byType = new Map(counts.rows.map((row) => [row.observation_type, Number(row.count)]))
  const metrics: Record<string, MetricValue> = {
    contacted_opportunities: known(String(byType.get('external_message_sent') ?? 0), 'count'),
    positive_responses: known(String(byType.get('positive_response') ?? 0), 'count'),
    meetings_booked: known(String(byType.get('meeting_booked') ?? 0), 'count'),
    proposals_sent: known(String(byType.get('proposal_sent') ?? 0), 'count'),
    signed_revenue: { kind: 'unknown', reason: 'confirmed_revenue_snapshot_required', unit: 'BRL' } as MetricValue,
    unsubscribe_rate: ratio(byType.get('unsubscribe') ?? 0, byType.get('external_message_sent') ?? 0),
    complaint_count: known(String(byType.get('complaint') ?? 0), 'count'),
    external_messages_sent: known(String(byType.get('external_message_sent') ?? 0), 'count'),
    human_hours: human.rows[0]?.minutes ? known(formatMinutesAsHours(human.rows[0].minutes), 'hours') : known('0', 'hours'),
  }
  for (const row of persisted.rows) {
    if (['signed_revenue','recovered_revenue_brl'].includes(row.metric_key)
      && row.value_kind === 'known' && row.attribution_status !== 'versioned') {
      metrics[row.metric_key] = { kind: 'unknown', reason: 'attribution_policy_legacy_unversioned', unit: row.unit }
      continue
    }
    if (row.value_kind === 'known' && row.numeric_value !== null) {
      metrics[row.metric_key] = known(row.numeric_value, row.unit)
    } else if (row.value_kind === 'unknown') {
      metrics[row.metric_key] = { kind: 'unknown', reason: row.reason ?? 'metric_source_unavailable', unit: row.unit }
    } else {
      metrics[row.metric_key] = { kind: 'not_applicable', reason: row.reason ?? 'metric_not_applicable', unit: row.unit }
    }
  }
  return metrics
}

export async function evaluateMission(client: Queryable, input: {
  missionId: string; organizationId: string; checkpointKey: string; idempotencyKey: string;
  signedRevenue: MetricValue; criticalGuardrailBreached?: boolean; killSwitchActive?: boolean;
  minimumSampleReached?: boolean; offTrack?: boolean; requiredMetricUnknownIsBlocking?: boolean;
  economics: MissionEconomics
}) {
  const mission = await getMission(client, input.missionId, input.organizationId)
  if (!mission) throw new Error('mission_not_found')
  const target = String(mission.parameters.targetRevenueBrl ?? '0')
  const decision = decideMissionConclusion({
    targetRevenueBrl: target, signedRevenue: input.signedRevenue, deadlineAt: mission.deadlineAt,
    now: new Date().toISOString(), criticalGuardrailBreached: input.criticalGuardrailBreached ?? false,
    killSwitchActive: input.killSwitchActive ?? false, minimumSampleReached: input.minimumSampleReached ?? false,
    offTrack: input.offTrack ?? false, requiredMetricUnknownIsBlocking: input.requiredMetricUnknownIsBlocking ?? true,
  })
  const persistedDecision = ({ continue: 'continue', pause: 'pause', block: 'pause', propose_replan: 'replan', succeed: 'succeed', fail: 'fail', expire: 'expire' } as const)[decision.conclusion]
  const evaluation = await recordEvaluation(client, {
    organizationId: input.organizationId, missionId: input.missionId, planId: mission.activePlanId,
    checkpointKey: input.checkpointKey, idempotencyKey: input.idempotencyKey, decision: persistedDecision,
    metricSnapshot: { signedRevenue: input.signedRevenue }, economicsSnapshot: input.economics,
    rationale: { conclusion: decision.conclusion, reasons: decision.reasons },
  })
  return { ...evaluation, conclusion: decision.conclusion, reasons: decision.reasons }
}

function known(value: string, unit: string): MetricValue { return { kind: 'known', value: value as `${number}`, unit } }
function ratio(numerator: number, denominator: number): MetricValue {
  if (denominator === 0) return { kind: 'not_applicable', reason: 'zero_denominator', unit: 'ratio' }
  return known((numerator / denominator).toFixed(4), 'ratio')
}
function decimalAtLeast(left: string, right: string): boolean {
  const scale = Math.max((left.split('.')[1] ?? '').length, (right.split('.')[1] ?? '').length)
  const parse = (value: string) => { const [whole, fraction = ''] = value.split('.'); return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, '0') || '0') }
  return parse(left) >= parse(right)
}
function formatMinutesAsHours(minutes: string): `${number}` {
  const totalMinutes = BigInt(minutes.split('.')[0] || '0')
  const hundredths = (totalMinutes * 100n + 30n) / 60n
  return `${hundredths / 100n}.${(hundredths % 100n).toString().padStart(2, '0')}` as `${number}`
}
