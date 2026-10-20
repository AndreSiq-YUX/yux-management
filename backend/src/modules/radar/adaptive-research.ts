import {z} from 'zod'
const action=z.object({id:z.string().min(1).max(160),kind:z.enum(['read','web','local','registry','extract','resolve','deep_research','qualify']),inputHash:z.string().min(1).max(160)}).strict()
export const researchActionV1Schema=action.extend({schemaVersion:z.literal(1)}).strict()
export type ResearchActionV1=z.infer<typeof researchActionV1Schema>
export class RadarAdaptiveTurnYield extends Error{constructor(){super('radar_adaptive_turn_yield')}}
export function rethrowRadarAdaptiveYield(cause:unknown){if(cause instanceof RadarAdaptiveTurnYield)throw cause}
const inputSchema=z.object({missing:z.array(z.string().min(1)).max(10),outsideProfile:z.boolean(),contentHash:z.string().min(1).max(160),lastDecision:z.string().optional(),availableActions:z.array(action).max(30),effects:z.array(z.object({actionId:z.string(),inputHash:z.string(),contentHash:z.string(),status:z.enum(['completed','uncertain','reserved','rejected'])}).strict()).max(1000)}).strict()
/** Pure one-action choice. Eligibility is supplied by authorized callers, not
 * invented by a model. Stable content excludes observations and wall clocks. */
export function planRadarAdaptiveResearch(raw:z.input<typeof inputSchema>){
 const input=inputSchema.parse(raw)
 if(input.outsideProfile)return{stop:'outside_profile' as const}
 if(!input.missing.length)return{stop:'criteria_met' as const}
 if(input.effects.some(effect=>['uncertain','reserved'].includes(effect.status)))return{stop:'awaiting_authorization' as const}
 const eligible=input.availableActions.filter(action=>!input.effects.some(effect=>effect.actionId===action.id&&effect.inputHash===action.inputHash&&effect.contentHash===input.contentHash))
 const decision=eligible.find(action=>action.id===input.lastDecision)
 const next=decision??eligible.find(action=>action.kind==='read')??eligible.find(action=>action.kind!=='deep_research')??eligible[0]
 return next?{next:{...next,schemaVersion:1 as const}}:{stop:input.availableActions.length?'no_progress' as const:'insufficient_evidence' as const}
}
