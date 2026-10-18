// Opt-in local UI QA. Every search/read/model dependency is simulated; no Redis or real provider request.
import pg from 'pg'
import {randomInt,randomUUID} from 'node:crypto'
import {buildServer} from '../../src/server.js'
import {loadEnv} from '../../src/config/env.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {fixtureIds,fixtureUsers,seedIntegrationFixtures} from '../integration/support/fixtures.js'
import {createRadarCampaign} from '../../src/modules/radar/repository.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {startRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {CnpjaSearchHttpError} from '../../src/modules/radar/cnpjaClient.js'
import {dispatchRadarCaptureOperation,reconcileRadarCaptureOutbox} from '../../src/modules/radar/capture-dispatch.js'
import {executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {storePlatformProviderSecret} from '../../src/modules/platform/adminRepository.js'
import type {AuthUser} from '../../src/auth/routes.js'
import type {AppJobQueue} from '../../src/server.js'
const databaseUrl=process.env.YUX_RADAR_TEST_DATABASE_URL??'',target=new URL(databaseUrl)
if(target.hostname!=='127.0.0.1'||!['55439','55440'].includes(target.port)||target.pathname!=='/yux_radar_research_test')throw Error('isolated_radar_test_database_required')
const pool=new pg.Pool({connectionString:databaseUrl});await seedIntegrationFixtures(pool)
const staleStart=process.env.YUX_RADAR_QA_STALE_START==='true'
const heartbeat=randomUUID()
const beat=()=>pool.query("INSERT INTO public.worker_process_heartbeats(instance_id,queue_classes,started_at,last_seen_at) VALUES($1,ARRAY['external'],NOW(),NOW()) ON CONFLICT(instance_id) DO UPDATE SET last_seen_at=NOW()",[heartbeat])
await beat()
const org=fixtureIds.organizationA,key=Buffer.alloc(32,7).toString('base64')
await pool.query(`INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=TRUE`,[fixtureIds.contractA])
for(const providerKey of ['brave_place','cnpja']){
 const provider=(await pool.query(`INSERT INTO public.platform_provider_connections(provider_type,provider_key,display_name,status,public_config,is_default) VALUES('internal_service',$1,'QA — Simulado','active','{"retentionLicensed":true,"credentialPurpose":"licensed_retention","webSearchLicensed":true}',TRUE) ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active',public_config=EXCLUDED.public_config RETURNING id`,[providerKey])).rows[0]
 await storePlatformProviderSecret(pool,{providerConnectionId:provider.id,secretKind:'api_key',value:'fixture-not-a-real-key'},`provider-key:${key}`)
}
await pool.query("UPDATE public.radar_data_sources SET enabled=TRUE,default_cost_per_unit=.025,rate_limit_per_day=10000 WHERE source_key='cnpja_advanced_search'")
await pool.query("UPDATE public.radar_data_sources SET enabled=TRUE,default_cost_per_unit=.01,rate_limit_per_day=10000 WHERE source_key='brave_web_search'")
const campaign=await createRadarCampaign(pool,fixtureUsers.yux_admin as AuthUser,{organizationId:org,name:'QA — Captação completa',campaignType:'regional_b2b',targetStates:['PR'],targetSegment:'Empresas B2B sintéticas',offerType:'Produtos e serviços configuráveis',dailyLimit:100,budgetLimit:10,searchConfiguration:{sources:{enrichWithBrave:false},batch:{pageSize:10,maxPagesPerScope:staleStart?8:2,maxQueriesPerBatch:staleStart?12:2},research:{enabled:true,webSearchEnabled:true}}} as never)
const qaSite='https://empresa-modelo.example/'
await pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Empresa Modelo — Dados sintéticos',$3,$4::jsonb)`,[org,campaign.id,`qa-${campaign.id}`,JSON.stringify({cnpj:String(randomInt(10_000_000_000_000,99_999_999_999_999)),city:'Curitiba',state:'PR',address:'Endereço sintético de teste',legalName:'Empresa Modelo LTDA',researchRevision:1,discoveryRevision:1,websiteStatus:'verified_present',websiteUrl:qaSite,registrationStatus:'Ativa',targetStatus:'confirmed',productFit:'high',
 publicPresence:{version:1,configurationRevision:1,website:{url:qaSite,association:'confirmed',scope:'establishment',readable:true,sourceUrl:qaSite,observedAt:new Date().toISOString()},contacts:[],externalReferences:[]},
 publicContacts:[{kind:'email',value:'compras@empresa-modelo.example',association:'confirmed',purpose:'suppliers',sourceUrl:qaSite,observedAt:new Date().toISOString(),provider:'Brave'}],
 companyProfile:{summary:{value:'Alimentação empresarial e fornecimento B2B.',sourceUrl:qaSite,model:'OpenRouter'},services:[{value:'Refeições coletivas',sourceUrl:qaSite}],customerSegments:[{value:'Indústrias',sourceUrl:qaSite}],operatingRegions:[{value:'Atuação regional',sourceUrl:qaSite}]},
 sizeAssessment:{score:75,evidenceCoverage:60,contributions:[{metric:'units',amount:20,points:75,weight:1,sourceUrl:qaSite,referenceDate:'2026-10-15'}]},activityAssessment:{status:'inconclusive',signals:[],presenceSignals:[{kind:'accessible_site',excerpt:'Site institucional acessível',sourceUrl:qaSite}]},researchUsesBrave:true,rawProvider:'Serper',internalCost:123})])
