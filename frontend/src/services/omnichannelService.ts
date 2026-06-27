import { apiRequest } from '@/lib/apiClient'
import type {
  ConversationStatus,
  DeliveryStatus,
  MessageAuthor,
  MessageDirection,
  OmnichannelChannel,
  ProviderTokenState,
  ProviderVerifyState,
  ResponseMode,
} from '@/types/omnichannel'

type JsonRecord = Record<string, unknown>
type Nullable<T> = T | null | undefined

export interface OmnichannelConversationFilters {
  organizationId?: string | null
  channel?: OmnichannelChannel | '' | null
  status?: ConversationStatus | '' | null
  queueId?: string | null
  teamId?: string | null
  assignedUserId?: string | null
  sla?: 'overdue' | 'due_soon' | '' | null
  tag?: string | null
  handoff?: boolean | null
}

export interface OmnichannelContactSummary {
  id: string
  displayName: string
  email?: string
  phone?: string
  leadId?: string
  clientId?: string
}

export interface OmnichannelConnectionSummary {
  id: string
  channel: OmnichannelChannel
  name: string
  adapterKey?: string
  isActive: boolean
  providerAccountId?: string
  phoneNumberId?: string
  providerVerifyState?: ProviderVerifyState
  tokenState?: ProviderTokenState
  lastProviderSyncAt?: string
  protectedMetadataReferences?: JsonRecord
  health?: {
    state: 'healthy' | 'warning' | 'blocked' | 'inactive'
    label: string
  }
}

export interface OmnichannelConversationSummary {
  id: string
  organizationId: string
  contactId: string
  connectionId?: string
  channel: OmnichannelChannel
  status: ConversationStatus
  responseMode: ResponseMode
  queueId?: string
  teamId?: string
  assignedUserId?: string
  leadId?: string
  subject?: string
  summary?: string
  classification?: string
  sentiment?: string
  commercialIntent?: string
  schedulingIntent?: string
  lastMessageAt?: string
  slaDeadlineAt?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
  contact?: OmnichannelContactSummary
  connection?: OmnichannelConnectionSummary
  queue?: { id: string; name: string }
  team?: { id: string; name: string }
  assignedUser?: { id: string; name: string }
  tags: string[]
}

export interface PortalOmnichannelConversationSummary {
  id: string
  organizationId: string
  channel: OmnichannelChannel
  status: ConversationStatus
  responseMode: ResponseMode
  subject?: string
  summary?: string
  classification?: string
  sentiment?: string
  lastMessageAt?: string
  slaDeadlineAt?: string
  resolvedAt?: string
  createdAt: string
  updatedAt: string
  contact?: OmnichannelContactSummary
  queue?: { id: string; name: string }
  team?: { id: string; name: string }
  assignedUser?: { id: string; name: string }
  tags: string[]
}

export interface OmnichannelAttachmentView {
  id: string
  messageId: string
  storagePath: string
  filename: string
  mimeType: string
  byteSize: number
  retentionDeadlineAt?: string
  createdAt: string
  updatedAt: string
}

export interface OmnichannelMessageView {
  id: string
  conversationId: string
  connectionId?: string
  direction: MessageDirection
  authorType: MessageAuthor
  authorUserId?: string
  contentType: string
  body?: string
  externalMessageId?: string
  deliveryStatus: DeliveryStatus
  metadata: JsonRecord
  createdAt: string
  updatedAt: string
  attachments: OmnichannelAttachmentView[]
}

export interface OmnichannelAiRunView {
  id: string
  organizationId: string
  conversationId: string
  inboundMessageId?: string
  outboundMessageId?: string
  logicalProvider?: string
  model?: string
  status: string
  inputTokens: number
  outputTokens: number
  estimatedCost: number
  latencyMs: number
  fallbackUsed: boolean
  protectedErrorText?: string
  metadata: JsonRecord
  createdAt: string
  updatedAt: string
}

export interface OmnichannelKnowledgePublicationView {
  id: string
  organizationId: string
  entryId: string
  bodySnapshot: string
  publisherUserId?: string
  publishedAt: string
  entry?: {
    id: string
    title: string
    body: string
    status: string
  }
}

const numberValue = (value: number | string | null | undefined) => Number(value || 0)

const optional = <T>(value: Nullable<T>) => value === null || value === undefined || value === '' ? undefined : value

