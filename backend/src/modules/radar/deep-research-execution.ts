import type pg from 'pg'
import type {AuthUser} from '../../auth/routes.js'
import type {AppEnv} from '../../config/env.js'
import {invokeAgentRuntime} from '../../lib/agent-runtime-client.js'
import {requireRadarScope} from './access.js'
import {normalizePerplexityEvidence} from './perplexity-evidence.js'
import {loadRadarOperationalLimits} from './operational-limits.js'
import {estimateRadarCostBrl,compareRadarDecimal,addRadarDecimal,multiplyRadarDecimal,radarReportedCostAmount,type RadarCostPolicy} from './cost-conversion.js'
import {radarDecisionHash} from './decision-service.js'
import {loadRadarDeepResearchRoute,radarDeepResearchBudget} from './deep-research.js'
import {resolveRadarAnalysisRetry,type RadarAnalysisRetryBinding} from './analysis-retry-authorizations.js'
import {resolveRadarSearchConfiguration} from './search-configuration.js'

const failure=(code:string,statusCode=409)=>Object.assign(Error(code),{statusCode})
type ResearchCall={source:'perplexity_agent';status:string;requestId:string;contextHash:string;context:Record<string,unknown>;route:Record<string,unknown>;tenant:{client_id:string|null;contract_id:string|null};reservedUsd:string;reservedBrl:string;usageDate:string;costPolicy:RadarCostPolicy;result?:Record<string,unknown>;actualBrl?:string;actualUsd?:string;budgetExceeded?:boolean;retryAuthorization?:RadarAnalysisRetryBinding;previous?:ResearchCall[]}
export function radarAgentCampaignSpentUsd(rows:Array<{calls:Record<string,ResearchCall>}>){
 const unique=new Map<string,ResearchCall>()
 for(const row of rows)for(const call of Object.values(row.calls??{}))if(call.source==='perplexity_agent')for(const attempt of [call,...(call.previous??[])]){
  if(typeof attempt.requestId!=='string'||!attempt.requestId)throw failure('radar_deep_research_legacy_budget_requires_review')
  const prior=unique.get(attempt.requestId)
  if(!prior||radarReportedCostAmount(prior.actualUsd)===null&&radarReportedCostAmount(attempt.actualUsd)!==null)unique.set(attempt.requestId,attempt)
 }
 let spent='0'
 for(const call of unique.values()){
  const amount=radarReportedCostAmount(call.actualUsd??call.reservedUsd)
  if(amount===null)throw failure('radar_deep_research_legacy_budget_requires_review')
  spent=addRadarDecimal(spent,amount)
 }
 return spent
}
/** Lease-owning worker only. Reserve BRL under the campaign lock, then preserve
 * raw runtime receipts. Redelivery recovers a result, never repeats a purchase. */