const apiUrl=new URL(databaseUrl);apiUrl.username='yux_api'
const apiPool=createContextAwarePool(new pg.Pool({connectionString:apiUrl.toString()}),'api')
const workerUrl=new URL(databaseUrl);workerUrl.username='yux_worker'
const workerPool=createContextAwarePool(new pg.Pool({connectionString:workerUrl.toString()}),'worker')
const env=loadEnv({NODE_ENV:'test',DATABASE_URL:databaseUrl,REDIS_URL:'redis://127.0.0.1:1',PROVIDER_SECRET_ENCRYPTION_KEY_B64:key,SESSION_SECRET:'local-radar-capture-fixture-session-secret',CORS_ORIGIN:'http://127.0.0.1:4174',GLOBAL_RATE_LIMIT_MAX:'5000'})
const rejectDiscovery=process.env.YUX_RADAR_QA_REJECT_DISCOVERY==='true'
const expiredContinuation=process.env.YUX_RADAR_QA_EXPIRED_CONTINUATION==='true'
const limitContinuation=process.env.YUX_RADAR_QA_LIMIT_CONTINUATION==='true'
const oldCompanies=Array.from({length:40},(_,i)=>({taxId:String(randomInt(10_000_000_000_000,99_999_999_999_999)),legalName:`Empresa anterior ${i+1} LTDA`,tradeName:`Empresa anterior ${i+1}`,city:'Curitiba',state:'PR',cnaes:[],websiteStatus:'unknown' as const,rawPayload:{}}))
if(limitContinuation||staleStart){
 for(const record of oldCompanies)await pool.query("INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search',$3,$4,$5)",[org,campaign.id,record.tradeName,`cnpj:${record.taxId}`,JSON.stringify({cnpj:record.taxId,legalName:record.legalName,city:'Curitiba',state:'PR',discoveryRevision:1})])
}
if(limitContinuation){
 const started=await startRadarCaptureOperation(pool,fixtureUsers.yux_admin as AuthUser,{organizationId:org,campaignId:campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20})
 await pool.query("UPDATE public.radar_capture_operations SET status='partial',discovery_stopped=TRUE,discovery_reason='page_cap',queries=1,scope_pages='{\"v1:PR:all\":1}',configuration_snapshot=jsonb_set(configuration_snapshot,'{search_configuration,batch,maxPagesPerScope}','1') WHERE id=$1",[started.operationId])
 await pool.query("INSERT INTO public.radar_enrichment_runs(organization_id,campaign_id,status,provider,input_payload,output_payload,error_message,started_at,completed_at) VALUES($1,$2,'failed','cnpja_advanced_search',$3,'{\"candidateCount\":0,\"discoveryOutcome\":\"rejected\",\"httpStatus\":400}','HTTP 400: token is invalid or expired',NOW(),NOW())",[org,campaign.id,JSON.stringify({captureOperationId:started.operationId,configurationRevision:1,regionalState:'PR',regionalCity:null,scopeKey:'v1:PR:all',pageToken:'qa-expired-token'})])
}
if(expiredContinuation||limitContinuation||staleStart){
 await pool.query(`INSERT INTO public.radar_regional_discovery_cursors(organization_id,campaign_id,state,provider,scope_key,next_token,pages_processed,candidates_seen,token_received_at) VALUES($1,$2,'PR','cnpja_advanced_search','v1:PR:all','qa-expired-token',4,40,CASE WHEN $3 THEN NOW()-INTERVAL '10 hours' ELSE NOW() END)`,[org,campaign.id,staleStart])
 if(expiredContinuation&&!limitContinuation&&!staleStart)await startRadarCaptureOperation(pool,fixtureUsers.yux_admin as AuthUser,{organizationId:org,campaignId:campaign.id,configurationRevision:1,requestId:crypto.randomUUID(),requestedCount:1})
}
const queued=new Set<string>(),blocked=new Set<string>();let failedOnce=rejectDiscovery||expiredContinuation||limitContinuation||staleStart,rejectedOnce=false
const queue:AppJobQueue={close:async()=>{},add:async(name,data,options)=>{
 const id=options?.jobId??`${name}-${Date.now()}`
 if(queued.has(id))return{id};queued.add(id)
 if(!['radar.advanceCaptureOperation','radar.researchCandidate'].includes(name))throw Error('qa_external_effects_disabled')
 setTimeout(()=>void runWithDatabaseRequestContext({role:'client_member',organizationIds:[org],serviceRole:'worker'},async()=>{
  if(name==='radar.advanceCaptureOperation'){
   const discover=()=>advanceRadarCaptureDiscovery(workerPool,env,{organizationId:org,operationId:String(data.operationId)},{loadSecret:async()=>'fixture',searchPage:async input=>{
    if(expiredContinuation&&input.token==='qa-expired-token')throw new CnpjaSearchHttpError('HTTP 400: request validation failed; token is invalid or expired',400)
    if(rejectDiscovery&&!rejectedOnce){rejectedOnce=true;throw new CnpjaSearchHttpError('request validation failed',422)}
    if(limitContinuation||staleStart){
     const page=Number(input.token?.replace('qa-page-','')??0)
     if(page<4)return{candidates:oldCompanies.slice(page*10,page*10+10),nextToken:`qa-page-${page+1}`}
     return{candidates:Array.from({length:10},(_,i)=>({taxId:String(randomInt(10_000_000_000_000,99_999_999_999_999)),legalName:`Empresa nova ${(page-4)*10+i+1} LTDA`,tradeName:`Empresa nova ${(page-4)*10+i+1}`,city:'Curitiba',state:'PR',cnaes:[],websiteStatus:'unknown' as const,rawPayload:{}})),...(page===4?{nextToken:'qa-page-5'}:{})}
    }
    return{candidates:Array.from({length:input.limit??1},(_,i)=>({taxId:String(randomInt(10_000_000_000_000,99_999_999_999_999)),legalName:`Empresa Sintética ${i+1} LTDA`,tradeName:`Empresa Sintética ${i+1}`,city:'Curitiba',state:'PR',cnaes:[],websiteStatus:'unknown' as const,rawPayload:{}}))}
   }})
   await dispatchRadarCaptureOperation(workerPool,env,{organizationId:org,operationId:String(data.operationId)},queue,undefined,{discover})
   // Accelerate only this opt-in synthetic journey; normal production dispatch timing is unchanged.
   if(limitContinuation||staleStart)await workerPool.query('UPDATE public.radar_capture_outbox SET next_dispatch_at=NOW() WHERE operation_id=$1 AND organization_id=$2',[String(data.operationId),org])
  }else{
   const runId=String(data.runId)
   if(!failedOnce){failedOnce=true;blocked.add(runId);await workerPool.query("UPDATE public.radar_candidate_research_runs SET status='blocked',error_code='radar_ai_credits_insufficient' WHERE id=$1",[runId]);return}
   if(blocked.has(runId)){blocked.delete(runId);await workerPool.query("UPDATE public.radar_candidate_research_runs SET status='blocked',error_code='provider_inactive' WHERE id=$1",[runId]);return}
   const candidate=(await workerPool.query('SELECT candidate.* FROM public.radar_candidate_research_runs run JOIN public.radar_candidate_records candidate ON candidate.id=run.candidate_id WHERE run.id=$1 AND run.organization_id=$2',[runId,org])).rows[0]
   const site=`https://qa-${candidate.id}.example/`,text=`${candidate.normalized_payload.legalName}. CNPJ ${candidate.normalized_payload.cnpj}. Curitiba PR. Contato para fornecedores: compras@empresa.example`
   await executeRadarCandidateResearch(workerPool,env,{organizationId:org,runId},undefined,{loadSecret:async()=>'fixture',web:async()=>[{url:site,title:candidate.title,snippets:[text],observedAt:new Date().toISOString()}],local:async()=>{throw Error('qa_unexpected_local_search')},collect:async()=>[{url:site,text,html:'<a href="mailto:compras@empresa.example">Fornecedores</a>',observedAt:new Date().toISOString()}],collectSocial:undefined,runtime:async()=>{throw Error('qa_unexpected_model')}} as never)
   blocked.delete(runId)
  }
 }).catch(error=>console.error('[QA simulated worker]',error)),500)
 return{id}
}}
const app=await buildServer(env,{pool:apiPool,jobQueue:queue,redisPing:async()=>'PONG'})
app.addHook('onRequest',async(request,reply)=>{
 if(request.method==='GET')return
 if(request.method==='PUT'&&request.url==='/api/radar/admin/operational-limits')return
 if(request.url==='/api/auth/login'||request.url==='/api/auth/logout'||request.url.includes(`/campaigns/${campaign.id}/capture-operations`)||request.url===`/api/radar/campaigns/${campaign.id}/capture-preflight`||/\/capture-operations\/[0-9a-f-]+\/resume$/.test(request.url))return
 return reply.code(403).send({error:'qa_external_effects_disabled'})
})
await app.listen({host:'127.0.0.1',port:4182})
const timer=setInterval(()=>void runWithDatabaseRequestContext({role:'yux_operator',organizationIds:[],serviceRole:'worker'},()=>reconcileRadarCaptureOutbox(workerPool,queue,Math.floor(Date.now()/1000))).catch(error=>console.error('[QA reconciler]',error)),1000)
const heartbeatTimer=setInterval(()=>void beat(),20_000)
console.log(JSON.stringify({campaignId:campaign.id,url:`http://127.0.0.1:4174/client-workspaces/${org}/comercial/radar/${campaign.id}`}))
for(const signal of ['SIGINT','SIGTERM'] as const)process.on(signal,()=>{clearInterval(timer);clearInterval(heartbeatTimer);void app.close().then(()=>pool.query('DELETE FROM public.worker_process_heartbeats WHERE instance_id=$1',[heartbeat])).then(()=>Promise.all([apiPool.end(),workerPool.end(),pool.end()])).then(()=>process.exit(0))})
