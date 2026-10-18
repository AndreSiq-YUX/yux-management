import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from './support/radar-capture-fixture.js'
import {startRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../src/modules/radar/capture-discovery.js'
import {dispatchRadarCaptureOperation,resumeRadarCaptureOperation} from '../src/modules/radar/capture-dispatch.js'
import {CnpjaSearchHttpError} from '../src/modules/radar/cnpjaClient.js'
import {runRadarCnpjaAdvancedSearch} from '../src/modules/radar/repository.js'
const path='../src/modules/radar/capture-capacity.js',api=await import(path).catch(()=>({}))
describe('capture capacity',()=>{
 it.each([
  {pages:1,queries:10,attempts:0,obtained:0,capacity:10,exhausted:null},
  {pages:2,queries:2,attempts:0,obtained:0,capacity:20,exhausted:null},
  {pages:2,queries:2,attempts:2,obtained:0,capacity:0,exhausted:'query_cap'},
  {pages:1,queries:10,attempts:1,obtained:1,capacity:0,exhausted:'page_cap'},
 ])('computes bounded capacity from $pages pages and $queries queries after $attempts attempts',row=>{
  expect(api.calculateRadarCaptureCapacity).toBeTypeOf('function')
  expect(api.calculateRadarCaptureCapacity({limits:{pageSize:10,maxPagesPerScope:row.pages,maxQueriesPerBatch:row.queries},remaining:20,attemptedQueries:row.attempts,scopes:[{key:'v1:PR:all',completed:false}],successfulPagesByScope:{'v1:PR:all':row.obtained},usableOverflowCount:0})).toEqual({optimisticAdditionalCapacity:row.capacity,minimumAdditionalQueries:2,exhausted:row.exhausted})
 })
})
describe.skipIf(!connectionString)('capture accounting and limit pause with PostgreSQL',()=>{
 async function setup(){
  const f=await captureFixture()
  await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(jsonb_set(search_configuration,'{batch,maxPagesPerScope}','1'),'{batch,maxQueriesPerBatch}','5') WHERE id=$1`,[f.campaign.id])
  const started=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20},{availability:available})
  const input={organizationId,operationId:started.operationId},op=async()=>(await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE id=$1',[input.operationId])).rows[0]
  return{...f,input,op}
 }
 it('does not count rejected attempts as obtained pages or erase consumption',async()=>{
  const f=await setup()
  try{
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>{throw new CnpjaSearchHttpError('invalid request',400)}})
   await resumeRadarCaptureOperation(f.pool,admin,{...f.input,configurationRevision:1,requestId:randomUUID()},{availability:available})
   let calls=0
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>{calls++;return{candidates:[company()],nextToken:'more'}}})
   expect(calls).toBe(1)
   expect(await f.op()).toMatchObject({queries:2,scope_pages:{'v1:PR:all':2}})
   const accounting=await api.loadRadarCapturePageAccounting(f.pool,await f.op())
   expect(accounting).toEqual({successfulPagesByScope:{'v1:PR:all':1},historyCertain:true})
  }finally{await f.close()}
 })
 it('pauses instead of closing an incomplete lot after a duplicate-only successful page',async()=>{
  const f=await setup(),old=company()
  try{
   await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key) VALUES($1,$2,'cnpja_advanced_search','Anterior',$3)`,[organizationId,f.campaign.id,`cnpj:${old.taxId}`])
   const discover:typeof advanceRadarCaptureDiscovery=(pool,env,input)=>advanceRadarCaptureDiscovery(pool,env,input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:[old],nextToken:'more'})})
   await dispatchRadarCaptureOperation(f.pool,{} as never,f.input,{add:async()=>({})} as never,undefined,{availability:available,discover})
   const state=await dispatchRadarCaptureOperation(f.pool,{} as never,f.input,{add:async()=>({})} as never,undefined,{availability:available,discover})
   expect(state).toMatchObject({status:'blocked',discoveryReason:'page_cap',counts:{requested:20,admitted:0},blockers:['radar_capture_page_limit']})
   expect((await f.op()).queries).toBe(1)
  }finally{await f.close()}
 })
 it('marks missing or ambiguous history uncertain rather than inventing obtained pages',async()=>{
  const f=await setup()
  try{
   expect(api.loadRadarCapturePageAccounting).toBeTypeOf('function')
   await f.pool.query('UPDATE public.radar_capture_operations SET queries=1 WHERE id=$1',[f.input.operationId])
   expect((await api.loadRadarCapturePageAccounting(f.pool,await f.op())).historyCertain).toBe(false)
  }finally{await f.close()}
 })
 it.each(['query','page'])('enforces the %s limit inside the reservation transaction too',async kind=>{
  const f=await setup();let calls=0
  try{
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:[],nextToken:'more'})})
   if(kind==='query')await f.pool.query('UPDATE public.radar_capture_operations SET queries=5 WHERE id=$1',[f.input.operationId])
   await expect(runRadarCnpjaAdvancedSearch(f.pool,admin,{organizationId,campaignId:f.campaign.id,captureOperationId:f.input.operationId,regionalState:'PR',expectedRevision:1,limit:10,secretKeyMaterial:'fixture'},
    {loadSecret:async()=>'fixture',searchPage:async()=>{calls++;return{candidates:[]}}})).rejects.toThrow(kind==='query'?'radar_capture_query_limit':'radar_capture_page_limit')
   expect(calls).toBe(0)
  }finally{await f.close()}
 })
 it.each(['wrong_operation','wrong_revision','running','ambiguous_scope'])('does not trust %s history',async mode=>{
  const f=await setup()
  try{
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:[],nextToken:'more'})})
   if(mode==='wrong_operation')await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{captureOperationId}',to_jsonb($2::text)) WHERE campaign_id=$1",[f.campaign.id,randomUUID()])
   if(mode==='wrong_revision')await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{configurationRevision}','2') WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='running')await f.pool.query("UPDATE public.radar_enrichment_runs SET status='running',completed_at=NULL WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='ambiguous_scope')await f.pool.query("UPDATE public.radar_capture_operations SET configuration_snapshot=jsonb_set(configuration_snapshot,'{target_states}','[\"PR\",\"PR\"]') WHERE id=$1",[f.input.operationId])
   expect(await api.loadRadarCapturePageAccounting(f.pool,await f.op())).toEqual({successfulPagesByScope:{},historyCertain:false})
  }finally{await f.close()}
 })
 it('finishes admitted child research before pausing the remaining discovery',async()=>{
  const f=await setup();let queued=0
  try{
   const discover:typeof advanceRadarCaptureDiscovery=(pool,env,input)=>advanceRadarCaptureDiscovery(pool,env,input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:[company()],nextToken:'more'})})
   const startResearch=async(_pool:unknown,_user:unknown,input:{candidateId:string})=>{
    const run=(await f.pool.query("INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status) VALUES($1,$2,$3,$4,1,'queued') RETURNING id",[organizationId,f.campaign.id,input.candidateId,admin.id])).rows[0]
    return{runId:run.id,status:'queued',reused:false}
   }
   await dispatchRadarCaptureOperation(f.pool,{} as never,f.input,{add:async()=>{queued++;return{}}} as never,undefined,{availability:available,discover,startResearch:startResearch as never})
   const pending=await dispatchRadarCaptureOperation(f.pool,{} as never,f.input,{add:async()=>({})} as never,undefined,{availability:available,discover})
   expect(pending).toMatchObject({status:'researching',counts:{admitted:1,researching:1}});expect(queued).toBe(1)
   await f.pool.query("UPDATE public.radar_candidate_research_runs SET status='succeeded',output='{\"siteAssociation\":\"confirmed\",\"quality\":{\"readyForReview\":true}}' WHERE campaign_id=$1",[f.campaign.id])
   const done=await dispatchRadarCaptureOperation(f.pool,{} as never,f.input,{add:async()=>({})} as never,undefined,{availability:available,discover})
   expect(done).toMatchObject({status:'blocked',discoveryReason:'page_cap',counts:{completed:1,researching:0}})
  }finally{await f.close()}
 })
})
