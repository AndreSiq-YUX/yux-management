import {z} from 'zod'
import type {RadarCaptureResearchAssessment} from './capture-research-state.js'

export const radarResearchAttentionSchema=z.object({
 stage:z.enum(['website_identity','commercial_fit','public_research']),
 reason:z.enum(['identity_analysis_incomplete','commercial_analysis_incomplete','attempt_confirmation_pending','public_research_interrupted']),
 nextAction:z.enum(['review_company','resume_available_steps','review_previous_attempt']),canResume:z.boolean(),
}).strip()
export type RadarResearchAttention=z.infer<typeof radarResearchAttentionSchema>
export function projectRadarResearchAttention(input:{assessment:RadarCaptureResearchAssessment;callStates?:Array<{kind:string;status:string;error?:string}>;canResumeSafely?:boolean;requiresAttemptReview?:boolean}):RadarResearchAttention|null{
 if(input.assessment.status!=='blocked')return null
 const code=input.assessment.reason??''
 const uncertain=input.requiresAttemptReview||/uncertain/.test(code)
 const stage=code.includes('presence')||input.assessment.stage==='presence'?'website_identity':code.includes('qualification')||input.assessment.stage==='qualification'?'commercial_fit':'public_research'
 const reason=uncertain?'attempt_confirmation_pending':stage==='website_identity'?'identity_analysis_incomplete':stage==='commercial_fit'?'commercial_analysis_incomplete':'public_research_interrupted'
 const canResume=input.canResumeSafely===true&&!uncertain
 return{stage,reason,nextAction:uncertain?'review_previous_attempt':canResume?'resume_available_steps':'review_company',canResume}
}
export function summarizeRadarResearchAttention(items:Array<{status:string;blocker?:string|null}>){
 const counts=new Map<RadarResearchAttention['reason'],number>()
 for(const item of items){const attention=projectRadarResearchAttention({assessment:{status:item.status==='blocked'?'blocked':'completed',reason:item.blocker??undefined}});if(attention)counts.set(attention.reason,(counts.get(attention.reason)??0)+1)}
 return [...counts].map(([reason,count])=>({reason,count}))
}
