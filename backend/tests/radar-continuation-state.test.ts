import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from './support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {dispatchRadarCaptureOperation} from '../src/modules/radar/capture-dispatch.js'
import {executeRadarCandidateResearch} from '../src/modules/radar/research-service.js'
import {getRadarCapturePreflight} from '../src/modules/radar/capture-preflight.js'
import {runRadarCnpjaAdvancedSearch} from '../src/modules/radar/repository.js'
import {advanceRadarCaptureDiscovery} from '../src/modules/radar/capture-discovery.js'
const api=await import('../src/modules/radar/continuation-state.js').catch(()=>({} as any))

describe.skipIf(!connectionString)('durable continuation before paid reservation',()=>{
 it('never repeats a first page with unknown response, even without a continuation token',async()=>{
  const f=await captureFixture();let calls=0
  try{
   const input={organizationId,campaignId:f.campaign.id,regionalState:'PR',expectedRevision:1,secretKeyMaterial:'fake'}
   await runRadarCnpjaAdvancedSearch(f.pool,admin,input,{loadSecret:async()=>'fake',searchPage:async()=>{calls++;throw new TypeError('simulated timeout')}})
   await expect(runRadarCnpjaAdvancedSearch(f.pool,admin,input,{loadSecret:async()=>'fake',searchPage:async()=>{calls++;return{candidates:[]}}})).rejects.toThrow('radar_capture_discovery_uncertain')
   expect(calls).toBe(1)
  }finally{await f.close()}
 })
 async function setup(){
  const f=await captureFixture()
  await f.pool.query(`INSERT INTO public.radar_regional_discovery_cursors(organization_id,campaign_id,state,provider,scope_key,next_token,pages_processed,candidates_seen) VALUES($1,$2,'PR','cnpja_advanced_search','v1:PR:all','legacy-token',3,40)`,[organizationId,f.campaign.id])
  const input={organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20}
  const preflight=()=>getRadarCapturePreflight(f.pool,admin,input,{availability:available,workerReady:async()=>true})
  return{...f,input,preflight}
 }
 it('blocks an inherited unknown-age token before any call; explicit consent preserves all history and deduplicates new companies',async()=>{
  const f=await setup();let calls=0
  try{
   const p=await f.preflight()
   expect(p.continuations).toHaveLength(1)
   expect(p.continuations[0]).toMatchObject({reason:'unknown_age',generation:0,replayEstimate:3,requiresRestartConfirmation:true})
   expect(JSON.stringify(p)).not.toContain('legacy-token')
   await expect(startRadarCaptureOperation(f.pool,admin,f.input,{availability:available})).rejects.toThrow('radar_capture_continuation_confirmation_required')
   await expect(runRadarCnpjaAdvancedSearch(f.pool,admin,{organizationId,campaignId:f.campaign.id,regionalState:'PR',expectedRevision:1,secretKeyMaterial:'fake'},{loadSecret:async()=>'fake',searchPage:async()=>{calls++;return{candidates:[]}}})).rejects.toThrow('radar_capture_continuation_confirmation_required')
   expect(calls).toBe(0)
   expect((await f.pool.query('SELECT * FROM public.radar_source_usage_counters WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(0)
   const previous=Array.from({length:40},company),fresh=Array.from({length:20},company)
   for(const c of previous)await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'cnpja_advanced_search','Anterior',$3)`,[organizationId,f.campaign.id,`cnpj:${c.taxId}`])
   const op=await startRadarCaptureOperation(f.pool,admin,{...f.input,continuationAuthorizations:p.continuations.map(s=>({scopeKey:s.scopeKey,expectedStateId:s.stateId}))},{availability:available})
   for(let i=0;i<5;i++)await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:op.operationId},{availability:available,loadSecret:async()=>'fake',searchPage:async request=>{
    calls++;if(i===0)expect(request.token).toBeUndefined()
    return{candidates:i<3?previous.slice(i*10,i*10+10):fresh.slice((i-3)*10,(i-2)*10),...(i<4?{nextToken:`new-page-${i}`}:{})}
   }})
   expect(calls).toBe(5)
   expect((await f.pool.query('SELECT * FROM public.radar_candidate_records WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(60)
   expect((await f.pool.query('SELECT * FROM public.radar_capture_items WHERE operation_id=$1',[op.operationId])).rows).toHaveLength(20)
   const cursor=(await f.pool.query('SELECT * FROM public.radar_regional_discovery_cursors WHERE campaign_id=$1',[f.campaign.id])).rows[0]
   expect(cursor).toMatchObject({generation:1,pages_processed:8,candidates_seen:90})
   expect((await f.pool.query('SELECT * FROM public.radar_continuation_authorizations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(1)
   const researched=new Set<string>(),pending=new Set<string>()
   const queue={add:async(name:string,data:Record<string,unknown>)=>{expect(name).toBe('radar.researchCandidate');pending.add(String(data.runId));return{id:String(data.runId)}}}
   for(let step=0;step<4;step++){
    await dispatchRadarCaptureOperation(f.pool,{} as never,{organizationId,operationId:op.operationId},queue,undefined,{availability:available})
    for(const runId of pending){
     if(researched.has(runId))continue
     const c=(await f.pool.query('SELECT candidate.* FROM public.radar_candidate_research_runs run JOIN public.radar_candidate_records candidate ON candidate.id=run.candidate_id WHERE run.id=$1',[runId])).rows[0]
     const url=`https://company-${c.id}.example/`,text=`${c.title}. CNPJ ${c.normalized_payload.cnpj}. Curitiba PR. Contato fornecedores compras@empresa.example`
     await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId},undefined,{loadSecret:async()=>'fake',web:async()=>[{url,title:c.title,snippets:[text],observedAt:new Date().toISOString()}],collect:async()=>[{url,text,html:'<a href="mailto:compras@empresa.example">Fornecedores</a>',observedAt:new Date().toISOString()}],runtime:async()=>{throw Error('unexpected_paid_model')}} as never)
     researched.add(runId)
    }
   }
   expect(researched.size).toBe(20)
   const result=await getRadarCaptureOperation(f.pool,admin,organizationId,op.operationId)
   expect(result.counts.researching).toBe(0);expect(result.counts.blocked).toBe(0)
   expect(result.counts.completed+result.counts.insufficient).toBe(20)
  }finally{await f.close()}
 },30_000)
 it.each(['advanced','policy','other_scope','other_revision'])('rejects stale or cross-scope approval: %s',async mode=>{
  const f=await setup()
  try{
   expect(api.inspectRadarContinuationState).toBeTypeOf('function')
   const p=await f.preflight(),state=p.continuations[0]
   if(mode==='advanced')await f.pool.query("UPDATE public.radar_regional_discovery_cursors SET next_token='newer',token_received_at=NOW(),generation=generation+1 WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='policy')await f.pool.query('UPDATE public.radar_operational_limits SET version=version+1 WHERE singleton=TRUE')
   const authorization={scopeKey:mode==='other_scope'?'v1:SP:all':state.scopeKey,expectedStateId:state.stateId}
   const next={...f.input,configurationRevision:mode==='other_revision'?2:1,continuationAuthorizations:[authorization]}
   await expect(startRadarCaptureOperation(f.pool,admin,next,{availability:available})).rejects.toThrow()
   expect((await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(0)
   expect((await f.pool.query('SELECT * FROM public.radar_continuation_authorizations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(0)
  }finally{await f.close()}
 })
 it('detects a proven rejection from another lot, but never clears an uncertain result',async()=>{
  const f=await setup()
  try{
   expect(api.inspectRadarContinuationState).toBeTypeOf('function')
   await f.pool.query("UPDATE public.radar_regional_discovery_cursors SET token_received_at=NOW() WHERE campaign_id=$1",[f.campaign.id])
   const payload={pageToken:'legacy-token',regionalState:'PR',configurationRevision:1,captureOperationId:randomUUID()}
   const receipt=(await f.pool.query(`INSERT INTO public.radar_enrichment_runs(organization_id,campaign_id,provider,status,input_payload,output_payload,error_message,started_at,completed_at) VALUES($1,$2,'cnpja_advanced_search','failed',$3,'{"candidateCount":0,"discoveryOutcome":"rejected","httpStatus":400}','HTTP 400: token is invalid or expired',NOW(),NOW()) RETURNING id`,[organizationId,f.campaign.id,JSON.stringify(payload)])).rows[0]
   const p=await f.preflight()
   expect(p.continuations[0]).toMatchObject({reason:'rejected',requiresRestartConfirmation:true})
   await f.pool.query(`UPDATE public.radar_enrichment_runs SET output_payload='{"discoveryOutcome":"uncertain"}' WHERE id=$1`,[receipt.id])
   const uncertain=await f.preflight()
   expect(uncertain.allowed).toBe(false)
   expect(uncertain.blockers).toContainEqual(expect.objectContaining({code:'radar_capture_discovery_uncertain'}))
   await expect(startRadarCaptureOperation(f.pool,admin,{...f.input,continuationAuthorizations:p.continuations.map(s=>({scopeKey:s.scopeKey,expectedStateId:s.stateId}))},{availability:available})).rejects.toThrow()
  }finally{await f.close()}
 })
})
