import type { ObjectionCategoryKey, StrategyVisibility } from '@/types/strategyEngine'

export interface ObjectionEventLike {
  categoryKey: ObjectionCategoryKey | string
  repeatedCount?: number
  sourceCount?: number
  visibility?: StrategyVisibility
  rawText?: string
}

const patterns: Array<{ category: ObjectionCategoryKey; terms: RegExp[] }> = [
  { category: 'price', terms: [/caro/i, /pre[cç]o/i, /or[cç]amento/i, /sem verba/i, /desconto/i] },
  { category: 'timing', terms: [/agora n[aã]o/i, /mais pra frente/i, /pr[oó]ximo m[eê]s/i, /sem tempo/i] },
  { category: 'trust', terms: [/confian/i, /case/i, /garantia/i, /prova/i, /depoimento/i] },
  { category: 'authority', terms: [/s[oó]cio/i, /diretor/i, /aprovar/i, /decisor/i, /financeiro/i] },
  { category: 'urgency', terms: [/n[aã]o tenho pressa/i, /vou pensar/i, /depois vejo/i] },
  { category: 'product_fit', terms: [/serve para/i, /funciona para/i, /n[aã]o sei se/i, /meu caso/i] },
  { category: 'competitor', terms: [/concorrente/i, /outra empresa/i, /fornecedor atual/i, /j[aá] tenho/i] },
  { category: 'implementation_effort', terms: [/implementar/i, /trabalho/i, /complexo/i, /demora/i, /equipe/i] },
  { category: 'unclear_value', terms: [/valor/i, /retorno/i, /roi/i, /benef[ií]cio/i, /entendi/i] },
  { category: 'no_response', terms: [/sem resposta/i, /n[aã]o respondeu/i, /sumiu/i, /sil[eê]ncio/i] },
]

const playbookActions: Record<ObjectionCategoryKey, string[]> = {
  price: ['offer', 'copy', 'sales_script', 'proof'],
  timing: ['follow_up_sequence', 'implication_question', 'crm_task'],
  trust: ['case_study', 'testimonial', 'risk_reversal'],
  authority: ['decision_map', 'stakeholder_material', 'meeting_with_decider'],
  urgency: ['cost_of_inaction', 'deadline_next_step', 'priority_frame'],
  product_fit: ['diagnosis', 'scope_adjustment', 'use_case_content'],
  competitor: ['ethical_comparison', 'proof_points', 'differentiation_script'],
  implementation_effort: ['implementation_roadmap', 'onboarding_offer', 'friction_reduction'],
  unclear_value: ['value_proposition', 'roi_argument', 'landing_page_copy'],
  no_response: ['follow_up_sequence', 'revenue_recovery', 'loss_reason_survey'],
}

export function classifyObjection(rawText: string): ObjectionCategoryKey {
  const text = rawText.trim()
  if (!text) return 'no_response'
  return patterns.find(pattern => pattern.terms.some(term => term.test(text)))?.category || 'unclear_value'
}

export function mapObjectionToPlaybookAction(category: ObjectionCategoryKey | string) {
  const normalized = (category in playbookActions ? category : 'unclear_value') as ObjectionCategoryKey
  return {
    category: normalized,
    actions: playbookActions[normalized],
    clientSafe: playbookActions[normalized].filter(action => !action.includes('internal')),
  }
}

export function shouldCreateOfferImprovementSuggestion(event: ObjectionEventLike) {
  const repeatedCount = event.repeatedCount ?? event.sourceCount ?? 1
  return repeatedCount >= 3 && event.categoryKey !== 'no_response'
}

export function shouldNotifyMarketingStrategist(event: ObjectionEventLike) {
  return ['price', 'trust', 'competitor', 'unclear_value', 'product_fit'].includes(event.categoryKey)
    || shouldCreateOfferImprovementSuggestion(event)
}

export function sanitizeClientSafePlaybook(item: { visibility?: StrategyVisibility; sourceDetails?: string; [key: string]: unknown }) {
  if (item.visibility !== 'client_safe') {
    const { sourceDetails: _sourceDetails, ...rest } = item
    return { ...rest, visibility: 'client_safe' as const }
  }
  return item
}
