import { randomUUID } from 'node:crypto'
import { expect,it,vi } from 'vitest'
import pg from 'pg'
import { createIntegrationRig,getIntegrationDatabaseUrl } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'
import { createActionEngineCapabilityRegistry } from '../../src/modules/action-engine/capabilities/index.js'
import { createActionEngineCommands } from '../../src/modules/action-engine/commands.js'
import { RADAR_PROSPECTING_PACK_V1 } from '../../src/modules/action-engine/packs/radar-prospecting-v1.js'
import { ensureRadarProspectingPackVersion } from '../../src/modules/action-engine/radar-pack-registration.js'
import { compileMissionPlan } from '../../src/modules/action-engine/planner.js'
import { insertPlanRevision,recordApproval,approvePlanRevision,decideActionApproval,getMission } from '../../src/modules/action-engine/repository.js'
import { executeActionRun,startMission,scheduleReadyActions } from '../../src/modules/action-engine/executor.js'
import { reconcileRadarMissionOperations } from '../../src/modules/action-engine/radar-operation-waits.js'
import { advanceRadarCaptureDiscovery } from '../../src/modules/radar/capture-discovery.js'
import { radarProspectingMetricCollector } from '../../src/modules/action-engine/metrics/radar-prospecting.js'
import { activateCaptureSearch,company } from '../support/radar-capture-fixture.js'
import { storePlatformProviderSecret } from '../../src/modules/platform/adminRepository.js'

const {available}=vi.hoisted(()=>({available:async()=>({allowed:true,reasons:[],semanticQualificationEnabled:false,maximumCostPerCandidate:.03,maxQueriesPerCandidate:3,estimates:[{available:true,remainingQueries:10000,costPerQuery:.01}]})}))
// Only availability is synthetic; canonical acceptance, outbox, ledger, claims,
// approvals and operation getters execute against isolated PostgreSQL.
vi.mock('../../src/modules/radar/capture-preflight.js',async original=>{
 const real=await original<typeof import('../../src/modules/radar/capture-preflight.js')>()
 return{...real,getRadarCapturePreflight:(pool:pg.Pool,user:never,input:never)=>real.getRadarCapturePreflight(pool,user,input,{availability:available as never})}
})
vi.mock('../../src/modules/radar/capture-operation.js',async original=>{
 const real=await original<typeof import('../../src/modules/radar/capture-operation.js')>()
 return{...real,startRadarCaptureOperation:(pool:pg.Pool,user:never,input:never)=>real.startRadarCaptureOperation(pool,user,input,{availability:available as never})}
})

