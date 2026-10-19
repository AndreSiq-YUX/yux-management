import {describe,it,expect,vi} from 'vitest'
import {normalizeRadarCounters} from '../src/modules/radar/numeric-counters.js'
import {randomUUID} from 'node:crypto'
import {captureFixture,connectionString,admin,organizationId,available,company} from './support/radar-capture-fixture.js'
import {startRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {advanceRadarCaptureDiscovery} from '../src/modules/radar/capture-discovery.js'
import {dispatchRadarCaptureOperation,resumeRadarCaptureOperation} from '../src/modules/radar/capture-dispatch.js'
import {CnpjaSearchHttpError} from '../src/modules/radar/cnpjaClient.js'
import {runRadarCnpjaAdvancedSearch} from '../src/modules/radar/repository.js'
import {getRadarCapturePreflight} from '../src/modules/radar/capture-preflight.js'
import {executeRadarCandidateResearch} from '../src/modules/radar/research-service.js'
const path='../src/modules/radar/capture-capacity.js',api=await import(path).catch(()=>({}))
describe('capture capacity',()=>{
 it('recognizes the output-only legacy recovery audit without losing an attempt or inventing a successful page',async()=>{
  const operation={id:randomUUID(),organization_id:organizationId,campaign_id:randomUUID(),configuration_revision:6,queries:3,scope_pages:{'v6:SP:all':3},configuration_snapshot:{target_states:['SP'],search_configuration:{}}}
  const linked={status:'failed',completed_at:new Date(),input_payload:{captureOperationId:operation.id,configurationRevision:6,regionalState:'SP'},output_payload:{discoveryOutcome:'rejected',candidateCount:0}}
  const legacy={...linked,input_payload:{configurationRevision:6,regionalState:'SP'},error_message:'request validation failed',output_payload:{candidateCount:0,issues:[{code:'provider_failed',sourceType:'cnpja_advanced_search'}],captureRecovery:{operationId:operation.id,reason:'legacy_validation_rejection',recoveredAt:new Date().toISOString()}}}
  const query=vi.fn(async()=>({rows:[legacy,linked,linked]}))
  expect(await api.loadRadarCapturePageAccounting({query} as never,operation)).toEqual({historyCertain:true,successfulPagesByScope:{}})
  expect(query).toHaveBeenCalledWith(expect.stringContaining("output_payload->'captureRecovery'->>'operationId'=$3"),[organizationId,operation.campaign_id,operation.id])
  expect(operation.queries).toBe(3);expect(legacy.input_payload).not.toHaveProperty('captureOperationId')
 })
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
it('accounts for an inherited transport page instead of truncating it to the next lot preference',()=>{
 expect(api.calculateRadarCaptureCapacity({limits:{pageSize:3,maxPagesPerScope:1,maxQueriesPerBatch:1},remaining:20,attemptedQueries:0,scopes:[{key:'PR',completed:false,inheritedPageSize:25}],successfulPagesByScope:{},usableOverflowCount:0})).toMatchObject({optimisticAdditionalCapacity:20,minimumAdditionalQueries:1})
})
describe.skipIf(!connectionString)('capture accounting and limit pause with PostgreSQL',()=>{
 it('does not count a request rejected by governance before dispatch as a paid attempt',async()=>{
  const f=await captureFixture()
  try{
   const started=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1},{availability:available})
   const op=(await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE id=$1',[started.operationId])).rows[0]
   await f.pool.query("INSERT INTO public.radar_enrichment_runs(organization_id,campaign_id,provider,status,input_payload,output_payload,completed_at) VALUES($1,$2,'cnpja_advanced_search','failed',$3,'{\"candidateCount\":0,\"discoveryOutcome\":\"not_dispatched\"}',NOW())",[organizationId,f.campaign.id,JSON.stringify({captureOperationId:op.id,configurationRevision:1,regionalState:'PR',scopeKey:'v1:PR:all'})])
   expect(await api.loadRadarCapturePageAccounting(f.pool,op)).toEqual({historyCertain:true,successfulPagesByScope:{}})
  }finally{await f.close()}
 })
 async function setup(){
  const f=await captureFixture()
  const started=await startRadarCaptureOperation(f.pool,admin,{organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:20},{availability:available})
  // Historic lots were accepted before capacity validation existed.
  await f.pool.query("UPDATE public.radar_capture_operations SET configuration_snapshot=jsonb_set(configuration_snapshot,'{search_configuration,batch,maxPagesPerScope}','1') WHERE id=$1",[started.operationId])
  const input={organizationId,operationId:started.operationId},op=async()=>normalizeRadarCounters((await f.pool.query('SELECT * FROM public.radar_capture_operations WHERE id=$1',[input.operationId])).rows[0])
  return{...f,input,op}
 }
 async function historicalLot(){
  const f=await setup()
  await f.pool.query(`UPDATE public.radar_campaigns SET search_configuration=jsonb_set(search_configuration,'{research,contactPurpose}','"suppliers"') WHERE id=$1`,[f.campaign.id])
  await f.pool.query(`UPDATE public.radar_capture_operations SET queries=3,scope_pages='{"v1:PR:all":3}',status='partial',discovery_stopped=TRUE,discovery_reason='page_cap',configuration_snapshot=jsonb_set(jsonb_set(configuration_snapshot,'{search_configuration,batch,maxPagesPerScope}','3'),'{search_configuration,batch,maxQueriesPerBatch}','30') WHERE id=$1`,[f.input.operationId])
  await f.pool.query(`UPDATE public.radar_capture_operations SET configuration_snapshot=jsonb_set(configuration_snapshot,'{search_configuration,research,contactPurpose}','"suppliers"') WHERE id=$1`,[f.input.operationId])
  const input={configurationRevision:1,regionalState:'PR',limit:10,pageToken:'expired-fixture-token'}
  const legacy=(await f.pool.query(`INSERT INTO public.radar_enrichment_runs(organization_id,campaign_id,provider,status,input_payload,output_payload,error_message,started_at,completed_at) VALUES($1,$2,'cnpja_advanced_search','failed',$3,$4,'request validation failed',NOW(),NOW()) RETURNING id`,
   [organizationId,f.campaign.id,JSON.stringify(input),JSON.stringify({candidateCount:0,issues:[{code:'provider_failed',sourceType:'cnpja_advanced_search'}],captureRecovery:{operationId:f.input.operationId,reason:'legacy_validation_rejection',recoveredAt:new Date().toISOString()}})])).rows[0].id
  // Production has two newer, explicitly linked rejections after this older recovery.
  for(let i=0;i<2;i++)await f.pool.query(`INSERT INTO public.radar_enrichment_runs(organization_id,campaign_id,provider,status,input_payload,output_payload,error_message,started_at,completed_at) VALUES($1,$2,'cnpja_advanced_search','failed',$3,$4,'request validation failed',NOW(),NOW())`,
   [organizationId,f.campaign.id,JSON.stringify({...input,captureOperationId:f.input.operationId}),JSON.stringify({candidateCount:0,discoveryOutcome:'rejected',httpStatus:400,...(i===1?{captureContinuationRecovery:{operationId:f.input.operationId,scopeKey:'v1:PR:all',recoveredAt:new Date().toISOString(),approvedBy:admin.id,requestId:randomUUID()}}:{})})])
  await f.pool.query(`INSERT INTO public.radar_regional_discovery_cursors(organization_id,campaign_id,state,provider,scope_key,next_token,pages_processed,candidates_seen) VALUES($1,$2,'PR','cnpja_advanced_search','v1:PR:all',NULL,4,40)`,[organizationId,f.campaign.id])
  return{...f,legacy,preflightInput:{organizationId,campaignId:f.campaign.id,operationId:f.input.operationId,configurationRevision:1,requestedCount:20}}
 }
 it('resumes an already-audited old-format rejection plus two newer attempts, skips forty old companies and researches all twenty new ones',async()=>{
  const f=await historicalLot(),old=Array.from({length:40},company),fresh=Array.from({length:20},company)
  try{
   for(const record of old)await f.pool.query(`INSERT INTO public.radar_candidate_records(organization_id,campaign_id,source_type,title,dedupe_key,normalized_payload) VALUES($1,$2,'cnpja_advanced_search','Anterior',$3,'{"websiteUrl":"https://old.example/"}')`,[organizationId,f.campaign.id,`cnpj:${record.taxId}`])
   const before=await f.op(),preflight=await getRadarCapturePreflight(f.pool,admin,f.preflightInput,{availability:available})
   expect(preflight).toMatchObject({allowed:true,requiresLimitsApproval:true,attemptedQueries:3,successfulPagesByScope:{},remaining:20})
   expect(await f.op()).toEqual(before) // Reading old proofs never rewrites consumption or receipts.
   await resumeRadarCaptureOperation(f.pool,admin,{...f.input,configurationRevision:1,requestId:randomUUID(),limitsAuthorization:{expectedStateId:preflight.stateId,limits:{pageSize:10,maxPagesPerScope:8,maxQueriesPerBatch:30}}},{availability:available})
   let calls=0
   const discover:typeof advanceRadarCaptureDiscovery=(pool,env,input)=>advanceRadarCaptureDiscovery(pool,env,input,{availability:available,loadSecret:async()=>'fixture',searchPage:async request=>{
    expect(request.token).toBe(calls?`fixture-page-${calls}`:undefined)
    const candidates=[...old,...fresh].slice(calls*10,++calls*10)
    return{candidates,nextToken:`fixture-page-${calls}`}
   }})
   const researched=new Set<string>(),queue={add:async(_name:string,input:{runId:string})=>{
    researched.add(input.runId)
    const payload=(await f.pool.query(`SELECT candidate.normalized_payload FROM public.radar_candidate_research_runs run JOIN public.radar_candidate_records candidate ON candidate.id=run.candidate_id WHERE run.id=$1`,[input.runId])).rows[0].normalized_payload
    const website=`https://empresa-${payload.cnpj}.example/`,email=`compras@empresa-${payload.cnpj}.example`
    const text=`${payload.legalName}. CNPJ ${payload.cnpj}. Curitiba PR. Contato para fornecedores: ${email}.`
    await executeRadarCandidateResearch(f.pool,{} as never,{organizationId,runId:input.runId},undefined,{
     loadSecret:async()=>'fixture',
     web:async()=>[{url:website,title:payload.legalName,snippets:[text],observedAt:new Date().toISOString()}],
     collect:async()=>[{url:website,text,html:`<footer>${text}</footer><a href="mailto:${email}">Fornecedores</a>`,observedAt:new Date().toISOString()}],
     runtime:async()=>{throw new Error('unexpected_paid_model')},
    } as never)
    return{}
   }}
   let state
   for(let i=0;i<10;i++)state=await dispatchRadarCaptureOperation(f.pool,{} as never,f.input,queue as never,undefined,{availability:available,discover})
   expect(state).toMatchObject({status:'completed',counts:{requested:20,admitted:20,completed:20,blocked:0,researching:0}})
   expect(calls).toBe(6);expect(researched.size).toBe(20)
   expect(await api.loadRadarCapturePageAccounting(f.pool,await f.op())).toEqual({successfulPagesByScope:{'v1:PR:all':6},historyCertain:true})
   expect(await f.op()).toMatchObject({queries:9,scope_pages:{'v1:PR:all':9},requested_count:20})
   expect((await f.pool.query("SELECT COUNT(*)::int AS n FROM public.radar_candidate_records WHERE campaign_id=$1 AND normalized_payload->>'websiteUrl'='https://old.example/'",[f.campaign.id])).rows[0].n).toBe(40)
   const researchedPayloads=(await f.pool.query("SELECT normalized_payload FROM public.radar_candidate_records WHERE campaign_id=$1 AND normalized_payload->>'researchRevision'='1'",[f.campaign.id])).rows
   expect(researchedPayloads).toHaveLength(20)
   for(const {normalized_payload:payload} of researchedPayloads){
    expect(payload.websiteUrl).toBe(`https://empresa-${payload.cnpj}.example/`)
    expect(payload.publicContacts).toEqual(expect.arrayContaining([expect.objectContaining({kind:'email',value:`compras@empresa-${payload.cnpj}.example`,association:'confirmed'})]))
   }
   expect((await f.pool.query('SELECT input_payload,output_payload FROM public.radar_enrichment_runs WHERE id=$1',[f.legacy])).rows[0]).toMatchObject({input_payload:{configurationRevision:1},output_payload:{captureRecovery:{reason:'legacy_validation_rejection'}}})
  }finally{await f.close()}
 })
 it.each(['wrong_operation','wrong_input_operation','wrong_revision','wrong_scope','running','has_results','missing_audit_date','wrong_audit_reason','wrong_error','missing_issue','uncertain'])('does not accept an unsafe legacy audit: %s',async mode=>{
  const f=await historicalLot()
  try{
   const changes:Record<string,string>={
    wrong_operation:"output_payload=jsonb_set(output_payload,'{captureRecovery,operationId}','\"another-operation\"')",
    wrong_input_operation:"input_payload=input_payload||'{\"captureOperationId\":\"another-operation\"}'",
    wrong_revision:"input_payload=jsonb_set(input_payload,'{configurationRevision}','2')",
    wrong_scope:"input_payload=jsonb_set(input_payload,'{regionalState}','\"SP\"')",
    running:"status='running',completed_at=NULL",has_results:"output_payload=jsonb_set(output_payload,'{candidateCount}','1')",
    missing_audit_date:"output_payload=output_payload#-'{captureRecovery,recoveredAt}'",
    wrong_audit_reason:"output_payload=jsonb_set(output_payload,'{captureRecovery,reason}','\"unproven\"')",
    wrong_error:"error_message='network failure'",missing_issue:"output_payload=output_payload-'issues'",
    uncertain:"output_payload=output_payload||'{\"discoveryOutcome\":\"uncertain\"}'",
   }
   await f.pool.query(`UPDATE public.radar_enrichment_runs SET ${changes[mode]} WHERE id=$1`,[f.legacy])
   expect((await api.loadRadarCapturePageAccounting(f.pool,await f.op())).historyCertain).toBe(false)
  }finally{await f.close()}
 })
 it('does not count rejected attempts as obtained pages or erase consumption',async()=>{
  const f=await setup()
  try{
   await f.pool.query("UPDATE public.radar_capture_operations SET configuration_snapshot=jsonb_set(configuration_snapshot,'{search_configuration,batch,maxPagesPerScope}','5') WHERE id=$1",[f.input.operationId])
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
 it.each(['wrong_operation','wrong_revision','running','ambiguous_scope','uncertain'])('does not trust %s history',async mode=>{
  const f=await setup()
  try{
   await advanceRadarCaptureDiscovery(f.pool,{} as never,f.input,{availability:available,loadSecret:async()=>'fixture',searchPage:async()=>({candidates:[],nextToken:'more'})})
   if(mode==='wrong_operation')await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{captureOperationId}',to_jsonb($2::text)) WHERE campaign_id=$1",[f.campaign.id,randomUUID()])
   if(mode==='wrong_revision')await f.pool.query("UPDATE public.radar_enrichment_runs SET input_payload=jsonb_set(input_payload,'{configurationRevision}','2') WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='running')await f.pool.query("UPDATE public.radar_enrichment_runs SET status='running',completed_at=NULL WHERE campaign_id=$1",[f.campaign.id])
   if(mode==='uncertain')await f.pool.query("UPDATE public.radar_enrichment_runs SET status='failed',output_payload=jsonb_set(output_payload,'{discoveryOutcome}','\"uncertain\"') WHERE campaign_id=$1",[f.campaign.id])
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
