import {createHash,randomUUID} from 'node:crypto'
import type pg from 'pg'
import {classifyRadarEmailDomain} from './email-domain.js'
import {loadRadarEmailDomainPolicy} from './email-domain-policy.js'
import {applyRadarRegistryAdmission} from './registry-admission.js'
import {loadRadarFunnelLotProgress,stopRadarFunnelAtPaidPageCap,syncRadarFunnelDiscovery} from './funnel-replenishment.js'
import type {AppEnv} from '../../config/env.js'
import type {AuthUser} from '../../auth/routes.js'
import {buildRadarAdaptiveDiscoveryPlan,planRadarAdaptiveDiscoveryTurn,type RadarAdaptiveDiscoveryPlan,type RadarAdaptiveDiscoveryItem} from './discovery-plan.js'
import {loadRadarDiscoveryPolicy,resolveRadarOsmMapping,type RadarDiscoveryPolicy} from './discovery-policy.js'
import {resolveRadarSearchConfiguration,radarStateSchema} from './search-configuration.js'
import {findRadarDataSource,evaluateRadarSourceGovernance,recordRadarSourceUsage} from './repository.js'
import {loadPlatformProviderSecret} from '../platform/adminRepository.js'
import {discoverRadarProviderPage,normalizeSavedRadarDiscoveryPage,type RadarDiscoveryPage,type RadarDiscoveryTransportInput} from './discovery-providers.js'
import {discoverRadarOsmPage} from './osm-discovery.js'
import {sanitizeRadarEffectBody} from './effect-receipts.js'
import {admitRadarBusinessMention} from './candidate-admission.js'
import {collectRadarSiteEvidence} from './site-evidence.js'
import {extractRadarBusinesses} from './discovery-extraction.js'
import {classifyRadarSource} from './source-identity.js'
import {invokeAgentRuntime} from '../../lib/agent-runtime-client.js'
import {loadRadarOperationalLimits} from './operational-limits.js'
import {radarAdaptiveContinuations,effectiveRadarAdaptivePage} from './adaptive-continuation.js'
import {CnpjaPreparationError,CnpjaSearchHttpError} from './cnpjaClient.js'
type Db=Pick<pg.Pool,'query'>
type Campaign=pg.QueryResultRow&{id:string;organization_id:string;configuration_revision:number;search_configuration:unknown;target_segment:string;target_states:string[];target_cnaes:string[];target_keywords:string[]}
type PlanInput=Parameters<typeof buildRadarAdaptiveDiscoveryPlan>[0]
type StoredPlan={plan:RadarAdaptiveDiscoveryPlan;input:PlanInput;policy:RadarDiscoveryPolicy;policyVersion:number;sourcePrices:Record<string,number>}
const failure=(code:string)=>Object.assign(Error(code),{statusCode:409})
const providerFor=(source:string)=>source.startsWith('perplexity_')?'perplexity':source.startsWith('brave_')?'brave_place':source.startsWith('serper_')?'serper':source==='cnpja_advanced_search'?'cnpja':undefined
function sourceRights(source:string,config:Record<string,unknown>,internal:boolean){
 if(source==='osm_extract')return{canPersist:internal,canDeliver:internal}
 const retained=source==='cnpja_advanced_search'||source==='serper_places'&&config.placesRetentionLicensed===true||source==='serper_web_search'&&config.webSearchLicensed===true||source.startsWith('brave_')&&config.retentionLicensed===true&&config.credentialPurpose==='licensed_retention'&&(source==='brave_place_search'||config.webSearchLicensed===true)||source.startsWith('perplexity_')&&config.retentionLicensed===true&&config.webSearchLicensed===true
 return{canPersist:retained,canDeliver:retained&&(internal||config.clientDeliveryLicensed===true)}
}
export async function prepareRadarAdaptiveCapture(db:Db,campaign:Campaign):Promise<StoredPlan>{
 const config=resolveRadarSearchConfiguration(campaign.search_configuration),policy=await loadRadarDiscoveryPolicy(db)
 const internal=(await db.query("SELECT kind='yux' AND is_internal_growth_workspace AS internal FROM public.organizations WHERE id=$1",[campaign.organization_id])).rows[0]?.internal===true
 const sources:PlanInput['sources']=[],sourcePrices:Record<string,number>={}
 for(const key of config.discovery.sourceOrder){
  const source=await findRadarDataSource(db as pg.Pool,campaign.organization_id,key),providerKey=providerFor(key)
  const provider=providerKey?(await db.query(`SELECT provider.*,EXISTS(SELECT 1 FROM public.platform_provider_secrets secret WHERE secret.provider_connection_id=provider.id AND secret.secret_kind='api_key') AS has_secret FROM public.platform_provider_connections provider WHERE provider_key=$1 AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1`,[providerKey])).rows[0]:undefined
  const governance=await evaluateRadarSourceGovernance(db,campaign.organization_id,campaign.id,source,1,1)
  sources.push({key,enabled:source?.enabled===true,available:governance.allowed&&(!providerKey||provider?.status==='active'&&provider.has_secret===true)&&(!source?.isPaid||source.defaultCostPerUnit>0)&&(key!=='osm_extract'||!!resolveRadarOsmMapping(policy.configuration,campaign.target_segment)),...sourceRights(key,provider?.public_config??{},internal)})
  if(source)sourcePrices[key]=source.defaultCostPerUnit
 }
 const cities=(await db.query(`SELECT city,state,municipality_code FROM public.radar_osm_snapshots WHERE status='active' AND extracted_at>=NOW()-($1::int*INTERVAL '1 day') ORDER BY state,city,municipality_code`,[policy.configuration.osm.maxSnapshotAgeDays])).rows
 const input:PlanInput={pipelineVersion:2,segment:campaign.target_segment,states:campaign.target_states.map(state=>radarStateSchema.parse(state)),cities:config.cities,terms:config.discovery.terms,excludedTerms:config.excludedNameTerms,sourceOrder:config.discovery.sourceOrder,sources,window:{size:policy.configuration.windowSize,offset:0},geography:{catalogVersion:`local-coverage:${policy.version}`,cities:cities.map(row=>({city:row.city,state:row.state,municipalityCode:row.municipality_code})),completeStates:[]}}
 return{plan:buildRadarAdaptiveDiscoveryPlan(input),input,policy:policy.configuration,policyVersion:policy.version,sourcePrices}
}
export async function loadRadarAdaptiveItems(db:Db,operationId:string,organizationId:string):Promise<RadarAdaptiveDiscoveryItem[]>{
 const rows=(await db.query(`SELECT item.candidate_id,item.is_new,item.status,review.target_status FROM public.radar_capture_items item JOIN public.radar_capture_operations operation ON operation.id=item.operation_id AND operation.organization_id=item.organization_id LEFT JOIN public.radar_b2b_reviews review ON review.candidate_id=item.candidate_id AND review.organization_id=item.organization_id AND review.configuration_revision=operation.configuration_revision WHERE item.operation_id=$1 AND item.organization_id=$2 ORDER BY item.created_at,item.id`,[operationId,organizationId])).rows
 return rows.map(row=>({candidateId:row.candidate_id,isNew:row.is_new,qualification:row.target_status??'review',state:row.status==='queued'?'pending':row.status==='researching'?'running':row.status==='blocked'?'waiting':'completed'}))
}
type Page=pg.QueryResultRow&{id:string;scope_key:string;source:string;status:'reserved'|'received'|'admitted'|'uncertain'|'rejected';normalized_page:RadarDiscoveryPage|null;input:RadarDiscoveryTransportInput;response_body:unknown;admitted_offset:number;extraction:Record<string,unknown>;page_number:number;continuation?:Record<string,unknown>;exhaustion:'more'|'exhausted'|'unknown'}
async function savedRadarExtractionFailure(db:Db,organizationId:string,page:Page){
 const requestId=`discovery:${page.id}:${Number(page.extraction.documentIndex??0)}:${Number(page.extraction.offset??0)}`
 const row=(await db.query(`SELECT effect.failure_code FROM public.radar_analysis_receipts analysis
  JOIN LATERAL(SELECT transport_outcome,validation_outcome,failure_code FROM public.radar_effect_receipts WHERE analysis_receipt_id=analysis.id AND organization_id=analysis.organization_id ORDER BY attempt DESC LIMIT 1) effect ON TRUE
  WHERE analysis.organization_id=$1 AND analysis.action='radar_discovery_extraction' AND analysis.request_id=$2 AND analysis.status='uncertain'
   AND effect.transport_outcome='received' AND effect.validation_outcome='invalid'
   AND effect.failure_code IN('output_truncated','radar_discovery_extraction_invalid_response')`,[organizationId,requestId])).rows[0]
 return row?.failure_code as string|undefined
}
/** A saved, invalid document reply must not hide prior validated mentions.
 * This check never repeats the generation or changes its receipt. */
