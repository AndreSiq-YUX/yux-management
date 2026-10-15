import type {RadarCandidateRecord} from '@/types/radar'
import type {RadarResearchQuality} from '@/types/radarResearch'
import {buildRadarPresenceSummary} from './radarPresenceSummary'
export const radarReviewQueueLabels={ready_for_review:'Pronta para revisão',missing_contact:'Falta contato útil',identity_pending:'Identidade pendente',qualification_pending:'Qualificação pendente',operational_block:'Aguardando liberação',not_target:'Fora do perfil'} as const
export function radarReviewQueue(candidate:RadarCandidateRecord,revision:number):keyof typeof radarReviewQueueLabels {
  const data=candidate.normalizedPayload,quality=Number(data.researchRevision)===revision?data.researchQuality as RadarResearchQuality|undefined:undefined
  if(data.targetStatus==='not_target')return'not_target'
  if(!quality?.readyForReview&&Array.isArray(data.researchLimitations)&&data.researchLimitations.some(value=>typeof value==='string'&&/source_limit|budget_exceeded|credits_insufficient|wallet_missing|previous_request_uncertain|explicit_route_required|service_unavailable/.test(value)))return'operational_block'
  if(data.researchAssociationNeedsReview===true)return'identity_pending'
  if(quality){
    if(quality.identity!=='associated')return'identity_pending'
    if(quality.contactability!=='useful'&&quality.missing?.includes('contact'))return'missing_contact'
    return quality.readyForReview?'ready_for_review':'qualification_pending'
  }
  const summary=buildRadarPresenceSummary(candidate,revision)
  if(!summary.website?.label.includes('Site associado'))return'identity_pending'
  return summary.contacts.some(contact=>contact.association==='confirmed')?'qualification_pending':'missing_contact'
}
