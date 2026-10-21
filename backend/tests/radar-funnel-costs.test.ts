import {expect,it} from 'vitest';
const api=await import('../src/modules/radar/funnel-costs.js').catch(()=>({})) as Record<string,any>;
it('deduplicates old recovered effects and keeps unknown amounts distinct from zero',()=>{
 const call={source:'perplexity_agent',status:'completed',requestId:'same',actualBrl:'0.03',actualUsd:'0.006',reservedBrl:'0.05'};
 const rows=[{id:'old',calls:{agent:call}},{id:'new',calls:{agent:{...call,actualBrl:undefined,status:'uncertain'},semantic:{source:'radar_business_qualification',status:'uncertain',requestId:'unknown'}}}];
 const cost=api.summarizeRadarFunnelCosts(rows);
 expect(cost.effects).toHaveLength(2);expect(cost.knownActualBrl).toBe('0.03');expect(cost.unknownActual).toBe(1);
});
it('never assigns the new attempt response or cost to a previous uncertain attempt',()=>{
 const result=api.summarizeRadarFunnelCosts([{id:'run',calls:{agent:{source:'perplexity_agent',requestId:'new',status:'completed',actualBrl:'0.03',result:{usage:{costUsd:.006}},previous:[{requestId:'old',status:'uncertain'}]}}}]);
 expect(result.effects.find((item:any)=>item.id==='old').actualBrl).toBeNull();
 expect(result.unknownActual).toBe(1);
});
