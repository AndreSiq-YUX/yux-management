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
it('opens decision capacity only on a distinct explicit recovery intent and keeps paid effects intact',()=>{
 const calls={a:{source:'openrouter_decision',status:'completed'},b:{source:'openrouter_decision',status:'completed'},agent:{source:'perplexity_agent',status:'completed',requestId:'already-paid'}};
 const output={funnel:{fit:{reasonCode:'decision_limit_reached'},agentCompleted:true,executedActions:['agent_research'],decisionCalls:2}};
 const result=api.prepareRadarDecisionRecovery(output,calls,{requestId:'approved-resume',maximum:2});
 expect(result).toMatchObject({funnel:{decisionRound:1,decisionRecoveryRequestId:'approved-resume',decisionCalls:0,agentCompleted:true,executedActions:['agent_research']}});
 expect(result.funnel.fit).toBeUndefined();
 expect(api.prepareRadarDecisionRecovery(result,calls,{requestId:'approved-resume',maximum:2})).toBe(result);
 expect(api.prepareRadarDecisionRecovery(output,calls,{maximum:2})).toBe(output);
 expect(calls.agent.requestId).toBe('already-paid');expect(Object.keys(calls)).toHaveLength(3);
});
