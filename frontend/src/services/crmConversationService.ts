import { crmConversationDataClient } from '@/lib/crmConversationDataClient'
import { scoreConversationLeadMatch } from '@/lib/crm/conversationRules'
import { crmService } from '@/services/crmService'
import { omnichannelService } from '@/services/omnichannelService'
import type { CrmLead } from '@/types/crm'
import type {
  CrmMessageTemplate,
  CrmQuickReply,
  LeadAiFieldSuggestion,
  LeadAiInsight,
  LeadConversationLink,
  LeadConversationMatchMethod,
  LeadResponseSuggestion,
  LeadSlaEvent,
} from '@/types/crmAi'
import type { OmnichannelChannel } from '@/types/omnichannel'

type Nullable<T> = T | null | undefined
type JsonRecord = Record<string, unknown>

const optional = <T>(value: Nullable<T>) => value === null || value === undefined || value === '' ? undefined : value

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: any }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

export interface FindLeadMatchesInput {
  organizationId: string
  crmInstanceId: string
  phone?: string
  email?: string
  name?: string
}

export interface LinkConversationToLeadInput {
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId: string
  channel: OmnichannelChannel
  matchMethod: LeadConversationMatchMethod
  matchScore?: number
  contactPhone?: string
  contactEmail?: string
  linkedBy?: string
}

export interface CreateLeadFromConversationInput {
  organizationId: string
  crmInstanceId: string
  pipelineId: string
  stageId: string
  conversationId: string
  channel: OmnichannelChannel
  name?: string
  email?: string
  phone?: string
  source?: string
  ownerMemberId?: string
  teamId?: string
}

export interface CreateResponseSuggestionInput {
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId: string
  channel: OmnichannelChannel
  body: string
  templateId?: string
  quickReplyId?: string
  aiInsightId?: string
  requiresApproval?: boolean
}

export interface StartHumanHandoffInput {
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId: string
  reason: string
  lockedBy?: string
  expiresAt?: string
}

export interface SendSuggestedReplyInput {
  suggestionId: string
  authorUserId?: string
}

export const buildLeadConversationLinkPayload = (input: LinkConversationToLeadInput) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId,
  lead_id: input.leadId,
  conversation_id: input.conversationId,
  channel: input.channel,
  status: 'linked',
  match_method: input.matchMethod,
  match_score: input.matchScore ?? 100,
  contact_phone: input.contactPhone || null,
  contact_email: input.contactEmail || null,
  linked_by: input.linkedBy || null,
  linked_at: new Date().toISOString(),
})

export const buildLeadFromConversationPayload = (input: CreateLeadFromConversationInput) => {
  const normalizedPhone = input.phone?.replace(/\D/g, '') || ''
  const fallbackEmail = normalizedPhone
    ? `whatsapp-${normalizedPhone}@lead.local`
    : `conversation-${input.conversationId}@lead.local`

  return {
    organization_id: input.organizationId,
    crm_instance_id: input.crmInstanceId,
    pipeline_id: input.pipelineId,
    stage_id: input.stageId,
    team_id: input.teamId || null,
    owner_member_id: input.ownerMemberId || null,
    name: input.name?.trim() || 'Contato sem nome',
    email: input.email?.trim() || fallbackEmail,
    phone: input.phone || null,
    source: input.source || `Omnichannel ${input.channel}`,
    source_kind: 'organic',
    status: 'open',
    score: 0,
    stage: 'NEW',
    assignment_state: input.ownerMemberId ? 'assigned' : 'in_queue',
    assignment_mode: input.ownerMemberId ? 'manual' : 'queue',
    last_assignment_at: input.ownerMemberId ? new Date().toISOString() : null,
    last_activity_at: new Date().toISOString(),
    last_conversation_at: new Date().toISOString(),
    whatsapp_phone: input.channel === 'whatsapp' ? input.phone || null : null,
    whatsapp_opt_in: input.channel === 'whatsapp',
    attribution_context: {
      source: input.source || 'omnichannel',
      channel: input.channel,
      conversationId: input.conversationId,
    },
  }
}

export const buildResponseSuggestionPayload = (input: CreateResponseSuggestionInput) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId,
  lead_id: input.leadId,
  conversation_id: input.conversationId,
  channel: input.channel,
  body: input.body.trim(),
  status: 'draft',
  template_id: input.templateId || null,
  quick_reply_id: input.quickReplyId || null,
  ai_insight_id: input.aiInsightId || null,
  requires_approval: input.requiresApproval ?? true,
})

export const buildHumanHandoffPayload = (input: StartHumanHandoffInput) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId,
  lead_id: input.leadId,
  conversation_id: input.conversationId,
  locked_by: input.lockedBy || null,
  reason: input.reason.trim(),
  active: true,
  expires_at: input.expiresAt || null,
})

