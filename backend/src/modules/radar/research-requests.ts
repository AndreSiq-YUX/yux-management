import {createHash,randomUUID} from 'node:crypto'
import type pg from 'pg'
import {z} from 'zod'
import type {AuthUser} from '../../auth/routes.js'
import type {AppEnv} from '../../config/env.js'
import type {RegisteredJobQueue} from '../../jobs/registry.js'
import {requireRadarScope} from './access.js'
import {loadRadarOperationalLimits} from './operational-limits.js'
import {startRadarCandidateResearch} from './research-service.js'
import {assessRadarCaptureResearch} from './capture-research-state.js'

export const radarResearchRequestSchema=z.object({organizationId:z.uuid(),campaignId:z.uuid(),candidateIds:z.array(z.uuid()).min(1),requestId:z.uuid(),criteriaRevision:z.number().int().positive(),intent:z.enum(['resume','refresh','reanalyze']),analysisAuthorizationId:z.uuid().optional(),allowSemanticRefresh:z.boolean().optional()}).strict()
export type RadarResearchRequestInput=z.infer<typeof radarResearchRequestSchema>
type RequestRow=pg.QueryResultRow&{id:string;organization_id:string;campaign_id:string;request_id:string;requested_by:string;criteria_revision:number;configuration_revision:number;intent:RadarResearchRequestInput['intent'];status:string;intent_hash:string;analysis_authorization_id?:string;analysis_refresh_authorization?:{approvedBy:string;candidateIds:string[];configurationRevision:number}}
type ItemRow=pg.QueryResultRow&{id:string;candidate_id:string;state:string;run_id?:string;reason_code?:string;dispatch_generation:number}
const failure=(code:string,statusCode=409)=>Object.assign(Error(code),{statusCode})
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{}
export function projectRadarResearchRequest(value:unknown){
 const row=object(value)
 const message=(state:unknown)=>state==='unchanged'?'Os dados disponíveis já foram conferidos.':state==='waiting'?'Esta empresa aguarda uma etapa da pesquisa.':state==='completed'?'Pesquisa desta empresa finalizada.':'Pesquisa solicitada.'
 return{requestId:row.request_id??row.id,state:row.status,items:(Array.isArray(row.items)?row.items:[]).map(value=>{const item=object(value);return{candidateId:item.candidate_id,state:item.state,message:message(item.state)}})}
}
async function requestWithItems(db:Pick<pg.Pool,'query'>,row:RequestRow){
 const items=(await db.query<ItemRow>('SELECT * FROM public.radar_research_request_items WHERE research_request_id=$1 AND organization_id=$2 ORDER BY created_at,id',[row.id,row.organization_id])).rows
 return{...row,items}
}
export async function getRadarResearchRequest(pool:pg.Pool,user:AuthUser,organizationId:string,requestId:string){
 await requireRadarScope(pool,user,{organizationId},false)
 const row=(await pool.query<RequestRow>('SELECT * FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[organizationId,requestId])).rows[0]
 if(!row)throw failure('radar_research_request_not_found',404)
 return projectRadarResearchRequest(await requestWithItems(pool,row))
}
export async function enqueueRadarResearchRequest(pool:pg.Pool,queue:Pick<RegisteredJobQueue,'add'>,organizationId:string,requestId:string){
 const row=(await pool.query('SELECT id FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[organizationId,requestId])).rows[0]
 if(!row)return false
 try{await queue.add('radar.advanceResearchRequest',{organizationId,researchRequestId:row.id},{jobId:`radar-request-start-${row.id}`});return true}catch{return false}
}
export async function queueRadarResearchRequest(pool:pg.Pool,user:AuthUser,value:RadarResearchRequestInput){
 const input=radarResearchRequestSchema.parse(value),candidateIds=[...new Set(input.candidateIds)].sort()
 if((input.allowSemanticRefresh||input.analysisAuthorizationId)&&user.role!=='yux_admin')throw failure('research_admin_required',403)
 await requireRadarScope(pool,user,{organizationId:input.organizationId,campaignId:input.campaignId},true)
 const intentHash=hash({...input,candidateIds}),client=await pool.connect()
 try{
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-research-request:${input.organizationId}:${input.requestId}`])
  const campaign=(await client.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.campaignId,input.organizationId])).rows[0]
  if(!campaign||campaign.commercial_criteria_revision!==input.criteriaRevision)throw failure('radar_campaign_configuration_changed')
  const prior=(await client.query<RequestRow>('SELECT * FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[input.organizationId,input.requestId])).rows[0]
  if(prior){if(prior.intent_hash!==intentHash)throw failure('radar_research_request_conflict');const result=await requestWithItems(client,prior);await client.query('COMMIT');return projectRadarResearchRequest(result)}
  const limits=await loadRadarOperationalLimits(client)
  if(candidateIds.length>limits.limits.maxVerificationBatch)throw failure('radar_operational_limit_exceeded')
  const candidates=(await client.query('SELECT id FROM public.radar_candidate_records WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND campaign_id=$3',[candidateIds,input.organizationId,input.campaignId])).rows
  if(candidates.length!==candidateIds.length)throw failure('radar_research_request_scope_invalid',403)
  if(input.analysisAuthorizationId){
   const grants=(await client.query('SELECT candidate_id,configuration_revision,expires_at,consumed_at FROM public.radar_analysis_retry_authorizations WHERE request_id=$1 AND organization_id=$2 AND campaign_id=$3',[input.analysisAuthorizationId,input.organizationId,input.campaignId])).rows
   const selected=grants.filter(grant=>candidateIds.includes(grant.candidate_id))
   if(!selected.length||selected.some(grant=>grant.configuration_revision!==campaign.configuration_revision||grant.consumed_at||new Date(grant.expires_at).getTime()<=Date.now()))throw failure('radar_analysis_retry_authorization_invalid')
  }
  const consent=input.allowSemanticRefresh?{approvedBy:user.id,candidateIds,configurationRevision:campaign.configuration_revision}:null
  const row=(await client.query<RequestRow>(`INSERT INTO public.radar_research_requests(organization_id,campaign_id,request_id,requested_by,criteria_revision,configuration_revision,operational_policy_version,intent,intent_hash,analysis_authorization_id,analysis_refresh_authorization)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[input.organizationId,input.campaignId,input.requestId,user.id,input.criteriaRevision,campaign.configuration_revision,campaign.operational_policy_version,input.intent,intentHash,input.analysisAuthorizationId??null,consent?JSON.stringify(consent):null])).rows[0]
  for(const candidateId of candidateIds)await client.query('INSERT INTO public.radar_research_request_items(organization_id,campaign_id,research_request_id,candidate_id) VALUES($1,$2,$3,$4)',[input.organizationId,input.campaignId,row.id,candidateId])
  await client.query('INSERT INTO public.radar_capture_outbox(organization_id,campaign_id,research_request_id) VALUES($1,$2,$3)',[input.organizationId,input.campaignId,row.id])
  const result=await requestWithItems(client,row)
  await client.query('COMMIT');return projectRadarResearchRequest(result)
 }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
type RequestQueue=Pick<RegisteredJobQueue,'add'>
export async function dispatchRadarResearchRequest(pool:pg.Pool,_env:AppEnv,input:{organizationId:string;researchRequestId:string},queue:RequestQueue){
 const lease=randomUUID()
 const row=(await pool.query<RequestRow>(`UPDATE public.radar_research_requests SET lease_id=$3,lease_until=NOW()+INTERVAL '3 minutes',updated_at=NOW()
  WHERE id=$1 AND organization_id=$2 AND status NOT IN('completed','unchanged') AND (lease_id IS NULL OR lease_until<NOW()) RETURNING *`,[input.researchRequestId,input.organizationId,lease])).rows[0]
 if(!row)return
 const setItem=async(item:ItemRow,state:string,reason?:string)=>pool.query('UPDATE public.radar_research_request_items SET state=$3,reason_code=$4,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[item.id,input.organizationId,state,reason??null])
 try{
  const actor=(await pool.query<AuthUser>("SELECT * FROM public.app_users WHERE id=$1 AND is_active=TRUE",[row.requested_by])).rows[0]
  const campaign=(await pool.query('SELECT configuration_revision,status FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2',[row.campaign_id,input.organizationId])).rows[0]
  const items=(await requestWithItems(pool,row)).items
  if(!actor||campaign?.configuration_revision!==row.configuration_revision||campaign.status==='paused'){
   for(const item of items)await setItem(item,'waiting',!actor?'radar_forbidden':'radar_campaign_configuration_changed')
  }else{
   await requireRadarScope(pool,actor,{organizationId:input.organizationId,campaignId:row.campaign_id},true)
   const grant=row.analysis_refresh_authorization
   const allowSemanticRefresh=!!grant&&grant.approvedBy===actor.id&&actor.role==='yux_admin'&&grant.configurationRevision===row.configuration_revision
   for(const item of items){
    if(['unchanged','completed'].includes(item.state))continue
    try{
     if(!item.run_id){
      const run=await startRadarCandidateResearch(pool,actor,{organizationId:input.organizationId,candidateId:item.candidate_id,configurationRevision:row.configuration_revision,requestId:item.id,operation:row.intent,...(allowSemanticRefresh&&grant!.candidateIds.includes(item.candidate_id)?{allowSemanticRefresh:true}:{})})
      await pool.query('UPDATE public.radar_research_request_items SET run_id=$3,started_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND run_id IS NULL',[item.id,input.organizationId,run.runId]);item.run_id=run.runId
      if(run.status==='succeeded'&&run.reused){await setItem(item,'unchanged');continue}
     }
     let run=(await pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE id=$1 AND organization_id=$2',[item.run_id,input.organizationId])).rows[0]
     if(!run)throw failure('radar_research_request_run_missing')
     if(run.status==='running'&&run.lease_until&&new Date(run.lease_until).getTime()<Date.now()){
      // Re-deliver the same DB run after a dead worker lease. Receipt recovery
      // still gates every effect: this is not permission to repeat a paid call.
      await startRadarCandidateResearch(pool,actor,{organizationId:input.organizationId,candidateId:item.candidate_id,configurationRevision:row.configuration_revision,requestId:item.id,operation:'resume'})
      const rotated=(await pool.query('UPDATE public.radar_research_request_items SET dispatch_generation=dispatch_generation+1 WHERE id=$1 AND organization_id=$2 RETURNING dispatch_generation',[item.id,input.organizationId])).rows[0]
      item.dispatch_generation=rotated.dispatch_generation
      run=(await pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE id=$1 AND organization_id=$2',[item.run_id,input.organizationId])).rows[0]
     }
     if(run.status==='queued'){
      const rotated=(await pool.query(`WITH stale AS(UPDATE public.radar_candidate_research_runs SET updated_at=NOW() WHERE id=$3 AND organization_id=$2 AND status='queued' AND updated_at<NOW()-INTERVAL '6 minutes' RETURNING id)
       UPDATE public.radar_research_request_items SET dispatch_generation=dispatch_generation+1 WHERE id=$1 AND organization_id=$2 AND run_id IN(SELECT id FROM stale) RETURNING dispatch_generation`,[item.id,input.organizationId,item.run_id])).rows[0]
      if(rotated)item.dispatch_generation=rotated.dispatch_generation
      await queue.add('radar.researchCandidate',{organizationId:input.organizationId,runId:item.run_id},{jobId:`radar-research-item-${item.id}-${item.dispatch_generation}`})
      await setItem(item,'running')
     }else{
      const assessment=assessRadarCaptureResearch(run as never)
      await setItem(item,assessment.status==='researching'?'running':assessment.status==='completed'?'completed':'waiting',assessment.reason??(assessment.status==='insufficient'?'radar_research_evidence_insufficient':undefined))
     }
    }catch(cause){const code=cause instanceof Error?cause.message:'';await setItem(item,'waiting',/^[a-z][a-z0-9_]{2,159}$/.test(code)?code:'radar_capture_queue_unavailable')}
   }
  }
  const current=await requestWithItems(pool,row),states=current.items.map(item=>item.state)
  const state=states.every(state=>state==='unchanged')?'unchanged':states.every(state=>['unchanged','completed'].includes(state))?'completed':states.some(state=>state==='running'||state==='accepted')?'running':'waiting'
  await pool.query('UPDATE public.radar_research_requests SET status=$3,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND lease_id=$4',[row.id,input.organizationId,state,lease])
  if(['completed','unchanged'].includes(state))await pool.query('DELETE FROM public.radar_capture_outbox WHERE research_request_id=$1 AND organization_id=$2',[row.id,input.organizationId])
  return projectRadarResearchRequest({...current,status:state})
 }finally{
  await pool.query('UPDATE public.radar_research_requests SET lease_id=NULL,lease_until=NULL WHERE id=$1 AND organization_id=$2 AND lease_id=$3',[row.id,input.organizationId,lease])
  await pool.query("UPDATE public.radar_capture_outbox SET next_dispatch_at=NOW()+INTERVAL '20 seconds' WHERE research_request_id=$1 AND organization_id=$2",[row.id,input.organizationId])
 }
}
