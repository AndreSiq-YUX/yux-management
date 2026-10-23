import type pg from 'pg'
import { missionArtifactHash } from '../action-engine/mission-command.js'
import type { RadarMissionContext, RadarOperationRef } from './action-engine-contracts.js'
import { radarMissionError } from './action-engine-access.js'

export async function runRadarMissionCommand<T extends Record<string,unknown>>(
  pool:pg.Pool,context:RadarMissionContext,key:string,input:unknown,
  execute:(client:pg.PoolClient,requestId:string)=>Promise<T>,transactional:boolean,
):Promise<T> {
  const client=await pool.connect()
  let inTransaction=false
  try {
    await client.query('BEGIN');inTransaction=true
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`${context.organizationId}:${context.idempotencyKey}`])
    const hash=missionArtifactHash({key,input})
    let row=(await client.query(
      'SELECT * FROM public.action_radar_commands WHERE organization_id=$1 AND idempotency_key=$2 FOR UPDATE',
      [context.organizationId,context.idempotencyKey],
    )).rows[0]
    if(row) {
      if(row.command_hash!==hash||row.mission_id!==context.missionId||row.action_run_id!==context.actionRunId||row.actor_user_id!==context.actorUserId)
        throw radarMissionError('radar_mission_idempotency_conflict')
      if(row.result!==null) {await client.query('COMMIT');inTransaction=false;return row.result as T}
    } else {
      row=(await client.query(
        `INSERT INTO public.action_radar_commands(organization_id,mission_id,action_run_id,actor_user_id,command_key,idempotency_key,command_hash)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [context.organizationId,context.missionId,context.actionRunId,context.actorUserId,key,context.idempotencyKey,hash],
      )).rows[0]!
    }
    // Radar owns its own durable transaction for capture/research. Persist the
    // request identity first so a crash cannot turn a retry into a new intent.
    if(!transactional) {await client.query('COMMIT');inTransaction=false}
    const result=await execute(client,String(row.request_id))
    await client.query('UPDATE public.action_radar_commands SET result=$2::jsonb,completed_at=NOW() WHERE id=$1 AND result IS NULL',[row.id,JSON.stringify(result)])
    if(inTransaction){await client.query('COMMIT');inTransaction=false}
    return result
  } catch(error) {
    if(inTransaction)await client.query('ROLLBACK').catch(()=>undefined)
    throw error
  } finally {client.release()}
}

export async function attachRadarMissionOperation(client:Pick<pg.Pool,'query'>,context:RadarMissionContext,ref:RadarOperationRef) {
  await client.query(
    `INSERT INTO public.action_radar_operation_links(organization_id,mission_id,action_run_id,operation_type,operation_id,request_id,campaign_id,configuration_revision,criteria_revision)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,action_run_id,operation_type) DO NOTHING`,
    [context.organizationId,context.missionId,context.actionRunId,ref.operationType,ref.operationId,ref.requestId,ref.campaignId,ref.configurationRevision,ref.criteriaRevision],
  )
}
