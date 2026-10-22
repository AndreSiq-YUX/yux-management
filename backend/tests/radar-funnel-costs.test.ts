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
it('includes an actually billed invalid reply without counting an unknown reservation as free',()=>{
 const result=api.summarizeRadarFunnelCosts([{id:'run',calls:{semantic:{source:'radar_business_qualification',requestId:'invalid-paid',status:'received_invalid',effectReceiptId:'protected',billingOutcome:'known',actualUsd:'0.0007643',costPolicy:{usdToBrl:'6',marginPercent:'15',rateAsOf:'2026-10-21T11:03:00Z',rateSource:'manual'}},presence:{source:'radar_presence_resolution',requestId:'unknown',status:'reserved'}}}]);
 expect(result.effects.find((item:any)=>item.id==='invalid-paid')).toMatchObject({actualUsd:'0.0007643',actualBrl:'0.00527367'});
 expect(result.unknownActual).toBe(1);
});
