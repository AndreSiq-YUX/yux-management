import pg from 'pg'
import {describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company,activateCaptureSearch} from '../support/radar-capture-fixture.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {dispatchRadarCaptureOperation,reconcileRadarCaptureOutbox,resumeRadarCaptureOperation} from '../../src/modules/radar/capture-dispatch.js'
import {startRadarCandidateResearch,executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {storePlatformProviderSecret} from '../../src/modules/platform/adminRepository.js'
import {fixtureIds} from './support/fixtures.js'

describe.skipIf(!connectionString)('capture journey with isolated PostgreSQL',()=>{
 it('does not execute a terminal blocked child when a late duplicate queue job arrives',async()=>{
  const f=await captureFixture()
  try{
   await activateCaptureSearch(f.pool)
   const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Empresa sintética',$3,'{"city":"Curitiba","state":"PR","discoveryRevision":1}') RETURNING id`,[organizationId,f.campaign.id,randomUUID()])).rows[0]
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status) VALUES($1,$2,$3,$4,1,'blocked') RETURNING id`,[organizationId,f.campaign.id,candidate.id,admin.id])).rows[0]
   const web=vi.fn(async()=>[])
   expect(await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.id},undefined,{web,loadSecret:async()=>'fixture'})).toMatchObject({status:'already_running_or_completed'})
   expect(web).not.toHaveBeenCalled()
  }finally{await f.close()}
 })
 it.each(['admin','module'])('stops subsequent paid searches after %s authorization is revoked mid-search',async kind=>{
  const f=await captureFixture(),userId=randomUUID(),record=company()
  try{
   await activateCaptureSearch(f.pool)
   await f.pool.query("INSERT INTO public.users(id,name,role) VALUES($1,'Revocation fixture','ADMIN')",[userId])
   await f.pool.query("INSERT INTO public.app_users(id,email,password_hash,display_name,role,is_active) VALUES($1,$2,'unused-fixture','Revocation fixture','yux_admin',TRUE)",[userId,`${userId}@example.test`])
   const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Empresa sintética',$3,$4) RETURNING id`,[organizationId,f.campaign.id,randomUUID(),JSON.stringify({cnpj:record.taxId,legalName:record.legalName,city:'Curitiba',state:'PR',discoveryRevision:1})])).rows[0]
   const run=(await f.pool.query('INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision) VALUES($1,$2,$3,$4,1) RETURNING id',[organizationId,f.campaign.id,candidate.id,userId])).rows[0]
   const web=vi.fn(async()=>{
    if(kind==='admin')await f.pool.query('UPDATE public.app_users SET is_active=FALSE WHERE id=$1',[userId])
    else await f.pool.query('UPDATE public.organizations SET is_internal_growth_workspace=FALSE WHERE id=$1',[organizationId])
    return[]
   })
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.id},undefined,{loadSecret:async()=>'fixture',web,collect:async()=>[],runtime:async()=>{throw new Error('unexpected_model')}} as never)
   expect(web).toHaveBeenCalledTimes(1)
  }finally{
   await f.pool.query('UPDATE public.organizations SET is_internal_growth_workspace=TRUE WHERE id=$1',[organizationId])
   await f.pool.query('DELETE FROM public.radar_campaigns WHERE id=$1',[f.campaign.id])
   await f.pool.query('DELETE FROM public.app_users WHERE id=$1',[userId]);await f.pool.query('DELETE FROM public.users WHERE id=$1',[userId]);await f.close()
  }
 })
 it.each(['presence','semantic'])('does not purchase %s AI after the configuration changes during reading',async kind=>{
  const f=await captureFixture(),record=company();let routeId:string|undefined
  try{
   await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,$2::text[],'true') WHERE id=$1`,[f.campaign.id,['research',kind==='presence'?'presenceResolutionEnabled':'semanticQualificationEnabled']])
   routeId=(await f.pool.query(`INSERT INTO public.model_routing_rules(agent_type,organization_id,provider,model_name) VALUES($1,$2,'openrouter','fixture-not-real') RETURNING id`,[kind==='presence'?'radar_presence_resolution':'radar_business_qualification',organizationId])).rows[0].id
   const candidate=(await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Empresa sintética',$3,$4) RETURNING id`,[organizationId,f.campaign.id,randomUUID(),JSON.stringify({cnpj:record.taxId,legalName:record.legalName,city:'Curitiba',state:'PR',discoveryRevision:1})])).rows[0]
   const output={discoveryLocked:true,readingComplete:false,discovery:{websiteUrl:'https://marca.example/',association:'review',hits:[],suggestions:[],limitations:[],queries:0}}
   const run=(await f.pool.query('INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,output) VALUES($1,$2,$3,$4,1,$5) RETURNING id',[organizationId,f.campaign.id,candidate.id,admin.id,JSON.stringify(output)])).rows[0]
   const runtime=vi.fn(async()=>({targetStatus:'confirmed',productFit:'high',reasons:[],evidenceIds:['page-0'],limitations:[]}))
   const collect=async()=>{
    await f.pool.query('UPDATE public.radar_campaigns SET configuration_revision=2 WHERE id=$1',[f.campaign.id])
    return[{url:'https://marca.example/',text:kind==='presence'?'Marca Exemplo. Empresa sintética LTDA é nossa razão social.':`${record.legalName}. CNPJ ${record.taxId}. Compras compras@marca.example`,html:`<footer>${record.legalName} — CNPJ ${record.taxId}</footer><a href="mailto:compras@marca.example">Compras</a>`,observedAt:new Date().toISOString()}]
   }
   await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:run.id},undefined,{loadSecret:async()=>'fixture',web:async()=>[],collect,runtime} as never)
   expect(runtime).not.toHaveBeenCalled()
  }finally{if(routeId)await f.pool.query('DELETE FROM public.model_routing_rules WHERE id=$1',[routeId]);await f.close()}
 })
 it('exposes dispatch metadata but no company, items or operation data to an unscoped worker',async()=>{
  const f=await captureFixture(),url=new URL(connectionString!);url.username='yux_worker'
  const raw=new pg.Pool({connectionString:url.toString()}),worker=createContextAwarePool(raw,'worker')
  try{
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   await runWithDatabaseRequestContext({role:'yux_operator',serviceRole:'worker',organizationIds:[]},async()=>{
    expect((await worker.query('SELECT id FROM public.radar_capture_operations WHERE id=$1',[start.operationId])).rows).toHaveLength(0)
    expect((await worker.query('SELECT operation_id FROM public.radar_capture_outbox WHERE operation_id=$1',[start.operationId])).rows).toHaveLength(1)
   })
   await runWithDatabaseRequestContext({role:'client_member',serviceRole:'worker',organizationIds:[fixtureIds.organizationB]},async()=>{
    expect((await worker.query('SELECT id FROM public.radar_capture_operations WHERE id=$1',[start.operationId])).rows).toHaveLength(0)
   })
   const jobs=new Map(),queue={add:vi.fn(async(_name:string,data:{operationId:string},opts?:{jobId?:string})=>{if(data.operationId===start.operationId)jobs.set(opts?.jobId,data);return{id:opts?.jobId}})}
   await Promise.all([1,2].map(()=>runWithDatabaseRequestContext({role:'yux_operator',serviceRole:'worker',organizationIds:[]},()=>reconcileRadarCaptureOutbox(worker,queue,1))))
   expect(jobs.size).toBe(1)
  }finally{await raw.end();await f.close()}
 })
 it('runs discovery through real child jobs with fake providers and recovers a blocked child without rediscovery',async()=>{
  const f=await captureFixture(),key=`provider-key:${Buffer.alloc(32,7).toString('base64')}`,record=company()
  const url=new URL(connectionString!);url.username='yux_worker'
  const raw=new pg.Pool({connectionString:url.toString()}),worker=createContextAwarePool(raw,'worker')
  const scoped=<T>(fn:()=>Promise<T>)=>runWithDatabaseRequestContext({role:'client_member',organizationIds:[organizationId],serviceRole:'worker'},fn)
  try{
   const provider=(await f.pool.query(`INSERT INTO public.platform_provider_connections(provider_type,provider_key,display_name,status,public_config,is_default) VALUES('internal_service','brave_place','Fixture','active','{"retentionLicensed":true,"credentialPurpose":"licensed_retention","webSearchLicensed":true}',TRUE) ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active',public_config=EXCLUDED.public_config RETURNING id`)).rows[0]
   await storePlatformProviderSecret(f.pool,{providerConnectionId:provider.id,secretKind:'api_key',value:'fixture-not-real'},key)
   await f.pool.query("UPDATE public.radar_data_sources SET enabled=TRUE,default_cost_per_unit=.01,rate_limit_per_day=10000 WHERE source_key='brave_web_search'")
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1})
   const discovery=vi.fn(async()=>({candidates:[record]}))
   const discover=async()=>advanceRadarCaptureDiscovery(worker,{} as never,{organizationId,operationId:start.operationId},{searchPage:discovery,loadSecret:async()=>'fixture'})
   const jobs=new Map<string,{runId:string}>(),queue={add:vi.fn(async(name:string,data:{runId:string},opts:{jobId:string})=>{if(name==='radar.researchCandidate')jobs.set(opts.jobId,data);return{id:opts.jobId}})}
   await scoped(()=>dispatchRadarCaptureOperation(worker,{} as never,{organizationId,operationId:start.operationId},queue as never,undefined,{discover}))
   let state=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)
   expect(state.counts).toMatchObject({admitted:1,completed:0,researching:1})
   const runId=state.items[0].runId!,requestId=state.items[0].id
   await f.pool.query("UPDATE public.radar_candidate_research_runs SET status='blocked',error_code='radar_ai_credits_insufficient' WHERE id=$1",[runId])
   await scoped(()=>dispatchRadarCaptureOperation(worker,{} as never,{organizationId,operationId:start.operationId},queue as never))
   state=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId);expect(state.status).toBe('blocked')
   const resumeId=randomUUID()
   await resumeRadarCaptureOperation(f.pool,admin,{organizationId,operationId:start.operationId,configurationRevision:1,requestId:resumeId})
   await scoped(()=>dispatchRadarCaptureOperation(worker,{} as never,{organizationId,operationId:start.operationId},queue as never))
   expect((await f.pool.query('SELECT id,status,request_id FROM public.radar_candidate_research_runs WHERE id=$1',[runId])).rows[0]).toMatchObject({id:runId,status:'queued',request_id:requestId})
   const text=`${record.legalName}. CNPJ ${record.taxId}. Curitiba PR. Contato para fornecedores: compras@empresa.example`;
   await scoped(()=>executeRadarCandidateResearch(worker,{} as never,{organizationId,runId},undefined,{loadSecret:async()=>'fixture',web:async()=>[{url:'https://empresa.example/',title:record.legalName,snippets:[text],observedAt:new Date().toISOString()}],collect:async()=>[{url:'https://empresa.example/',text,html:'<a href="mailto:compras@empresa.example">Fornecedores</a>',observedAt:new Date().toISOString()}],runtime:async()=>{throw new Error('unexpected_paid_model')}} as never))
   await scoped(()=>dispatchRadarCaptureOperation(worker,{} as never,{organizationId,operationId:start.operationId},queue as never))
   state=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)
   expect(state.counts.completed+state.counts.insufficient).toBe(1);expect(state.counts.blocked).toBe(0)
   expect(discovery).toHaveBeenCalledTimes(1)
   expect((await f.pool.query('SELECT * FROM public.radar_b2b_reviews WHERE campaign_id=$1 AND approved_at IS NOT NULL',[f.campaign.id])).rows).toHaveLength(0)
   expect((await f.pool.query('SELECT * FROM public.leads WHERE attribution_context->>\'radarCnpj\'=$1',[record.taxId])).rows).toHaveLength(0)
  }finally{await raw.end();await f.close()}
 })
})