export async function canContinueRadarAdaptiveAfterSavedExtraction(db:Db,op:pg.QueryResultRow):Promise<boolean>{
 if(op.pipeline_version!==2||op.discovery_stopped||op.discovery_pending)return false
 const stored=op.discovery_plan as StoredPlan
 if(!stored?.plan||stored.plan.pipelineVersion!==2)return false
 const pages=(await db.query<Page>(`SELECT * FROM public.radar_discovery_pages WHERE organization_id=$1 AND campaign_id=$2 AND criteria_revision=$3 AND status='received' AND normalized_page IS NOT NULL ORDER BY created_at,id`,[op.organization_id,op.campaign_id,op.configuration_revision])).rows
 for(const page of pages){
  if(stored.plan.scopes.some(scope=>scope.key===page.scope_key)&&Number(page.extraction.documentIndex??0)<page.normalized_page!.documents.length&&await savedRadarExtractionFailure(db,op.organization_id,page))return true
 }
 return false
}
/** Read-only recovery check for older parents globally paused by a rejected
 * cursor. It never restarts that cursor or grants research/spending authority. */
export async function canContinueRadarAdaptiveAfterCursorRejection(db:Db,op:pg.QueryResultRow):Promise<boolean>{
 if(op.pipeline_version!==2||op.discovery_stopped||op.discovery_pending)return false
 const stored=op.discovery_plan as StoredPlan,config=resolveRadarSearchConfiguration(op.configuration_snapshot.search_configuration)
 if(!stored?.plan||stored.plan.pipelineVersion!==2)return false
 const rows=(await db.query<Page>('SELECT * FROM public.radar_discovery_pages WHERE organization_id=$1 AND campaign_id=$2 AND criteria_revision=$3 ORDER BY created_at,id',[op.organization_id,op.campaign_id,op.configuration_revision])).rows
 if(!rows.some(page=>page.operation_id===op.id&&page.status==='rejected'&&page.error_code==='radar_discovery_continuation_rejected'))return false
 const continuations=await radarAdaptiveContinuations(db,{organizationId:op.organization_id,campaignId:op.campaign_id,configurationRevision:op.configuration_revision},await loadRadarOperationalLimits(db))
 if(continuations.some(state=>state.reason==='uncertain'))return false
 const pages=rows.map(page=>effectiveRadarAdaptivePage(page) as Page),attemptedHere=rows.filter(page=>page.operation_id===op.id)
 if(attemptedHere.length>=config.batch.maxQueriesPerBatch)return false
 const held=new Set(continuations.map(state=>state.scopeKey)),scopes=[]
 for(const scope of stored.plan.scopes){
  if(held.has(scope.key)||attemptedHere.filter(page=>page.scope_key===scope.key).length>=config.batch.maxPagesPerScope)continue
  const source=await findRadarDataSource(db as pg.Pool,op.organization_id,scope.source)
  const capacity=await evaluateRadarSourceGovernance(db,op.organization_id,op.campaign_id,source,1,scope.source==='cnpja_advanced_search'?Math.ceil(config.batch.pageSize/10):1)
  if(capacity.allowed)scopes.push(scope)
 }
 if(!scopes.length)return false
 const items=await loadRadarAdaptiveItems(db,op.id,op.organization_id)
 if(items.some(item=>['pending','running'].includes(item.state)))return false
 const progress=op.funnel_enabled?await loadRadarFunnelLotProgress(db,op as any):null
 if(progress?.remaining===0)return false
 const turn=planRadarAdaptiveDiscoveryTurn({plan:{...stored.plan,scopes},requestedCount:progress?items.length+progress.remaining:Number(op.requested_count),items:progress?items.map(item=>({...item,qualification:'confirmed' as const})):items,pages:pages.map(page=>({id:page.id,scopeKey:page.scope_key,status:page.status,exhaustion:page.exhaustion,continuation:page.continuation}))})
 return 'action' in turn&&['discover','admit_saved_page','expand_plan_window'].includes(turn.action!)
}
export async function advanceRadarAdaptiveCapture(pool:pg.Pool,env:AppEnv,operation:pg.QueryResultRow,user:AuthUser,dependencies:{adaptiveDiscover?:(input:RadarDiscoveryTransportInput)=>Promise<RadarDiscoveryPage>;runtime?:typeof invokeAgentRuntime;collect?:typeof collectRadarSiteEvidence}={}){
 const op=operation,stored=op.discovery_plan as StoredPlan,config=resolveRadarSearchConfiguration(op.configuration_snapshot.search_configuration)
 if(op.pipeline_version!==2||!stored.plan||stored.plan.pipelineVersion!==2)throw failure('radar_capture_pipeline_unknown')
 const allPages=(await pool.query<Page>('SELECT * FROM public.radar_discovery_pages WHERE organization_id=$1 AND campaign_id=$2 AND criteria_revision=$3 ORDER BY created_at,id',[op.organization_id,op.campaign_id,op.configuration_revision])).rows.map(page=>effectiveRadarAdaptivePage(page) as Page)
 const relevant=allPages.filter(page=>stored.plan.scopes.some(scope=>scope.key===page.scope_key))
 const items=await loadRadarAdaptiveItems(pool,op.id,op.organization_id)
 const funnelProgress=op.funnel_enabled?await loadRadarFunnelLotProgress(pool,op as any):null
 // Research the existing admissions before consuming saved surplus/replacements.
 if(items.some(item=>['pending','running'].includes(item.state)))return
 if(funnelProgress?funnelProgress.remaining===0:items.filter(item=>item.isNew&&item.qualification==='confirmed').length>=Number(op.requested_count)){await pool.query("UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason='target_reached',status='researching',blockers='[]'::jsonb WHERE id=$1 AND organization_id=$2",[op.id,op.organization_id]);return}
 const attemptedHere=allPages.filter(page=>page.operation_id===op.id)
 const sourceCapacity=new Map<string,{allowed:boolean;code?:string}>()
 for(const key of new Set(stored.plan.scopes.map(scope=>scope.source))){
  const source=await findRadarDataSource(pool,op.organization_id,key),governance=await evaluateRadarSourceGovernance(pool,op.organization_id,op.campaign_id,source,1,key==='cnpja_advanced_search'?Math.ceil(config.batch.pageSize/10):1)
  sourceCapacity.set(key,{allowed:governance.allowed,code:governance.issues[0]?.code})
 }
 const savedPending=relevant.some(page=>page.status==='received')
 const continuations=savedPending?[]:await radarAdaptiveContinuations(pool,{organizationId:op.organization_id,campaignId:op.campaign_id,configurationRevision:op.configuration_revision},await loadRadarOperationalLimits(pool))
 // An uncertain purchase still needs reconciliation. An expired/rejected
 // cursor only holds its own region; unused configured regions remain usable.
 if(continuations.some(state=>state.reason==='uncertain'))throw failure('radar_capture_continuation_confirmation_required')
 const heldScopes=new Set(continuations.map(state=>state.scopeKey))
 if(!savedPending&&attemptedHere.length>=config.batch.maxQueriesPerBatch){await pool.query("UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason='query_cap' WHERE id=$1 AND organization_id=$2",[op.id,op.organization_id]);return}
 const eligibleScopes=stored.plan.scopes.filter(scope=>!heldScopes.has(scope.key)&&sourceCapacity.get(scope.source)?.allowed&&attemptedHere.filter(page=>page.scope_key===scope.key).length<config.batch.maxPagesPerScope)
 if(!savedPending&&!eligibleScopes.length&&stored.plan.scopes.length){
  // A cap applies to this scope, not all later regions/sources in a bounded
  // planning window. Expanding the frozen plan is local and buys nothing.
  if(stored.plan.nextScopeOffset!==null){
   const input={...stored.input,window:{...stored.input.window,offset:stored.plan.nextScopeOffset}},plan=buildRadarAdaptiveDiscoveryPlan(input)
   await pool.query('UPDATE public.radar_capture_operations SET discovery_plan=$3::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[op.id,op.organization_id,JSON.stringify({...stored,input,plan})]);return
  }
  if([...sourceCapacity.values()].some(value=>value.allowed)&&continuations.length)throw failure('radar_capture_continuation_confirmation_required')
  if([...sourceCapacity.values()].some(value=>value.allowed))await pool.query("UPDATE public.radar_capture_operations SET discovery_stopped=TRUE,discovery_reason='page_cap' WHERE id=$1 AND organization_id=$2",[op.id,op.organization_id])
  else throw failure([...sourceCapacity.values()].find(value=>value.code)?.code??'radar_discovery_no_eligible_sources')
  return
 }
 const planningItems=funnelProgress?items.map(item=>({...item,qualification:'confirmed' as const})):items
 const turn=planRadarAdaptiveDiscoveryTurn({plan:{...stored.plan,scopes:eligibleScopes},requestedCount:funnelProgress?items.length+funnelProgress.remaining:Number(op.requested_count),items:planningItems,pages:relevant.map(page=>({id:page.id,scopeKey:page.scope_key,status:page.status,exhaustion:page.exhaustion,continuation:page.continuation}))})
 if('stop' in turn){
  if(continuations.length&&['awaiting_research_attention','consulted_sources_exhausted','coverage_incomplete'].includes(turn.stop!))throw failure('radar_capture_continuation_confirmation_required')
  const wait=['awaiting_research_attention','awaiting_reconciliation','awaiting_source_response','awaiting_continuation'].includes(turn.stop!)
  await pool.query(`UPDATE public.radar_capture_operations SET status=$3,discovery_stopped=$4,discovery_reason=$5,blockers=$6::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[op.id,op.organization_id,wait?'blocked':'researching',!wait,turn.stop==='target_reached'?'target_reached':turn.stop,JSON.stringify(wait?[`radar_discovery_${turn.stop}`]:[])])
  return
 }
 if(turn.action==='research_pending')return
 if(turn.action==='expand_plan_window'){
  const input={...stored.input,window:{...stored.input.window,offset:turn.offset}},plan=buildRadarAdaptiveDiscoveryPlan(input)
  await pool.query('UPDATE public.radar_capture_operations SET discovery_plan=$3::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[op.id,op.organization_id,JSON.stringify({...stored,input,plan})]);return
 }
 if(turn.action==='admit_saved_page'){
  const page=relevant.find(page=>page.id===turn.pageId)!
  if(!page.normalized_page){
   if(!page.response_body)throw failure('radar_discovery_response_revalidation_required')
   const restored=await normalizeSavedRadarDiscoveryPage(page.input,page.response_body)
   await pool.query(`UPDATE public.radar_discovery_pages SET normalized_page=$3::jsonb,continuation=$4::jsonb,exhaustion=$5,error_code=NULL,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND normalized_page IS NULL`,[page.id,op.organization_id,JSON.stringify(restored),JSON.stringify(restored.continuation??null),restored.exhaustion])
   return
  }
  const remaining=funnelProgress?.remaining??Math.max(0,Number(op.requested_count)-items.filter(item=>item.isNew&&item.qualification==='confirmed').length)
  await admitAdaptivePage(pool,env,op,page,remaining,dependencies)
  return
 }
 if(await stopRadarFunnelAtPaidPageCap(pool,op as any))return
 const scope=turn.scope
 const currentScopePages=relevant.filter(page=>page.scope_key===scope.key)
 if(attemptedHere.length>=config.batch.maxQueriesPerBatch||currentScopePages.filter(page=>page.operation_id===op.id).length>=config.batch.maxPagesPerScope)throw failure('radar_capture_query_limit')
 const pageId=randomUUID(),owner=randomUUID(),db=await pool.connect()
 let apiKey=''
 const input:RadarDiscoveryTransportInput={scope,pageSize:config.batch.pageSize,apiKey:'',...(turn.continuation?{continuation:turn.continuation}:{}),registryFilters:{cnaes:op.configuration_snapshot.target_cnaes,includeSecondaryActivities:config.activityScope==='main_or_secondary',excludedNameTerms:config.excludedNameTerms,registrationStatusIds:config.registrationStatusIds,openingFrom:config.openingFrom,openingTo:config.openingTo}}
 try{
  await db.query('BEGIN')
  const campaign=(await db.query('SELECT * FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[op.campaign_id,op.organization_id])).rows[0]
  if(campaign?.configuration_revision!==op.configuration_revision||['paused','completed','archived'].includes(campaign.status))throw failure('radar_campaign_configuration_changed')
  const actor=(await db.query("SELECT role FROM public.app_users WHERE id=$1 AND is_active=TRUE",[op.requested_by])).rows[0]
  if(actor?.role!=='yux_admin')throw failure('radar_batch_admin_not_active')
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`radar:${op.organization_id}:${scope.source}`])
  const source=await findRadarDataSource(db as unknown as pg.Pool,op.organization_id,scope.source)
  if(!source||source.defaultCostPerUnit>(stored.sourcePrices[scope.source]??-1))throw failure('radar_intent_source_price_changed')
  const billingUnits=scope.source==='cnpja_advanced_search'?Math.ceil(config.batch.pageSize/10):1
  const governance=await evaluateRadarSourceGovernance(db,op.organization_id,op.campaign_id,source,1,billingUnits,true)
  if(!governance.allowed)throw failure(governance.issues[0].code)
  const providerKey=providerFor(scope.source)
  if(providerKey){
   const connection=(await db.query(`SELECT * FROM public.platform_provider_connections WHERE provider_key=$1 AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1`,[providerKey])).rows[0]
   const internal=(await db.query("SELECT kind='yux' AND is_internal_growth_workspace AS internal FROM public.organizations WHERE id=$1",[op.organization_id])).rows[0]?.internal===true
   const rights=sourceRights(scope.source,connection?.public_config??{},internal)
   if(connection?.status!=='active'||!rights.canPersist||!rights.canDeliver)throw failure('radar_discovery_source_rights_required')
   apiKey=await loadPlatformProviderSecret(db as unknown as pg.Pool,connection.id,'api_key',env.PROVIDER_SECRET_ENCRYPTION_KEY_B64?`provider-key:${env.PROVIDER_SECRET_ENCRYPTION_KEY_B64}`:env.SESSION_SECRET)??''
   if(!apiKey)throw failure('provider_secret_missing')
  }
  await db.query(`INSERT INTO public.radar_discovery_pages(id,organization_id,campaign_id,operation_id,criteria_revision,scope_key,source,page_number,status,input,cost_estimate_brl,lease_id,lease_until) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'reserved',$9::jsonb,$10,$11,NOW()+INTERVAL '6 minutes')`,[pageId,op.organization_id,op.campaign_id,op.id,op.configuration_revision,scope.key,scope.source,(currentScopePages.at(-1)?.page_number??0)+1,JSON.stringify(input),source.defaultCostPerUnit*billingUnits,owner])
  await recordRadarSourceUsage(db,op.organization_id,op.campaign_id,source,1,source.defaultCostPerUnit*billingUnits)
  await db.query('UPDATE public.radar_capture_operations SET queries=queries+1,updated_at=NOW() WHERE id=$1 AND organization_id=$2',[op.id,op.organization_id])
  await db.query('COMMIT')
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
 try{
  const result=await(dependencies.adaptiveDiscover??(value=>discoverRadarProviderPage(value,{osm:()=>discoverRadarOsmPage(pool,{city:scope.city,state:scope.state,segment:op.configuration_snapshot.target_segment,policy:stored.policy,continuation:turn.continuation})})))({...input,apiKey,onResponse:async body=>{
   const saved=await pool.query(`UPDATE public.radar_discovery_pages SET status='received',response_body=$4::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND lease_id=$3 AND lease_until>NOW() RETURNING id`,[pageId,op.organization_id,owner,JSON.stringify(sanitizeRadarEffectBody(body))]);if(!saved.rows[0])throw failure('radar_discovery_lease_lost')
  }})
  const saved=await pool.query(`UPDATE public.radar_discovery_pages SET status='received',normalized_page=$4::jsonb,continuation=$5::jsonb,exhaustion=$6,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND lease_id=$3 AND lease_until>NOW() RETURNING id`,[pageId,op.organization_id,owner,JSON.stringify(result),JSON.stringify(result.continuation??null),result.exhaustion]);if(!saved.rows.length)throw failure('radar_discovery_lease_lost')
 }catch(cause){
  const notDispatched=cause instanceof CnpjaPreparationError
  const rejected=cause instanceof CnpjaSearchHttpError&&cause.requestRejected||(cause as {billingOutcome?:string})?.billingOutcome==='not_billed'
  const code=notDispatched?cause.message:rejected&&input.continuation?.token?'radar_discovery_continuation_rejected':rejected?'radar_discovery_parameters_rejected':cause instanceof Error&&/^[a-z][a-z0-9_]+$/.test(cause.message)?cause.message:'radar_discovery_request_uncertain'
  const receipt=await pool.connect()
  try{
   await receipt.query('BEGIN')
   await receipt.query(`UPDATE public.radar_discovery_pages SET status=CASE WHEN response_body IS NOT NULL THEN 'received' WHEN $5 THEN 'rejected' ELSE 'uncertain' END,error_code=$4,updated_at=NOW() WHERE id=$1 AND organization_id=$2 AND lease_id=$3`,[pageId,op.organization_id,owner,code,rejected])
   // Only the typed local preparation failure proves that no request consumed
   // a source unit. A non-billed response alone does not prove that. Commit
   // receipt and refund together, including after a worker/process interruption.
   if((cause as {billingOutcome?:string})?.billingOutcome==='not_billed')await receipt.query(`WITH original AS(SELECT id,cost_estimate_brl,created_at::date AS usage_date FROM public.radar_discovery_pages WHERE id=$1 AND organization_id=$2 AND cost_estimate_brl>0 AND status='rejected' FOR UPDATE),recorded AS(UPDATE public.radar_discovery_pages page SET cost_estimate_brl=0 FROM original WHERE page.id=original.id RETURNING original.cost_estimate_brl,original.usage_date) UPDATE public.radar_source_usage_counters counter SET units=GREATEST(0,counter.units-CASE WHEN $5 THEN 1 ELSE 0 END),estimated_cost=GREATEST(0,counter.estimated_cost-recorded.cost_estimate_brl),updated_at=NOW() FROM recorded WHERE counter.organization_id=$2 AND counter.campaign_id=$3 AND counter.source_type=$4 AND counter.usage_date=recorded.usage_date`,[pageId,op.organization_id,op.campaign_id,scope.source,notDispatched])
   await receipt.query('COMMIT')
  }catch(error){await receipt.query('ROLLBACK');throw error}finally{receipt.release()}
  // The receipt now holds only this region. The next normal turn can select
  // another valid cursor; if none remains, the existing confirmation guard
  // pauses truthfully. Unknown outcomes and other validation errors still stop.
  if(code==='radar_discovery_continuation_rejected')return
  throw Object.assign(failure(code),{cause})
 }
}
async function admitAdaptivePage(pool:pg.Pool,env:AppEnv,op:pg.QueryResultRow,page:Page,remaining:number,dependencies:{runtime?:typeof invokeAgentRuntime;collect?:typeof collectRadarSiteEvidence}){
 const normalized=page.normalized_page!,documentIndex=Number(page.extraction.documentIndex??0),config=resolveRadarSearchConfiguration(op.configuration_snapshot.search_configuration)
 const permission=(await pool.query(`SELECT organization.kind='yux' AND organization.is_internal_growth_workspace AS internal,provider.public_config,actor.role,actor.is_active,campaign.status,campaign.configuration_revision FROM public.radar_campaigns campaign JOIN public.organizations organization ON organization.id=campaign.organization_id JOIN public.app_users actor ON actor.id=$3 LEFT JOIN LATERAL(SELECT public_config FROM public.platform_provider_connections WHERE provider_key=$4 AND environment='production' ORDER BY is_default DESC,updated_at DESC LIMIT 1) provider ON TRUE WHERE campaign.id=$1 AND campaign.organization_id=$2`,[op.campaign_id,op.organization_id,op.requested_by,providerFor(page.source)??null])).rows[0]
 if(!permission||permission.role!=='yux_admin'||!permission.is_active||permission.configuration_revision!==op.configuration_revision||['paused','completed','archived'].includes(permission.status))throw failure('radar_campaign_configuration_changed')
 const rights=sourceRights(page.source,permission.public_config??{},permission.internal===true)
 if(!rights.canPersist||!rights.canDeliver)throw failure('radar_discovery_source_rights_required')
 // One document/window per durable turn. Each paid extraction has a stable ID;
 // re-delivery reuses its runtime receipt rather than paying again.
 // Enough validated mentions may already fill this request. Admit them before
 // reading/generating the rest; retain every unread document and surplus item.
 if(documentIndex<normalized.documents.length&&normalized.candidates.length-Number(page.admitted_offset)<remaining){
  const skipInvalidDocument=async(code:string)=>{
   const limitations=Array.isArray(page.extraction.limitations)?page.extraction.limitations:[]
   await pool.query(`UPDATE public.radar_discovery_pages SET extraction=extraction||$3::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[page.id,op.organization_id,JSON.stringify({documentIndex:documentIndex+1,document:null,offset:0,limitations:[...limitations,{documentIndex,offset:Number(page.extraction.offset??0),code}]})])
  }
  const priorFailure=await savedRadarExtractionFailure(pool,op.organization_id,page)
  if(priorFailure){await skipInvalidDocument(priorFailure);return}
  const hit=normalized.documents[documentIndex]
  let document=page.extraction.document as {text:string;observedAt:string;url?:string;searchExcerpt?:boolean}|undefined
  if(!document){
   const read=(await(dependencies.collect??collectRadarSiteEvidence)(hit.url,{maxPagesPerCandidate:1,maxAttemptsPerCandidate:1})).find(item=>!item.limitation&&item.text)
   // Licensed search text can identify provisional mentions even when our
   // reader cannot fetch the page. It is NOT evidence of a live official site
   // and never supplies publisher contacts to the prospect.
   const excerpt=[hit.title,hit.extractedText,...hit.snippets].filter(Boolean).join('\n')
   if(!read&&!excerpt){await pool.query(`UPDATE public.radar_discovery_pages SET extraction=extraction||$3::jsonb WHERE id=$1 AND organization_id=$2`,[page.id,op.organization_id,JSON.stringify({documentIndex:documentIndex+1,document:null,offset:0,readingRestricted:true})]);return}
   document=read?{text:read.text,observedAt:read.observedAt,url:read.url}:{text:excerpt,observedAt:hit.observedAt,url:hit.url,searchExcerpt:true}
   await pool.query(`UPDATE public.radar_discovery_pages SET extraction=extraction||$3::jsonb WHERE id=$1 AND organization_id=$2`,[page.id,op.organization_id,JSON.stringify({document})])
  }
  const tenant=(await pool.query(`SELECT organization.client_id,contract.id AS contract_id FROM public.organizations organization LEFT JOIN LATERAL(SELECT id FROM public.contracts WHERE client_id=organization.client_id AND status='active' ORDER BY starts_at DESC,id DESC LIMIT 1) contract ON TRUE WHERE organization.id=$1`,[op.organization_id])).rows[0]
  const offset=Number(page.extraction.offset??0)
  let extracted:Awaited<ReturnType<typeof extractRadarBusinesses>>
  try{
   extracted=await extractRadarBusinesses({enabled:true,requestId:`discovery:${page.id}:${documentIndex}:${offset}`,tenant:{organizationId:op.organization_id,clientId:tenant?.client_id,contractId:tenant?.contract_id},document:{id:`doc-${documentIndex}`,source_url:document.url??hit.url,text:document.text,kind:document.searchExcerpt?'third_party':classifyRadarSource(document.url??hit.url).kind,observed_at:document.observedAt,canPersist:true},offsetBytes:offset,criteria:{segment:op.configuration_snapshot.target_segment,...config.qualification},region:{state:page.input.scope.state,city:page.input.scope.city}},
    {runtime:(path,payload)=>(dependencies.runtime??invokeAgentRuntime)(env,path,payload)})
  }catch(cause){
   const confirmedFailure=await savedRadarExtractionFailure(pool,op.organization_id,page)
   if(!confirmedFailure)throw cause
   await skipInvalidDocument(confirmedFailure);return
  }
  const candidates=[...normalized.candidates,...extracted.mentions.map(mention=>({mention}))]
  await pool.query(`UPDATE public.radar_discovery_pages SET normalized_page=$3::jsonb,extraction=extraction||$4::jsonb,updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[page.id,op.organization_id,JSON.stringify({...normalized,candidates}),JSON.stringify({documentIndex:extracted.nextOffsetBytes===null?documentIndex+1:documentIndex,document:extracted.nextOffsetBytes===null?null:document,offset:extracted.nextOffsetBytes??0,lastAnalysis:extracted.analysis})]);return
 }
 const db=await pool.connect()
 try{
  await db.query('BEGIN')
  const campaign=(await db.query('SELECT configuration_revision FROM public.radar_campaigns WHERE id=$1 AND organization_id=$2 FOR UPDATE',[op.campaign_id,op.organization_id])).rows[0]
  if(campaign?.configuration_revision!==op.configuration_revision)throw failure('radar_campaign_configuration_changed')
  const locked=(await db.query<Page>('SELECT * FROM public.radar_discovery_pages WHERE id=$1 AND organization_id=$2 FOR UPDATE',[page.id,op.organization_id])).rows[0]
  let offset=locked.admitted_offset,added=0,scanned=0
  while(offset<normalized.candidates.length&&added<remaining&&scanned<config.batch.verificationLimit){
   const candidate=normalized.candidates[offset]
   const admission=await admitRadarBusinessMention(pool,{organizationId:op.organization_id,campaignId:op.campaign_id,revision:op.configuration_revision,observationKey:`page:${page.id}:${offset}`,mention:candidate.mention,verification:candidate.verification,externalKey:candidate.externalKey,registryPolicy:{triage:'investigate',requiredFields:[],missingFields:[],sourceAllowed:false,budgetApproved:false},canPersist:true},{transaction:db})
   if(admission.candidateId&&admission.newCandidateCount){
    // Keep origin rights attached after admission too. Export/CRM must still
    // enforce licensing if permissions change after the discovery request.
    const provenance={discoverySourceType:page.source,researchUsesBrave:page.source.startsWith('brave_'),researchUsesSerper:page.source==='serper_web_search',researchUsesSerperPlaces:page.source==='serper_places',researchUsesPerplexity:page.source.startsWith('perplexity_')}
    await db.query(`UPDATE public.radar_candidate_records SET normalized_payload=normalized_payload||$3::jsonb,source_type=CASE WHEN $4='osm_extract' THEN 'osm_extract' ELSE source_type END WHERE id=$1 AND organization_id=$2`,[admission.candidateId,op.organization_id,JSON.stringify(provenance),page.source])
    if(candidate.registry){
     const row=candidate.registry
     const fiscal={legalName:row.legalName,tradeName:row.tradeName||row.legalName,cnpj:row.taxId,cnaeMain:row.cnaeMain,cnaes:row.cnaes,registryActivities:row.activities??[],emailDomainSignal:classifyRadarEmailDomain(row.email,(await loadRadarEmailDomainPolicy(db)).configuration),registrationStatus:row.registrationStatus,openingDate:row.openingDate,capital:row.capital,legalNature:row.legalNature,registeredSize:row.registeredSize,registryUpdatedAt:row.registryUpdatedAt,address:row.address,city:row.city,state:row.state,emailRaw:row.email,phoneRaw:row.phone}
     await db.query(`UPDATE public.radar_candidate_records SET normalized_payload=normalized_payload||$3::jsonb,raw_payload=$4::jsonb,source_type='cnpja_advanced_search' WHERE id=$1 AND organization_id=$2`,[admission.candidateId,op.organization_id,JSON.stringify(fiscal),JSON.stringify(row.rawPayload)])
    }
    await db.query('INSERT INTO public.radar_capture_items(organization_id,campaign_id,operation_id,candidate_id,is_new) VALUES($1,$2,$3,$4,TRUE) ON CONFLICT DO NOTHING',[op.organization_id,op.campaign_id,op.id,admission.candidateId]);added++
    if(op.funnel_enabled){const payload=(await db.query('SELECT normalized_payload FROM public.radar_candidate_records WHERE id=$1 AND organization_id=$2',[admission.candidateId,op.organization_id])).rows[0]?.normalized_payload;await applyRadarRegistryAdmission(db,{organizationId:op.organization_id,campaignId:op.campaign_id,candidateId:admission.candidateId,operationId:op.id,revision:op.configuration_revision,configuration:config,targetCnaes:op.configuration_snapshot.target_cnaes??[],payload})}
   }
   offset++;scanned++
  }
  await db.query(`UPDATE public.radar_discovery_pages SET admitted_offset=$3::int,status=CASE WHEN $3::int>=$4::int AND $5 THEN 'admitted' ELSE 'received' END,updated_at=NOW() WHERE id=$1 AND organization_id=$2`,[page.id,op.organization_id,offset,normalized.candidates.length,Number(locked.extraction.documentIndex??0)>=normalized.documents.length])
  if(op.funnel_enabled){const current=(await db.query('SELECT * FROM public.radar_capture_operations WHERE id=$1 AND organization_id=$2 FOR UPDATE',[op.id,op.organization_id])).rows[0];await syncRadarFunnelDiscovery(db,current)}
  await db.query('COMMIT')
 }catch(cause){await db.query('ROLLBACK');throw cause}finally{db.release()}
}
