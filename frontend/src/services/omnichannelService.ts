import { supabase } from '@/lib/supabase'
import type {
  ConversationStatus,
  DeliveryStatus,
  MessageAuthor,
  MessageDirection,
  OmnichannelChannel,
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

const conversationSelect = `
  *,
  omnichannel_contacts(id, display_name, email, phone, lead_id, client_id),
  channel_connections(id, channel, name, adapter_key, is_active),
  conversation_queues(id, name),
  omnichannel_teams(id, name),
  users(id, name),
  conversation_tags(tag)
`

const applyConversationFilters = (query: any, filters: OmnichannelConversationFilters) => {
  const normalized = buildOmnichannelFilters(filters)
  let next = query
  if (normalized.organization_id) next = next.eq('organization_id', normalized.organization_id)
  if (normalized.channel) next = next.eq('channel', normalized.channel)
  if (normalized.status) next = next.eq('status', normalized.status)
  if (normalized.queue_id) next = next.eq('queue_id', normalized.queue_id)
  if (normalized.team_id) next = next.eq('team_id', normalized.team_id)
  if (normalized.assigned_user_id) next = next.eq('assigned_user_id', normalized.assigned_user_id)
  if (normalized.sla === 'overdue') next = next.lt('sla_deadline_at', new Date().toISOString()).neq('status', 'resolved')
  if (normalized.sla === 'due_soon') {
    const soon = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    next = next.gte('sla_deadline_at', new Date().toISOString()).lte('sla_deadline_at', soon).neq('status', 'resolved')
  }
  return next
}

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: any }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

