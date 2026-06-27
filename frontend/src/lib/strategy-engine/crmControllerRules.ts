import type { CrmControllerLeadLike } from '@/types/strategyEngine'

export type CrmControllerRecommendationType =
  | 'follow_up_task'
  | 'stage_correction'
  | 'objection_capture'
  | 'proposal_follow_up'
  | 'revenue_recovery_sequence'
  | 'human_review'
  | 'do_not_pursue'

const opportunityStages = new Set(['raised_hand', 'qualified_opportunity', 'almost_customer'])
const lifecycleStages = new Set(['first_purchase_customer', 'recurring_customer', 'ex_customer', 'non_customer'])

function daysSince(dateValue?: string) {
  if (!dateValue) return Number.POSITIVE_INFINITY
  const time = new Date(dateValue).getTime()
  if (!Number.isFinite(time)) return Number.POSITIVE_INFINITY
  return Math.floor((Date.now() - time) / 86_400_000)
}

export function detectStaleLead(lead: CrmControllerLeadLike, thresholdDays = 3) {
  if (lead.status === 'won' || lead.status === 'lost' || lead.fitStatus === 'bad_fit') return false
  const lastTouch = lead.lastMeaningfulTouchAt || lead.lastConversationAt || lead.lastActivityAt
  return daysSince(lastTouch) >= thresholdDays
}

export function detectMissingNextAction(lead: CrmControllerLeadLike) {
  if (lead.fitStatus === 'bad_fit' || lead.status === 'won' || lead.status === 'lost') return false
  return !lead.nextFollowUpAt
}

export function detectStageMismatch(lead: CrmControllerLeadLike) {
  const stage = lead.commercialStage
  if (!stage) return false
  if (lead.fitStatus === 'bad_fit' && stage !== 'bad_fit') return true
  if (lead.status === 'won' && !lifecycleStages.has(stage)) return true
  if ((lead.temperature === 'hot' || lead.urgency === 'high') && (stage === 'lead_cold' || stage === 'lead_warm')) return true
  return false
}

export function recommendCrmNextAction(
  lead: CrmControllerLeadLike,
  metrics: { stuckOpportunityValue?: number; inactiveDays?: number } = {},
  objections: string[] = lead.objections || [],
) {
  if (lead.fitStatus === 'bad_fit' || lead.commercialStage === 'bad_fit') {
    return {
      type: 'do_not_pursue' as CrmControllerRecommendationType,
      priority: 'low',
      action: 'Registrar bad fit e evitar follow-up agressivo.',
      owner: 'crm_controller',
    }
  }

  if (detectStageMismatch(lead)) {
    return {
      type: 'stage_correction' as CrmControllerRecommendationType,
      priority: 'high',
      action: 'Revisar estágio comercial antes de acionar cadência.',
      owner: 'crm_controller',
    }
  }

  if (objections.length > 0 || lead.mainObjection) {
    return {
      type: 'objection_capture' as CrmControllerRecommendationType,
      priority: lead.commercialStage === 'almost_customer' ? 'high' : 'medium',
      action: 'Registrar objeção estruturada e acionar playbook comercial.',
      owner: 'ai_closer',
    }
  }

  if (lead.commercialStage === 'almost_customer') {
    return {
      type: 'proposal_follow_up' as CrmControllerRecommendationType,
      priority: 'high',
      action: 'Criar follow-up de proposta com próximo passo claro.',
      owner: 'ai_closer',
    }
  }

  if (lead.commercialStage === 'ex_customer' || lead.commercialStage === 'non_customer' || (metrics.inactiveDays || 0) >= 90) {
    return {
      type: 'revenue_recovery_sequence' as CrmControllerRecommendationType,
      priority: metrics.stuckOpportunityValue && metrics.stuckOpportunityValue > 30000 ? 'high' : 'medium',
      action: 'Iniciar sequência de recuperação de receita.',
      owner: 'revenue_recovery',
    }
  }

  if (detectMissingNextAction(lead) || (lead.commercialStage && opportunityStages.has(lead.commercialStage))) {
    return {
      type: 'follow_up_task' as CrmControllerRecommendationType,
      priority: lead.commercialStage === 'raised_hand' ? 'high' : 'medium',
      action: 'Criar tarefa de follow-up e confirmar próximo passo.',
      owner: 'crm_controller',
    }
  }

  return {
    type: 'human_review' as CrmControllerRecommendationType,
    priority: 'medium',
    action: 'Revisar manualmente histórico e dados do lead.',
    owner: 'crm_controller',
  }
}

export function buildCrmControllerRecommendation(
  lead: CrmControllerLeadLike,
  contextPack: { concept_cards?: Array<{ id?: string }>; context_hash?: string } = {},
) {
  const recommendation = recommendCrmNextAction(lead)
  return {
    objective: 'Corrigir gargalo comercial no CRM',
    audience: lead.id,
    stage: lead.commercialStage || 'lead_warm',
    action: recommendation.action,
    channel: 'crm',
    owner: recommendation.owner,
    metric: recommendation.type === 'revenue_recovery_sequence' ? 'recoverable_value' : 'next_action_sla',
    nextStep: recommendation.action,
    confidence: recommendation.priority === 'high' ? 0.82 : 0.64,
    requiresApproval: recommendation.owner !== 'crm_controller',
    supportingCards: (contextPack.concept_cards || []).map(card => card.id).filter(Boolean),
    metadata: {
      recommendationType: recommendation.type,
      priority: recommendation.priority,
      contextHash: contextPack.context_hash,
    },
  }
}
