import type pg from 'pg'
import {createHash} from 'node:crypto'
import {z} from 'zod'
import type {AuthUser} from '../../auth/routes.js'
import {loadRadarOperationalLimits} from './operational-limits.js'
import {resolveRadarSearchConfiguration} from './search-configuration.js'

const fail=(code:string,statusCode=409)=>Object.assign(Error(code),{statusCode})
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex')
const numericSnapshot=(value:unknown)=>value===undefined?undefined:value===null?null:Number(value)
function fallbackSnapshot(value:unknown){
 if(!value||typeof value!=='object'||Array.isArray(value))throw fail('radar_analysis_retry_route_invalid')
 const item=value as Record<string,unknown>,model=item.modelName??item.model_name
 if(typeof item.provider!=='string'||typeof model!=='string'||!model)throw fail('radar_analysis_retry_route_invalid')
 return{provider:item.provider,modelName:model}
}
export const radarAnalysisRetryAuthorizationSchema=z.object({organizationId:z.uuid(),campaignId:z.uuid(),configurationRevision:z.number().int().positive(),requestId:z.uuid(),expiresAt:z.iso.datetime(),acknowledgePreviousChargeMayExist:z.literal(true),
 items:z.array(z.object({candidateId:z.uuid(),previousReceiptId:z.uuid()}).strict()).min(1)}).strict()
export type RadarAnalysisRetryAuthorizationInput=z.infer<typeof radarAnalysisRetryAuthorizationSchema>
export type RadarAnalysisRetryBinding={authorization_id:string;candidate_id:string;campaign_id:string;configuration_revision:number;policy_hash:string}
export async function resolveRadarAnalysisRetry(db:Pick<pg.Pool,'query'>,input:{organizationId:string;campaignId:string;candidateId:string;runId:string;configurationRevision:number;action:string;previousRequestId:string;searchConfiguration:unknown}):Promise<RadarAnalysisRetryBinding|undefined>{
 const row=(await db.query(`SELECT grant_row.* FROM public.radar_research_request_items item
  JOIN public.radar_research_requests request ON request.id=item.research_request_id AND request.organization_id=item.organization_id
  JOIN public.radar_analysis_retry_authorizations grant_row ON grant_row.request_id=request.analysis_authorization_id AND grant_row.organization_id=request.organization_id AND grant_row.campaign_id=request.campaign_id AND grant_row.candidate_id=item.candidate_id
  JOIN public.radar_analysis_receipts receipt ON receipt.id=grant_row.previous_analysis_receipt_id AND receipt.organization_id=grant_row.organization_id
  WHERE item.organization_id=$1 AND item.campaign_id=$2 AND item.candidate_id=$3 AND item.run_id=$4 AND grant_row.configuration_revision=$5 AND grant_row.action=$6 AND receipt.request_id=$7
   AND grant_row.consumed_at IS NULL AND grant_row.expires_at>NOW() ORDER BY request.created_at DESC LIMIT 1`,[input.organizationId,input.campaignId,input.candidateId,input.runId,input.configurationRevision,input.action,input.previousRequestId])).rows[0]
 if(!row)return
 const campaign=(await db.query('SELECT operational_policy_version FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2',[input.campaignId,input.organizationId])).rows[0]
 const actions=(row.policy_snapshot?.routes??[]).map((route:{action:string})=>route.action)
 const current=await radarAnalysisRetryPolicy(db,input.organizationId,input.searchConfiguration,actions,Number(campaign?.operational_policy_version??1))
 if(current.hash!==row.policy_hash)throw fail('radar_analysis_retry_policy_changed')
 return{authorization_id:row.id,candidate_id:input.candidateId,campaign_id:input.campaignId,configuration_revision:input.configurationRevision,policy_hash:row.policy_hash}
}

