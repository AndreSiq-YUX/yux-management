import pg from 'pg'
import {describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from '../support/radar-capture-fixture.js'
import {createContextAwarePool} from '../../src/db/client.js'
import {runWithDatabaseRequestContext} from '../../src/db/request-context.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../../src/modules/radar/capture-discovery.js'
import {dispatchRadarCaptureOperation,reconcileRadarCaptureOutbox,resumeRadarCaptureOperation} from '../../src/modules/radar/capture-dispatch.js'
import {startRadarCandidateResearch,executeRadarCandidateResearch} from '../../src/modules/radar/research-service.js'
import {storePlatformProviderSecret} from '../../src/modules/platform/adminRepository.js'
import {fixtureIds} from './support/fixtures.js'

describe.skipIf(!connectionString)('capture journey with isolated PostgreSQL',()=>{
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
   const jobs=new Map(),queue={add:vi.fn(async(_name:string,data:unknown,opts?:{jobId?:string})=>{jobs.set(opts?.jobId,data);return{id:opts?.jobId}})}
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
