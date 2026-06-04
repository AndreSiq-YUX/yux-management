import type { OmnichannelChannel, ConversationSentiment } from './omnichannel'

export type LeadConversationLinkStatus = 'suggested' | 'linked' | 'rejected' | 'archived'
export type LeadConversationMatchMethod = 'phone' | 'email' | 'manual' | 'ai' | 'webchat'
export type LeadAiUrgency = 'high' | 'medium' | 'low' | 'none'
export type LeadAiSuggestionStatus = 'pending' | 'confirmed' | 'rejected' | 'expired'
export type LeadResponseSuggestionStatus = 'draft' | 'approved' | 'sent' | 'rejected'
export type LeadSlaEventType = 'first_response' | 'follow_up' | 'human_handoff' | 'stale_conversation'
export type LeadSlaEventStatus = 'open' | 'breached' | 'resolved' | 'cancelled'
export type CrmMessageTemplateStatus = 'active' | 'paused' | 'archived'

export interface LeadConversationLink {
  id: string
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId: string
  channel: OmnichannelChannel
  status: LeadConversationLinkStatus
  matchMethod: LeadConversationMatchMethod
  matchScore: number
  contactPhone?: string
  contactEmail?: string
  linkedBy?: string
  linkedAt?: string
  createdAt: string
  updatedAt: string
}

export interface LeadAiInsight {
  id: string
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId?: string
  aiRunId?: string
  summary: string
  intent?: string
  sentiment: ConversationSentiment | 'unknown'
  urgency: LeadAiUrgency
  objections: string[]
  risks: string[]
  nextBestAction?: string
  confidence: number
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface LeadAiFieldSuggestion {
  id: string
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId?: string
  fieldKey: string
  currentValue?: unknown
  suggestedValue: unknown
  confidence: number
  reason?: string
  status: LeadAiSuggestionStatus
  confirmedBy?: string
  confirmedAt?: string
  createdAt: string
}

export interface LeadResponseSuggestion {
  id: string
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId: string
  channel: OmnichannelChannel
  body: string
  status: LeadResponseSuggestionStatus
  templateId?: string
  quickReplyId?: string
  aiInsightId?: string
  requiresApproval: boolean
  approvedBy?: string
  sentMessageId?: string
  createdAt: string
  updatedAt: string
}

export interface LeadSlaEvent {
  id: string
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId?: string
  type: LeadSlaEventType
  status: LeadSlaEventStatus
  dueAt: string
  breachedAt?: string
  resolvedAt?: string
  ownerMemberId?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface LeadHandoffLock {
  id: string
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId: string
  lockedBy?: string
  reason: string
  active: boolean
  expiresAt?: string
  createdAt: string
  releasedAt?: string
}

export interface CrmQuickReply {
  id: string
  crmInstanceId: string
  label: string
  body: string
  category?: string
  channel?: OmnichannelChannel
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CrmMessageTemplate {
  id: string
  crmInstanceId: string
  name: string
  channel: OmnichannelChannel
  body: string
  status: CrmMessageTemplateStatus
  requiresOptIn: boolean
  category?: string
  variables: string[]
  createdAt: string
  updatedAt: string
}

export interface LeadFieldPatch {
  fieldKey: string
  value: unknown
  suggestionId: string
}