export async function radarAnalysisRetryPolicy(db:Pick<pg.PoolClient,'query'>,organizationId:string,searchConfiguration:unknown,actions:string[],campaignOperationalVersion=1){
 const policy=await loadRadarOperationalLimits(db),research=resolveRadarSearchConfiguration(searchConfiguration).research
 const rows=(await db.query(`SELECT rule.* FROM public.organizations organization
  LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE
  JOIN public.model_routing_rules rule ON rule.agent_type=ANY($2::text[]) AND rule.status='active' AND rule.routing_tier='default'
   AND (rule.organization_id IS NULL OR rule.organization_id=organization.id) AND (rule.client_id IS NULL OR rule.client_id=organization.client_id)
   AND (rule.contract_id IS NULL OR rule.contract_id=contract.id) AND rule.agent_id IS NULL WHERE organization.id=$1 ORDER BY rule.id`,[organizationId,[...new Set(actions)].sort()])).rows
 const routes=rows.map(rule=>({id:rule.id,version:rule.version,action:rule.agent_type,organizationId:rule.organization_id,clientId:rule.client_id,contractId:rule.contract_id,
  provider:rule.provider,model:rule.model_name,fallbackModel:rule.fallback_model_name,
  fallbacks:Array.isArray(rule.fallback_routes)?rule.fallback_routes.map(fallbackSnapshot):[],
  maxInputTokens:rule.max_input_tokens,maxOutputTokens:rule.max_output_tokens,maxCostPerRun:numericSnapshot(rule.max_cost_per_run),temperature:numericSnapshot(rule.temperature)}))
 const snapshot={campaignOperationalVersion,operationalPolicy:{version:policy.version,limits:policy.limits},research,routes}
 return{snapshot,hash:hash(snapshot),policy}
}
export async function authorizeRadarAnalysisRetries(pool:pg.Pool,user:AuthUser,value:RadarAnalysisRetryAuthorizationInput){
 if(user.role!=='yux_admin')throw fail('radar_forbidden',403)
 const input=radarAnalysisRetryAuthorizationSchema.parse(value),items=[...input.items].sort((a,b)=>a.candidateId.localeCompare(b.candidateId)||a.previousReceiptId.localeCompare(b.previousReceiptId))
 if(new Set(items.map(item=>`${item.candidateId}:${item.previousReceiptId}`)).size!==items.length)throw fail('radar_analysis_retry_duplicate_item',400)
 const batchHash=hash({organizationId:input.organizationId,campaignId:input.campaignId,revision:input.configurationRevision,expiresAt:input.expiresAt,items})
 const client=await pool.connect()
 try{
  await client.query('BEGIN')
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar-analysis-retry:${input.organizationId}:${input.requestId}`])
  const actor=(await client.query("SELECT id FROM public.app_users WHERE id=$1 AND role='yux_admin' AND is_active=TRUE",[user.id])).rows[0]
  if(!actor)throw fail('radar_forbidden',403)
  const campaign=(await client.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[input.campaignId,input.organizationId])).rows[0]
  if(!campaign||campaign.configuration_revision!==input.configurationRevision)throw fail('radar_campaign_configuration_changed')
  const existing=(await client.query('SELECT * FROM public.radar_analysis_retry_authorizations WHERE organization_id=$1 AND request_id=$2 ORDER BY candidate_id,previous_analysis_receipt_id',[input.organizationId,input.requestId])).rows
  const project=(rows:pg.QueryResultRow[])=>({analysisAuthorizationId:input.requestId,expiresAt:new Date(rows[0].expires_at).toISOString(),items:rows.map(row=>({candidateId:row.candidate_id,previousReceiptId:row.previous_analysis_receipt_id,authorizationId:row.id}))})
  if(existing.length){
   if(existing.length!==items.length||existing.some(row=>row.batch_hash!==batchHash))throw fail('radar_analysis_retry_request_conflict')
   await client.query('COMMIT');return project(existing)
  }
  const now=new Date((await client.query('SELECT NOW() AS now')).rows[0].now).getTime()
  if(Date.parse(input.expiresAt)<=now)throw fail('radar_analysis_retry_authorization_expired')
  const candidates=(await client.query(`SELECT candidate.id,review.approved_at FROM public.radar_candidate_records candidate LEFT JOIN public.radar_b2b_reviews review ON review.candidate_id=candidate.id AND review.organization_id=candidate.organization_id
    WHERE candidate.organization_id=$1 AND candidate.campaign_id=$2 AND candidate.id=ANY($3::uuid[]) AND candidate.status='pending_review'`,[input.organizationId,input.campaignId,[...new Set(items.map(item=>item.candidateId))]])).rows
  if(candidates.length!==new Set(items.map(item=>item.candidateId)).size||candidates.some(row=>row.approved_at))throw fail('radar_analysis_retry_scope_invalid',403)
  const receipts=(await client.query('SELECT * FROM public.radar_analysis_receipts WHERE organization_id=$1 AND id=ANY($2::uuid[]) ORDER BY id FOR UPDATE',[input.organizationId,items.map(item=>item.previousReceiptId)])).rows
  const runs=(await client.query('SELECT id,candidate_id,calls FROM public.radar_candidate_research_runs WHERE organization_id=$1 AND campaign_id=$2 AND candidate_id=ANY($3::uuid[])',[input.organizationId,input.campaignId,items.map(item=>item.candidateId)])).rows
  const bound=items.map(item=>{
   const receipt=receipts.find(row=>row.id===item.previousReceiptId),key=receipt?.action==='radar_presence_resolution'?'presence':'semantic'
   if(!receipt||!runs.some(run=>run.candidate_id===item.candidateId&&run.calls[key]?.evidenceHash&&(run.calls[key].requestId??`${run.id}${key==='presence'?':presence':''}:${run.calls[key].evidenceHash}`)===receipt.request_id))throw fail('radar_analysis_retry_scope_invalid',403)
   if(receipt.status==='completed'||receipt.status==='rejected_before_provider')throw fail('radar_analysis_retry_not_required')
   if(receipt.status==='reserved'&&receipt.lease_until&&new Date(receipt.lease_until).getTime()>now)throw fail('radar_analysis_still_running')
   return{...item,action:receipt.action}
  })
  const active=(await client.query('SELECT id FROM public.radar_analysis_retry_authorizations WHERE organization_id=$1 AND previous_analysis_receipt_id=ANY($2::uuid[]) AND consumed_at IS NULL AND expires_at>NOW() LIMIT 1',[input.organizationId,items.map(item=>item.previousReceiptId)])).rows[0]
  if(active)throw fail('radar_analysis_retry_already_authorized')
  const policy=await radarAnalysisRetryPolicy(client,input.organizationId,campaign.search_configuration,bound.map(item=>item.action),Number(campaign.operational_policy_version??1))
  if(new Set(items.map(item=>item.candidateId)).size>policy.policy.limits.maxNewCompaniesPerLot)throw fail('radar_operational_limit_exceeded')
  if(bound.some(item=>!policy.snapshot.routes.some(route=>route.action===item.action)))throw fail('radar_analysis_retry_route_missing')
  const research=policy.snapshot.research
  if(bound.some(item=>item.action==='radar_presence_resolution'?!research.presenceResolutionEnabled:!(research.semanticQualificationEnabled||research.profileEnabled||research.sizeAssessment.enabled)))throw fail('radar_analysis_retry_stage_disabled')
  const rows=[]
  for(const item of bound)rows.push((await client.query(`INSERT INTO public.radar_analysis_retry_authorizations(organization_id,campaign_id,candidate_id,request_id,batch_hash,configuration_revision,previous_analysis_receipt_id,action,approved_by,expires_at,acknowledged_previous_charge,policy_snapshot,policy_hash)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11,$12) RETURNING *`,[input.organizationId,input.campaignId,item.candidateId,input.requestId,batchHash,input.configurationRevision,item.previousReceiptId,item.action,user.id,input.expiresAt,JSON.stringify(policy.snapshot),policy.hash])).rows[0])
  await client.query('COMMIT');return project(rows)
 }catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
