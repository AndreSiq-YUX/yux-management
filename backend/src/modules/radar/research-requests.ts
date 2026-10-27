import {isRadarCampaignExcluded} from './campaign-exclusions.js'
import {createHash,randomUUID} from 'node:crypto'
import type pg from 'pg'
import {z} from 'zod'
import type {AuthUser} from '../../auth/routes.js'
import type {AppEnv} from '../../config/env.js'
import type {RegisteredJobQueue} from '../../jobs/registry.js'
import {requireRadarScope} from './access.js'
import {loadRadarOperationalLimits} from './operational-limits.js'
import {startRadarCandidateResearch} from './research-service.js'
import {assessRadarResearchProgress} from './capture-research-state.js'
import {createRadarResearchIntentBudget,loadRadarResearchBudgetPolicy,amendRadarResearchIntentBudget} from './research-budget.js'
import {projectRadarCommercialResearchStatus} from './commercial-status.js'

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
 return{requestId:row.request_id??row.id,state:row.status,items:(Array.isArray(row.items)?row.items:[]).map(value=>{const item=object(value);return{candidateId:item.candidate_id,state:item.state,message:message(item.state),feedback:projectRadarCommercialResearchStatus({run:item.research_run??{status:item.state==='accepted'?'queued':'blocked'},previous:item.previous_research})}})}
}
async function requestWithItems(db:Pick<pg.Pool,'query'>,row:RequestRow){
 const items=(await db.query<ItemRow>(`SELECT item.*,to_jsonb(run) AS research_run,CASE WHEN candidate.normalized_payload->>'researchRunId'=item.run_id::text THEN candidate.normalized_payload->'previousResearch' ELSE candidate.normalized_payload END AS previous_research
  FROM public.radar_research_request_items item LEFT JOIN public.radar_candidate_research_runs run ON run.id=item.run_id AND run.organization_id=item.organization_id
  JOIN public.radar_candidate_records candidate ON candidate.id=item.candidate_id AND candidate.organization_id=item.organization_id
  WHERE item.research_request_id=$1 AND item.organization_id=$2 ORDER BY item.created_at,item.id`,[row.id,row.organization_id])).rows
 return{...row,items}
}
export async function getRadarResearchRequest(pool:pg.Pool,user:AuthUser,organizationId:string,requestId:string){
 await requireRadarScope(pool,user,{organizationId},false)
 const row=(await pool.query<RequestRow>('SELECT * FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[organizationId,requestId])).rows[0]
 if(!row)throw failure('radar_research_request_not_found',404)
 return projectRadarResearchRequest(await requestWithItems(pool,row))
}
export async function getLatestRadarResearchRequest(pool:pg.Pool,user:AuthUser,organizationId:string,campaignId:string){
 await requireRadarScope(pool,user,{organizationId,campaignId},false)
 const row=(await pool.query<RequestRow>('SELECT * FROM public.radar_research_requests WHERE organization_id=$1 AND campaign_id=$2 ORDER BY created_at DESC,id DESC LIMIT 1',[organizationId,campaignId])).rows[0]
 return{request:row?projectRadarResearchRequest(await requestWithItems(pool,row)):null}
}
export async function enqueueRadarResearchRequest(pool:pg.Pool,queue:Pick<RegisteredJobQueue,'add'>,organizationId:string,requestId:string){
 const row=(await pool.query('SELECT id FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[organizationId,requestId])).rows[0]
 if(!row)return false
 try{await queue.add('radar.advanceResearchRequest',{organizationId,researchRequestId:row.id},{jobId:`radar-request-start-${row.id}`});return true}catch{return false}
}
export async function queueRadarResearchRequest(pool:pg.Pool,user:AuthUser,value:RadarResearchRequestInput,options:{client?:pg.PoolClient}={}){
 const input=radarResearchRequestSchema.parse(value),candidateIds=[...new Set(input.candidateIds)].sort()
 if((input.allowSemanticRefresh||input.analysisAuthorizationId)&&user.role!=='yux_admin')throw failure('research_admin_required',403)
 await requireRadarScope(pool,user,{organizationId:input.organizationId,campaignId:input.campaignId},true)
 const intentHash=hash({...input,candidateIds}),client=options.client??await pool.connect(),ownsTransaction=!options.client
 try{
  if(ownsTransaction)await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-research-request:${input.organizationId}:${input.requestId}`])
  const campaign=(await client.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.campaignId,input.organizationId])).rows[0]
  if(!campaign||campaign.commercial_criteria_revision!==input.criteriaRevision)throw failure('radar_campaign_configuration_changed')
  const prior=(await client.query<RequestRow>('SELECT * FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[input.organizationId,input.requestId])).rows[0]
  if(prior){if(prior.intent_hash!==intentHash)throw failure('radar_research_request_conflict');const result=await requestWithItems(client,prior);if(ownsTransaction)await client.query('COMMIT');return projectRadarResearchRequest(result)}
  const limits=await loadRadarOperationalLimits(client)
  if(candidateIds.length>limits.limits.maxNewCompaniesPerLot)throw failure('radar_operational_limit_exceeded')
  const candidates=(await client.query('SELECT id FROM public.radar_candidate_records WHERE id=ANY($1::uuid[]) AND organization_id=$2 AND campaign_id=$3',[candidateIds,input.organizationId,input.campaignId])).rows
  if(candidates.length!==candidateIds.length)throw failure('radar_research_request_scope_invalid',403)
  for(const candidateId of candidateIds)if(await isRadarCampaignExcluded(client,{organizationId:input.organizationId,campaignId:input.campaignId,identity:{candidateId},criteriaRevision:campaign.configuration_revision}))throw failure('radar_candidate_excluded')
  if(input.analysisAuthorizationId){
   const grants=(await client.query('SELECT candidate_id,configuration_revision,expires_at,consumed_at FROM public.radar_analysis_retry_authorizations WHERE request_id=$1 AND organization_id=$2 AND campaign_id=$3',[input.analysisAuthorizationId,input.organizationId,input.campaignId])).rows
   const selected=grants.filter(grant=>candidateIds.includes(grant.candidate_id))
   if(!selected.length||selected.some(grant=>grant.configuration_revision!==campaign.configuration_revision||grant.consumed_at||new Date(grant.expires_at).getTime()<=Date.now()))throw failure('radar_analysis_retry_authorization_invalid')
  }
  const consent=input.allowSemanticRefresh?{approvedBy:user.id,candidateIds,configurationRevision:campaign.configuration_revision}:null
  const row=(await client.query<RequestRow>(`INSERT INTO public.radar_research_requests(organization_id,campaign_id,request_id,requested_by,criteria_revision,configuration_revision,operational_policy_version,intent,intent_hash,analysis_authorization_id,analysis_refresh_authorization)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[input.organizationId,input.campaignId,input.requestId,user.id,input.criteriaRevision,campaign.configuration_revision,campaign.operational_policy_version,input.intent,intentHash,input.analysisAuthorizationId??null,consent?JSON.stringify(consent):null])).rows[0]
  const previous=(await client.query(`SELECT DISTINCT ON(candidate_id) id,candidate_id,calls FROM public.radar_candidate_research_runs WHERE organization_id=$1 AND campaign_id=$2 AND candidate_id=ANY($3::uuid[]) AND configuration_revision=$4 ORDER BY candidate_id,created_at DESC`,[input.organizationId,input.campaignId,candidateIds,campaign.configuration_revision])).rows
  const budgetPolicy=await loadRadarResearchBudgetPolicy(client,{organizationId:input.organizationId,configuration:campaign.search_configuration,policy:limits})
  for(const candidateId of candidateIds){
   const budget=createRadarResearchIntentBudget({requestId:input.requestId,approvedBy:user.id,policy:budgetPolicy,previousRun:previous.find(run=>run.candidate_id===candidateId) as {id:string;calls:Record<string,{source:string;status:string}>}|undefined})
   await client.query('INSERT INTO public.radar_research_request_items(organization_id,campaign_id,research_request_id,candidate_id,research_budget) VALUES($1,$2,$3,$4,$5)',[input.organizationId,input.campaignId,row.id,candidateId,JSON.stringify(budget)])
  }
  await client.query('INSERT INTO public.radar_capture_outbox(organization_id,campaign_id,research_request_id) VALUES($1,$2,$3)',[input.organizationId,input.campaignId,row.id])
  const result=await requestWithItems(client,row)
  if(ownsTransaction)await client.query('COMMIT');return projectRadarResearchRequest(result)
 }catch(cause){if(ownsTransaction)await client.query('ROLLBACK');throw cause}finally{if(ownsTransaction)client.release()}
}
type RequestQueue=Pick<RegisteredJobQueue,'add'>
export const radarResearchBudgetAuthorizationSchema=z.object({organizationId:z.uuid(),requestId:z.uuid(),expectedBudgetRevision:z.number().int().positive(),authorizationId:z.uuid()}).strict()
export async function authorizeRadarResearchBudget(pool:pg.Pool,user:AuthUser,value:z.infer<typeof radarResearchBudgetAuthorizationSchema>){
 if(user.role!=='yux_admin')throw failure('research_admin_required',403)
 const input=radarResearchBudgetAuthorizationSchema.parse(value)
 await requireRadarScope(pool,user,{organizationId:input.organizationId},true)
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  const active=(await client.query("SELECT id FROM public.app_users WHERE id=$1 AND is_active=TRUE AND role='yux_admin'",[user.id])).rows[0]
  if(!active)throw failure('research_admin_required',403)
  const initial=(await client.query('SELECT campaign_id FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2',[input.organizationId,input.requestId])).rows[0]
  if(!initial)throw failure('radar_research_request_not_found',404)
  const campaign=(await client.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[initial.campaign_id,input.organizationId])).rows[0]
  const row=(await client.query<RequestRow>('SELECT * FROM public.radar_research_requests WHERE organization_id=$1 AND request_id=$2 FOR UPDATE',[input.organizationId,input.requestId])).rows[0]
  if(row.budget_authorizations.some((entry:{authorizationId:string})=>entry.authorizationId===input.authorizationId)){await client.query('COMMIT');return{budgetRevision:row.budget_revision}}
  if(row.budget_revision!==input.expectedBudgetRevision)throw failure('radar_intent_budget_stale')
  if(campaign?.configuration_revision!==row.configuration_revision)throw failure('radar_campaign_configuration_changed')
  if(row.lease_until&&new Date(row.lease_until).getTime()>Date.now())throw failure('radar_research_request_busy')
  const items=(await requestWithItems(client,row)).items.filter(item=>item.state==='waiting')
  if(!items.length)throw failure('radar_intent_budget_no_waiting_items')
  const policy=await loadRadarResearchBudgetPolicy(client,{organizationId:input.organizationId,configuration:campaign.search_configuration,policy:await loadRadarOperationalLimits(client)})
  const audit:unknown[]=[]
  for(const item of items){
   const latest=(await client.query('SELECT id,status FROM public.radar_candidate_research_runs WHERE candidate_id=$1 AND organization_id=$2 ORDER BY created_at DESC LIMIT 1 FOR UPDATE',[item.candidate_id,input.organizationId])).rows[0]
   if(!item.research_budget)throw failure('radar_intent_budget_legacy_requires_new_intent')
   if(latest&&latest.id!==(item.run_id??item.research_budget.baselineRunId))throw failure('radar_intent_budget_run_superseded')
   if(latest&&['queued','running'].includes(latest.status))throw failure('radar_research_request_busy')
   const next=amendRadarResearchIntentBudget(item.research_budget,policy,user.id)
   audit.push({candidateId:item.candidate_id,previous:item.research_budget,next})
   await client.query("UPDATE public.radar_research_request_items SET research_budget=$3,resume_pending=$4,state='accepted',reason_code=NULL,updated_at=NOW() WHERE id=$1 AND organization_id=$2",[item.id,input.organizationId,JSON.stringify(next),!!item.run_id])
  }
  const revision=row.budget_revision+1
  const authorization={authorizationId:input.authorizationId,approvedBy:user.id,approvedAt:new Date().toISOString(),revision,items:audit}
  await client.query("UPDATE public.radar_research_requests SET budget_revision=$3,budget_authorizations=budget_authorizations||$4::jsonb,status='accepted',updated_at=NOW() WHERE id=$1 AND organization_id=$2",[row.id,input.organizationId,revision,JSON.stringify([authorization])])
  await client.query('INSERT INTO public.radar_capture_outbox(organization_id,campaign_id,research_request_id) VALUES($1,$2,$3) ON CONFLICT(research_request_id) DO UPDATE SET next_dispatch_at=NOW()',[input.organizationId,row.campaign_id,row.id])
  await client.query('COMMIT');return{budgetRevision:revision}
 }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
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
  let permitted=!!actor
  if(actor)try{await requireRadarScope(pool,actor,{organizationId:input.organizationId,campaignId:row.campaign_id},true)}catch(cause){if((cause as {statusCode?:number}).statusCode!==403)throw cause;permitted=false}
  if(!permitted||campaign?.configuration_revision!==row.configuration_revision||campaign.status==='paused'){
   for(const item of items)await setItem(item,'waiting',!permitted?'radar_forbidden':'radar_campaign_configuration_changed')
  }else{
   const grant=row.analysis_refresh_authorization
   const allowSemanticRefresh=!!grant&&grant.approvedBy===actor.id&&actor.role==='yux_admin'&&grant.configurationRevision===row.configuration_revision
   const policy=await loadRadarOperationalLimits(pool)
   // One durable intent can exceed a worker dispatch window. Oldest attempted
   // items rotate fairly; waiting companies cannot starve newly accepted ones.
   const window=items.filter(item=>!['unchanged','completed'].includes(item.state)).sort((a,b)=>(a.state==='accepted'?0:1)-(b.state==='accepted'?0:1)||new Date(a.updated_at).getTime()-new Date(b.updated_at).getTime()).slice(0,policy.limits.maxVerificationBatch)
   for(const item of window){
    if(['unchanged','completed'].includes(item.state))continue
    try{
     if(!item.run_id){
      const run=await startRadarCandidateResearch(pool,actor,{organizationId:input.organizationId,candidateId:item.candidate_id,configurationRevision:row.configuration_revision,requestId:item.id,operation:row.intent,...(allowSemanticRefresh&&grant!.candidateIds.includes(item.candidate_id)?{allowSemanticRefresh:true,analysisRefreshRequestId:row.request_id}:{})})
      await pool.query('UPDATE public.radar_research_request_items SET run_id=$3,started_at=NOW(),updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND run_id IS NULL',[item.id,input.organizationId,run.runId]);item.run_id=run.runId
      if(run.status==='succeeded'&&run.reused){await setItem(item,'unchanged');continue}
     }
     let run=(await pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE id=$1 AND organization_id=$2',[item.run_id,input.organizationId])).rows[0]
     if(!run)throw failure('radar_research_request_run_missing')
     if(item.resume_pending){
      if(['queued','running'].includes(run.status))throw failure('radar_research_request_busy')
      const resumed=await startRadarCandidateResearch(pool,actor,{organizationId:input.organizationId,candidateId:item.candidate_id,configurationRevision:row.configuration_revision,requestId:item.id,operation:'resume',...(allowSemanticRefresh&&grant!.candidateIds.includes(item.candidate_id)?{allowSemanticRefresh:true,analysisRefreshRequestId:row.request_id}:{})})
      if(resumed.runId!==item.run_id)throw failure('radar_intent_budget_run_superseded')
      const changed=(await pool.query('UPDATE public.radar_research_request_items SET resume_pending=FALSE,dispatch_generation=dispatch_generation+1 WHERE id=$1 AND organization_id=$2 RETURNING dispatch_generation',[item.id,input.organizationId])).rows[0]
      item.dispatch_generation=changed.dispatch_generation
      run=(await pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE id=$1 AND organization_id=$2',[item.run_id,input.organizationId])).rows[0]
     }
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
      const assessment=assessRadarResearchProgress(run as never)
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
