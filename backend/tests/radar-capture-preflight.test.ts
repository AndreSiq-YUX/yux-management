import {describe,it,expect} from 'vitest'
import {connectionString,admin,available,organizationId,company} from './support/radar-capture-fixture.js'
import {fixtureUsers} from './integration/support/fixtures.js'
import {limitFixture} from './support/radar-capture-limit-fixture.js'
import {startRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {randomUUID} from 'node:crypto'
import {createRadarCampaign} from '../src/modules/radar/repository.js'
import {advanceRadarCaptureDiscovery} from '../src/modules/radar/capture-discovery.js'
const path='../src/modules/radar/capture-preflight.js',api=await import(path).catch(()=>({}))
describe.skipIf(!connectionString)('capture preflight with PostgreSQL',()=>{
 it('warns about enrichment capacity for the entire requested lot before discovery, without raising quotas',async()=>{
  const f=await limitFixture()
  try{
   const {operationId,...input}=f.input
   const availability=async()=>({...await available(),estimates:[{sourceType:'brave_web_search',costPerQuery:.01,remainingQueries:2}],maxQueriesPerCandidate:3})
   const result=await api.getRadarCapturePreflight(f.pool,admin,{...input,requestedCount:2},{availability})
   expect(result).toMatchObject({researchCapacity:{remainingQueries:2,plannedMaximumQueries:6,estimatedMaximumCostBrl:.06},warnings:[{code:'radar_capture_enrichment_capacity_low'}]})
   expect((await f.pool.query("SELECT rate_limit_per_day FROM public.radar_data_sources WHERE source_key='brave_web_search'")).rows.every(row=>row.rate_limit_per_day===10000)).toBe(true)
  }finally{await f.close()}
 })
 it('includes the shared campaign budget when warning about enrichment capacity across selected sources',async()=>{
  const f=await limitFixture()
  try{
   await f.pool.query('UPDATE public.radar_campaigns SET budget_limit=.03 WHERE id=$1',[f.campaign.id])
   const {operationId,...input}=f.input
   const availability=async()=>({...await available(),estimates:[{sourceType:'brave_web_search',costPerQuery:.01,remainingQueries:100},{sourceType:'serper_web_search',costPerQuery:.02,remainingQueries:100}],maxQueriesPerCandidate:3})
   const result=await api.getRadarCapturePreflight(f.pool,admin,{...input,requestedCount:2},{availability})
   expect(result.warnings.map((item:{code:string})=>item.code)).toContain('radar_capture_enrichment_capacity_low')
  }finally{await f.close()}
 })
 it('distinguishes genuinely exhausted regions from an editable page cap',async()=>{
  const f=await limitFixture()
  try{
   await f.pool.query("INSERT INTO public.radar_regional_discovery_cursors(organization_id,campaign_id,state,provider,scope_key,completed) VALUES($1,$2,'PR','cnpja_advanced_search','v1:PR:all',TRUE)",[f.input.organizationId,f.campaign.id])
   const result=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:available})
   expect(result.allowed).toBe(false)
   expect(result.blockers[0].code).toBe('radar_capture_source_exhausted')
  }finally{await f.close()}
 })
 it('explains legacy lot capacity without changing limits or queueing work',async()=>{
  const f=await limitFixture()
  try{
   expect(api.getRadarCapturePreflight).toBeTypeOf('function')
   const before=await f.op(),result=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:available})
   expect(result).toMatchObject({allowed:true,requiresLimitsApproval:true,remaining:20,optimisticAdditionalCapacity:10,minimumAdditionalQueries:2,limits:{maxPagesPerScope:1}})
   expect(result.stateId).toMatch(/^[a-f0-9]{64}$/);expect(await f.op()).toEqual(before)
   expect(result.checks).toContainEqual({key:'external_credit',status:'not_checked'})
  }finally{await f.close()}
 })
 it('rejects an impossible new request before any lot exists',async()=>{
  const f=await limitFixture()
  try{
   expect(api.getRadarCapturePreflight).toBeTypeOf('function')
   const {operationId,...input}=f.input,result=await api.getRadarCapturePreflight(f.pool,admin,input,{availability:available})
   expect(result.allowed).toBe(false);expect(result.blockers.map((r:{code:string})=>r.code)).toContain('radar_capture_capacity_insufficient')
   await expect(startRadarCaptureOperation(f.pool,admin,{...input,requestId:randomUUID()},{availability:available})).rejects.toThrow('radar_capture_capacity_insufficient')
   expect((await f.pool.query('SELECT id FROM public.radar_capture_operations WHERE campaign_id=$1',[f.campaign.id])).rows).toHaveLength(1)
  }finally{await f.close()}
 })
 it.each(['yux_operator','client_admin_A','client_member_A'])('denies preflight internals to %s',async role=>{
  const f=await limitFixture()
  try{expect(api.getRadarCapturePreflight).toBeTypeOf('function');await expect(api.getRadarCapturePreflight(f.pool,fixtureUsers[role as keyof typeof fixtureUsers],f.input,{availability:available})).rejects.toThrow()}
  finally{await f.close()}
 })
 it('checks worker readiness and never mislabels an unknown external balance',async()=>{
  const f=await limitFixture()
  try{
   expect(api.getRadarCapturePreflight).toBeTypeOf('function')
   const result=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:available,workerReady:async()=>false})
   expect(result.allowed).toBe(false);expect(result.blockers.map((r:{code:string})=>r.code)).toContain('radar_capture_worker_unavailable')
  }finally{await f.close()}
 })
 it('rejects a mismatched quantity or organization without mutating the lot',async()=>{
  const f=await limitFixture()
  try{
   expect(api.getRadarCapturePreflight).toBeTypeOf('function')
   await expect(api.getRadarCapturePreflight(f.pool,admin,{...f.input,requestedCount:19},{availability:available})).rejects.toThrow('radar_capture_request_conflict')
   await expect(api.getRadarCapturePreflight(f.pool,admin,{...f.input,organizationId:'10000000-0000-4000-8000-000000000001'},{availability:available})).rejects.toThrow()
   expect((await f.op()).organization_id).toBe(organizationId)
  }finally{await f.close()}
 })
 it.each(['quota','route'])('reports a real local %s blocker without writing',async kind=>{
  const f=await limitFixture()
  try{
   if(kind==='quota')await f.pool.query('UPDATE public.radar_campaigns SET daily_limit=1 WHERE id=$1',[f.campaign.id])
   const p=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:kind==='route'?async()=>({allowed:false,reasons:[{code:'route_missing',message:'Configure modelo',resolution:'Admin'}]}):available})
   expect(p.allowed).toBe(false);expect(p.blockers.length).toBeGreaterThan(0)
  }finally{await f.close()}
 })
 it('checks the exact client contract wallet for new work but defers AI gates to each effect when recovering admitted research',async()=>{
  const f=await limitFixture(),clientId=randomUUID(),orgId=randomUUID(),contractId=randomUUID()
  try{
   await f.pool.query("INSERT INTO public.clients(id,company_name,contact_name,email,sector,size,lead_source,status) VALUES($1,'Wallet QA','QA',$2,'QA','small','test','active')",[clientId,`${clientId}@example.test`])
   await f.pool.query("INSERT INTO public.organizations(id,name,slug,kind,client_id) VALUES($1::uuid,'Wallet QA',$1::text,'client',$2)",[orgId,clientId])
   await f.pool.query("INSERT INTO public.contracts(id,client_id,package_id,status) VALUES($1,$2,'31000000-0000-4000-8000-000000000001','active')",[contractId,clientId])
   await f.pool.query("INSERT INTO public.contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',TRUE)",[contractId])
   const campaign=await createRadarCampaign(f.pool,admin,{organizationId:orgId,name:'Wallet QA',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],offerType:'Oferta',dailyLimit:100,budgetLimit:100,searchConfiguration:{batch:{maxPagesPerScope:5},research:{enabled:true,profileEnabled:true}}} as never)
   const input={organizationId:orgId,campaignId:campaign.id,configurationRevision:1,requestedCount:1}
   const check=()=>api.getRadarCapturePreflight(f.pool,admin,input,{availability:available})
   expect((await check()).blockers).toContainEqual({code:'radar_ai_wallet_missing',message:'radar_ai_wallet_missing'})
   await f.pool.query('INSERT INTO public.ai_credit_wallets(organization_id,client_id,contract_id,current_balance) VALUES($1,$2,$3,0)',[orgId,clientId,contractId])
   expect((await check()).blockers).toContainEqual({code:'radar_ai_credits_insufficient',message:'radar_ai_credits_insufficient'})
   await f.pool.query('UPDATE public.ai_credit_wallets SET is_unlimited=TRUE WHERE contract_id=$1',[contractId])
   expect((await check()).checks).toContainEqual({key:'ai_wallet',status:'ok'})
   expect((await f.pool.query('SELECT current_balance FROM public.ai_credit_wallets WHERE contract_id=$1',[contractId])).rows[0].current_balance).toBe(0)
   const started=await startRadarCaptureOperation(f.pool,admin,{...input,requestId:randomUUID()},{availability:available})
   await advanceRadarCaptureDiscovery(f.pool,{} as never,{organizationId:orgId,operationId:started.operationId},{availability:available,searchPage:async()=>({candidates:[company()]}),loadSecret:async()=>'fixture'})
   const item=(await f.pool.query('SELECT * FROM public.radar_capture_items WHERE operation_id=$1',[started.operationId])).rows[0]
   const run=(await f.pool.query(`INSERT INTO public.radar_candidate_research_runs(organization_id,campaign_id,candidate_id,requested_by,configuration_revision,status,output,calls)
    VALUES($1,$2,$3,$4,1,'partial','{"readingComplete":true,"discovery":{"association":"confirmed","hits":[]},"pages":[]}','{"semantic":{"status":"completed","source":"radar_business_qualification","evidenceHash":"saved","result":{"targetStatus":"review"}}}') RETURNING id`,[orgId,campaign.id,item.candidate_id,admin.id])).rows[0]
   await f.pool.query("UPDATE public.radar_capture_items SET status='blocked',run_id=$2 WHERE id=$1",[item.id,run.id])
   await f.pool.query("UPDATE public.radar_capture_operations SET status='blocked' WHERE id=$1",[started.operationId])
   await f.pool.query('UPDATE public.ai_credit_wallets SET is_unlimited=FALSE WHERE contract_id=$1',[contractId])
   const unavailableAI=async()=>({...await available(),semantic:{routeConfigured:false}})
   const recovered=await api.getRadarCapturePreflight(f.pool,admin,{...input,operationId:started.operationId},{availability:unavailableAI})
   expect(recovered.allowed).toBe(true)
   expect(recovered.checks).toContainEqual({key:'ai_wallet',status:'not_checked'})
   expect(recovered.checks).toContainEqual({key:'ai_model_route',status:'not_checked'})
   expect((await api.getRadarCapturePreflight(f.pool,admin,input,{availability:unavailableAI})).blockers.map((b:{code:string})=>b.code)).toEqual(expect.arrayContaining(['radar_ai_credits_insufficient','radar_capture_model_route_missing']))
   expect((await f.pool.query('SELECT calls FROM public.radar_candidate_research_runs WHERE id=$1',[run.id])).rows[0].calls.semantic.status).toBe('completed')
   await f.pool.query("INSERT INTO public.radar_data_sources(organization_id,source_key,source_type,display_name,enabled) VALUES($1,'cnpja_advanced_search','cnpja_advanced_search','Own disabled fixture',FALSE)",[orgId])
   expect((await check()).allowed).toBe(false)
   expect((await check()).blockers.map((b:{code:string})=>b.code)).toContain('source_disabled')
  }finally{await f.pool.query('DELETE FROM public.organizations WHERE id=$1',[orgId]);await f.pool.query('DELETE FROM public.contracts WHERE id=$1',[contractId]);await f.pool.query('DELETE FROM public.clients WHERE id=$1',[clientId]);await f.close()}
 })
})
