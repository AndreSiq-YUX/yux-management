import {expect,it} from 'vitest';
const api=await import('../src/modules/radar/funnel-round-seed.js').catch(()=>({})) as Record<string,any>;
it('reuses only fresh public facts, resets decisions and preserves uncertain effect identities',()=>{
 const page={url:'https://alfa.example/',text:'Fatos públicos',observedAt:'2026-10-20T12:00:00Z'};
 const old={...page,url:'https://old.example/',observedAt:'2020-01-01T12:00:00Z'};
 const result=api.seedRadarFunnelRound({output:{pages:[page,old],funnel:{agentCompleted:true},decisionExcluded:true,qualification:{targetStatus:'confirmed'},contacts:[{kind:'email',value:'compras@alfa.example',sourceUrl:page.url,association:'confirmed'}]},calls:{unknown:{source:'radar_presence_resolution',status:'uncertain',requestId:'old-paid'},done:{source:'radar_business_qualification',status:'completed',requestId:'old-done'}}},7,Date.parse('2026-10-21T12:00:00Z'));
 expect(result.output.pages).toEqual([page]);expect(result.output.funnel).toBeUndefined();expect(result.output.qualification).toBeUndefined();expect(result.output.decisionExcluded).toBeUndefined();
 expect(result.calls).toEqual({unknown:{source:'radar_presence_resolution',status:'uncertain',requestId:'old-paid'}});
 expect(result.output.contacts[0].association).toBe('review');
});
it('keeps the original receipt identity of legacy presence and qualification reservations',()=>{
 const result=api.seedRadarFunnelRound({id:'historical-run',output:{},calls:{presence:{status:'uncertain',evidenceHash:'presence-hash'},semantic:{status:'reserved',evidenceHash:'qualification-hash'}}},7);
 expect(result.calls.presence.requestId).toBe('historical-run:presence:presence-hash');
 expect(result.calls.semantic.requestId).toBe('historical-run:qualification-hash');
});
