import type pg from 'pg'
import { radarOperationRefSchema,type RadarOperationRef,type RadarMissionContext } from '../radar/action-engine-contracts.js'
import { getRadarCaptureOperation } from '../radar/capture-operation.js'
import { getRadarResearchRequest } from '../radar/research-requests.js'
import { resolveRadarMissionActor,radarMissionError } from '../radar/action-engine-access.js'
import { recordDomainEvent } from '../events/repository.js'
import type { AppJobQueue } from '../../server.js'
import { renewMissionResourceClaims } from './resource-claims.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { recoverRadarMissionCommandResult } from '../radar/action-engine-store.js'

const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'?v as Record<string,unknown>:{}
const number=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:0
export function classifyRadarOperation(ref:RadarOperationRef,value:unknown,now=new Date()):Record<string,unknown> {
  const row=object(value),c=object(row.counts),items=Array.isArray(row.items)?row.items.map(object):[]
  const state=String(row.status??row.state??'blocked')
  const pending=['accepted','queued','discovering','researching','running'].includes(state)
    ||state==='partial'&&number(c.researching)>0
  if(pending)return{status:'pending',ref,nextCheckAt:new Date(now.getTime()+15_000).toISOString()}
  const status=['completed','unchanged'].includes(state)?'completed':state==='partial'?'partial':'blocked'
  return{status,ref,counts:{
    requested:number(c.requested)||items.length,found:number(c.admitted)||items.length,
    complete:number(c.completed)||items.filter(i=>['completed','unchanged'].includes(String(i.state))).length,
    withGaps:number(c.completedWithGaps)||number(c.insufficient),
    outsideProfile:number(c.outsideProfile),waiting:number(c.blocked)||items.filter(i=>i.state==='waiting').length,
    approved:number(c.approvedByHuman),
  },message:status==='blocked'?'A pesquisa aguarda uma ação do responsável.':status==='partial'?'A pesquisa terminou com lacunas ou quantidade parcial.':'A pesquisa foi finalizada; os resultados aguardam a revisão aplicável.',
    campaignHref:`/client-workspaces/ORGANIZATION/comercial/radar/${ref.campaignId}`,
  }
}

export async function inspectRadarMissionOperation(pool:pg.Pool,context:RadarMissionContext,raw:unknown) {
  const ref=radarOperationRefSchema.parse(raw)
  const link=(await pool.query(
    `SELECT id FROM public.action_radar_operation_links WHERE organization_id=$1 AND mission_id=$2
      AND operation_type=$3 AND operation_id=$4 AND request_id=$5 AND campaign_id=$6
      AND configuration_revision=$7 AND criteria_revision=$8`,
    [context.organizationId,context.missionId,ref.operationType,ref.operationId,ref.requestId,ref.campaignId,ref.configurationRevision,ref.criteriaRevision],
  )).rows[0]
  if(!link)throw radarMissionError('radar_mission_operation_unlinked',403)
  const user=await resolveRadarMissionActor(pool,context)
  const value=ref.operationType==='capture'
    ?await getRadarCaptureOperation(pool,user,context.organizationId,ref.operationId)
    :await getRadarResearchRequest(pool,user,context.organizationId,ref.requestId)
  const result=classifyRadarOperation(ref,value)
  if(typeof result.campaignHref==='string')result.campaignHref=result.campaignHref.replace('ORGANIZATION',context.organizationId)
  return result
}

/** Database polling only; never invokes research providers or starts a lot. */
export async function reconcileRadarMissionOperations(pool:pg.Pool,queue:AppJobQueue,options:{limit?:number;now?:Date}={}) {
  const limit=Math.max(1,Math.min(100,options.limit??25))
  // Global maintenance reads only Engine run metadata. Radar reads and writes
  // always use a fresh connection carrying exactly one organization.
  const organizations=(await pool.query<{organization_id:string}>(
    `SELECT run.organization_id,MIN(run.available_at) AS oldest FROM public.action_runs run
     JOIN public.action_missions mission ON mission.id=run.mission_id
     JOIN public.action_plan_steps step ON step.id=run.plan_step_id
     WHERE mission.status='active' AND (
       run.status='running' AND run.claimed_by='radar_operation_wait' AND run.available_at<=$2
       OR run.status='succeeded' AND run.claimed_by='radar_needs_schedule'
       OR run.status='running' AND step.capability_key LIKE 'radar.%' AND step.capability_key<>'radar.operation.await' AND run.claimed_at<$2-INTERVAL '2 minutes')
     GROUP BY run.organization_id ORDER BY oldest LIMIT $1`,[limit,options.now??new Date()],
  )).rows
  let checked=0,resolved=0
  for(const organization of organizations){
    if(checked>=limit)break
    const result=await runWithDatabaseRequestContext({role:'yux_operator',organizationIds:[organization.organization_id],serviceRole:'worker'},
      ()=>reconcileTenantRadarOperations(pool,queue,{...options,limit:limit-checked,organizationId:organization.organization_id}))
    checked+=result.checked;resolved+=result.resolved
  }
  return{checked,resolved}
}