export const mapLeadConversationLink = (row: any): LeadConversationLink => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: row.crm_instance_id,
  leadId: row.lead_id,
  conversationId: row.conversation_id,
  channel: row.channel,
  status: row.status,
  matchMethod: row.match_method,
  matchScore: Number(row.match_score || 0),
  contactPhone: optional(row.contact_phone),
  contactEmail: optional(row.contact_email),
  linkedBy: optional(row.linked_by),
  linkedAt: optional(row.linked_at),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapLeadAiInsight = (row: any): LeadAiInsight => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: row.crm_instance_id,
  leadId: row.lead_id,
  conversationId: optional(row.conversation_id),
  aiRunId: optional(row.ai_run_id),
  summary: row.summary,
  intent: optional(row.intent),
  sentiment: row.sentiment,
  urgency: row.urgency,
  objections: row.objections || [],
  risks: row.risks || [],
  nextBestAction: optional(row.next_best_action),
  confidence: Number(row.confidence || 0),
  metadata: row.metadata || {},
  createdAt: row.created_at,
})

export const mapFieldSuggestion = (row: any): LeadAiFieldSuggestion => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: row.crm_instance_id,
  leadId: row.lead_id,
  conversationId: optional(row.conversation_id),
  fieldKey: row.field_key,
  currentValue: row.current_value,
  suggestedValue: row.suggested_value,
  confidence: Number(row.confidence || 0),
  reason: optional(row.reason),
  status: row.status,
  confirmedBy: optional(row.confirmed_by),
  confirmedAt: optional(row.confirmed_at),
  createdAt: row.created_at,
})