const cleanPayload = (payload: Record<string, unknown>) => Object.fromEntries(
  Object.entries(payload).filter(([, value]) => value !== undefined),
)

const summaryByName = (row: Nullable<{ id?: string; name?: string | null }>) => (
  row?.id ? { id: row.id, name: row.name || '' } : undefined
)

export function deriveProviderHealth(input: {
  isActive: boolean
  channel: OmnichannelChannel
  phoneNumberId?: string
  providerVerifyState?: ProviderVerifyState
  tokenState?: ProviderTokenState
}): OmnichannelConnectionSummary['health'] {
  if (!input.isActive) return { state: 'inactive', label: 'Provider inativo' }
  if (input.channel !== 'whatsapp') return { state: 'healthy', label: 'Provider padrao' }
  if (!input.phoneNumberId || input.tokenState === 'not_configured') return { state: 'warning', label: 'WhatsApp nao configurado' }
  if (input.tokenState === 'needs_reauth') return { state: 'blocked', label: 'WhatsApp precisa reautenticar' }
  if (input.tokenState === 'failed') return { state: 'blocked', label: 'WhatsApp com falha' }
  if (input.tokenState === 'stale' || input.providerVerifyState !== 'verified') return { state: 'warning', label: 'WhatsApp requer revisao' }
  return { state: 'healthy', label: 'WhatsApp conectado' }
}

export function buildOmnichannelFilters(filters: OmnichannelConversationFilters) {
  const output: Record<string, string | boolean> = {}
  if (filters.organizationId) output.organization_id = filters.organizationId
  if (filters.channel) output.channel = filters.channel
  if (filters.status) output.status = filters.status
  if (filters.queueId) output.queue_id = filters.queueId
  if (filters.teamId) output.team_id = filters.teamId
  if (filters.assignedUserId) output.assigned_user_id = filters.assignedUserId
  if (filters.sla) output.sla = filters.sla
  if (filters.tag) output.tag = filters.tag
  if (filters.handoff !== null && filters.handoff !== undefined) output.handoff = filters.handoff
  return output
}

export function mapOmnichannelConversation(row: any): OmnichannelConversationSummary {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contactId: row.contact_id,
    connectionId: optional(row.connection_id),
    channel: row.channel,
    status: row.status,
    responseMode: row.response_mode,
    queueId: optional(row.queue_id),
    teamId: optional(row.team_id),
    assignedUserId: optional(row.assigned_user_id),
    leadId: optional(row.lead_id),
    subject: optional(row.subject),
    summary: optional(row.summary),
    classification: optional(row.classification),
    sentiment: optional(row.sentiment),
    commercialIntent: optional(row.commercial_intent),
    schedulingIntent: optional(row.scheduling_intent),
    lastMessageAt: optional(row.last_message_at),
    slaDeadlineAt: optional(row.sla_deadline_at),
    resolvedAt: optional(row.resolved_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contact: row.omnichannel_contacts ? {
      id: row.omnichannel_contacts.id,
      displayName: row.omnichannel_contacts.display_name,
      email: optional(row.omnichannel_contacts.email),
      phone: optional(row.omnichannel_contacts.phone),
      leadId: optional(row.omnichannel_contacts.lead_id),
      clientId: optional(row.omnichannel_contacts.client_id),
    } : undefined,
    connection: row.channel_connections ? {
      id: row.channel_connections.id,
      channel: row.channel_connections.channel,
      name: row.channel_connections.name,
      adapterKey: optional(row.channel_connections.adapter_key),
      isActive: Boolean(row.channel_connections.is_active),
      providerAccountId: optional(row.channel_connections.provider_account_id),
      phoneNumberId: optional(row.channel_connections.phone_number_id),
      providerVerifyState: optional(row.channel_connections.provider_verify_state),
      tokenState: optional(row.channel_connections.token_state),
      lastProviderSyncAt: optional(row.channel_connections.last_provider_sync_at),
      protectedMetadataReferences: row.channel_connections.protected_metadata_references || {},
      health: deriveProviderHealth({
        isActive: Boolean(row.channel_connections.is_active),
        channel: row.channel_connections.channel,
        phoneNumberId: optional(row.channel_connections.phone_number_id),
        providerVerifyState: optional(row.channel_connections.provider_verify_state),
        tokenState: optional(row.channel_connections.token_state),
      }),
    } : undefined,
    queue: summaryByName(row.conversation_queues),
    team: summaryByName(row.omnichannel_teams),
    assignedUser: summaryByName(row.users),
    tags: (row.conversation_tags || []).map((tag: any) => tag.tag).filter(Boolean),
  }
}

