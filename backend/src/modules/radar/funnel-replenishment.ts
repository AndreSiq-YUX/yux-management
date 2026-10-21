import {z} from 'zod'
const counter=z.number().int().nonnegative().safe()
const countersSchema=z.object({requested:counter.min(1),ratio:z.number().finite().min(0).max(1),admitted:counter,passed:counter,pending:counter}).strict().refine(value=>value.passed+value.pending<=value.admitted,'invalid_radar_funnel_counts')
export function planRadarFunnelReplenishment(raw:z.infer<typeof countersSchema>){
 const {requested,ratio,admitted,passed,pending}=countersSchema.parse(raw)
 const required=Math.ceil(ratio*requested),missing=Math.max(0,required-passed)
 return{required,missing,replenish:admitted>=requested&&pending===0&&missing>0}
}