export const mapResponseSuggestion = (row: any): LeadResponseSuggestion => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: row.crm_instance_id,
  leadId: row.lead_id,
  conversationId: row.conversation_id,
  channel: row.channel,
  body: row.body,
  status: row.status,
  templateId: optional(row.template_id),
  quickReplyId: optional(row.quick_reply_id),
  aiInsightId: optional(row.ai_insight_id),
  requiresApproval: Boolean(row.requires_approval),
  approvedBy: optional(row.approved_by),
  sentMessageId: optional(row.sent_message_id),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapSlaEvent = (row: any): LeadSlaEvent => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: row.crm_instance_id,
  leadId: row.lead_id,
  conversationId: optional(row.conversation_id),
  type: row.type,
  status: row.status,
  dueAt: row.due_at,
  breachedAt: optional(row.breached_at),
  resolvedAt: optional(row.resolved_at),
  ownerMemberId: optional(row.owner_member_id),
  metadata: row.metadata || {},
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapQuickReply = (row: any): CrmQuickReply => ({
  id: row.id,
  crmInstanceId: row.crm_instance_id,
  label: row.label,
  body: row.body,
  category: optional(row.category),
  channel: optional(row.channel),
  isActive: Boolean(row.is_active),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const mapMessageTemplate = (row: any): CrmMessageTemplate => ({
  id: row.id,
  crmInstanceId: row.crm_instance_id,
  name: row.name,
  channel: row.channel,
  body: row.body,
  status: row.status,
  requiresOptIn: Boolean(row.requires_opt_in),
  category: optional(row.category),
  variables: row.variables || [],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export const crmConversationService = {
  async findLeadMatchesForConversation(input: FindLeadMatchesInput) {
    const data = await requireData<any[]>(
      crmConversationDataClient
        .from('leads')
        .select('*')
        .eq('crm_instance_id', input.crmInstanceId)
        .eq('organization_id', input.organizationId)
        .limit(100),
    )

    return (data || [])
      .map(row => scoreConversationLeadMatch(input, {
        id: row.id,
        organizationId: row.organization_id,
        crmInstanceId: row.crm_instance_id,
        email: row.email,
        phone: row.phone,
        whatsappPhone: row.whatsapp_phone,
        name: row.name,
      }))
      .filter(match => match.score > 0 || match.unsafeReason)
      .sort((a, b) => b.score - a.score)
  },

  async linkConversationToLead(input: LinkConversationToLeadInput) {
    const payload = buildLeadConversationLinkPayload(input)
    const link = await requireData<any>(
      crmConversationDataClient
        .from('lead_conversation_links')
        .insert(payload)
        .select()
        .single(),
    )

    await requireData(
      crmConversationDataClient
        .from('conversations')
        .update({ lead_id: input.leadId, updated_at: new Date().toISOString() })
        .eq('id', input.conversationId)
        .select('id')
        .single(),
    )

    await requireData(
      crmConversationDataClient
        .from('leads')
        .update({ last_conversation_at: payload.linked_at, last_activity_at: payload.linked_at })
        .eq('id', input.leadId)
        .select('id')
        .single(),
    )

    return mapLeadConversationLink(link)
  },

  async createLeadFromConversation(input: CreateLeadFromConversationInput) {
    const payload = buildLeadFromConversationPayload(input)
    const lead = await requireData<any>(crmConversationDataClient.from('leads').insert(payload).select().single())
    await this.linkConversationToLead({
      organizationId: input.organizationId,
      crmInstanceId: input.crmInstanceId,
      leadId: lead.id,
      conversationId: input.conversationId,
      channel: input.channel,
      matchMethod: 'webchat',
      matchScore: 100,
      contactPhone: input.phone,
      contactEmail: input.email,
    })
    return crmService.getLeadsForInstance(input.crmInstanceId).then(leads => leads.find(item => item.id === lead.id) as CrmLead)
  },

  async getLeadConversations(leadId: string) {
    const data = await requireData<any[]>(
      crmConversationDataClient
        .from('lead_conversation_links')
        .select('*')
        .eq('lead_id', leadId)
        .neq('status', 'archived')
        .order('updated_at', { ascending: false }),
    )
    const conversationIds = [...new Set((data || []).map(row => row.conversation_id).filter(Boolean))]
    const conversations = conversationIds.length
      ? await requireData<any[]>(
        crmConversationDataClient
          .from('conversations')
          .select('*')
          .in('id', conversationIds),
      )
      : []
    const conversationsById = new Map((conversations || []).map(conversation => [conversation.id, conversation]))

    return (data || []).map(row => ({
      ...mapLeadConversationLink(row),
      conversation: conversationsById.get(row.conversation_id),
    }))
  },

  async getLeadAiInsights(leadId: string) {
    const [insights, fieldSuggestions, responseSuggestions, slaEvents, quickReplies, templates] = await Promise.all([
      requireData<any[]>(crmConversationDataClient.from('lead_ai_insights').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })),
      requireData<any[]>(crmConversationDataClient.from('lead_ai_field_suggestions').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })),
      requireData<any[]>(crmConversationDataClient.from('lead_response_suggestions').select('*').eq('lead_id', leadId).order('updated_at', { ascending: false })),
      requireData<any[]>(crmConversationDataClient.from('lead_sla_events').select('*').eq('lead_id', leadId).order('due_at', { ascending: true })),
      requireData<any[]>(crmConversationDataClient.from('crm_quick_replies').select('*').eq('is_active', true).order('label')),
      requireData<any[]>(crmConversationDataClient.from('crm_message_templates').select('*').eq('status', 'active').order('name')),
    ])

    return {
      insights: insights.map(mapLeadAiInsight),
      fieldSuggestions: fieldSuggestions.map(mapFieldSuggestion),
      responseSuggestions: responseSuggestions.map(mapResponseSuggestion),
      slaEvents: slaEvents.map(mapSlaEvent),
      quickReplies: quickReplies.map(mapQuickReply),
      templates: templates.map(mapMessageTemplate),
    }
  },

  async confirmAiFieldSuggestion(suggestionId: string, confirmedBy?: string) {
    const confirmedAt = new Date().toISOString()
    const suggestion = await requireData<any>(
      crmConversationDataClient
        .from('lead_ai_field_suggestions')
        .update({ status: 'confirmed', confirmed_by: confirmedBy || null, confirmed_at: confirmedAt })
        .eq('id', suggestionId)
        .select()
        .single(),
    )

    const mapped = mapFieldSuggestion(suggestion)
    await requireData(
      crmConversationDataClient
        .from('leads')
        .update({ [mapped.fieldKey]: mapped.suggestedValue, updated_at: confirmedAt })
        .eq('id', mapped.leadId)
        .select('id')
        .single(),
    )
    return mapped
  },

  async createResponseSuggestion(input: CreateResponseSuggestionInput) {
    const data = await requireData<any>(
      crmConversationDataClient
        .from('lead_response_suggestions')
        .insert(buildResponseSuggestionPayload(input))
        .select()
        .single(),
    )
    return mapResponseSuggestion(data)
  },

  async sendSuggestedReply(input: SendSuggestedReplyInput) {
    const suggestion = mapResponseSuggestion(await requireData<any>(
      crmConversationDataClient
        .from('lead_response_suggestions')
        .select('*')
        .eq('id', input.suggestionId)
        .single(),
    ))

    const message = await omnichannelService.sendHumanReply({
      conversationId: suggestion.conversationId,
      body: suggestion.body,
      authorUserId: input.authorUserId,
      metadata: { crmResponseSuggestionId: suggestion.id } satisfies JsonRecord,
    })

    const updated = await requireData<any>(
      crmConversationDataClient
        .from('lead_response_suggestions')
        .update({
          status: 'sent',
          approved_by: input.authorUserId || null,
          sent_message_id: message.id,
        })
        .eq('id', suggestion.id)
        .select()
        .single(),
    )

    return mapResponseSuggestion(updated)
  },

  async startHumanHandoff(input: StartHumanHandoffInput) {
    const lock = await requireData<any>(
      crmConversationDataClient
        .from('lead_handoff_locks')
        .insert(buildHumanHandoffPayload(input))
        .select()
        .single(),
    )

    await omnichannelService.handoffConversation({
      conversationId: input.conversationId,
      trigger: 'crm_handoff',
      outcome: { reason: input.reason },
      assignedByUserId: input.lockedBy,
    })

    return lock
  },

  async releaseHumanHandoff(lockId: string) {
    const data = await requireData<any>(
      crmConversationDataClient
        .from('lead_handoff_locks')
        .update({ active: false, released_at: new Date().toISOString() })
        .eq('id', lockId)
        .select()
        .single(),
    )
    return data
  },
}
