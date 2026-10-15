import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import pg from 'pg'
import {captureFixture,connectionString,admin,organizationId,available} from './support/radar-capture-fixture.js'

const modulePath='../src/modules/radar/capture-operation.js'
const api=await import(modulePath).catch(()=>({}))
describe('capture operation contract',()=>{
  it('exposes quantity validation before any database effects',()=>{
    expect(api.parseRadarCaptureCount,'missing capture operation implementation').toBeTypeOf('function')
    for(const n of [0,1.5,1001,NaN])expect(()=>api.parseRadarCaptureCount(n)).toThrow()
    expect(api.parseRadarCaptureCount(7)).toBe(7)
  })
})
describe.skipIf(!connectionString)('capture operation persistence',()=>{
  it('keeps a request associated with the reused active operation after that operation finishes',async()=>{
    const f=await captureFixture()
    try{
      const input={organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:7}
      const first=await api.startRadarCaptureOperation(f.pool,admin,input,{availability:available})
      const second={...input,requestId:randomUUID(),requestedCount:5}
      expect((await api.startRadarCaptureOperation(f.pool,admin,second,{availability:available})).operationId).toBe(first.operationId)
      await f.pool.query("UPDATE public.radar_capture_operations SET status='completed' WHERE id=$1",[first.operationId])
      expect((await api.startRadarCaptureOperation(f.pool,admin,second,{availability:available})).operationId).toBe(first.operationId)
      await expect(api.startRadarCaptureOperation(f.pool,admin,{...second,requestedCount:6},{availability:available})).rejects.toThrow('radar_capture_request_conflict')
    }finally{await f.close()}
  })
  it('starts with a single available pool connection without nested acquisition',async()=>{
    const f=await captureFixture(),single=new pg.Pool({connectionString,max:1,connectionTimeoutMillis:200})
    try{
      const input={organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:1}
      const availability=async(queryable:pg.Pool)=>{await queryable.query('SELECT 1');return available()}
      await expect(api.startRadarCaptureOperation(single,admin,input,{availability})).resolves.toMatchObject({reused:false})
    }finally{await single.end();await f.close()}
  })
  it('reuses the same request, rejects changed payload and serializes different requests',async()=>{
    expect(api.startRadarCaptureOperation).toBeTypeOf('function')
    const f=await captureFixture()
    try{
      const input={organizationId,campaignId:f.campaign.id,configurationRevision:1,requestId:randomUUID(),requestedCount:7}
      const first=await api.startRadarCaptureOperation(f.pool,admin,input,{availability:available})
      const retry=await api.startRadarCaptureOperation(f.pool,admin,input,{availability:available})
      expect(retry).toMatchObject({operationId:first.operationId,reused:true})
      await expect(api.startRadarCaptureOperation(f.pool,admin,{...input,requestedCount:5},{availability:available})).rejects.toThrow('radar_capture_request_conflict')
      const concurrent=await Promise.all([5,9].map(requestedCount=>api.startRadarCaptureOperation(f.pool,admin,{...input,requestId:randomUUID(),requestedCount},{availability:available})))
      expect(concurrent.map(x=>x.operationId)).toEqual([first.operationId,first.operationId])
      const state=await api.getRadarCaptureOperation(f.pool,admin,organizationId,first.operationId)
      expect(state.counts).toMatchObject({requested:7,admitted:0,completed:0})
      expect((await f.pool.query('SELECT * FROM public.radar_capture_outbox WHERE operation_id=$1',[first.operationId])).rows).toHaveLength(1)
    }finally{await f.close()}
  })
})
