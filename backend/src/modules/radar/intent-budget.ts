import {z} from 'zod'

const units=z.number().int().nonnegative().safe()
export function resolveRadarIntentBudget(input:{historicalUsage:{completed:number;reserved:number};intentBaseline:{completed:number;reserved:number};authorizedPolicy:{additionalAllowed:number}|null}){
 const completed=units.parse(input.historicalUsage.completed),reserved=units.parse(input.historicalUsage.reserved)
 const baseline=units.parse(input.intentBaseline.completed)+units.parse(input.intentBaseline.reserved)
 const historical=completed+reserved
 if(!Number.isSafeInteger(historical)||!Number.isSafeInteger(baseline)||baseline>historical)return{additionalAllowed:0,reserved,remaining:0,reasons:['radar_intent_budget_baseline_invalid']}
 if(!input.authorizedPolicy)return{additionalAllowed:0,reserved,remaining:0,reasons:['radar_intent_budget_missing']}
 const additionalAllowed=units.parse(input.authorizedPolicy.additionalAllowed),remaining=Math.max(0,additionalAllowed-(historical-baseline))
 return{additionalAllowed,reserved,remaining,reasons:remaining?[]:['radar_intent_budget_exhausted']}
}
