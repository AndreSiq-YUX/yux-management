import type { ConversationStatus, ResponseMode } from '@/types/omnichannel'
import type { LeadAiFieldSuggestion, LeadFieldPatch } from '@/types/crmAi'

export interface LeadMatchCandidate {
  id: string
  organizationId: string
  crmInstanceId?: string
  email?: string
  phone?: string
  whatsappPhone?: string
  name?: string
}

export interface ConversationContactCandidate {
  organizationId: string
  crmInstanceId: string
  email?: string
  phone?: string
  name?: string
}

export interface LeadMatchScore {
  leadId: string
  score: number
  reasons: string[]
  safeToAutoLink: boolean
  unsafeReason?: 'organization_mismatch' | 'crm_instance_mismatch'
}

export interface TemplateSendContext {
  channel: string
  requiresOptIn?: boolean
  whatsappOptIn?: boolean
  optedOut?: boolean
  templateStatus?: string
}

export interface CreateLeadDecisionInput {
  contact: Pick<ConversationContactCandidate, 'email' | 'phone' | 'name'>
  matches: LeadMatchScore[]
  allowAutoCreate?: boolean
}

export interface HandoffPauseContext {
  responseMode?: ResponseMode
  status?: ConversationStatus
  activeHandoffLock?: boolean
  assignedUserId?: string
}

const normalizeText = (value?: string | null) => (value || '').trim().toLowerCase()

export const normalizePhoneForLeadMatch = (value?: string | null) => {
  const digits = (value || '').replace(/\D/g, '')
  const withoutInternationalPrefix = digits.startsWith('00') ? digits.slice(2) : digits

  if (withoutInternationalPrefix.length === 10 || withoutInternationalPrefix.length === 11) {
    return `55${withoutInternationalPrefix}`
  }

  return withoutInternationalPrefix
}

export const scoreConversationLeadMatch = (
  conversation: ConversationContactCandidate,
  lead: LeadMatchCandidate,
): LeadMatchScore => {
  if (conversation.organizationId !== lead.organizationId) {
    return { leadId: lead.id, score: 0, reasons: [], safeToAutoLink: false, unsafeReason: 'organization_mismatch' }
  }

  if (lead.crmInstanceId && conversation.crmInstanceId !== lead.crmInstanceId) {
    return { leadId: lead.id, score: 0, reasons: [], safeToAutoLink: false, unsafeReason: 'crm_instance_mismatch' }
  }

  let score = 0
  const reasons: string[] = []
  const contactPhone = normalizePhoneForLeadMatch(conversation.phone)
  const leadPhones = [lead.phone, lead.whatsappPhone].map(normalizePhoneForLeadMatch).filter(Boolean)
  const emailMatches = Boolean(conversation.email && normalizeText(conversation.email) === normalizeText(lead.email))
  const phoneMatches = Boolean(contactPhone && leadPhones.includes(contactPhone))

  if (phoneMatches) {
    score += 90
    reasons.push('phone_match')
  }

  if (emailMatches) {
    score += 70
    reasons.push('email_match')
  }

  if (conversation.name && lead.name && normalizeText(conversation.name) === normalizeText(lead.name)) {
    score += 10
    reasons.push('name_match')
  }

  return {
    leadId: lead.id,
    score: Math.min(score, 100),
    reasons,
    safeToAutoLink: phoneMatches || (emailMatches && score >= 70),
  }
}

export const shouldCreateLeadFromConversation = (input: CreateLeadDecisionInput) => {
  if (input.allowAutoCreate === false) return false
  if (!input.contact.email && !input.contact.phone && !input.contact.name) return false
  return input.matches.every(match => !match.safeToAutoLink && match.score < 70)
}

export const shouldPauseAutomationForHuman = (context: HandoffPauseContext) => (
  Boolean(context.activeHandoffLock) ||
  context.responseMode === 'manual' ||
  context.status === 'waiting_human' ||
  context.status === 'assigned' ||
  Boolean(context.assignedUserId)
)

export const isSlaBreached = (
  event: { dueAt?: string; resolvedAt?: string; status?: string },
  now = new Date(),
) => {
  if (!event.dueAt || event.resolvedAt || event.status === 'resolved' || event.status === 'cancelled') return false
  const dueAt = new Date(event.dueAt)
  if (Number.isNaN(dueAt.getTime())) return false
  return dueAt.getTime() <= now.getTime()
}

export const canSendTemplate = (context: TemplateSendContext) => {
  if (context.templateStatus && context.templateStatus !== 'active') return false
  if (context.optedOut) return false
  if (context.channel === 'whatsapp' && context.requiresOptIn && !context.whatsappOptIn) return false
  return true
}

export const buildAiFieldPatch = (
  suggestions: LeadAiFieldSuggestion[],
  confirmedSuggestionIds: string[],
): LeadFieldPatch[] => {
  const confirmed = new Set(confirmedSuggestionIds)

  return suggestions
    .filter(suggestion => suggestion.status === 'confirmed' || confirmed.has(suggestion.id))
    .map(suggestion => ({
      suggestionId: suggestion.id,
      fieldKey: suggestion.fieldKey,
      value: suggestion.suggestedValue,
    }))
}
