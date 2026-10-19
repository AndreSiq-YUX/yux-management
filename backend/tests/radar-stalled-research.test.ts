import {expect,it} from 'vitest'
const modulePath='../src/modules/radar/stalled-research.js',api=await import(modulePath).catch(()=>({})) as Record<string,Function>
const now=new Date('2026-10-19T12:00:00Z'),base={lastProgressAt:'2026-10-19T11:00:00Z',codes:[],hasDelivery:true,leases:[]}
it('classifies real waits before recovery without trusting polling as progress or starting effects',()=>{
 expect(api.classifyStalledRadarResearch).toBeTypeOf('function')
 const classify=(value:object)=>api.classifyStalledRadarResearch({...base,...value},{now,stalledAfterMinutes:10})
 expect(classify({lastProgressAt:'2026-10-19T11:55:00Z'})).toBeNull()
 expect(classify({updatedAt:now.toISOString()})).toBe('no_progress')
 expect(classify({uncertain:true,codes:['source_limit_exceeded']})).toBe('effect_uncertain')
 expect(classify({codes:['radar_presence_refresh_authorization_required']})).toBe('waiting_authorization')
 expect(classify({codes:['source_limit_exceeded']})).toBe('waiting_capacity')
 expect(classify({leases:['2026-10-19T12:03:00Z'],workerHeartbeat:true})).toBe('running_with_heartbeat')
 expect(classify({leases:['2026-10-19T11:50:00Z']})).toBe('lease_expired')
 expect(classify({hasDelivery:false})).toBe('queue_unavailable')
})
