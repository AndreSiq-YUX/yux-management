import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import type { RadarMissionContext } from './action-engine-contracts.js'
import { isRadarEnabledOrganization } from './repository.js'
import { createHash } from 'node:crypto'

export const radarMissionError=(code:string,statusCode=409)=>Object.assign(new Error(code),{statusCode})
export async function resolveRadarMissionActor(pool:Pick<pg.Pool,'query'>,context:RadarMissionContext):Promise<AuthUser> {
  const row=(await pool.query(
    `SELECT principal.id,principal.email,principal.display_name AS name,principal.role,principal.is_active,
            mission.created_by,mission.organization_id,mission.status,mission.mode
       FROM public.action_missions mission JOIN public.app_users principal ON principal.id=$3
      WHERE mission.id=$1 AND mission.organization_id=$2`,
    [context.missionId,context.organizationId,context.actorUserId],
  )).rows[0]
  if(!row||row.organization_id!==context.organizationId)throw radarMissionError('radar_mission_scope_forbidden',403)
  if(row.role!=='yux_admin'||!row.is_active||row.created_by!==context.actorUserId)throw radarMissionError('radar_mission_actor_forbidden',403)
  if(row.mode!=='assisted')throw radarMissionError('radar_mission_mode_unsupported',403)
  if(['cancelled','succeeded','failed','expired','paused'].includes(row.status))throw radarMissionError('radar_mission_not_active')
  if(!await isRadarEnabledOrganization(pool,context.organizationId))throw radarMissionError('radar_mission_not_entitled',403)
  return {id:row.id,email:row.email??'',name:row.name??'',role:row.role}
}

export async function assertRadarMissionResource(pool:Pick<pg.Pool,'query'>,context:RadarMissionContext,scope:{campaignId?:string;operationId?:string;candidateIds?:string[]}) {
  if(scope.campaignId) {
    const row=(await pool.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2',[scope.campaignId,context.organizationId])).rows[0]
    if(!row)throw radarMissionError('radar_mission_scope_forbidden',403)
  }
  if(scope.operationId) {
    const row=(await pool.query('SELECT id FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2',[scope.operationId,context.organizationId])).rows[0]
    if(!row)throw radarMissionError('radar_mission_scope_forbidden',403)
  }
  if(scope.candidateIds?.length) {
    const ids=[...new Set(scope.candidateIds)]
    const rows=(await pool.query('SELECT id FROM public.radar_candidate_records WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND campaign_id=$3',[ids,context.organizationId,scope.campaignId])).rows
    if(rows.length!==ids.length)throw radarMissionError('radar_mission_scope_forbidden',403)
  }
}

/** The executor already consumed the lease; commands verify its exact active fence. */
export async function assertRadarMissionMutation(pool:Pick<pg.Pool,'query'>,context:RadarMissionContext,capabilityKey:string) {
  if(!context.mutationLease||!context.fencingToken)throw radarMissionError('radar_mission_lease_required',403)
  const row=(await pool.query(
    `SELECT lease.id FROM public.action_mutation_leases lease
      JOIN public.action_runs run ON run.id=lease.action_run_id AND run.mission_id=lease.mission_id
      WHERE lease.organization_id=$1 AND lease.mission_id=$2 AND lease.action_run_id=$3
        AND lease.capability_key=$4 AND lease.fencing_token=$5::bigint AND lease.token_hash=$6
        AND lease.consumed=TRUE AND lease.revoked_at IS NULL AND lease.expires_at>NOW()
        AND run.status='running' AND EXISTS(
          SELECT 1 FROM public.action_resource_claims claim WHERE claim.organization_id=$1
            AND claim.mission_id=$2 AND claim.fencing_token=lease.fencing_token
            AND claim.active=TRUE AND claim.lease_expires_at>NOW())`,
    [context.organizationId,context.missionId,context.actionRunId,capabilityKey,context.fencingToken,createHash('sha256').update(context.mutationLease).digest('hex')],
  )).rows[0]
  if(!row)throw radarMissionError('radar_mission_lease_invalid',403)
}
