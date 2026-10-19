import {it,expect} from 'vitest'
const api=await import('../src/modules/radar/intent-budget.js').catch(()=>({})) as Record<string,any>
it('authorizes only additional usage while retaining all history and uncertain reservations',()=>{
 expect(api.resolveRadarIntentBudget).toBeTypeOf('function')
 const input={historicalUsage:{completed:5,reserved:0},intentBaseline:{completed:5,reserved:0},authorizedPolicy:{additionalAllowed:3}}
 expect(api.resolveRadarIntentBudget(input)).toMatchObject({additionalAllowed:3,reserved:0,remaining:3,reasons:[]})
 expect(api.resolveRadarIntentBudget({...input,historicalUsage:{completed:6,reserved:1}})).toMatchObject({additionalAllowed:3,reserved:1,remaining:1})
 expect(api.resolveRadarIntentBudget({...input,historicalUsage:{completed:7,reserved:1}})).toMatchObject({reserved:1,remaining:0,reasons:['radar_intent_budget_exhausted']})
 expect(api.resolveRadarIntentBudget({...input,authorizedPolicy:null})).toMatchObject({remaining:0,reasons:['radar_intent_budget_missing']})
 expect(api.resolveRadarIntentBudget({...input,intentBaseline:{completed:10,reserved:0}})).toMatchObject({remaining:0,reasons:['radar_intent_budget_baseline_invalid']})
})
