export type OmnichannelChannel = 'whatsapp' | 'instagram' | 'email' | 'webchat'
export type ConversationStatus = 'open' | 'waiting_ai' | 'waiting_human' | 'assigned' | 'resolved' | 'archived'
export type MessageDirection = 'inbound' | 'outbound'
export type MessageAuthor = 'contact' | 'ai' | 'agent' | 'system'
export type DeliveryStatus = 'queued' | 'processing' | 'sent' | 'delivered' | 'read' | 'failed'
export type ResponseMode = 'automatic' | 'assisted' | 'manual'
export type HandoffCombinator = 'all' | 'any'
export type HandoffOutcomeType = 'continue' | 'assist' | 'manual' | 'route'
export type KnowledgePublicationState = 'draft' | 'published' | 'archived'
export type ConversationSentiment = 'positive' | 'neutral' | 'negative'
export type AssignmentStatus = 'active' | 'transferred' | 'closed'
export type HandoffEventType = 'requested' | 'matched_rule' | 'assigned' | 'resolved' | 'cancelled'
export type WebhookEventStatus = 'pending' | 'processed' | 'failed'
export type OutboundRunStatus = 'pending' | 'queued' | 'sent' | 'failed' | 'cancelled'
export type SchedulingRequestStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled'
export type AiRunStatus = 'pending' | 'completed' | 'failed'
export type CrmSyncRunStatus = 'pending' | 'completed' | 'failed' | 'skipped'
export type KnowledgeSourceType = 'document' | 'url' | 'faq' | 'manual'
export type KnowledgePublicationStatus = 'published' | 'unpublished' | 'archived'
export type WebchatSessionStatus = 'active' | 'ended' | 'expired'

export interface ChannelConnection {
  id: string
  organizationId: string
  channel: OmnichannelChannel
  provider: string
  externalAccountId: string
  responseMode: ResponseMode
  createdAt: string
  updatedAt: string
}

export interface ChannelEventIdempotencyInput {
  connectionId: string
  externalEventId: string
  eventType: string
}

export interface OmnichannelConversation {
  id: string
  organizationId: string
  connectionId: string
  channel: OmnichannelChannel
  status: ConversationStatus
  contactId?: string
  leadId?: string
  queueId?: string
  assignedUserId?: string
  responsibleUserId?: string
  tagIds: string[]
  lastMessageAt?: string
  createdAt: string
  updatedAt: string
}