it('executes a reviewed plan through canonical Radar commands and waits for persisted completion',async()=>{
 const rig=await createIntegrationRig({queueMode:'stub',radarActionEngine:true})
 const pool=new pg.Pool({connectionString:getIntegrationDatabaseUrl()})
 const actor=fixtureUsers.yux_admin,org=rig.ids.organizationA
 const registry=createActionEngineCapabilityRegistry(),pack=RADAR_PROSPECTING_PACK_V1
 const queued:Array<{name:string;data:Record<string,unknown>}>=[]
 const queue={async add(name:string,data:Record<string,unknown>){queued.push({name,data});return{id:randomUUID()}}}
 const config={RADAR_ACTION_ENGINE_ENABLED:true,RADAR_ACTION_ENGINE_TENANT_ALLOWLIST:org}
 try{
  await rig.sql("INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE),($1,'action_engine',TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE",[rig.ids.contractA])
  const parameters={campaign:{name:'Indústrias do Paraná '+randomUUID(),targetSegment:'Indústrias',targetStates:['PR'],offerType:'Consultoria'},requestedCount:2}
  const intent=await rig.request('yux_admin','POST','/api/action-engine/missions/intents',{organizationId:org,contractId:rig.ids.contractA,objective:'Pesquisar empresas no Radar Comercial',mode:'assisted',quickStart:'radar_prospecting',allowedModules:['radar'],maxTotalCostBrl:'50',maxHumanHours:'1',deadlineAt:new Date(Date.now()+86400000).toISOString(),radarParameters:parameters},{'idempotency-key':randomUUID()})
  expect(intent.statusCode,JSON.stringify(intent.body)).toBe(201)
  const missionId=intent.body.id
  const raw={schemaVersion:1,missionId,actionPack:{key:pack.key,version:pack.semanticVersion,templateHash:pack.contentHash},resolvedParameters:parameters,estimatedEconomics:{currency:'BRL',totalExecutionCost:'1'},steps:pack.topologyTemplate.steps.map(step=>({stepKey:step.stepKey,capabilityKey:step.capabilityKey,capabilityVersion:1,dependsOn:step.dependsOn,input:step.defaultParameters,timeoutSeconds:60,maxAttempts:2,approvalRequired:step.approvalRequired,effect:registry.get(step.capabilityKey,1).effect}))}
  const compiled=compileMissionPlan({rawPlan:raw,missionId,pack,registry,maxTotalCostBrl:'50'})
  const packVersion=await ensureRadarProspectingPackVersion(pool,actor.id)
  const plan=await insertPlanRevision(pool,{organizationId:org,missionId,packVersionId:packVersion.id,packContentHash:pack.contentHash,parameters:compiled.parameters,deviations:[],estimatedEconomics:compiled.estimatedEconomics,capabilityManifest:compiled.capabilityManifest,capabilityManifestHash:compiled.capabilityManifestHash,compiledPayload:compiled as never,planHash:compiled.planHash,steps:compiled.steps,createdBy:actor.id})
  await rig.sql("UPDATE public.action_plans SET status='pending_approval' WHERE id=$1",[plan.id])
  await rig.sql("UPDATE public.action_missions SET status='pending_plan_approval',active_plan_id=$2 WHERE id=$1",[missionId,plan.id])
  const approval=await recordApproval(pool,{organizationId:org,missionId,planId:plan.id,approvalType:'plan',subjectHash:compiled.planHash,requestedPayload:{planHash:compiled.planHash}})
  const ready=await approvePlanRevision(pool,{organizationId:org,missionId,planId:plan.id,approvalId:approval.id,expectedMissionVersion:intent.body.version,subjectHash:compiled.planHash,decidedBy:actor.id,reason:'Plano sintético revisado'})
  await startMission(pool,{organizationId:org,missionId,expectedVersion:ready.version,actorId:actor.id})
  expect((await rig.sql("SELECT resource_key FROM public.action_resource_claims WHERE mission_id=$1 AND active=TRUE",[missionId])).rows).toEqual([{resource_key:'radar.creation'}])
  const execute=async(stepKey:string)=>{
   await scheduleReadyActions(pool,queue as never,missionId)
   const run=(await rig.sql("SELECT run.* FROM public.action_runs run JOIN public.action_plan_steps step ON step.id=run.plan_step_id WHERE run.mission_id=$1 AND step.step_key=$2",[missionId,stepKey])).rows[0]
   const result=await executeActionRun(pool,registry,{actionRunId:run.id,organizationId:org,workerId:'radar-test',mutationLeaseSecret:'radar-integration-signing-secret-32-characters',commands:createActionEngineCommands(pool,missionId,config)})
   return{run,result,row:(await rig.sql('SELECT * FROM public.action_runs WHERE id=$1',[run.id])).rows[0]}
  }
  expect((await execute('pack.inspect')).result.status).toBe('succeeded')
  const saved=await execute('pack.campaign')
  expect(saved.result.status,JSON.stringify(saved.row)).toBe('succeeded')
  const campaignId=saved.row.output.output.campaignId
  expect((await rig.sql('SELECT count(*)::int AS n FROM public.radar_campaigns WHERE organization_id=$1 AND name=$2',[org,parameters.campaign.name])).rows[0].n).toBe(1)
  // Test fixture uses the established v1 capture protocol and simulated sources.
  await rig.sql(`UPDATE public.radar_campaigns SET search_configuration=$2::jsonb WHERE id=$1`,[campaignId,JSON.stringify({funnel:{enabled:false},discovery:{enabled:false},sources:{enrichWithBrave:false},batch:{pageSize:10,maxPagesPerScope:5,maxQueriesPerBatch:5},research:{enabled:true,webSearchEnabled:true,webSearchProviders:['brave_web_search'],presenceResolutionEnabled:false,semanticQualificationEnabled:false,profileEnabled:false,inspectLinkedSocialProfiles:false,deepResearchEnabled:false,completion:{enabled:false}}})])
  await activateCaptureSearch(pool)
  await rig.sql("UPDATE public.radar_data_sources SET enabled=TRUE,default_cost_per_unit=.025,rate_limit_per_day=10000 WHERE source_key='cnpja_advanced_search'")
  const provider=(await rig.sql(`INSERT INTO public.platform_provider_connections(provider_type,provider_key,display_name,status,public_config) VALUES('internal_service','cnpja','Fixture','active','{}') ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active' RETURNING id`)).rows[0]
  await storePlatformProviderSecret(pool,{providerConnectionId:provider.id,secretKind:'api_key',value:'fixture-not-real'},`provider-key:${Buffer.alloc(32,7).toString('base64')}`)
  await rig.sql("INSERT INTO public.worker_process_heartbeats(instance_id,queue_classes,started_at,last_seen_at,metadata) VALUES($1,ARRAY['external'],NOW(),NOW(),'{}')",[randomUUID()])
  const preflight=await execute('pack.preflight')
  expect(preflight.result.status,JSON.stringify(preflight.row)).toBe('succeeded')
  expect(preflight.row.output.output.allowed).toBe(true)
  expect(await scheduleReadyActions(pool,queue as never,missionId)).toMatchObject({waitingApproval:1})
  expect((await rig.sql('SELECT count(*)::int n FROM public.radar_capture_operations WHERE campaign_id=$1',[campaignId])).rows[0].n).toBe(0)
  const captureApproval=(await rig.sql("SELECT * FROM public.action_approvals WHERE mission_id=$1 AND approval_type='action' AND status='pending'",[missionId])).rows[0]
  expect(captureApproval.requested_payload.commercialRequest).toMatchObject({campaignId,requestedCount:2})
  await decideActionApproval(pool,{approvalId:captureApproval.id,organizationId:org,subjectHash:captureApproval.subject_hash,decision:'approved',reason:'Pesquisa sintética autorizada',decidedBy:actor.id})
  const captured=await execute('pack.capture')
  expect(captured.result.status,JSON.stringify(captured.row)).toBe('succeeded')
  const ref=captured.row.output.output.ref
  expect((await execute('pack.await')).result.status).toBe('running')
  await rig.restartApi()
  config.RADAR_ACTION_ENGINE_ENABLED=false
  await advanceRadarCaptureDiscovery(pool,{} as never,{organizationId:org,operationId:ref.operationId},{availability:available as never,searchPage:async()=>({candidates:[company(),company()]}),loadSecret:async()=>'fixture'})
  // Simulate the research worker's terminal persistence, never contact a provider.
  await rig.sql("UPDATE public.radar_capture_items SET status='completed' WHERE operation_id=$1",[ref.operationId])
  await rig.sql("UPDATE public.radar_capture_operations SET status='completed' WHERE id=$1",[ref.operationId])
  await rig.sql("UPDATE public.action_runs SET available_at=NOW()-INTERVAL '1 second' WHERE mission_id=$1 AND claimed_by='radar_operation_wait'",[missionId])
  expect(await reconcileRadarMissionOperations(pool,queue as never)).toMatchObject({resolved:1})
  config.RADAR_ACTION_ENGINE_ENABLED=true
  expect((await execute('pack.results')).result.status).toBe('succeeded')
  const mission=await getMission(pool,missionId,org)
  const snapshot=await radarProspectingMetricCollector.collect(pool,mission!)
  expect(snapshot.metrics.companies_found).toMatchObject({value:'2'})
  expect(snapshot.metrics.attributed_revenue_brl.kind).toBe('not_applicable')
  expect(radarProspectingMetricCollector.evaluate({mission:mission!,snapshot,economics:{} as never,now:new Date().toISOString()}).conclusion).toBe('succeed')
  expect((await rig.sql('SELECT count(*)::int n FROM public.radar_capture_requests WHERE campaign_id=$1',[campaignId])).rows[0].n).toBe(1)
  expect(await rig.providerCalls()).toHaveLength(0)
 }finally{await pool.end();await rig.close()}
})
