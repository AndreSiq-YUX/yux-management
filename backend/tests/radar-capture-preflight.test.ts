import {describe,it,expect} from 'vitest'
import {connectionString,admin,available,organizationId} from './support/radar-capture-fixture.js'
import {fixtureUsers} from './integration/support/fixtures.js'
import {limitFixture} from './support/radar-capture-limit-fixture.js'
import {startRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {randomUUID} from 'node:crypto'
import {createRadarCampaign} from '../src/modules/radar/repository.js'
const path='../src/modules/radar/capture-preflight.js',api=await import(path).catch(()=>({}))
describe.skipIf(!connectionString)('capture preflight with PostgreSQL',()=>{
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
 it('checks the exact client contract wallet only for enabled AI stages',async()=>{
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
   await f.pool.query("INSERT INTO public.radar_data_sources(organization_id,source_key,source_type,display_name,enabled) VALUES($1,'cnpja_advanced_search','cnpja_advanced_search','Own disabled fixture',FALSE)",[orgId])
   expect((await check()).allowed).toBe(false)
   expect((await check()).blockers.map((b:{code:string})=>b.code)).toContain('source_disabled')
  }finally{await f.pool.query('DELETE FROM public.organizations WHERE id=$1',[orgId]);await f.pool.query('DELETE FROM public.contracts WHERE id=$1',[contractId]);await f.pool.query('DELETE FROM public.clients WHERE id=$1',[clientId]);await f.close()}
 })
})
