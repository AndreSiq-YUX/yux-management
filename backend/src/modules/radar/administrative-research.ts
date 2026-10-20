import type pg from 'pg'
import {z} from 'zod'
import type {AuthUser} from '../../auth/routes.js'
import type {AppEnv} from '../../config/env.js'
import {invokeAgentRuntime} from '../../lib/agent-runtime-client.js'
import {requireRadarScope} from './access.js'
import {loadRadarOperationalLimits,assertRadarOperationalLimit} from './operational-limits.js'
import {radarReportedCostAmount} from './cost-conversion.js'

export const radarAdministrativeScopeSchema=z.object({organizationId:z.uuid(),campaignId:z.uuid()}).strict()
export const radarAdministrativeRevalidationSchema=radarAdministrativeScopeSchema.extend({receiptIds:z.array(z.uuid()).min(1)}).strict()
type Scope=z.infer<typeof radarAdministrativeScopeSchema>
const failure=(code:string,statusCode=409)=>Object.assign(Error(code),{statusCode})
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'?value as Record<string,unknown>:{}
async function authorize(pool:pg.Pool,user:AuthUser,input:Scope){
 if(user.role!=='yux_admin')throw failure('radar_source_admin_required',403)
 const actor=(await pool.query("SELECT id FROM public.app_users WHERE id=$1 AND role='yux_admin' AND is_active=TRUE",[user.id])).rows[0]
 if(!actor)throw failure('radar_source_admin_required',403)
 await requireRadarScope(pool,user,input,false)
}
async function analyses(pool:pg.Pool,input:Scope,ids?:string[]){
 // Select metadata only. Raw reply, saved input and ownership tokens stay in SQL.
 return(await pool.query(`SELECT receipt.id,receipt.action,receipt.request_id,receipt.status,receipt.input_hash,
  receipt.lease_until>NOW() AS lease_active,receipt.created_at,
  jsonb_typeof(receipt.input_request)='object' AS has_saved_input,
  receipt.input_request->>'client_id' AS client_id,receipt.input_request->>'contract_id' AS contract_id,
  candidate.id AS candidate_id,candidate.title AS company_name,run.configuration_revision,
  COALESCE((SELECT value FROM jsonb_each(run.calls) WHERE value->>'requestId'=receipt.request_id LIMIT 1),run.calls->(CASE WHEN receipt.action='radar_presence_resolution' THEN 'presence' ELSE 'semantic' END)) AS current_call,
  run.configuration_revision=campaign.configuration_revision AND candidate.status='pending_review'
   AND run.id=(SELECT newer.id FROM public.radar_candidate_research_runs newer WHERE newer.organization_id=$1 AND newer.candidate_id=candidate.id ORDER BY newer.created_at DESC,newer.id DESC LIMIT 1)
   AND NOT EXISTS(SELECT 1 FROM public.radar_b2b_reviews review WHERE review.candidate_id=candidate.id AND review.organization_id=$1 AND review.approved_at IS NOT NULL) AS current_scope,
  effect.transport_outcome,effect.validation_outcome,effect.billing_outcome,effect.failure_code,effect.provider,effect.model_snapshot,effect.usage,
  effect.response_body IS NOT NULL AND effect.transport_outcome='received' AS has_saved_response
  FROM public.radar_analysis_receipts receipt
  JOIN public.radar_candidate_research_runs run ON split_part(receipt.request_id,':',1)=run.id::text AND run.organization_id=receipt.organization_id
  JOIN public.radar_candidate_records candidate ON candidate.id=run.candidate_id AND candidate.organization_id=run.organization_id
  JOIN public.radar_campaigns campaign ON campaign.id=run.campaign_id AND campaign.organization_id=run.organization_id
  LEFT JOIN LATERAL(SELECT transport_outcome,validation_outcome,billing_outcome,failure_code,provider,model_snapshot,usage,response_body FROM public.radar_effect_receipts effect
   WHERE effect.analysis_receipt_id=receipt.id AND effect.organization_id=receipt.organization_id ORDER BY effect.attempt DESC LIMIT 1) effect ON TRUE
  WHERE receipt.organization_id=$1 AND run.campaign_id=$2 AND receipt.action IN('radar_presence_resolution','radar_business_qualification','radar_initial_triage','radar_next_action','radar_quality_gate','radar_deep_research')
   AND (($3::uuid[] IS NULL AND receipt.status<>'completed') OR receipt.id=ANY($3::uuid[]))
  ORDER BY receipt.created_at DESC,receipt.id DESC`,[input.organizationId,input.campaignId,ids??null])).rows
}
export async function getRadarAdministrativeResearch(pool:pg.Pool,user:AuthUser,value:Scope){
 if(user.role!=='yux_admin')throw failure('radar_source_admin_required',403)
 const input=radarAdministrativeScopeSchema.parse(value);await authorize(pool,user,input)
 const campaign=(await pool.query('SELECT configuration_revision,commercial_criteria_revision FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2',[input.campaignId,input.organizationId])).rows[0]
 const rows=await analyses(pool,input)
 const requests=(await pool.query(`SELECT request.request_id,request.status,request.criteria_revision,request.configuration_revision,request.budget_revision,request.created_at,
  COUNT(item.id) AS item_count,COUNT(item.id) FILTER(WHERE item.state='waiting') AS waiting_count
  FROM public.radar_research_requests request JOIN public.radar_research_request_items item ON item.research_request_id=request.id AND item.organization_id=request.organization_id
  WHERE request.organization_id=$1 AND request.campaign_id=$2 GROUP BY request.id ORDER BY request.created_at DESC,request.id DESC`,[input.organizationId,input.campaignId])).rows
 return{configurationRevision:campaign.configuration_revision,criteriaRevision:campaign.commercial_criteria_revision,requests:requests.map(row=>({requestId:row.request_id,state:row.status,criteriaRevision:row.criteria_revision,configurationRevision:row.configuration_revision,budgetRevision:row.budget_revision,createdAt:row.created_at,items:Number(row.item_count),waiting:Number(row.waiting_count)})),
  analyses:rows.map(row=>{
   const call=object(row.current_call),estimate=object(call.costEstimate),usage=object(row.usage)
   const inferred=`${row.request_id.split(':')[0]}${row.action==='radar_presence_resolution'?':presence':''}:${call.evidenceHash}`
   const bound=(call.requestId??inferred)===row.request_id
   return{receiptId:row.id,candidateId:row.candidate_id,companyName:row.company_name,action:row.action,status:row.status,configurationRevision:row.configuration_revision,createdAt:row.created_at,
    transport:row.transport_outcome??null,validation:row.validation_outcome??null,billing:row.billing_outcome??'uncertain',failureCode:row.failure_code??null,provider:row.provider??null,model:row.model_snapshot??null,
    reportedUsd:radarReportedCostAmount(usage.costUsd),estimatedBrl:bound?radarReportedCostAmount(estimate.amountBrl??call.reservedBrl):null,
    canRevalidate:row.has_saved_response===true&&row.has_saved_input===true&&!row.lease_active,
    canAuthorizeRetry:bound&&call.status!=='completed'&&row.current_scope===true&&row.status==='uncertain'&&!row.lease_active}
  })}
}
export async function revalidateRadarAdministrativeResearch(pool:pg.Pool,user:AuthUser,env:AppEnv,value:z.infer<typeof radarAdministrativeRevalidationSchema>,dependencies:{runtime?:typeof invokeAgentRuntime}={}){
 if(user.role!=='yux_admin')throw failure('radar_source_admin_required',403)
 const input=radarAdministrativeRevalidationSchema.parse(value);await authorize(pool,user,input)
 const ids=[...new Set(input.receiptIds)],policy=await loadRadarOperationalLimits(pool)
 const rows=await analyses(pool,input,ids)
 if(rows.length!==ids.length)throw failure('radar_analysis_recovery_scope_invalid',403)
 // One logical selection may span execution windows. Revalidation below is
 // sequential and free: a window of one must still recover a larger saved lot.
 assertRadarOperationalLimit(new Set(rows.map(row=>row.candidate_id)).size,policy.limits.maxNewCompaniesPerLot)
 const items:Array<{receiptId:string;state:'revalidated'|'invalid'|'no_saved_response'|'waiting';reason?:string}>=[]
 for(const row of rows){
  if(row.status==='completed'){items.push({receiptId:row.id,state:'revalidated'});continue}
  if(!row.has_saved_response||!row.has_saved_input){items.push({receiptId:row.id,state:'no_saved_response'});continue}
  if(row.lease_active){items.push({receiptId:row.id,state:'waiting'});continue}
  try{
   await(dependencies.runtime??invokeAgentRuntime)(env,'/radar/revalidate',{organization_id:input.organizationId,action:row.action,request_id:row.request_id,input_hash:row.input_hash,client_id:row.client_id??null,contract_id:row.contract_id??null})
   const saved=(await pool.query('SELECT status FROM public.radar_analysis_receipts WHERE id=$1 AND organization_id=$2',[row.id,input.organizationId])).rows[0]
   items.push({receiptId:row.id,state:saved?.status==='completed'?'revalidated':'waiting'})
  }catch(cause){
   const code=/^agent_runtime_422:((?:radar_[a-z0-9_]+)|output_truncated)$/.exec(cause instanceof Error?cause.message:'')?.[1]
   items.push({receiptId:row.id,state:code?'invalid':'waiting',...(code?{reason:code}:{})})
  }
 }
 return{items}
}
