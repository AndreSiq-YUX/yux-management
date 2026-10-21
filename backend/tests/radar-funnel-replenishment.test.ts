import {expect,it} from 'vitest'
const api=await import('../src/modules/radar/funnel-replenishment.js').catch(()=>({})) as Record<string,any>
it.each([
 [50,.5,20,30,0,25,5,true],
 [50,.5,30,20,0,25,0,false],
 [50,.8,35,15,0,40,5,true],
 [50,0,0,50,0,0,0,false],
 [3,.5,1,2,0,2,1,true],
 [50,.5,20,25,5,25,5,false],
])('uses configured ratio and waits for unresolved initial decisions: %s/%s', (requested,ratio,passed,blocked,pending,required,missing,replenish)=>{
 expect(api.planRadarFunnelReplenishment?.({requested,ratio,admitted:passed+blocked+pending,passed,pending})).toMatchObject({required,missing,replenish})
})
it('never treats unknown or invalid counters as permission to start paid discovery',()=>{
 expect(()=>api.planRadarFunnelReplenishment({requested:20,ratio:1.1,admitted:20,passed:0,pending:0})).toThrow()
})