async function reconcileTenantRadarOperations(pool:pg.Pool,queue:AppJobQueue,options:{limit:number;now?:Date;organizationId:string}) {
  const client=await pool.connect()
  const toSchedule:Array<{id:string;mission_id:string;organization_id:string}>=[]
  let checked=0,resolved=0
  try {
    await client.query('BEGIN')
    const rows=(await client.query(
      `SELECT run.*,mission.created_by,mission.deadline_at,step.capability_key FROM public.action_runs run
       JOIN public.action_missions mission ON mission.id=run.mission_id AND mission.organization_id=run.organization_id
       JOIN public.action_plan_steps step ON step.id=run.plan_step_id
       WHERE mission.status='active' AND mission.organization_id=$3 AND (
         run.status='running' AND run.claimed_by='radar_operation_wait' AND run.available_at<=$2
         OR run.status='succeeded' AND run.claimed_by='radar_needs_schedule'
         OR run.status='running' AND step.capability_key LIKE 'radar.%' AND step.capability_key<>'radar.operation.await' AND run.claimed_at<$2-INTERVAL '2 minutes')
       ORDER BY run.available_at FOR UPDATE OF run SKIP LOCKED LIMIT $1`,
      [options.limit,options.now??new Date(),options.organizationId],
    )).rows
    for(const row of rows) {
      checked++
      if(row.status==='succeeded'){toSchedule.push(row);continue}
      let output:Record<string,unknown>
      try {
        if(row.deadline_at&&new Date(row.deadline_at)<=(options.now??new Date()))throw radarMissionError('radar_mission_deadline')
        await renewMissionResourceClaims(client,row.mission_id,row.organization_id,900)
        const context={
          organizationId:row.organization_id,missionId:row.mission_id,actionRunId:row.id,
          actorUserId:row.created_by,idempotencyKey:row.idempotency_key,
        }
        if(row.capability_key==='radar.operation.await'){
          const ref=object(object(row.output).output).ref
          output=await inspectRadarMissionOperation(pool,context,ref)
        } else {
          await resolveRadarMissionActor(pool,context)
          output=await recoverRadarMissionCommandResult(client,context)??{status:'blocked',message:'A ação interrompida precisa ser revisada.'}
        }
      } catch {output={status:'blocked',message:'A pesquisa aguarda uma ação do responsável.'}}
      if(output.status==='pending') {
        await client.query("UPDATE public.action_runs SET available_at=$2,updated_at=NOW() WHERE id=$1",[row.id,output.nextCheckAt])
        continue
      }
      const blocked=output.status==='blocked'
      await client.query(
        `UPDATE public.action_runs SET status=$2,output=$3::jsonb,completed_at=CASE WHEN $2='succeeded' THEN NOW() ELSE NULL END,
          claimed_by=$4,last_error=CASE WHEN $2='blocked' THEN 'radar_operation_needs_action' ELSE NULL END,updated_at=NOW() WHERE id=$1`,
        [row.id,blocked?'blocked':'succeeded',JSON.stringify({output,effectProduced:!blocked&&row.capability_key!=='radar.operation.await'}),blocked?'radar_blocked':'radar_needs_schedule'],
      )
      if(!blocked)await client.query("UPDATE public.action_run_attempts SET status='succeeded',output_snapshot=$2::jsonb,completed_at=NOW() WHERE run_id=$1 AND status='running'",[row.id,JSON.stringify({output,effectProduced:row.capability_key!=='radar.operation.await'})])
      await recordDomainEvent(client,{
        eventType:blocked?'action.waiting':'action.succeeded',organizationId:row.organization_id,aggregateType:'action_run',aggregateId:row.id,
        actor:{type:'system'},payload:{missionId:row.mission_id,capabilityKey:row.capability_key,status:output.status},
      })
      resolved++
      if(!blocked)toSchedule.push(row)
    }
    await client.query('COMMIT')
  } catch(error){await client.query('ROLLBACK').catch(()=>undefined);throw error}
  finally{client.release()}
  for(const row of toSchedule) {
    try {
      await queue.add('action-engine.scheduleReadyActions',{missionId:row.mission_id,organizationId:row.organization_id},{jobId:`radar-ready-${row.id}`})
      await pool.query("UPDATE public.action_runs SET claimed_by='radar_reconciled' WHERE id=$1 AND status='succeeded' AND claimed_by='radar_needs_schedule'",[row.id])
    } catch { /* persisted marker retries a lost queue acknowledgement */ }
  }
  return{checked,resolved}
}