export interface OmnichannelContact {
  id: string
  organizationId: string
  channel: OmnichannelChannel
  externalContactId?: string
  name?: string
  email?: string
  phone?: string
  avatarUrl?: string
  leadId?: string
  clientId?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface OmnichannelTag {
  id: string
  organizationId: string
  name: string
  color?: string
  createdAt: string
  updatedAt: string
}

export interface OmnichannelMessage {
  id: string
  organizationId: string
  conversationId: string
  direction: MessageDirection
  author: MessageAuthor
  body: string
  deliveryStatus: DeliveryStatus
  externalMessageId?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface OmnichannelAttachment {
  id: string
  organizationId: string
  conversationId: string
  messageId?: string
  fileName: string
  mimeType: string
  sizeBytes: number
  storagePath: string
  createdAt: string
}

export interface OmnichannelAssignment {
  id: string
  organizationId: string
  conversationId: string
  queueId?: string
  teamId?: string
  userId?: string
  assignedBy?: string
  status: AssignmentStatus
  startedAt: string
  endedAt?: string
}

export interface OmnichannelTeam {
  id: string
  organizationId: string
  name: string
  description?: string
  supervisorUserId?: string
  createdAt: string
  updatedAt: string
}

export interface OmnichannelTeamMember {
  id: string
  organizationId: string
  teamId: string
  userId: string
  available: boolean
  createdAt: string
  updatedAt: string
}

export interface OmnichannelQueue {
  id: string
  organizationId: string
  name: string
  description?: string
  teamId?: string
  supervisorUserId?: string
  responseMode?: ResponseMode
  createdAt: string
  updatedAt: string
}

export interface OmnichannelRuleContext {
  channel: OmnichannelChannel
  status?: ConversationStatus
  currentQueueId?: string
  responsibleUserId?: string
  tagIds?: string[]
  humanRequested?: boolean
  aiConfidence?: number
  messageText?: string
  leadQualified?: boolean
  purchaseIntent?: boolean
  schedulingIntent?: boolean
  isBusinessHours?: boolean
  slaElapsedMinutes?: number
  sentiment?: ConversationSentiment
  repeatedContactCount?: number
}

export type HandoffCondition =
  | { type: 'human_request' }
  | { type: 'low_confidence'; threshold: number }
  | { type: 'critical_keyword'; keywords: string[] }
  | { type: 'qualified_lead' }
  | { type: 'purchase_intent' }
  | { type: 'scheduling_intent' }
  | { type: 'business_hours'; expected: boolean }
  | { type: 'sla_threshold'; minutes: number }
  | { type: 'sentiment'; sentiment: ConversationSentiment }
  | { type: 'repeated_contact'; count: number }
  | { type: 'channel'; channel: OmnichannelChannel }
  | { type: 'tag'; tagId: string }
  | { type: 'queue'; queueId: string }
  | { type: 'responsible_user'; userId: string }

export interface HandoffOutcome {
  type: HandoffOutcomeType
  queueId?: string
  teamId?: string
  fixedUserId?: string
  useLeadOwner?: boolean
}

export interface HandoffRule {
  id: string
  priority: number
  combinator: HandoffCombinator
  conditions: HandoffCondition[]
  outcome: HandoffOutcome
}

export interface HandoffRuleEvaluation {
  ruleId: string
  matched: boolean
  matchedConditions: HandoffCondition[]
  outcome?: HandoffOutcome
}

export interface OmnichannelHandoffEvent {
  id: string
  organizationId: string
  conversationId: string
  type: HandoffEventType
  ruleId?: string
  outcome?: HandoffOutcome
  fromUserId?: string
  toUserId?: string
  queueId?: string
  teamId?: string
  reason?: string
  createdAt: string
}

export interface RoutingTeamMember {
  userId: string
  teamId: string
  available: boolean
}

export interface OmnichannelRoutingCandidates {
  leadOwnerUserId?: string
  supervisorUserId?: string
  teamMembers: RoutingTeamMember[]
}

export interface RoutingCandidate {
  queueId?: string
  teamId?: string
  userId?: string
}

export interface CrmSyncFilters {
  channels?: OmnichannelChannel[]
  requiredTagIds?: string[]
  excludedTagIds?: string[]
  statuses?: ConversationStatus[]
  onlyQualifiedLeads?: boolean
}

export interface CrmSyncContext {
  channel: OmnichannelChannel
  tagIds?: string[]
  status?: ConversationStatus
  leadQualified?: boolean
}

export type CrmSyncRejectionReason =
  | 'channel_not_allowed'
  | 'missing_required_tag'
  | 'has_excluded_tag'
  | 'status_not_allowed'
  | 'lead_not_qualified'

export interface CrmSyncDecision {
  shouldSync: boolean
  reasons: CrmSyncRejectionReason[]
}

export interface OmnichannelWebhookEvent {
  id: string
  organizationId: string
  connectionId: string
  channel: OmnichannelChannel
  externalEventId: string
  eventType: string
  idempotencyKey: string
  payload: Record<string, unknown>
  status: WebhookEventStatus
  error?: string
  receivedAt: string
  processedAt?: string
}

export interface OmnichannelOutboundRun {
  id: string
  organizationId: string
  conversationId: string
  messageId?: string
  channel: OmnichannelChannel
  status: OutboundRunStatus
  payload: Record<string, unknown>
  error?: string
  scheduledAt?: string
  sentAt?: string
  createdAt: string
  updatedAt: string
}

export interface OmnichannelSchedulingRequest {
  id: string
  organizationId: string
  conversationId: string
  contactId?: string
  requestedBy?: string
  status: SchedulingRequestStatus
  requestedStartAt?: string
  requestedEndAt?: string
  confirmedStartAt?: string
  confirmedEndAt?: string
  notes?: string
  createdAt: string
  updatedAt: string
}

export interface OmnichannelAiRun {
  id: string
  organizationId: string
  conversationId: string
  messageId?: string
  status: AiRunStatus
  responseMode: ResponseMode
  model?: string
  promptSummary?: string
  outputText?: string
  confidence?: number
  usage?: AiTokenUsage
  costEstimate?: AiCostEstimate
  error?: string
  createdAt: string
  completedAt?: string
}

export interface OmnichannelCrmSyncRun {
  id: string
  organizationId: string
  conversationId: string
  leadId?: string
  clientId?: string
  status: CrmSyncRunStatus
  decision: CrmSyncDecision
  error?: string
  createdAt: string
  completedAt?: string
}

export interface RetentionSettings {
  conversationMonths?: number
  attachmentMonths?: number
}

export interface KnowledgeEntry {
  id: string
  state: KnowledgePublicationState
  title: string
  body?: string
  tags?: string[]
  updatedAt?: string
}

export interface OmnichannelKnowledgeSource {
  id: string
  organizationId: string
  type: KnowledgeSourceType
  title: string
  uri?: string
  content?: string
  metadata?: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface OmnichannelKnowledgePublication {
  id: string
  organizationId: string
  sourceId: string
  state: KnowledgePublicationState
  status: KnowledgePublicationStatus
  title: string
  body: string
  tags: string[]
  publishedAt?: string
  archivedAt?: string
  createdAt: string
  updatedAt: string
}

export interface OmnichannelOrganizationSettings {
  id: string
  organizationId: string
  defaultResponseMode: ResponseMode
  retention: RetentionSettings
  crmSyncFilters?: CrmSyncFilters
  widget?: Omit<WidgetSettings, 'id' | 'organizationId' | 'createdAt' | 'updatedAt'>
  createdAt: string
  updatedAt: string
}

export interface WidgetSettings {
  id: string
  organizationId: string
  enabled: boolean
  allowedOrigins: string[]
  defaultQueueId?: string
  createdAt: string
  updatedAt: string
}

export interface OmnichannelWebchatSession {
  id: string
  organizationId: string
  widgetId: string
  conversationId?: string
  contactId?: string
  origin: string
  status: WebchatSessionStatus
  visitorId?: string
  metadata?: Record<string, unknown>
  startedAt: string
  endedAt?: string
  updatedAt: string
}

export interface AiTokenUsage {
  inputTokens: number
  outputTokens: number
}

export interface AiTokenPrices {
  inputPerMillion: number
  outputPerMillion: number
}

export interface AiCostEstimate {
  inputCost: number
  outputCost: number
  totalCost: number
}
