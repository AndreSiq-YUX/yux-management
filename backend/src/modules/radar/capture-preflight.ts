import {createHash} from 'node:crypto'
import type pg from 'pg'
import {normalizeRadarCounters} from './numeric-counters.js'
import type {AuthUser} from '../../auth/routes.js'
import {assertRadarRegionalBatchAccess,findRadarDataSource,evaluateRadarSourceGovernance} from './repository.js'
import {captureError,parseRadarCaptureCount,type AvailabilityLoader,type CaptureAvailability} from './capture-operation.js'
import {inspectRejectedRadarCaptureDiscovery} from './capture-recovery.js'
import {getRadarResearchAvailability} from './research-availability.js'
import {buildRadarDiscoveryScopes,resolveRadarSearchConfiguration} from './search-configuration.js'
import {calculateRadarCaptureCapacity,loadRadarCapturePageAccounting,type RadarCaptureLimits,type RadarQueryable} from './capture-capacity.js'
import {inspectExpiredRadarCaptureContinuation} from './capture-continuation.js'
import {loadRadarOperationalLimits,assertRadarOperationalLimit,validateRadarOperationalConfiguration,type RadarOperationalPolicy} from './operational-limits.js'
import {inspectRadarContinuationState,type RadarContinuationState} from './continuation-state.js'
import {loadRadarAdaptivePreflight} from './adaptive-preflight.js'
export type PreflightInput={organizationId:string;campaignId:string;configurationRevision:number;requestedCount:number;operationId?:string}
export type PreflightDependencies={availability?:AvailabilityLoader;workerReady?:()=>Promise<boolean>}
export type RadarCapturePreflight={stateId:string;allowed:boolean;requiresLimitsApproval:boolean;remaining:number;limits:RadarCaptureLimits;policy:RadarOperationalPolicy;campaignLimits:RadarCaptureLimits;continuations:RadarContinuationState[];attemptedQueries:number;successfulPagesByScope:Record<string,number>;optimisticAdditionalCapacity:number;minimumAdditionalQueries:number;blockers:Array<{code:string;message:string}>;warnings:Array<{code:string;message:string}>;researchCapacity?:{remainingQueries:number;plannedMaximumQueries:number;estimatedMaximumCostBrl:number};checks:Array<{key:string;status:'ok'|'blocked'|'not_applicable'|'not_checked';code?:string}>;expiredContinuation?:{receiptId:string;scopeLabel:string}}
export const isRadarCaptureLimitPause=(op:{status:string;discovery_reason?:string;requested_count:number},admitted:number)=>['blocked','partial'].includes(op.status)&&['page_cap','query_cap'].includes(op.discovery_reason??'')&&admitted<op.requested_count
export async function loadRadarCapturePreflight(db:RadarQueryable,user:AuthUser,input:PreflightInput,deps:PreflightDependencies={}){
 if(user.role!=='yux_admin')throw captureError('radar_source_admin_required',403)
 parseRadarCaptureCount(input.requestedCount)
 const revision=await assertRadarRegionalBatchAccess(db as pg.Pool,user,input.organizationId,input.campaignId)
 if(revision!==input.configurationRevision)throw captureError('radar_campaign_configuration_changed')
 const campaign=(await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2',[input.campaignId,input.organizationId])).rows[0]
 const op=input.operationId?normalizeRadarCounters((await db.query('SELECT *,lease_until>NOW() AS lease_active FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2 AND campaign_id=$3',[input.operationId,input.organizationId,input.campaignId])).rows[0]):null
 if(input.operationId&&!op)throw captureError('radar_capture_not_found',404)
 if(op&&(op.configuration_revision!==revision||op.requested_count!==input.requestedCount))throw captureError('radar_capture_request_conflict')
 const policy=await loadRadarOperationalLimits(db)
 if(!op)assertRadarOperationalLimit(input.requestedCount,policy.limits.maxNewCompaniesPerLot)
 const snapshot=op?.configuration_snapshot??campaign,config=resolveRadarSearchConfiguration(snapshot.search_configuration)
 if(!op)validateRadarOperationalConfiguration(config,policy.limits,campaign.daily_limit)
 if(op?.pipeline_version===2||!op&&config.discovery.enabled)return loadRadarAdaptivePreflight(db,user,input,campaign,op,policy,deps)
 const {pageSize,maxPagesPerScope,maxQueriesPerBatch}=config.batch,limits={pageSize,maxPagesPerScope,maxQueriesPerBatch}
 const items=op?(await db.query('SELECT COUNT(*)::int AS n FROM public.radar_capture_items WHERE operation_id=$1 AND organization_id=$2',[op.id,input.organizationId])).rows[0].n:0
 const remaining=Math.max(0,input.requestedCount-items)
 const cursors=(await db.query("SELECT scope_key,next_token,page_size,completed,lease_id,running_until,running_until>NOW() AS lease_active FROM public.radar_regional_discovery_cursors WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' ORDER BY scope_key",[input.organizationId,input.campaignId])).rows
 const scopes=buildRadarDiscoveryScopes({targetStates:snapshot.target_states,configurationRevision:revision,searchConfiguration:config}).map(scope=>({...scope,inheritedPageSize:undefined as number|undefined,completed:cursors.some(row=>row.scope_key===scope.key&&row.completed)}))
 const overflowCount=Number((await db.query(`SELECT COUNT(DISTINCT candidate->>'taxId') AS n FROM public.radar_capture_overflow overflow
  WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND candidate->>'taxId' IS NOT NULL
  AND NOT EXISTS(SELECT 1 FROM public.radar_candidate_records candidate WHERE candidate.campaign_id=$2 AND candidate.dedupe_key='cnpj:'||(overflow.candidate->>'taxId'))
  AND NOT EXISTS(SELECT 1 FROM public.radar_company_records company WHERE company.organization_id=$1 AND company.cnpj=overflow.candidate->>'taxId')
  AND NOT EXISTS(SELECT 1 FROM public.leads lead WHERE lead.organization_id=$1 AND lead.attribution_context->>'radarCnpj'=overflow.candidate->>'taxId')`,[input.organizationId,input.campaignId,revision])).rows[0].n)
 const rejected=op?.discovery_pending?await inspectRejectedRadarCaptureDiscovery(db,op):false
 const accounting=op?await loadRadarCapturePageAccounting(db,op):{successfulPagesByScope:{},historyCertain:true}
 // The narrow legacy rejection proof accounts for one failed attempt, never an obtained page.
 if(rejected&&rejected.legacy)accounting.historyCertain=true
 const limitPause=op&&isRadarCaptureLimitPause(op,items),needsDiscovery=remaining>0&&(!op?.discovery_stopped||limitPause)
 const continuations:RadarContinuationState[]=[]
 if(needsDiscovery&&remaining>overflowCount)for(const scope of scopes.filter(s=>!s.completed)){
  const state=await inspectRadarContinuationState(db,{...scope,organizationId:input.organizationId,campaignId:input.campaignId,configurationRevision:revision},policy)
  if(state)continuations.push(state)
  if(state?.reason==='ready')scope.inheritedPageSize=Number(cursors.find(row=>row.scope_key===scope.key)?.page_size??10)
 }
 const capacity=calculateRadarCaptureCapacity({limits,remaining,attemptedQueries:op?.queries??0,scopes,successfulPagesByScope:accounting.successfulPagesByScope,usableOverflowCount:overflowCount})
 const blockers:RadarCapturePreflight['blockers']=[],checks:RadarCapturePreflight['checks']=[]
 const fail=(code:string,message=code)=>{if(!blockers.some(item=>item.code===code))blockers.push({code,message})}
 if(op?.discovery_pending&&!rejected)fail('radar_capture_discovery_uncertain')
 if(op?.lease_active||cursors.some(row=>row.lease_active))fail('radar_capture_in_progress')
 if(!accounting.historyCertain)fail('radar_capture_history_uncertain')
 if(['paused','archived','completed'].includes(campaign.status))fail('radar_capture_campaign_inactive')
 const other=(await db.query("SELECT id FROM public.radar_capture_operations WHERE organization_id=$1 AND campaign_id=$2 AND configuration_revision=$3 AND status IN ('queued','discovering','researching','blocked') AND ($4::uuid IS NULL OR id<>$4) LIMIT 1",[input.organizationId,input.campaignId,revision,op?.id??null])).rows[0]
 if(other)fail('radar_capture_other_active_lot')
 const requiresLimitsApproval=!!op&&!!needsDiscovery&&(!!limitPause||capacity.optimisticAdditionalCapacity<remaining)
 for(const state of continuations){
  if(state?.reason==='uncertain')fail('radar_capture_discovery_uncertain')
  if(state?.reason==='running')fail('radar_capture_in_progress')
 }
 if(needsDiscovery&&remaining>overflowCount&&scopes.length>0&&scopes.every(scope=>scope.completed))fail('radar_capture_source_exhausted')
 if(!op&&capacity.optimisticAdditionalCapacity<remaining)fail('radar_capture_capacity_insufficient')
 const availability:CaptureAvailability=await(deps.availability??getRadarResearchAvailability)(db as pg.Pool,user,input.organizationId,input.campaignId)
 const estimates=(availability.estimates??[]).filter(item=>item.available!==false),knownCapacity=estimates.length>0&&estimates.every(item=>item.remainingQueries!==undefined)
 const plannedMaximumQueries=(availability.maxQueriesPerCandidate??config.research.maxSearchQueriesPerCandidate)*input.requestedCount
 const researchCapacity=knownCapacity?{remainingQueries:estimates.reduce((sum,item)=>sum+(item.remainingQueries??0),0),plannedMaximumQueries,
  estimatedMaximumCostBrl:Number((availability.maximumCostPerCandidate!==undefined?availability.maximumCostPerCandidate*input.requestedCount:plannedMaximumQueries*Math.max(0,...estimates.map(item=>item.costPerQuery))).toFixed(6))}:undefined
 const spent=researchCapacity&&campaign.budget_limit!==null&&campaign.budget_limit!==undefined
  ?Number((await db.query("SELECT COALESCE(SUM(estimated_cost),0) AS cost FROM public.radar_source_usage_counters WHERE organization_id=$1 AND campaign_id=$2 AND source_type<>'perplexity_agent' AND usage_date=CURRENT_DATE",[input.organizationId,input.campaignId])).rows[0]?.cost??0):0
 const budgetCapacity=campaign.budget_limit===null||campaign.budget_limit===undefined?undefined:Math.max(0,Number(campaign.budget_limit)-spent)
 const warnings:RadarCapturePreflight['warnings']=researchCapacity&&(researchCapacity.remainingQueries<plannedMaximumQueries||budgetCapacity!==undefined&&researchCapacity.estimatedMaximumCostBrl>budgetCapacity)
  ?[{code:'radar_capture_enrichment_capacity_low',message:'A capacidade diária de aprofundamento pode ser menor que este lote. Ajuste as quotas das fontes no Admin ou reduza o lote. Etapas salvas continuam recuperáveis; nenhum limite será aumentado automaticamente.'}]:[]
 // An admitted lot can recover checkpoints independently of new search capacity.
 // This is not permission to search: children still reserve/recheck every paid effect.
 const recovering=!!op&&!needsDiscovery
 const researchBlockers=availability.reasons.filter(reason=>!recovering||!['source_limit_exceeded','source_budget_exceeded'].includes(reason.code))
 if(!availability.allowed)for(const reason of researchBlockers)fail(reason.code,reason.message)
 if(!recovering&&(availability.presence?.routeConfigured===false||availability.semantic?.routeConfigured===false))fail('radar_capture_model_route_missing')
 // Resuming can consume completed receipts without contacting a model. Each
 // child checks its route and the runtime checks credits before any new call.
 if(recovering)checks.push({key:'ai_model_route',status:'not_checked'})
 checks.push({key:'research_configuration',status:availability.allowed||!researchBlockers.length?'ok':'blocked'})
 if(recovering&&!availability.allowed&&!researchBlockers.length)checks.push({key:'new_search_capacity',status:'blocked',code:'source_limit_exceeded'})
 if(needsDiscovery&&capacity.minimumAdditionalQueries>0){
  const source=await findRadarDataSource(db as pg.Pool,input.organizationId,'cnpja_advanced_search')
  // With no proposal yet, use optimistic lower bounds for quota/cost. The Admin
  // ceiling permits larger pages; it never forces their purchase. Exact proposed
  // and inherited sizes are priced again before consent commits and reservation.
  const previewPageSize=Math.max(requiresLimitsApproval?policy.limits.maxDiscoveryPageSize:pageSize,...scopes.map(scope=>scope.inheritedPageSize??0))
  const minimumQueries=requiresLimitsApproval?Math.ceil(Math.max(0,remaining-overflowCount)/previewPageSize):capacity.minimumAdditionalQueries
  const minimumBillingUnits=requiresLimitsApproval?Math.max(minimumQueries,Math.ceil(Math.max(0,remaining-overflowCount)/10)):minimumQueries*Math.ceil(previewPageSize/10)
  const governance=await evaluateRadarSourceGovernance(db,input.organizationId,input.campaignId,source,minimumQueries,minimumBillingUnits)
  for(const issue of governance.issues)fail(issue.code,issue.message)
  const provider=(await db.query(`SELECT status,EXISTS(SELECT 1 FROM public.platform_provider_secrets secret WHERE secret.provider_connection_id=provider.id AND secret.secret_kind='api_key') AS has_secret
   FROM public.platform_provider_connections provider WHERE provider_key='cnpja' AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1`)).rows[0]
  if(provider?.status!=='active')fail('radar_capture_source_inactive')
  if(!provider?.has_secret)fail('radar_capture_source_secret_missing')
  checks.push({key:'discovery_source',status:governance.allowed&&provider?.status==='active'&&provider.has_secret?'ok':'blocked'})
 }
 const worker=deps.workerReady?await deps.workerReady():!!(await db.query("SELECT 1 FROM public.worker_process_heartbeats WHERE 'external'=ANY(queue_classes) AND last_seen_at>NOW()-INTERVAL '90 seconds' LIMIT 1")).rows.length
 if(!worker)fail('radar_capture_worker_unavailable')
 checks.push({key:'external_worker',status:worker?'ok':'blocked'})
 const ai=config.research.presenceResolutionEnabled||config.research.semanticQualificationEnabled||config.research.profileEnabled||config.research.sizeAssessment.enabled
 if(ai&&!recovering){
  const context=(await db.query(`SELECT organization.client_id,contract.id AS contract_id FROM public.organizations organization
   LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE WHERE organization.id=$1`,[input.organizationId])).rows[0]
  if(context?.client_id&&context.contract_id){
   const wallet=(await db.query('SELECT current_balance,is_unlimited FROM public.ai_credit_wallets WHERE organization_id=$1 AND client_id=$2 AND contract_id=$3',[input.organizationId,context.client_id,context.contract_id])).rows[0]
   const code=!wallet?'radar_ai_wallet_missing':!wallet.is_unlimited&&Number(wallet.current_balance)<1?'radar_ai_credits_insufficient':undefined
   if(code)fail(code);checks.push({key:'ai_wallet',status:code?'blocked':'ok',...(code?{code}:{})})
  }else checks.push({key:'ai_wallet',status:'not_applicable'})
 }else checks.push({key:'ai_wallet',status:ai?'not_checked':'not_applicable'})
 checks.push({key:'external_credit',status:'not_checked'},{key:'runtime_connectivity',status:'not_checked'})
 const latest=(await db.query("SELECT id FROM public.radar_enrichment_runs WHERE organization_id=$1 AND campaign_id=$2 AND provider='cnpja_advanced_search' ORDER BY started_at DESC NULLS LAST,id DESC LIMIT 1",[input.organizationId,input.campaignId])).rows[0]?.id??null
 let expired:Awaited<ReturnType<typeof inspectExpiredRadarCaptureContinuation>>=null
 if(op&&!op.discovery_pending&&!op.lease_active){try{expired=await inspectExpiredRadarCaptureContinuation(db,op)}catch{fail('radar_capture_continuation_confirmation_stale')}}
 const stateId=createHash('sha256').update(JSON.stringify({policyVersion:policy.version,continuations,organizationId:input.organizationId,campaignId:input.campaignId,operationId:op?.id??null,revision,requested:input.requestedCount,status:op?.status??null,reason:op?.discovery_reason??null,generation:op?.resume_generation??0,queries:op?.queries??0,items,accounting,limits,campaignLimits:resolveRadarSearchConfiguration(campaign.search_configuration).batch,cursors,latest,overflowCount})).digest('hex')
 const preflight:RadarCapturePreflight={stateId,allowed:!blockers.length,requiresLimitsApproval,remaining,limits,policy,continuations,campaignLimits:resolveRadarSearchConfiguration(campaign.search_configuration).batch,attemptedQueries:op?.queries??0,successfulPagesByScope:accounting.successfulPagesByScope,optimisticAdditionalCapacity:capacity.optimisticAdditionalCapacity,minimumAdditionalQueries:capacity.minimumAdditionalQueries,blockers,warnings,researchCapacity,checks,...(expired?{expiredContinuation:{receiptId:expired.receiptId,scopeLabel:expired.scopeLabel}}:{})}
 return{preflight,operation:op,campaign,scopes,overflowCount,policy}
}
export async function getRadarCapturePreflight(pool:pg.Pool,user:AuthUser,input:PreflightInput,deps:PreflightDependencies={}){
 const client=await pool.connect()
 try{await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');const result=await loadRadarCapturePreflight(client,user,input,deps);await client.query('COMMIT');return result.preflight}
 catch(cause){await client.query('ROLLBACK');throw cause}finally{client.release()}
}
