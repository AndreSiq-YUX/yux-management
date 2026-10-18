import {describe,it,expect,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company,activateCaptureSearch} from './support/radar-capture-fixture.js'
import {startRadarCaptureOperation,getRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery,blockRadarCapture} from '../src/modules/radar/capture-discovery.js'
const modulePath='../src/modules/radar/capture-dispatch.js'
const api=await import(modulePath).catch(()=>({}))
const state=await import('../src/modules/radar/capture-research-state.js')
describe('capture outcomes',()=>{
 it('treats exhausted identity evidence as insufficient, not an execution failure',()=>{
  const run={status:'partial',stage:'review',calls:{presence:{status:'completed'}},output:{siteAssociation:'review',limitations:['radar_qualification_waiting_identity','radar_profile_waiting_identity']}}
  expect(api.classifyRadarCaptureResearch(run)).toBe('insufficient')
  expect(state.assessRadarCaptureResearch(run)).toEqual({status:'insufficient',stage:'presence',reason:'radar_research_identity_insufficient'})
 })
 it('ignores incidental quota warnings only after required research is demonstrably complete',()=>{
  const output={siteAssociation:'confirmed',quality:{readyForReview:true},qualification:{targetStatus:'confirmed',productFit:'high'},limitations:['source_limit_exceeded']}
  expect(api.classifyRadarCaptureResearch({status:'partial',stage:'review',calls:{},output})).toBe('completed')
  expect(state.assessRadarCaptureResearch({status:'partial',output:{limitations:['source_limit_exceeded','radar_qualification_waiting_public_read']}})).toEqual({status:'blocked',stage:'discovery',reason:'source_limit_exceeded'})
 })
 it('keeps a precise operational reason without interpreting arbitrary public text as an error',()=>{
  expect(state.assessRadarCaptureResearch({status:'partial',calls:{semantic:{status:'uncertain'}},output:{}})).toEqual({status:'blocked',stage:'qualification',reason:'radar_research_call_uncertain'})
  expect(state.assessRadarCaptureResearch({status:'partial',output:{limitations:['Qualificação semântica pendente (agent_runtime_422). Os fatos foram preservados.']}})).toEqual({status:'blocked',stage:'qualification',reason:'agent_runtime_422'})
  expect(api.classifyRadarCaptureResearch({status:'partial',output:{limitations:['Texto público: radar_company_failed é o nome do produto']}})).toBe('insufficient')
  expect(api.classifyRadarCaptureResearch({status:'partial',output:{siteAssociation:'review',limitations:['radar_profile_unverifiable']}})).toBe('insufficient')
 })
 it.each(['source_limit_exceeded','source_budget_exceeded','provider_inactive'])('keeps structured provider blocker %s resumable',code=>{
   expect(api.classifyRadarCaptureResearch({status:'partial',output:{discovery:{association:'blocked',limitations:[code]},limitations:[code]},calls:{}})).toBe('blocked')
 })
 it('distinguishes missing facts from uncertain paid calls and pending TLS approval',()=>{
  expect(api.classifyRadarCaptureResearch).toBeTypeOf('function')
  expect(api.classifyRadarCaptureResearch({status:'partial',output:{siteAssociation:'review',limitations:['no site']},calls:{}})).toBe('insufficient')
  expect(api.classifyRadarCaptureResearch({status:'partial',output:{},calls:{presence:{status:'uncertain'}}})).toBe('blocked')
  expect(api.classifyRadarCaptureResearch({status:'partial',output:{pages:[{diagnostic:{kind:'tls_expired'}}]},calls:{}})).toBe('blocked')
  expect(api.classifyRadarCaptureResearch({status:'succeeded',output:{quality:{readyForReview:false}}})).toBe('insufficient')
 })
})
describe.skipIf(!connectionString)('durable capture dispatch',()=>{
 it('redelivers a stale queued child with a new durable queue generation while preserving its run',async()=>{
  const f=await captureFixture()
  try{
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   const input={organizationId,operationId:start.operationId}
   await advanceRadarCaptureDiscovery(f.pool,{} as never,input,{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)).items[0]
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,updated_at) VALUES($1,$2,$3,$4,1,'queued',NOW()-INTERVAL '10 minutes') RETURNING id`,[organizationId,f.campaign.id,item.candidateId,admin.id])).rows[0]
   await f.pool.query("UPDATE public.radar_capture_items SET run_id=$2,status='researching' WHERE id=$1",[item.id,run.id])
   const queue={add:vi.fn(async()=>({id:'job'}))}
   await api.dispatchRadarCaptureOperation(f.pool,{} as never,input,queue,undefined,{availability:available})
   expect(queue.add).toHaveBeenCalledWith('radar.researchCandidate',{organizationId,runId:run.id},{jobId:`radar-capture-item-${item.id}-1`})
  }finally{await f.close()}
 })
 it('recovers an expired running child using the same run and stored receipts',async()=>{
  const f=await captureFixture()
  try{
   await activateCaptureSearch(f.pool)
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:start.operationId},{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)).items[0]
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,request_id,status,lease_until,calls) VALUES($1,$2,$3,$4,1,$5,'running',NOW()-INTERVAL '1 minute','{"saved":{"status":"completed","source":"brave_web_search","result":[]}}') RETURNING id`,[organizationId,f.campaign.id,item.candidateId,admin.id,item.id])).rows[0]
   await f.pool.query("UPDATE public.radar_capture_items SET run_id=$2,status='researching' WHERE id=$1",[item.id,run.id])
   const queue={add:vi.fn(async()=>({id:'queued'}))},input={organizationId,operationId:start.operationId}
   await api.dispatchRadarCaptureOperation(f.pool,{} as never,input,queue,undefined,{availability:available})
   expect((await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)).status).toBe('blocked')
   await api.resumeRadarCaptureOperation(f.pool,admin,{...input,configurationRevision:1,requestId:randomUUID()},{availability:available})
   await api.dispatchRadarCaptureOperation(f.pool,{} as never,input,queue,undefined,{availability:available})
   expect(queue.add).toHaveBeenCalledWith('radar.researchCandidate',{organizationId,runId:run.id},expect.any(Object))
   expect((await f.pool.query('SELECT status,calls FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0]).toMatchObject({status:'queued',calls:{saved:{status:'completed'}}})
  }finally{await f.close()}
 })
 it('aggregates finished children when a subsequent discovery page is blocked and retires its outbox',async()=>{
  const f=await captureFixture()
  try{
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:2},{availability:available})
   const input={organizationId,operationId:start.operationId}
   await advanceRadarCaptureDiscovery(f.pool,{} as never,input,{availability:available,searchPage:async()=>({candidates:[company()],nextToken:'page-2'}),loadSecret:async()=>'fixture'})
   const item=(await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)).items[0]
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,output) VALUES($1,$2,$3,$4,1,'succeeded','{"siteAssociation":"confirmed","quality":{"readyForReview":true}}') RETURNING id`,[organizationId,f.campaign.id,item.candidateId,admin.id])).rows[0]
   await f.pool.query("UPDATE public.radar_capture_items SET run_id=$2,status='researching' WHERE id=$1",[item.id,run.id])
   const discover=async()=>{await blockRadarCapture(f.pool,organizationId,start.operationId,new Error('source_limit_exceeded'));return getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)}
   const queue={add:vi.fn()}
   await api.dispatchRadarCaptureOperation(f.pool,{} as never,input,queue,undefined,{availability:available,discover})
   const state=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)
   expect(state).toMatchObject({status:'blocked',counts:{completed:1,researching:0}})
   expect((await f.pool.query('SELECT * FROM public.radar_capture_outbox WHERE operation_id=$1',[start.operationId])).rows).toHaveLength(0)
   expect(queue.add).not.toHaveBeenCalled()
  }finally{await f.close()}
 })
 it('finishes already completed child work even when no search quota remains',async()=>{
  const f=await captureFixture()
  try{
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:start.operationId},{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   const state=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId),item=state.items[0]
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,output) VALUES($1,$2,$3,$4,1,'succeeded','{"siteAssociation":"confirmed","quality":{"readyForReview":true}}') RETURNING id`,[organizationId,f.campaign.id,item.candidateId,admin.id])).rows[0]
   await f.pool.query("UPDATE public.radar_capture_items SET run_id=$2,status='researching' WHERE id=$1",[item.id,run.id])
   const queue={add:vi.fn()}
   await api.dispatchRadarCaptureOperation(f.pool,{} as never,{organizationId,operationId:start.operationId},queue,undefined,{availability:async()=>({allowed:false,reasons:[{code:'source_limit_exceeded',message:'Quota',resolution:'Admin'}]})})
   expect(await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)).toMatchObject({status:'completed',counts:{completed:1,blocked:0}})
   expect(queue.add).not.toHaveBeenCalled()
  }finally{await f.close()}
 })
 it('dispatches only admitted IDs and recovers lost queue acknowledgements using the same run and request',async()=>{
  expect(api.dispatchRadarCaptureOperation).toBeTypeOf('function')
  const f=await captureFixture()
  try{
   await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'cnpja_advanced_search','Old unprocessed',$3)`,[organizationId,f.campaign.id,randomUUID()])
   const start=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:2},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId,operationId:start.operationId},{availability:available,searchPage:async()=>({candidates:[company(),company()]}),loadSecret:async()=>'fixture'})
   const requests:Array<{candidateId:string;requestId:string}>=[]
   const startResearch=async(_pool:unknown,_user:unknown,input:{candidateId:string;requestId:string})=>{
    requests.push(input)
    const row=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,request_id) VALUES($1,$2,$3,$4,1,$5) ON CONFLICT(organization_id,candidate_id,request_id) WHERE request_id IS NOT NULL DO UPDATE SET request_id=EXCLUDED.request_id RETURNING id,status`,[organizationId,f.campaign.id,input.candidateId,admin.id,input.requestId])).rows[0]
    return {runId:row.id,status:row.status,reused:requests.length>2}
   }
   const jobs=new Map<string,unknown>(),add=vi.fn(async(name:string,data:unknown,opts:{jobId:string})=>{jobs.set(opts.jobId,{name,data});if(jobs.size===1&&add.mock.calls.length===1)throw new Error('lost_ack');return{id:opts.jobId}})
   const dependencies={availability:available,startResearch}
   await api.dispatchRadarCaptureOperation(f.pool,{} as never,{organizationId,operationId:start.operationId},{add},undefined,dependencies)
   const before=await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)
   expect(before.counts.admitted).toBe(2);expect(before.counts.completed).toBe(0)
   await api.dispatchRadarCaptureOperation(f.pool,{} as never,{organizationId,operationId:start.operationId},{add},undefined,dependencies)
   expect(jobs.size).toBe(2)
   expect(new Set(requests.map(x=>x.candidateId))).toEqual(new Set(before.items.map(x=>x.candidateId)))
   expect(requests.every(x=>before.items.some(item=>item.id===x.requestId&&item.candidateId===x.candidateId))).toBe(true)
   expect((await f.pool.query('SELECT * FROM public.radar_candidate_research_runs WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(2)
  }finally{await f.close()}
 })
 it('rejects disabled preflight before discovery and pauses a changed revision without provider calls',async()=>{
  const f=await captureFixture()
  try{
   const input={organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:2}
   await expect(startRadarCaptureOperation(f.pool,admin,input,{availability:async()=>({allowed:false,reasons:[{code:'disabled',message:'disabled',resolution:'Configuração'}]})})).rejects.toThrow('radar_capture_research_unavailable')
   expect((await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(0)
   const start=await startRadarCaptureOperation(f.pool,admin,input,{availability:available})
   await f.pool.query('UPDATE public.radar_campaigns SET configuration_revision=2 WHERE id=$1',[f.campaign.id])
   const discover=vi.fn(),queue={add:vi.fn()}
   await api.dispatchRadarCaptureOperation(f.pool,{} as never,{organizationId,operationId:start.operationId},queue,undefined,{availability:available,discover})
   expect(discover).not.toHaveBeenCalled();expect(queue.add).not.toHaveBeenCalled()
   expect(await getRadarCaptureOperation(f.pool,admin,organizationId,start.operationId)).toMatchObject({status:'blocked',blockers:['radar_campaign_configuration_changed']})
  }finally{await f.close()}
 })
})
