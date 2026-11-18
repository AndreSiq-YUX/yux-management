import type { Queryable } from '../action-engine/repository.js'
import { reconcilePlanningCost } from '../action-engine/planning-cycle.js'

type PlanningHistoryRow = {
  id: string
  revision: number
  state: 'active' | 'exhausted' | 'completed' | 'cancelled'
  started_at: Date | string
  reserved_brl: string
  measurement: unknown
}

function nonnegativeAmount(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export async function loadPlanningHistory(pool: Queryable, scope: {
  organizationId: string
  missionId: string
  contractId?: string
}) {
  const { rows } = await pool.query<PlanningHistoryRow>(
    `SELECT reservation.id, cycle.plan_revision AS revision, cycle.status AS state,
            reservation.created_at AS started_at, reservation.cost_brl::text AS reserved_brl, actual.measurement
     FROM public.action_missions mission
     JOIN public.action_pack_versions version ON version.id = mission.pack_version_id
     JOIN public.action_packs pack ON pack.id = version.pack_id AND pack.key <> 'radar_prospecting'
     JOIN public.action_planning_cycles cycle
       ON cycle.mission_id = mission.id AND cycle.organization_id = mission.organization_id
       AND cycle.pack_key <> 'radar_prospecting' AND strpos(cycle.pack_version, 'radar_prospecting@') = 0
     JOIN public.action_planning_usage_entries reservation
       ON reservation.cycle_id = cycle.id AND reservation.organization_id = cycle.organization_id
       AND reservation.nature = 'reservation'
     LEFT JOIN LATERAL (
       SELECT CASE WHEN entry.nature = 'release' AND (entry.metadata->>'reason' = 'mission_plan_spec_changed'
         OR entry.metadata->'confirmedNotStarted' = 'true'::jsonb) THEN
         jsonb_build_object('reportedCostUsd', 0, 'recognizedCostBrl', '0', 'pendingReconciliation', FALSE)
         ELSE entry.metadata->'measurements' END AS measurement
       FROM public.action_planning_usage_entries entry
       WHERE entry.cycle_id = cycle.id AND entry.organization_id = cycle.organization_id
         AND entry.reservation_id = reservation.id AND entry.nature IN ('actual', 'release')
       ORDER BY entry.created_at DESC, entry.id DESC LIMIT 1
     ) actual ON TRUE
     WHERE mission.organization_id = $1 AND mission.id = $2 AND mission.contract_id IS NOT DISTINCT FROM $3::uuid
     ORDER BY cycle.plan_revision DESC, reservation.created_at DESC, reservation.id DESC LIMIT 10`,
    [scope.organizationId, scope.missionId, scope.contractId ?? null],
  )
  return rows.map(row => {
    const measurement = row.measurement && typeof row.measurement === 'object' ? row.measurement as Record<string, unknown> : {}
    const { measurements } = reconcilePlanningCost(measurement.stages, row.reserved_brl)
    const totalUsd = nonnegativeAmount(measurement.reportedCostUsd)
    const reconciledBrl = measurement.pendingReconciliation === false && typeof measurement.recognizedCostBrl === 'string'
      && /^\d+(\.\d{1,6})?$/.test(measurement.recognizedCostBrl) ? measurement.recognizedCostBrl : null
    return {
      id: row.id, revision: row.revision, state: row.state, startedAt: new Date(row.started_at).toISOString(),
      reservedBrl: row.reserved_brl, reconciledBrl, totalUsd,
      knownSubtotalUsd: totalUsd ?? nonnegativeAmount(measurement.knownCostSubtotalUsd) ?? measurements.knownCostSubtotalUsd,
      stages: measurements.stages.flatMap(stage => stage.node ? [{
        name: stage.node, attempts: stage.attemptCount, inputTokens: stage.knownInputTokens,
        outputTokens: stage.knownOutputTokens, reasoningTokens: stage.knownReasoningTokens,
        confirmedUsd: stage.knownCostSubtotalUsd,
      }] : []),
    }
  })
}
