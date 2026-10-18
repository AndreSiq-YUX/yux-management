import {describe,it,expect} from 'vitest'
import {connectionString,admin,available,organizationId} from './support/radar-capture-fixture.js'
import {fixtureUsers} from './integration/support/fixtures.js'
import {limitFixture} from './support/radar-capture-limit-fixture.js'
import {startRadarCaptureOperation} from '../src/modules/radar/capture-operation.js'
import {randomUUID} from 'node:crypto'
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
 it.each(['source','quota','route'])('reports a real local %s blocker without writing',async kind=>{
  const f=await limitFixture()
  try{
   if(kind==='source')await f.pool.query("UPDATE public.radar_data_sources SET enabled=FALSE WHERE source_key='cnpja_advanced_search'")
   if(kind==='quota')await f.pool.query('UPDATE public.radar_campaigns SET daily_limit=1 WHERE id=$1',[f.campaign.id])
   const p=await api.getRadarCapturePreflight(f.pool,admin,f.input,{availability:kind==='route'?async()=>({allowed:false,reasons:[{code:'route_missing',message:'Configure modelo',resolution:'Admin'}]}):available})
   expect(p.allowed).toBe(false);expect(p.blockers.length).toBeGreaterThan(0)
  }finally{if(kind==='source')await f.pool.query("UPDATE public.radar_data_sources SET enabled=TRUE WHERE source_key='cnpja_advanced_search'");await f.close()}
 })
})
