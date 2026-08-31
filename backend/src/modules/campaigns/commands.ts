import { executeProviderAdapter, sanitizeProviderMetadata, type AdsProviderMutationAction } from '../../lib/edge-compat/adsProvider.js'
import { loadProviderSecretFromPool } from '../../lib/edge-compat/providerSecrets.js'
import { recordDomainEvent } from '../events/repository.js'
import { loadMissionCommandResult, missionArtifactHash, saveMissionCommandResult, type MissionCommandContext, type MissionCommandQueryable } from '../action-engine/mission-command.js'
import type { Connectable } from '../action-engine/repository.js'
import { getCampaignMissionVersion, insertCampaignDraft, inspectCampaignState, type CampaignLaunchArtifact } from './repository.js'

type ArtifactResult = { entityId: string; versionId: string; status: string; contentHash: string; evidence: Record<string, unknown> }
type ProviderResult = ArtifactResult & { providerReference: string; mutationRunId: string }

export { inspectCampaignState }

export async function createCampaignDraft(client: MissionCommandQueryable, context: MissionCommandContext, input: CampaignLaunchArtifact): Promise<ArtifactResult> {
  const key='campaign.create_draft'; const prior=await loadMissionCommandResult<ArtifactResult>(client,context,key); if(prior)return prior
  const version=await insertCampaignDraft(client,context,input)
  const result={entityId:required(version.campaignId),versionId:version.id,status:'draft',contentHash:version.contentHash,evidence:{provider:input.platform,activated:false,budgetBrl:input.totalBudgetBrl}}
  await event(client,context,'mission.campaign_draft_created',{campaignId:result.entityId,versionId:result.versionId,contentHash:result.contentHash})
  return saveMissionCommandResult(client,context,key,result)
}

export async function generateCreativeDraft(client: MissionCommandQueryable, context: MissionCommandContext, input:{campaignVersionId:string;position:number;creative:CampaignLaunchArtifact['creatives'][number]}):Promise<ArtifactResult>{
  const key='marketing.creative.generate_draft';const prior=await loadMissionCommandResult<ArtifactResult>(client,context,key);if(prior)return prior
  const version=await requireVersion(client,context,input.campaignVersionId,'draft'); if(!input.creative.sourceIds.length)throw new Error('campaign_creative_evidence_required')
  const hash=missionArtifactHash(input.creative);const inserted=await client.query<{id:string}>(`INSERT INTO public.campaign_creative_versions (organization_id,campaign_version_id,position,snapshot_payload,content_hash,mission_id,action_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (campaign_version_id,position) DO UPDATE SET snapshot_payload=EXCLUDED.snapshot_payload,content_hash=EXCLUDED.content_hash,action_run_id=EXCLUDED.action_run_id WHERE campaign_creative_versions.status='draft' RETURNING id`,[context.organizationId,version.id,input.position,input.creative,hash,context.missionId,context.actionRunId])
  const id=required(inserted.rows[0]?.id);const result={entityId:id,versionId:id,status:'draft',contentHash:hash,evidence:{position:input.position,sourceIds:input.creative.sourceIds}}
  await event(client,context,'mission.campaign_creative_draft_created',{campaignVersionId:version.id,creativeVersionId:id,contentHash:hash});return saveMissionCommandResult(client,context,key,result)
}