export function mapPortalConversation(row: any): PortalOmnichannelConversationSummary {
  const conversation = mapOmnichannelConversation(row)
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    channel: conversation.channel,
    status: conversation.status,
    responseMode: conversation.responseMode,
    subject: conversation.subject,
    summary: conversation.summary,
    classification: conversation.classification,
    sentiment: conversation.sentiment,
    lastMessageAt: conversation.lastMessageAt,
    slaDeadlineAt: conversation.slaDeadlineAt,
    resolvedAt: conversation.resolvedAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    contact: conversation.contact,
    queue: conversation.queue,
    team: conversation.team,
    assignedUser: conversation.assignedUser,
    tags: conversation.tags,
  }
}

export function mapOmnichannelAttachment(row: any): OmnichannelAttachmentView {
  return {
    id: row.id,
    messageId: row.message_id,
    storagePath: row.storage_path,
    filename: row.filename,
    mimeType: row.mime_type,
    byteSize: numberValue(row.byte_size),
    retentionDeadlineAt: optional(row.retention_deadline_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapOmnichannelMessage(row: any): OmnichannelMessageView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    connectionId: optional(row.connection_id),
    direction: row.direction,
    authorType: row.author_type,
    authorUserId: optional(row.author_user_id),
    contentType: row.content_type,
    body: optional(row.body),
    externalMessageId: optional(row.external_message_id),
    deliveryStatus: row.delivery_status,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: (row.message_attachments || []).map(mapOmnichannelAttachment),
  }
}

export function mapAiRun(row: any): OmnichannelAiRunView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    inboundMessageId: optional(row.inbound_message_id),
    outboundMessageId: optional(row.outbound_message_id),
    logicalProvider: optional(row.logical_provider),
    model: optional(row.model),
    status: row.status,
    inputTokens: numberValue(row.input_tokens),
    outputTokens: numberValue(row.output_tokens),
    estimatedCost: numberValue(row.estimated_cost),
    latencyMs: numberValue(row.latency_ms),
    fallbackUsed: Boolean(row.fallback_used),
    protectedErrorText: optional(row.protected_error_text),
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapKnowledgePublication(row: any): OmnichannelKnowledgePublicationView {
  return {
    id: row.id,
    organizationId: row.organization_id,
    entryId: row.entry_id,
    bodySnapshot: row.body_snapshot,
    publisherUserId: optional(row.publisher_user_id),
    publishedAt: row.published_at,
    entry: row.knowledge_entries ? structuredClone({
      id: row.knowledge_entries.id,
      title: row.knowledge_entries.title,
      body: row.knowledge_entries.body,
      status: row.knowledge_entries.status,
    }) : undefined,
  }
}

const buildQuery = (params: Record<string, string | boolean | undefined | null>) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

const conversationQuery = (filters: OmnichannelConversationFilters = {}) => buildQuery({
  organizationId: filters.organizationId || undefined,
  channel: filters.channel || undefined,
  status: filters.status || undefined,
  queueId: filters.queueId || undefined,
  teamId: filters.teamId || undefined,
  assignedUserId: filters.assignedUserId || undefined,
  sla: filters.sla || undefined,
  tag: filters.tag || undefined,
  handoff: filters.handoff,
})

export const omnichannelService = {
  async getInternalInbox(filters: OmnichannelConversationFilters = {}) {
    return apiRequest<OmnichannelConversationSummary[]>(`/omnichannel/conversations${conversationQuery(filters)}`)
  },

  async getPortalInbox(filters: OmnichannelConversationFilters = {}) {
    return apiRequest<PortalOmnichannelConversationSummary[]>(`/omnichannel/portal/conversations${conversationQuery(filters)}`)
  },

  async getConversationDetail(conversationId: string, portal = false) {
    return apiRequest<OmnichannelConversationSummary | PortalOmnichannelConversationSummary>(`/omnichannel/conversations/${conversationId}${buildQuery({ portal })}`)
  },

  async getMessages(conversationId: string) {
    return apiRequest<OmnichannelMessageView[]>(`/omnichannel/conversations/${conversationId}/messages`)
  },

  async getConversationTimeline(conversationId: string) {
    return this.getMessages(conversationId)
  },

  async getTeams(organizationId: string) {
    return apiRequest<any[]>(`/omnichannel/teams${buildQuery({ organizationId })}`)
  },

  async getTeamMembers(teamId: string) {
    return apiRequest<any[]>(`/omnichannel/teams/${teamId}/members`)
  },

  async getQueues(organizationId: string) {
    return apiRequest<any[]>(`/omnichannel/queues${buildQuery({ organizationId })}`)
  },

  async getRules(organizationId: string) {
    return apiRequest<any[]>(`/omnichannel/rules${buildQuery({ organizationId })}`)
  },

  async getSettings(organizationId: string) {
    return apiRequest<any>(`/omnichannel/settings${buildQuery({ organizationId })}`)
  },

  async getWidgetConfiguration(organizationId: string) {
    return apiRequest<any[]>(`/omnichannel/widgets${buildQuery({ organizationId })}`)
  },

  async getKnowledgeSources(organizationId: string) {
    return apiRequest<any[]>(`/omnichannel/knowledge-sources${buildQuery({ organizationId })}`)
  },

  async getKnowledgeEntries(organizationId: string) {
    return apiRequest<any[]>(`/omnichannel/knowledge-entries${buildQuery({ organizationId })}`)
  },

  async getKnowledgePublications(organizationId: string) {
    return apiRequest<OmnichannelKnowledgePublicationView[]>(`/omnichannel/knowledge-publications${buildQuery({ organizationId })}`)
  },

  async getInternalMetrics(organizationId: string) {
    return apiRequest<{ aiRuns: OmnichannelAiRunView[]; crmRuns: any[]; outboundRuns: any[] }>(`/omnichannel/metrics${buildQuery({ organizationId })}`)
  },

  async getPortalMetrics(organizationId: string) {
    const conversations = await this.getPortalInbox({ organizationId })
    const byChannel = conversations.reduce<Record<string, number>>((acc, conversation) => {
      acc[conversation.channel] = (acc[conversation.channel] || 0) + 1
      return acc
    }, {})
    return {
      totalConversations: conversations.length,
      openConversations: conversations.filter(conversation => conversation.status !== 'resolved' && conversation.status !== 'archived').length,
      resolvedConversations: conversations.filter(conversation => conversation.status === 'resolved').length,
      byChannel,
    }
  },

  async getWebhookEvents(organizationId: string) {
    return apiRequest<any[]>(`/omnichannel/webhook-events${buildQuery({ organizationId })}`)
  },

  async getOutboundRetryLogs(conversationId: string) {
    return apiRequest<any[]>(`/omnichannel/conversations/${conversationId}/outbound-runs`)
  },

  async sendHumanReply(input: { conversationId: string; connectionId?: string; body: string; authorUserId?: string; metadata?: JsonRecord }) {
    return apiRequest<OmnichannelMessageView>('/omnichannel/messages/human-reply', {
      method: 'POST',
      body: input,
    })
  },

  async approveAssistedSuggestion(messageId: string) {
    return apiRequest(`/omnichannel/messages/${messageId}/approve`, { method: 'POST' })
  },

  async assignConversation(input: { conversationId: string; queueId?: string; teamId?: string; assignedUserId?: string; reason?: string; assignedByUserId?: string }) {
    return apiRequest('/omnichannel/assignments', {
      method: 'POST',
      body: input,
    })
  },

  async reassignConversation(input: { conversationId: string; queueId?: string; teamId?: string; assignedUserId?: string; reason?: string; assignedByUserId?: string }) {
    return this.assignConversation(input)
  },

  async handoffConversation(input: { conversationId: string; trigger: string; ruleId?: string; outcome?: JsonRecord; assignedByUserId?: string }) {
    return apiRequest('/omnichannel/handoff', {
      method: 'POST',
      body: input,
    })
  },

  async resolveConversation(conversationId: string) {
    return apiRequest<OmnichannelConversationSummary>(`/omnichannel/conversations/${conversationId}/resolve`, { method: 'PATCH' })
  },

  async reopenConversation(conversationId: string) {
    return apiRequest<OmnichannelConversationSummary>(`/omnichannel/conversations/${conversationId}/reopen`, { method: 'PATCH' })
  },

  async createTeam(input: { organizationId: string; name: string; availabilityMode?: string; isActive?: boolean }) {
    return apiRequest('/omnichannel/teams', { method: 'POST', body: input })
  },

  async updateTeam(id: string, input: { name?: string; availabilityMode?: string; isActive?: boolean }) {
    return apiRequest(`/omnichannel/teams/${id}`, { method: 'PATCH', body: input })
  },

  async createQueue(input: { organizationId: string; teamId?: string; name: string; strategy?: string; slaSettings?: JsonRecord; isActive?: boolean }) {
    return apiRequest('/omnichannel/queues', { method: 'POST', body: input })
  },

  async updateQueue(id: string, input: { teamId?: string | null; name?: string; strategy?: string; slaSettings?: JsonRecord; isActive?: boolean }) {
    return apiRequest(`/omnichannel/queues/${id}`, { method: 'PATCH', body: input })
  },

  async createRule(input: { organizationId: string; name: string; isEnabled?: boolean; priority?: number; combinator?: 'all' | 'any'; conditions?: unknown[]; outcome?: JsonRecord }) {
    return apiRequest('/omnichannel/rules', { method: 'POST', body: input })
  },

  async updateRule(id: string, input: { name?: string; isEnabled?: boolean; priority?: number; combinator?: 'all' | 'any'; conditions?: unknown[]; outcome?: JsonRecord }) {
    return apiRequest(`/omnichannel/rules/${id}`, { method: 'PATCH', body: input })
  },

  async upsertSettings(input: { organizationId: string; defaultResponseMode?: ResponseMode; retentionMonths?: number; attachmentRetentionMonths?: number; anonymizeOnRetention?: boolean; crmSyncFilters?: JsonRecord; businessHours?: JsonRecord; aiLogicalProvider?: string; aiModel?: string; aiTokenPrices?: JsonRecord }) {
    return apiRequest('/omnichannel/settings', { method: 'PUT', body: input })
  },

  async createWidget(input: { organizationId: string; name: string; isActive?: boolean; allowedOrigins?: string[]; branding?: JsonRecord; consentText?: string; initialForm?: JsonRecord }) {
    return apiRequest('/omnichannel/widgets', { method: 'POST', body: input })
  },

  async updateWidget(id: string, input: { name?: string; isActive?: boolean; allowedOrigins?: string[]; branding?: JsonRecord; consentText?: string | null; initialForm?: JsonRecord }) {
    return apiRequest(`/omnichannel/widgets/${id}`, { method: 'PATCH', body: input })
  },

  async createKnowledgeSource(input: { organizationId: string; sourceType: string; name: string; sourceUrl?: string; storagePath?: string; retentionDeadlineAt?: string; status?: string }) {
    return apiRequest('/omnichannel/knowledge-sources', { method: 'POST', body: input })
  },

  async createKnowledgeEntry(input: { organizationId: string; sourceId?: string; title: string; body: string; status?: string; reviewerUserId?: string }) {
    return apiRequest('/omnichannel/knowledge-entries', { method: 'POST', body: input })
  },

  async updateKnowledgeEntry(id: string, input: { title?: string; body?: string; status?: string; reviewerUserId?: string | null }) {
    return apiRequest(`/omnichannel/knowledge-entries/${id}`, { method: 'PATCH', body: input })
  },

  async submitKnowledgeForReview(entryId: string) {
    return this.updateKnowledgeEntry(entryId, { status: 'review' })
  },

  async publishKnowledgeEntry(input: { organizationId: string; entryId: string; bodySnapshot: string; publisherUserId?: string }) {
    return apiRequest<OmnichannelKnowledgePublicationView>('/omnichannel/knowledge-publications', { method: 'POST', body: input })
  },

  async simulateChannelEvent(body: JsonRecord) {
    return apiRequest('/omnichannel/simulate-channel-event', { method: 'POST', body })
  },

  async retryOutboundMessage(messageId: string) {
    return apiRequest(`/omnichannel/messages/${messageId}/retry`, { method: 'POST' })
  },

  async requestScheduling(body: JsonRecord) {
    return apiRequest('/omnichannel/scheduling', { method: 'POST', body })
  },
}