export const omnichannelService = {
  async getInternalInbox(filters: OmnichannelConversationFilters = {}) {
    const query = applyConversationFilters(
      supabase.from('conversations').select(conversationSelect),
      filters,
    ).order('last_message_at', { ascending: false, nullsFirst: false })
    const data = await requireData<any[]>(query)
    return (data || []).map(mapOmnichannelConversation)
  },

  async getPortalInbox(filters: OmnichannelConversationFilters = {}) {
    const query = applyConversationFilters(
      supabase.from('conversations').select(conversationSelect),
      filters,
    ).order('last_message_at', { ascending: false, nullsFirst: false })
    const data = await requireData<any[]>(query)
    return (data || []).map(mapPortalConversation)
  },

  async getConversationDetail(conversationId: string, portal = false) {
    const data = await requireData<any>(
      supabase.from('conversations').select(conversationSelect).eq('id', conversationId).single(),
    )
    return portal ? mapPortalConversation(data) : mapOmnichannelConversation(data)
  },

  async getMessages(conversationId: string) {
    const data = await requireData<any[]>(
      supabase
        .from('messages')
        .select('*, message_attachments(*)')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true }),
    )
    return (data || []).map(mapOmnichannelMessage)
  },

  async getConversationTimeline(conversationId: string) {
    return this.getMessages(conversationId)
  },

  async getTeams(organizationId: string) {
    return requireData<any[]>(
      supabase.from('omnichannel_teams').select('*').eq('organization_id', organizationId).order('name'),
    )
  },

  async getTeamMembers(teamId: string) {
    return requireData<any[]>(
      supabase.from('omnichannel_team_members').select('*, users(id, name)').eq('team_id', teamId).order('priority'),
    )
  },

  async getQueues(organizationId: string) {
    return requireData<any[]>(
      supabase.from('conversation_queues').select('*, omnichannel_teams(id, name)').eq('organization_id', organizationId).order('name'),
    )
  },

  async getRules(organizationId: string) {
    return requireData<any[]>(
      supabase.from('handoff_rules').select('*').eq('organization_id', organizationId).order('priority'),
    )
  },

  async getSettings(organizationId: string) {
    return requireData<any>(
      supabase.from('omnichannel_settings').select('*').eq('organization_id', organizationId).maybeSingle(),
    )
  },

  async getWidgetConfiguration(organizationId: string) {
    return requireData<any[]>(
      supabase.from('webchat_widgets').select('*').eq('organization_id', organizationId).order('name'),
    )
  },

  async getKnowledgeSources(organizationId: string) {
    return requireData<any[]>(
      supabase.from('knowledge_sources').select('*').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    )
  },

  async getKnowledgeEntries(organizationId: string) {
    return requireData<any[]>(
      supabase.from('knowledge_entries').select('*, knowledge_sources(id, name)').eq('organization_id', organizationId).order('updated_at', { ascending: false }),
    )
  },

  async getKnowledgePublications(organizationId: string) {
    const data = await requireData<any[]>(
      supabase
        .from('knowledge_publications')
        .select('*, knowledge_entries(id, title, body, status)')
        .eq('organization_id', organizationId)
        .order('published_at', { ascending: false }),
    )
    return (data || []).map(mapKnowledgePublication)
  },

  async getInternalMetrics(organizationId: string) {
    const [aiRuns, crmRuns, outboundRuns] = await Promise.all([
      requireData<any[]>(supabase.from('ai_message_runs').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })),
      requireData<any[]>(supabase.from('crm_sync_runs').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })),
      requireData<any[]>(supabase.from('outbound_message_runs').select('*').eq('organization_id', organizationId).order('created_at', { ascending: false })),
    ])
    return {
      aiRuns: aiRuns.map(mapAiRun),
      crmRuns,
      outboundRuns,
    }
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
    return requireData<any[]>(
      supabase
        .from('channel_webhook_events')
        .select('*, channel_connections(id, organization_id)')
        .eq('channel_connections.organization_id', organizationId)
        .order('received_at', { ascending: false }),
    )
  },

  async getOutboundRetryLogs(conversationId: string) {
    return requireData<any[]>(
      supabase.from('outbound_message_runs').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: false }),
    )
  },

  async sendHumanReply(input: { conversationId: string; connectionId?: string; body: string; authorUserId?: string; metadata?: JsonRecord }) {
    const data = await requireData<any>(
      supabase.from('messages').insert({
        conversation_id: input.conversationId,
        connection_id: input.connectionId || null,
        direction: 'outbound',
        author_type: 'agent',
        author_user_id: input.authorUserId || null,
        content_type: 'text',
        body: input.body,
        delivery_status: 'queued',
        metadata: input.metadata || {},
      }).select('*, message_attachments(*)').single(),
    )
    await supabase.functions.invoke('dispatch-outbound-message', { body: { messageId: data.id } })
    return mapOmnichannelMessage(data)
  },

  async approveAssistedSuggestion(messageId: string) {
    const { data, error } = await supabase.functions.invoke('dispatch-outbound-message', { body: { messageId } })
    if (error) throw error
    return data
  },

  async assignConversation(input: { conversationId: string; queueId?: string; teamId?: string; assignedUserId?: string; reason?: string; assignedByUserId?: string }) {
    const assignment = await requireData<any>(
      supabase.from('conversation_assignments').insert({
        conversation_id: input.conversationId,
        queue_id: input.queueId || null,
        team_id: input.teamId || null,
        assigned_user_id: input.assignedUserId || null,
        source: 'manual',
        reason: input.reason || null,
        assigned_by_user_id: input.assignedByUserId || null,
      }).select().single(),
    )
    await requireData(
      supabase.from('conversations').update({
        queue_id: input.queueId || null,
        team_id: input.teamId || null,
        assigned_user_id: input.assignedUserId || null,
        status: input.assignedUserId ? 'assigned' : 'waiting_human',
      }).eq('id', input.conversationId).select('id').single(),
    )
    return assignment
  },

  async reassignConversation(input: { conversationId: string; queueId?: string; teamId?: string; assignedUserId?: string; reason?: string; assignedByUserId?: string }) {
    return this.assignConversation(input)
  },

  async handoffConversation(input: { conversationId: string; trigger: string; ruleId?: string; outcome?: JsonRecord; assignedByUserId?: string }) {
    const event = await requireData<any>(
      supabase.from('handoff_events').insert({
        conversation_id: input.conversationId,
        rule_id: input.ruleId || null,
        trigger: input.trigger,
        outcome: input.outcome || {},
      }).select().single(),
    )
    await requireData(supabase.from('conversations').update({ status: 'waiting_human', response_mode: 'manual' }).eq('id', input.conversationId).select('id').single())
    return event
  },

  async resolveConversation(conversationId: string) {
    return requireData<any>(
      supabase.from('conversations').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', conversationId).select(conversationSelect).single(),
    ).then(mapOmnichannelConversation)
  },

  async reopenConversation(conversationId: string) {
    return requireData<any>(
      supabase.from('conversations').update({ status: 'open', resolved_at: null }).eq('id', conversationId).select(conversationSelect).single(),
    ).then(mapOmnichannelConversation)
  },

  async createTeam(input: { organizationId: string; name: string; availabilityMode?: string; isActive?: boolean }) {
    return requireData<any>(supabase.from('omnichannel_teams').insert({
      organization_id: input.organizationId,
      name: input.name,
      availability_mode: input.availabilityMode || 'business_hours',
      is_active: input.isActive ?? true,
    }).select().single())
  },

  async updateTeam(id: string, input: { name?: string; availabilityMode?: string; isActive?: boolean }) {
    return requireData<any>(supabase.from('omnichannel_teams').update(cleanPayload({
      name: input.name,
      availability_mode: input.availabilityMode,
      is_active: input.isActive,
    })).eq('id', id).select().single())
  },

  async createQueue(input: { organizationId: string; teamId?: string; name: string; strategy?: string; slaSettings?: JsonRecord; isActive?: boolean }) {
    return requireData<any>(supabase.from('conversation_queues').insert({
      organization_id: input.organizationId,
      team_id: input.teamId || null,
      name: input.name,
      strategy: input.strategy || 'round_robin',
      sla_settings: input.slaSettings || {},
      is_active: input.isActive ?? true,
    }).select().single())
  },

  async updateQueue(id: string, input: { teamId?: string | null; name?: string; strategy?: string; slaSettings?: JsonRecord; isActive?: boolean }) {
    return requireData<any>(supabase.from('conversation_queues').update(cleanPayload({
      team_id: input.teamId,
      name: input.name,
      strategy: input.strategy,
      sla_settings: input.slaSettings,
      is_active: input.isActive,
    })).eq('id', id).select().single())
  },

  async createRule(input: { organizationId: string; name: string; isEnabled?: boolean; priority?: number; combinator?: 'all' | 'any'; conditions?: unknown[]; outcome?: JsonRecord }) {
    return requireData<any>(supabase.from('handoff_rules').insert({
      organization_id: input.organizationId,
      name: input.name,
      is_enabled: input.isEnabled ?? true,
      priority: input.priority ?? 100,
      combinator: input.combinator || 'all',
      conditions: input.conditions || [],
      outcome: input.outcome || {},
    }).select().single())
  },

  async updateRule(id: string, input: { name?: string; isEnabled?: boolean; priority?: number; combinator?: 'all' | 'any'; conditions?: unknown[]; outcome?: JsonRecord }) {
    return requireData<any>(supabase.from('handoff_rules').update(cleanPayload({
      name: input.name,
      is_enabled: input.isEnabled,
      priority: input.priority,
      combinator: input.combinator,
      conditions: input.conditions,
      outcome: input.outcome,
    })).eq('id', id).select().single())
  },

  async upsertSettings(input: { organizationId: string; defaultResponseMode?: ResponseMode; retentionMonths?: number; attachmentRetentionMonths?: number; anonymizeOnRetention?: boolean; crmSyncFilters?: JsonRecord; businessHours?: JsonRecord; aiLogicalProvider?: string; aiModel?: string; aiTokenPrices?: JsonRecord }) {
    return requireData<any>(supabase.from('omnichannel_settings').upsert({
      organization_id: input.organizationId,
      default_response_mode: input.defaultResponseMode || 'assisted',
      retention_months: input.retentionMonths ?? 12,
      attachment_retention_months: input.attachmentRetentionMonths ?? 12,
      anonymize_on_retention: input.anonymizeOnRetention ?? false,
      crm_sync_filters: input.crmSyncFilters || {},
      business_hours: input.businessHours || {},
      ai_logical_provider: input.aiLogicalProvider || null,
      ai_model: input.aiModel || null,
      ai_token_prices: input.aiTokenPrices || {},
    }, { onConflict: 'organization_id' }).select().single())
  },

  async createWidget(input: { organizationId: string; name: string; isActive?: boolean; allowedOrigins?: string[]; branding?: JsonRecord; consentText?: string; initialForm?: JsonRecord }) {
    return requireData<any>(supabase.from('webchat_widgets').insert({
      organization_id: input.organizationId,
      name: input.name,
      is_active: input.isActive ?? true,
      allowed_origins: input.allowedOrigins || [],
      branding: input.branding || {},
      consent_text: input.consentText || null,
      initial_form: input.initialForm || {},
    }).select().single())
  },

  async updateWidget(id: string, input: { name?: string; isActive?: boolean; allowedOrigins?: string[]; branding?: JsonRecord; consentText?: string | null; initialForm?: JsonRecord }) {
    return requireData<any>(supabase.from('webchat_widgets').update(cleanPayload({
      name: input.name,
      is_active: input.isActive,
      allowed_origins: input.allowedOrigins,
      branding: input.branding,
      consent_text: input.consentText,
      initial_form: input.initialForm,
    })).eq('id', id).select().single())
  },

  async createKnowledgeSource(input: { organizationId: string; sourceType: string; name: string; sourceUrl?: string; storagePath?: string; retentionDeadlineAt?: string; status?: string }) {
    return requireData<any>(supabase.from('knowledge_sources').insert({
      organization_id: input.organizationId,
      source_type: input.sourceType,
      name: input.name,
      source_url: input.sourceUrl || null,
      storage_path: input.storagePath || null,
      retention_deadline_at: input.retentionDeadlineAt || null,
      status: input.status || 'draft',
    }).select().single())
  },

  async createKnowledgeEntry(input: { organizationId: string; sourceId?: string; title: string; body: string; status?: string; reviewerUserId?: string }) {
    return requireData<any>(supabase.from('knowledge_entries').insert({
      organization_id: input.organizationId,
      source_id: input.sourceId || null,
      title: input.title,
      body: input.body,
      status: input.status || 'draft',
      reviewer_user_id: input.reviewerUserId || null,
    }).select().single())
  },

  async updateKnowledgeEntry(id: string, input: { title?: string; body?: string; status?: string; reviewerUserId?: string | null }) {
    return requireData<any>(supabase.from('knowledge_entries').update(cleanPayload({
      title: input.title,
      body: input.body,
      status: input.status,
      reviewer_user_id: input.reviewerUserId,
      reviewed_at: input.status === 'approved' || input.status === 'published' ? new Date().toISOString() : undefined,
    })).eq('id', id).select().single())
  },

  async submitKnowledgeForReview(entryId: string) {
    return this.updateKnowledgeEntry(entryId, { status: 'review' })
  },

  async publishKnowledgeEntry(input: { organizationId: string; entryId: string; bodySnapshot: string; publisherUserId?: string }) {
    const publication = await requireData<any>(supabase.from('knowledge_publications').insert({
      organization_id: input.organizationId,
      entry_id: input.entryId,
      body_snapshot: input.bodySnapshot,
      publisher_user_id: input.publisherUserId || null,
    }).select('*, knowledge_entries(id, title, body, status)').single())
    await this.updateKnowledgeEntry(input.entryId, { status: 'published', reviewerUserId: input.publisherUserId || null })
    return mapKnowledgePublication(publication)
  },

  async simulateChannelEvent(body: JsonRecord) {
    const { data, error } = await supabase.functions.invoke('simulate-channel-event', { body })
    if (error) throw error
    return data
  },

  async retryOutboundMessage(messageId: string) {
    const { data, error } = await supabase.functions.invoke('retry-outbound-message', { body: { messageId } })
    if (error) throw error
    return data
  },

  async requestScheduling(body: JsonRecord) {
    const { data, error } = await supabase.functions.invoke('request-scheduling', { body })
    if (error) throw error
    return data
  },
}