export async function researchRadarGaps(pool:pg.Pool,user:AuthUser,input:{organizationId:string;candidateId:string;gaps:string[];revision:number;context:Record<string,unknown>},dependencies:{env:AppEnv;runId:string;leaseId:string;authorize:()=>Promise<void>;runtime?:typeof invokeAgentRuntime;beforeEffect?:()=>void}){
 await requireRadarScope(pool,user,{organizationId:input.organizationId,candidateId:input.candidateId},true)
 if(Buffer.byteLength(JSON.stringify({...input.context,gaps:input.gaps}))>16000)throw failure('radar_deep_research_context_too_large',400)
 const contextHash=radarDecisionHash({context:input.context,gaps:input.gaps,revision:input.revision});let key=`deep_${contextHash}`
 const db=await pool.connect();let call:ResearchCall,campaignId:string,newEffect=false
 try{
  await db.query('BEGIN')
  const candidate=(await db.query('SELECT campaign_id FROM public.radar_candidate_records WHERE id=$1 AND organization_id=$2',[input.candidateId,input.organizationId])).rows[0]
  if(!candidate)throw failure('radar_candidate_not_found',404)
  campaignId=candidate.campaign_id
  const campaign=(await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[campaignId,input.organizationId])).rows[0]
  const run=(await db.query('SELECT *,lease_until>NOW() AS lease_active FROM public.radar_candidate_research_runs WHERE id=$1 AND organization_id=$2 AND candidate_id=$3 FOR UPDATE',[dependencies.runId,input.organizationId,input.candidateId])).rows[0]
  if(!run||run.campaign_id!==campaignId||run.configuration_revision!==input.revision||campaign.configuration_revision!==input.revision)throw failure('radar_campaign_configuration_changed')
  if(run.status!=='running'||run.lease_id!==dependencies.leaseId||!run.lease_active)throw failure('radar_research_lease_lost')
  call=run.calls?.[key]
  const singleRound=resolveRadarSearchConfiguration(campaign.search_configuration).funnel.enabled
  if(!call){const bound=(Object.entries(run.calls??{}) as Array<[string,ResearchCall]>).find(([,entry])=>entry.source==='perplexity_agent'&&(singleRound||entry.contextHash===contextHash||entry.status!=='completed'));if(bound){key=bound[0];call=bound[1]}}
  let retry:RadarAnalysisRetryBinding|undefined,previous:ResearchCall|undefined
  if(call&&call.status!=='completed'){
   const receipt=(await db.query("SELECT status FROM public.radar_analysis_receipts WHERE organization_id=$1 AND action='radar_deep_research' AND request_id=$2",[input.organizationId,call.requestId])).rows[0]
   if(receipt?.status==='uncertain')retry=await resolveRadarAnalysisRetry(db,{organizationId:input.organizationId,campaignId,candidateId:input.candidateId,runId:dependencies.runId,configurationRevision:input.revision,action:'radar_deep_research',previousRequestId:call.requestId,searchConfiguration:campaign.search_configuration})
   if(retry){previous=call;call=undefined as unknown as ResearchCall}
  }
  if(!call){
   dependencies.beforeEffect?.()
   await dependencies.authorize()
   if(['paused','completed','archived'].includes(campaign.status))throw failure('radar_campaign_not_active')
   const policy=await loadRadarOperationalLimits(db),route=await loadRadarDeepResearchRoute(db,input.organizationId)
   if(!route||route.status!=='active'||route.kind!=='research'||route.provider!=='perplexity'||route.protocol!=='perplexity-agent-v1')throw failure('research_unconfigured')
   const budget=radarDeepResearchBudget(route.research_config,policy.limits.maxFallbackAttemptsPerEffect)
   const attempts=[...new Map([{provider:route.provider,modelName:route.model_name},...(route.fallback_routes??[])].map(item=>[item.modelName,item])).values()]
   if(attempts.some(item=>item.provider!=='perplexity'||!item.modelName))throw failure('llm_route_capability_incompatible')
   const maximum=Math.min(attempts.length,budget.attempts),reservedUsd=multiplyRadarDecimal(String(budget.config.estimatedUsdPerAttempt),String(maximum)),price=estimateRadarCostBrl({amount:reservedUsd,currency:'USD',rateSnapshot:policy.costPolicy})
   if(price.amountBrl===null)throw failure(price.reason??'research_price_unconfigured')
   const calls=Object.values(run.calls??{}) as ResearchCall[]
   if(!retry&&calls.filter(item=>item.source==='perplexity_agent').length>=policy.limits.maxDeepSearchesPerCompany)throw failure('radar_deep_search_limit_reached')
   if(calls.some(item=>item.source==='perplexity_agent'&&item.status!=='completed'&&item.requestId!==previous?.requestId))throw failure('radar_research_call_uncertain')
   const connection=(await db.query(`SELECT provider.*,EXISTS(SELECT 1 FROM public.platform_provider_secrets secret WHERE secret.provider_connection_id=provider.id AND secret.secret_kind='api_key') AS has_secret,organization.kind='yux' AND organization.is_internal_growth_workspace AS internal FROM public.organizations organization CROSS JOIN LATERAL(SELECT * FROM public.platform_provider_connections WHERE provider_key='perplexity' AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1) provider WHERE organization.id=$1`,[input.organizationId])).rows[0]
   if(connection?.status!=='active'||!connection.has_secret||connection.public_config?.retentionLicensed!==true||connection.public_config?.agentResearchLicensed!==true||!connection.internal&&connection.public_config?.clientDeliveryLicensed!==true)throw failure('radar_deep_research_license_required')
   // Enforce the USD policy in its original currency. Comparing historic BRL
   // reservations against a freshly changed exchange rate would reset capacity.
   const spent=radarAgentCampaignSpentUsd((await db.query(`WITH entries AS(
    SELECT entry.value FROM public.radar_candidate_research_runs run CROSS JOIN LATERAL jsonb_each(run.calls) entry
    WHERE run.organization_id=$1 AND run.campaign_id=$2 AND entry.value->>'source'='perplexity_agent'
   ),versions AS(SELECT value FROM entries UNION ALL SELECT history.value FROM entries CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entries.value->'previous','[]')) history)
   SELECT jsonb_build_object('entry',jsonb_build_object('source','perplexity_agent','requestId',value->'requestId','reservedUsd',value->'reservedUsd','actualUsd',value->'actualUsd')) AS calls FROM versions`,[input.organizationId,campaignId])).rows)
   if(compareRadarDecimal(addRadarDecimal(spent,reservedUsd),String(budget.config.budgetUsdPerCampaign))>0)throw failure('radar_deep_research_campaign_budget_reached')
   const usageDate=(await db.query('SELECT CURRENT_DATE::text AS date')).rows[0].date
   call={source:'perplexity_agent',status:'reserved',requestId:`${dependencies.runId}:deep:${contextHash}${retry?`:retry:${retry.authorization_id}`:''}`,contextHash,context:{...input.context,gaps:input.gaps},route:{id:String(route.id),version:Number(route.version),attempts,authorizedAttempts:maximum},tenant:{client_id:route.client_id??null,contract_id:route.contract_id??null},reservedUsd,reservedBrl:price.amountBrl,usageDate,costPolicy:policy.costPolicy,...(retry?{retryAuthorization:retry,previous:[...(previous?.previous??[]),{...previous!,previous:undefined}]}:{})}
   await db.query(`INSERT INTO public.radar_source_usage_counters(organization_id,campaign_id,source_type,units,estimated_cost) VALUES($1,$2,'perplexity_agent',1,$3) ON CONFLICT(organization_id,campaign_id,source_type,usage_date) DO UPDATE SET units=radar_source_usage_counters.units+1,estimated_cost=radar_source_usage_counters.estimated_cost+EXCLUDED.estimated_cost,updated_at=NOW()`,[input.organizationId,campaignId,call.reservedBrl])
   await db.query('UPDATE public.radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$2],$3::jsonb) WHERE id=$1',[dependencies.runId,key,JSON.stringify(call)])
   newEffect=true
  }
  await db.query('COMMIT')
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
 let result=call.result
 if(!result){
  const receipt=(await pool.query("SELECT * FROM public.radar_analysis_receipts WHERE organization_id=$1 AND action='radar_deep_research' AND request_id=$2",[input.organizationId,call.requestId])).rows[0]
  if(receipt?.status==='completed')result=receipt.result
  else if(receipt&&receipt.status!=='rejected_before_provider')result=await(dependencies.runtime??invokeAgentRuntime)<Record<string,unknown>>(dependencies.env,'/radar/revalidate',{organization_id:input.organizationId,...call.tenant,action:'radar_deep_research',request_id:call.requestId,input_hash:receipt.input_hash})
  else if(!newEffect&&receipt?.status!=='rejected_before_provider'&&call.status!=='rejected_before_provider')throw failure('radar_research_call_uncertain')
  if(!result){
   dependencies.beforeEffect?.()
   try{await dependencies.authorize()}
   catch(cause){
    // No provider request started. Keep the conservative budget hold, but mark
    // a safe same-ID retry after permission is restored, not an uncertain bill.
    await pool.query(`UPDATE public.radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$3,'status'],'"rejected_before_provider"') WHERE id=$1 AND organization_id=$2 AND lease_id=$4 AND lease_until>NOW()`,[dependencies.runId,input.organizationId,key,dependencies.leaseId]);throw cause
   }
   try{result=await(dependencies.runtime??invokeAgentRuntime)<Record<string,unknown>>(dependencies.env,'/radar/deep-research',{organization_id:input.organizationId,...call.tenant,request_id:call.requestId,enabled:true,context:call.context,route_snapshot:call.route,...(call.retryAuthorization?{retry_authorization:call.retryAuthorization}:{})},{timeoutMs:135000})}
   catch(cause){await pool.query(`UPDATE public.radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$3,'status'],'"uncertain"') WHERE id=$1 AND organization_id=$2 AND lease_id=$4 AND lease_until>NOW()`,[dependencies.runId,input.organizationId,key,dependencies.leaseId]);throw cause}
  }
  if(!result||typeof result.response!=='object')throw failure('radar_deep_research_response_invalid')
  // Revalidation may return no fallback summary. Recover all attempt receipts;
  // missing cost retains the reservation instead of treating unknown as zero.
  const effects=(await pool.query(`SELECT effect.usage FROM public.radar_effect_receipts effect JOIN public.radar_analysis_receipts receipt ON receipt.id=effect.analysis_receipt_id WHERE receipt.organization_id=$1 AND receipt.action='radar_deep_research' AND receipt.request_id=$2 ORDER BY effect.attempt`,[input.organizationId,call.requestId])).rows
  const budget=result.budget as {usedUsd?:unknown;exceeded?:boolean}|undefined,usage=result.usage as {costUsd?:unknown;costComplete?:boolean}|undefined
  const actualUsd=radarReportedCostAmount(budget?.usedUsd)??(effects.length?effects.reduce((sum,row)=>addRadarDecimal(sum,radarReportedCostAmount(row.usage?.costUsd)??'0'),'0'):radarReportedCostAmount(usage?.costUsd))
  const allKnown=effects.every(row=>radarReportedCostAmount(row.usage?.costUsd)!==null)
  const actualBrl=actualUsd!==null&&usage?.costComplete!==false&&(!effects.length||allKnown)?estimateRadarCostBrl({amount:actualUsd,currency:'USD',rateSnapshot:call.costPolicy}).amountBrl:null
  const write=await pool.connect()
  try{
   await write.query('BEGIN')
   await write.query('SELECT id FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[campaignId!,input.organizationId])
   // A historical uncertain effect may have been carried into another round.
   // Both can recover its receipt, but the original reservation settles once.
   const settled=(await write.query(`WITH entries AS(SELECT entry.value FROM public.radar_candidate_research_runs run CROSS JOIN LATERAL jsonb_each(run.calls) entry WHERE run.organization_id=$1 AND run.campaign_id=$2 AND entry.value->>'source'='perplexity_agent'), versions AS(SELECT value FROM entries UNION ALL SELECT history.value FROM entries CROSS JOIN LATERAL jsonb_array_elements(COALESCE(entries.value->'previous','[]')) history) SELECT EXISTS(SELECT 1 FROM versions WHERE value->>'requestId'=$3 AND value?'actualBrl') AS done`,[input.organizationId,campaignId!,call.requestId])).rows[0]?.done===true
   const changed=await write.query(`UPDATE public.radar_candidate_research_runs SET calls=jsonb_set(calls,ARRAY[$3],$4::jsonb),updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND lease_id=$5 AND status='running' AND lease_until>NOW() AND calls->$3->>'status'<>'completed' RETURNING id`,[dependencies.runId,input.organizationId,key,JSON.stringify({...call,status:'completed',result,...(actualBrl!==null?{actualBrl,actualUsd}:{}),budgetExceeded:budget?.exceeded===true}),dependencies.leaseId])
   if(changed.rows.length&&actualBrl!==null&&!settled&&call.actualBrl===undefined)await write.query(`UPDATE public.radar_source_usage_counters SET estimated_cost=GREATEST(0,estimated_cost-$4::numeric+$5::numeric),updated_at=NOW() WHERE organization_id=$1 AND campaign_id=$2 AND source_type='perplexity_agent' AND usage_date=$3::date`,[input.organizationId,campaignId!,call.usageDate,call.reservedBrl,actualBrl])
   if(!changed.rows.length){const saved=(await write.query('SELECT calls->$2 AS call FROM public.radar_candidate_research_runs WHERE id=$1',[dependencies.runId,key])).rows[0]?.call;if(saved?.status!=='completed')throw failure('radar_research_lease_lost')}
   await write.query('COMMIT')
  }catch(cause){await write.query('ROLLBACK');throw cause}finally{write.release()}
 }
 return{...normalizePerplexityEvidence(result!.response),usage:result!.usage,budget:result!.budget}
}