export async function generateOptimizationCreativeDraft(client: MissionCommandQueryable, context: MissionCommandContext, input:{campaignVersionId:string;creative:CampaignLaunchArtifact['creatives'][number]}):Promise<ArtifactResult>{
  const key='marketing.creative.optimization_draft';const prior=await loadMissionCommandResult<ArtifactResult>(client,context,key);if(prior)return prior
  const version=await getCampaignMissionVersion(client,{organizationId:context.organizationId,missionId:context.missionId,versionId:input.campaignVersionId})
  if(!version||!['active','provider_paused'].includes(version.status))throw new Error('campaign_version_status_invalid')
  if(!input.creative.sourceIds.length)throw new Error('campaign_creative_evidence_required')
  const position=await client.query<{position:number}>(`SELECT COALESCE(MAX(position),-1)+1 AS position FROM public.campaign_creative_versions WHERE campaign_version_id=$1 AND organization_id=$2`,[version.id,context.organizationId])
  const nextPosition=Number(position.rows[0]?.position??0);const contentHash=missionArtifactHash(input.creative)
  const inserted=await client.query<{id:string}>(`INSERT INTO public.campaign_creative_versions (organization_id,campaign_version_id,position,snapshot_payload,content_hash,mission_id,action_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,[context.organizationId,version.id,nextPosition,input.creative,contentHash,context.missionId,context.actionRunId])
  const id=required(inserted.rows[0]?.id);const result={entityId:id,versionId:id,status:'draft',contentHash,evidence:{position:nextPosition,sourceIds:input.creative.sourceIds,optimization:true}}
  await event(client,context,'mission.campaign_creative_optimization_draft_created',{campaignVersionId:version.id,creativeVersionId:id,contentHash});return saveMissionCommandResult(client,context,key,result)
}

export async function attachCampaignCreativeDraft(client:MissionCommandQueryable,context:MissionCommandContext,input:{campaignVersionId:string;creativeVersionId:string;expectedContentHash:string}):Promise<ArtifactResult>{
  const key='campaign.creative.attach_draft';const prior=await loadMissionCommandResult<ArtifactResult>(client,context,key);if(prior)return prior
  await requireVersion(client,context,input.campaignVersionId,'draft')
  const creative=await client.query<{id:string;content_hash:string;position:number}>(`SELECT creative.id,creative.content_hash,creative.position FROM public.campaign_creative_versions creative WHERE creative.id=$1 AND creative.campaign_version_id=$2 AND creative.organization_id=$3 AND creative.mission_id=$4 AND creative.status='draft' LIMIT 1`,[input.creativeVersionId,input.campaignVersionId,context.organizationId,context.missionId]);const row=creative.rows[0];if(!row)throw new Error('campaign_creative_version_not_found');if(row.content_hash!==input.expectedContentHash)throw new Error('campaign_creative_hash_changed')
  const result={entityId:row.id,versionId:row.id,status:'draft',contentHash:row.content_hash,evidence:{attached:true,position:Number(row.position)}};return saveMissionCommandResult(client,context,key,result)
}

export async function attachAcquisitionAsset(client:MissionCommandQueryable,context:MissionCommandContext,input:{campaignVersionId:string;assetKind:'landing_page'|'lead_form'|'tracking';sourceEntityId?:string;payload:Record<string,unknown>;validated?:boolean}):Promise<ArtifactResult>{
  const key=`campaign.acquisition.attach_${input.assetKind}`;const prior=await loadMissionCommandResult<ArtifactResult>(client,context,key);if(prior)return prior
  const version=await requireVersion(client,context,input.campaignVersionId,'draft');const hash=missionArtifactHash(input.payload)
  const inserted=await client.query<{id:string}>(`INSERT INTO public.campaign_acquisition_asset_versions (organization_id,campaign_version_id,asset_kind,source_entity_id,status,snapshot_payload,content_hash,mission_id,action_run_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (campaign_version_id,asset_kind) DO UPDATE SET source_entity_id=EXCLUDED.source_entity_id,status=EXCLUDED.status,snapshot_payload=EXCLUDED.snapshot_payload,content_hash=EXCLUDED.content_hash,action_run_id=EXCLUDED.action_run_id WHERE campaign_acquisition_asset_versions.status IN ('draft','validated') RETURNING id`,[context.organizationId,version.id,input.assetKind,input.sourceEntityId??null,input.validated?'validated':'draft',input.payload,hash,context.missionId,context.actionRunId])
  const id=required(inserted.rows[0]?.id);const result={entityId:input.sourceEntityId??id,versionId:id,status:input.validated?'validated':'draft',contentHash:hash,evidence:{assetKind:input.assetKind}}
  return saveMissionCommandResult(client,context,key,result)
}

export async function createProviderCampaignPaused(pool:Connectable,context:MissionCommandContext,input:{versionId:string;expectedContentHash:string;approvedSubjectHash:string;maxTotalBudgetBrl:string;fetcher?:typeof fetch}):Promise<ProviderResult>{
  return providerMutation(pool,context,{action:'create_campaign',commandKey:'campaign.provider.create_paused',versionId:input.versionId,expectedContentHash:input.expectedContentHash,approvedSubjectHash:input.approvedSubjectHash,maxTotalBudgetBrl:input.maxTotalBudgetBrl,fetcher:input.fetcher,nextStatus:'provider_paused'})
}
export async function activateProviderCampaign(pool:Connectable,context:MissionCommandContext,input:{versionId:string;expectedContentHash:string;approvedSubjectHash:string;fetcher?:typeof fetch}):Promise<ProviderResult>{
  return providerMutation(pool,context,{action:'activate_campaign',commandKey:'campaign.provider.activate',...input,nextStatus:'active'})
}
export async function pauseProviderCampaign(pool:Connectable,context:MissionCommandContext,input:{versionId:string;expectedContentHash:string;approvedSubjectHash:string;fetcher?:typeof fetch}):Promise<ProviderResult>{
  return providerMutation(pool,context,{action:'pause_campaign',commandKey:'campaign.provider.pause',...input,nextStatus:'paused'})
}

export async function adjustProviderCampaignBudget(pool:Connectable,context:MissionCommandContext,input:{
  versionId:string;expectedContentHash:string;approvedSubjectHash:string;currentDailyBudgetBrl:string;nextDailyBudgetBrl:string;
  maxAdjustmentPercent:string;direction:'decrease'|'increase';providerBudgetResourceId?:string;fetcher?:typeof fetch
}):Promise<ProviderResult&{currentDailyBudgetBrl:string;nextDailyBudgetBrl:string;adjustmentPercent:string}>{
  const current=Number(input.currentDailyBudgetBrl),next=Number(input.nextDailyBudgetBrl),maximum=Number(input.maxAdjustmentPercent)
  if(!Number.isFinite(current)||current<=0||!Number.isFinite(next)||next<=0||!Number.isFinite(maximum)||maximum<=0||maximum>20)throw new Error('campaign_budget_adjustment_invalid')
  if(input.direction==='decrease'?next>=current:next<=current)throw new Error('campaign_budget_adjustment_direction_invalid')
  const adjustment=Math.abs(next-current)/current*100;if(adjustment>maximum+0.000001)throw new Error('campaign_budget_adjustment_exceeds_ceiling')
  const commandKey=input.direction==='decrease'?'campaign.budget.decrease_bounded':'campaign.budget.increase'
  const prepared=await transaction(pool,async client=>{
    const prior=await loadMissionCommandResult<ProviderResult&{currentDailyBudgetBrl:string;nextDailyBudgetBrl:string;adjustmentPercent:string}>(client,context,commandKey);if(prior)return{prior}
    const version=await requireVersion(client,context,input.versionId,'active');if(version.contentHash!==input.expectedContentHash)throw new Error('campaign_version_hash_changed')
    const campaign=await client.query<{id:string;daily_budget:string;external_id:string;provider_connection_id:string;provider:'meta'|'google'}>(`SELECT id,daily_budget::TEXT,external_id,provider_connection_id,provider FROM public.campaigns WHERE id=$1 AND organization_id=$2 AND lifecycle_status='active' FOR UPDATE`,[version.campaignId,context.organizationId])
    const row=campaign.rows[0];if(!row)throw new Error('campaign_active_state_unavailable');if(Math.abs(Number(row.daily_budget)-current)>0.01)throw new Error('campaign_budget_state_changed')
    const connection=await client.query<{id:string;provider:'meta'|'google';provider_account_id:string|null;token_reference:string|null;status:string}>(`SELECT id,provider,provider_account_id,token_reference,status FROM public.ad_provider_connections WHERE id=$1 AND organization_id=$2 LIMIT 1`,[row.provider_connection_id,context.organizationId])
    const provider=connection.rows[0];if(!provider||provider.status!=='connected'||!provider.token_reference)throw new Error('campaign_provider_connection_unavailable')
    const priorCreate=await client.query<{response_payload:Record<string,unknown>}>(`SELECT response_payload FROM public.ad_provider_mutation_runs WHERE campaign_id=$1 AND organization_id=$2 AND action='create_campaign' AND status='succeeded' ORDER BY completed_at DESC LIMIT 1`,[row.id,context.organizationId])
    const resource=input.providerBudgetResourceId??providerBudgetResource(provider.provider,priorCreate.rows[0]?.response_payload)
    if(!resource)throw new Error('campaign_provider_budget_reference_unavailable')
    const requestPayload=provider.provider==='meta'?{externalAdSetId:resource,nextDaily:next}:{budgetResourceName:resource,nextDaily:next}
    const idempotencyKey=`${provider.provider}:update_budget:${context.idempotencyKey}`;const requestHash=missionArtifactHash(requestPayload)
    const run=await client.query<{id:string;status:string}>(`INSERT INTO public.ad_provider_mutation_runs (organization_id,provider_connection_id,campaign_id,provider,action,status,idempotency_key,request_payload,request_hash,approved_subject_hash,mission_id,action_run_id,requested_by) VALUES ($1,$2,$3,$4,'update_budget','running',$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id,status`,[context.organizationId,provider.id,row.id,provider.provider,idempotencyKey,sanitizeProviderMetadata(requestPayload),requestHash,input.approvedSubjectHash,context.missionId,context.actionRunId,context.actorId])
    return{version,provider,requestPayload,runId:required(run.rows[0]?.id),campaignId:row.id,providerReference:row.external_id}
  })
  if('prior'in prepared&&prepared.prior)return prepared.prior
  if(!('provider'in prepared))throw new Error('campaign_provider_preparation_failed')
  const secret=await loadProviderSecretFromPool(pool as never,required(prepared.provider.token_reference??undefined));if(secret.expired)throw new Error('campaign_provider_token_expired')
  const response=await executeProviderAdapter({provider:prepared.provider.provider,action:'update_budget',localMutationId:prepared.runId,requestPayload:{...prepared.requestPayload,accessToken:secret.value,providerAccountId:prepared.provider.provider_account_id??undefined},...(input.fetcher?{fetcher:input.fetcher}:{})})
  if(response.status!=='succeeded'){const unknown=/timeout|timed out|abort|network|fetch failed/i.test(response.protectedError??'');await pool.query(`UPDATE public.ad_provider_mutation_runs SET status=$2,protected_error=$3,response_payload=$4,completed_at=NOW(),updated_at=NOW() WHERE id=$1`,[prepared.runId,unknown?'unknown':'failed',response.protectedError??'provider_mutation_failed',providerResponseEvidence(response)]);throw new Error(unknown?'provider_outcome_unknown':'provider_mutation_failed')}
  return transaction(pool,async client=>{
    await client.query(`UPDATE public.ad_provider_mutation_runs SET status='succeeded',provider_reference=$2,response_payload=$3,protected_error=NULL,completed_at=NOW(),updated_at=NOW() WHERE id=$1`,[prepared.runId,prepared.providerReference,providerResponseEvidence(response)])
    await client.query(`UPDATE public.campaigns SET daily_budget=$2,budget=$2,updated_at=NOW() WHERE id=$1 AND organization_id=$3`,[prepared.campaignId,input.nextDailyBudgetBrl,context.organizationId])
    const result={...artifactProviderResult(prepared.version,prepared.providerReference,prepared.runId,'active'),currentDailyBudgetBrl:Number(current).toFixed(2),nextDailyBudgetBrl:Number(next).toFixed(2),adjustmentPercent:adjustment.toFixed(4)}
    await event(client,context,'mission.campaign_budget_adjusted',{campaignId:prepared.campaignId,direction:input.direction,...result});return saveMissionCommandResult(client,context,commandKey,result)
  })
}

async function providerMutation(pool:Connectable,context:MissionCommandContext,input:{action:AdsProviderMutationAction;commandKey:string;versionId:string;expectedContentHash:string;approvedSubjectHash:string;maxTotalBudgetBrl?:string;fetcher?:typeof fetch;nextStatus:'provider_paused'|'active'|'paused'}):Promise<ProviderResult>{
  const prepared=await transaction(pool,async client=>{
    const prior=await loadMissionCommandResult<ProviderResult>(client,context,input.commandKey);if(prior)return{prior}
    const version=await requireVersion(client,context,input.versionId,input.action==='create_campaign'?'draft':input.action==='activate_campaign'?'provider_paused':'active')
    if(version.contentHash!==input.expectedContentHash)throw new Error('campaign_version_hash_changed')
    if(input.maxTotalBudgetBrl!==undefined&&Number(version.snapshotPayload.totalBudgetBrl)>Number(input.maxTotalBudgetBrl))throw new Error('campaign_budget_exceeds_envelope')
    const connection=await client.query<{id:string;provider:'meta'|'google';provider_account_id:string|null;token_reference:string|null;status:string}>(`SELECT id,provider,provider_account_id,token_reference,status FROM public.ad_provider_connections WHERE id=$1 AND organization_id=$2 AND provider=$3 LIMIT 1`,[version.snapshotPayload.providerConnectionId,context.organizationId,version.snapshotPayload.platform])
    const provider=connection.rows[0];if(!provider||provider.status!=='connected'||!provider.token_reference)throw new Error('campaign_provider_connection_unavailable')
    const campaignId=required(version.campaignId);const idempotencyKey=`${provider.provider}:${input.action}:${context.idempotencyKey}`;const requestPayload=await buildProviderPayload(client,version,input.action)
    const requestHash=missionArtifactHash(requestPayload)
    const run=await client.query<{id:string;status:string;provider_reference:string|null}>(`INSERT INTO public.ad_provider_mutation_runs (organization_id,provider_connection_id,campaign_id,provider,action,status,idempotency_key,request_payload,request_hash,approved_subject_hash,mission_id,action_run_id,requested_by) VALUES ($1,$2,$3,$4,$5,'pending',$6,$7,$8,$9,$10,$11,$12) ON CONFLICT (idempotency_key) DO UPDATE SET idempotency_key=EXCLUDED.idempotency_key RETURNING id,status,provider_reference`,[context.organizationId,provider.id,campaignId,provider.provider,input.action,idempotencyKey,sanitizeProviderMetadata(requestPayload),requestHash,input.approvedSubjectHash,context.missionId,context.actionRunId,context.actorId])
    if(run.rows[0]?.status==='succeeded'&&run.rows[0].provider_reference){const result=artifactProviderResult(version,run.rows[0].provider_reference,run.rows[0].id,input.nextStatus);return{prior:await saveMissionCommandResult(client,context,input.commandKey,result)}}
    await client.query(`UPDATE public.ad_provider_mutation_runs SET status='running',updated_at=NOW() WHERE id=$1`,[run.rows[0]?.id])
    return{version,provider,requestPayload,runId:required(run.rows[0]?.id)}
  })
  if('prior'in prepared&&prepared.prior)return prepared.prior
  if(!('provider'in prepared))throw new Error('campaign_provider_preparation_failed')
  const secret=await loadProviderSecretFromPool(pool as never,required(prepared.provider.token_reference??undefined));if(secret.expired)throw new Error('campaign_provider_token_expired')
  const response=await executeProviderAdapter({provider:prepared.provider.provider,action:input.action,localMutationId:prepared.runId,requestPayload:{...prepared.requestPayload,accessToken:secret.value,providerAccountId:prepared.provider.provider_account_id??undefined},...(input.fetcher?{fetcher:input.fetcher}:{})})
  if(response.status!=='succeeded'){
    const unknown=/timeout|timed out|abort|network|fetch failed/i.test(response.protectedError??'')
    await pool.query(`UPDATE public.ad_provider_mutation_runs SET status=$2,protected_error=$3,response_payload=$4,completed_at=NOW(),updated_at=NOW() WHERE id=$1`,[prepared.runId,unknown?'unknown':'failed',response.protectedError??'provider_mutation_failed',response.payload])
    throw new Error(unknown?'provider_outcome_unknown':'provider_mutation_failed')
  }
  const providerReference=response.externalCampaignId??required(prepared.version.campaignId)
  return transaction(pool,async client=>{
    await client.query(`UPDATE public.ad_provider_mutation_runs SET status='succeeded',provider_reference=$2,response_payload=$3,protected_error=NULL,completed_at=NOW(),updated_at=NOW() WHERE id=$1`,[prepared.runId,providerReference,providerResponseEvidence(response)])
    await client.query(`UPDATE public.campaign_mission_versions SET status=$2,approved_subject_hash=COALESCE(approved_subject_hash,$3),approved_by=COALESCE(approved_by,$4),approved_at=COALESCE(approved_at,NOW()),updated_at=NOW() WHERE id=$1 AND organization_id=$5`,[prepared.version.id,input.nextStatus,input.approvedSubjectHash,context.actorId,context.organizationId])
    await client.query(`UPDATE public.campaigns SET external_id=$2,lifecycle_status=$3,status=$4,updated_at=NOW() WHERE id=$1 AND organization_id=$5`,[prepared.version.campaignId,providerReference,input.nextStatus==='provider_paused'?'paused':input.nextStatus,input.nextStatus==='active'?'ACTIVE':'PAUSED',context.organizationId])
    const result=artifactProviderResult(prepared.version,providerReference,prepared.runId,input.nextStatus);await event(client,context,`mission.campaign_provider_${input.nextStatus}`,{campaignId:prepared.version.campaignId,versionId:prepared.version.id,providerReference,mutationRunId:prepared.runId});return saveMissionCommandResult(client,context,input.commandKey,result)
  })
}

async function buildProviderPayload(client:MissionCommandQueryable,version:NonNullable<Awaited<ReturnType<typeof getCampaignMissionVersion>>>,action:AdsProviderMutationAction){
  if(action!=='create_campaign')return{externalCampaignId:await providerReference(client,required(version.campaignId))}
  const artifact=version.snapshotPayload;const page=await client.query<{url:string|null}>(`SELECT COALESCE(published_url,preview_url) AS url FROM public.landing_pages WHERE id=$1 AND organization_id=$2 LIMIT 1`,[artifact.landingPageId??null,version.organizationId]);const landingPageUrl=page.rows[0]?.url;if(!landingPageUrl)throw new Error('campaign_landing_page_unavailable')
  return{campaign:{name:artifact.name,objective:artifact.objective,dailyBudget:Number(artifact.dailyBudgetBrl),landingPageUrl,headline:artifact.creatives[0]!.headline,body:artifact.creatives[0]!.body}}
}
async function providerReference(client:MissionCommandQueryable,campaignId:string){const result=await client.query<{external_id:string}>(`SELECT external_id FROM public.campaigns WHERE id=$1 LIMIT 1`,[campaignId]);const value=result.rows[0]?.external_id;if(!value||value.startsWith('local:'))throw new Error('campaign_provider_reference_unavailable');return value}
async function requireVersion(client:MissionCommandQueryable,context:MissionCommandContext,id:string,status: string){const version=await getCampaignMissionVersion(client,{organizationId:context.organizationId,missionId:context.missionId,versionId:id});if(!version)throw new Error('campaign_version_not_found');if(version.status!==status)throw new Error('campaign_version_status_invalid');return version}
function artifactProviderResult(version:NonNullable<Awaited<ReturnType<typeof getCampaignMissionVersion>>>,providerReference:string,mutationRunId:string,status:string):ProviderResult{return{entityId:required(version.campaignId),versionId:version.id,status,contentHash:version.contentHash,providerReference,mutationRunId,evidence:{provider:version.snapshotPayload.platform,providerReference,activated:status==='active'}}}
function providerResponseEvidence(response:{payload:Record<string,unknown>;externalCampaignId?:string;externalAdSetId?:string;externalAdId?:string}){return{...response.payload,...(response.externalCampaignId?{externalCampaignId:response.externalCampaignId}:{}),...(response.externalAdSetId?{externalAdSetId:response.externalAdSetId}:{}),...(response.externalAdId?{externalAdId:response.externalAdId}:{})}}
function providerBudgetResource(provider:'meta'|'google',payload?:Record<string,unknown>){if(!payload)return undefined;if(provider==='meta'){const value=payload.externalAdSetId;return typeof value==='string'&&value?value:undefined}return deepString(payload,value=>/campaignBudgets\//i.test(value))}
function deepString(value:unknown,predicate:(value:string)=>boolean):string|undefined{if(typeof value==='string')return predicate(value)?value:undefined;if(Array.isArray(value)){for(const item of value){const found=deepString(item,predicate);if(found)return found}}else if(value&&typeof value==='object'){for(const item of Object.values(value as Record<string,unknown>)){const found=deepString(item,predicate);if(found)return found}}return undefined}
async function event(client:MissionCommandQueryable,context:MissionCommandContext,eventType:string,payload:Record<string,unknown>){await recordDomainEvent(client as never,{eventType,organizationId:context.organizationId,aggregateType:'mission',aggregateId:context.missionId,actor:{type:'user',id:context.actorId},correlationId:context.missionId,payload:{missionId:context.missionId,actionRunId:context.actionRunId,...payload}})}
function required(value?:string){if(!value)throw new Error('campaign_command_persistence_failed');return value}
async function transaction<T>(pool:Connectable,work:(client:MissionCommandQueryable)=>Promise<T>):Promise<T>{const client=await pool.connect();try{await client.query('BEGIN');const result=await work(client);await client.query('COMMIT');return result}catch(error){await client.query('ROLLBACK');throw error}finally{client.release()}}
