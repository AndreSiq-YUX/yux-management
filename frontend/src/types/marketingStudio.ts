export type MarketingOperationMode = 'managed_by_yux' | 'assisted_client' | 'advanced_partner'

export type MarketingAgentType =
  | 'content_radar'
  | 'strategic_curator'
  | 'content_strategist'
  | 'multichannel_writer'
  | 'brand_quality_reviewer'
  | 'campaign_strategist'
  | 'visual_creative_generator'
  | 'editorial_calendar_manager'
  | 'controlled_publisher'
  | 'performance_analyst'

export type MarketingToolKey =
  | 'curated_sources'
  | 'jina_reader'
  | 'jina_search'
  | 'jina_grounding'
  | 'tavily_search'
  | 'serper_search'
  | 'firecrawl'
  | 'youtube_data'
  | 'rag_search'
  | 'create_task'
  | 'create_wordpress_draft'
  | 'publish_wordpress'
  | 'campaign_draft'
  | 'image_generation'

export type MarketingChannel =
  | 'linkedin'
  | 'instagram'
  | 'blog'
  | 'newsletter'
  | 'email'
  | 'ad'
  | 'video_script'
  | 'carousel'
  | 'whatsapp_broadcast'

export type MarketingContentType =
  | 'social_post'
  | 'blog_article'
  | 'newsletter'
  | 'email'
  | 'ad_copy'
  | 'video_script'
  | 'carousel_text'
  | 'creative_brief'

export type MarketingContentStatus =
  | 'draft'
  | 'in_review'
  | 'changes_requested'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'rejected'
  | 'archived'

export type MarketingIdeaStatus = 'captured' | 'curated' | 'approved' | 'rejected' | 'converted'
export type MarketingSourceType = 'rss' | 'blog' | 'news' | 'youtube' | 'competitor' | 'crm' | 'omnichannel' | 'campaign' | 'manual'
export type MarketingSourceStatus = 'active' | 'paused' | 'failed' | 'archived'
export type MarketingSourceItemType =
  | 'article'
  | 'search_result'
  | 'rss_entry'
  | 'youtube_video'
  | 'crm_topic'
  | 'omnichannel_question'
  | 'campaign_signal'
  | 'manual'
export type MarketingSourceItemStatus = 'captured' | 'summarized' | 'idea_generated' | 'dismissed' | 'archived'
export type MarketingResearchProvider = 'jina_reader' | 'jina_search' | 'tavily' | 'serper' | 'firecrawl' | 'internal'
export type MarketingResearchRequestType = 'reader' | 'search' | 'crawl' | 'internal_lookup'
export type MarketingRadarRunStatus = 'queued' | 'collecting' | 'curating' | 'completed' | 'failed' | 'cancelled'

export type MarketingUsageAction =
  | 'classify_idea'
  | 'summarize_source'
  | 'read_url'
  | 'simple_search'
  | 'generate_short_caption'
  | 'generate_social_post'
  | 'generate_carousel'
  | 'generate_variations'
  | 'generate_blog_article'
  | 'deep_research'
  | 'grounding_short'
  | 'grounding_article'
  | 'generate_image'
  | 'monthly_performance_analysis'

export interface MarketingApprovalPolicy {
  publishSocial: boolean
  publishWordPress: boolean
  paidCampaignDraft: boolean
  premiumImage: boolean
  regulatedContent: boolean
}

export interface MarketingStudioSettings {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  operationMode: MarketingOperationMode
  monthlyCreditLimit: number
  currentCreditBalance: number
  approvalPolicy: MarketingApprovalPolicy
  allowedChannels: MarketingChannel[]
  toneOfVoice?: string
  persona?: string
  visualPreferences?: string
  forbiddenTopics?: string[]
  priorityTopics?: string[]
  createdAt: string
  updatedAt: string
}

export interface MarketingBrandProfile {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  toneOfVoice: string
  persona: string
  brandVoiceSummary: string
  vocabularyDo: string[]
  vocabularyDont: string[]
  forbiddenTopics: string[]
  priorityTopics: string[]
  visualGuidelines?: string
  complianceNotes?: string
  status: 'draft' | 'active' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface MarketingProductService {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  name: string
  category?: string
  description: string
  valueProposition?: string
  targetAudience?: string
  proofPoints: string[]
  objections: string[]
  cta?: string
  status: 'active' | 'paused' | 'archived'
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type MarketingKnowledgeDocumentType = 'brand' | 'product' | 'service' | 'faq' | 'case' | 'campaign' | 'policy' | 'other'
export type MarketingKnowledgeDocumentStatus = 'draft' | 'indexing' | 'indexed' | 'published' | 'archived'

export interface MarketingKnowledgeDocument {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  sourceId?: string
  title: string
  documentType: MarketingKnowledgeDocumentType
  status: MarketingKnowledgeDocumentStatus
  storagePath?: string
  sourceUrl?: string
  summary?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingKnowledgeChunk {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  documentId?: string
  entryId?: string
  chunkIndex: number
  title?: string
  body: string
  tokenCount: number
  embeddingModel?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingKnowledgeMatch {
  chunkId: string
  documentId?: string
  title?: string
  body: string
  rank: number
}

export type PortalMarketingBrandProfile = Omit<MarketingBrandProfile, 'complianceNotes'> & {
  complianceNotes?: never
}

export interface MarketingAgent {
  id: string
  organizationId: string
  clientId?: string
  contractId?: string
  name: string
  agentType: MarketingAgentType
  description: string
  status: 'active' | 'paused' | 'archived'
  defaultModel?: string
  fallbackModel?: string
  allowedTools: MarketingToolKey[]
  requiresHumanApproval: boolean
  maxCostPerRun?: number
  maxRunsPerDay?: number
  basePrompt?: string
  promptConfig: Record<string, unknown>
  contextPolicy: Record<string, unknown>
  qualityGates: Record<string, unknown>
  modelParameters: Record<string, unknown>
  promptVersion: number
  createdAt: string
  updatedAt: string
}

export interface MarketingAgentTemplate {
  id: string
  agentType: MarketingAgentType
  name: string
  description: string
  defaultTools: MarketingToolKey[]
  requiresHumanApproval: boolean
  defaultModel?: string
  fallbackModel?: string
  createdAt: string
  updatedAt: string
}

export interface MarketingAgentGlobalPrompt {
  id: string
  templateId: string
  agentType: MarketingAgentType
  systemPrompt: string
  promptVersion: number
  defaultContextPolicy: Record<string, unknown>
  defaultModelPolicy: Record<string, unknown>
  defaultQualityGates: Record<string, unknown>
  status: 'active' | 'archived'
  updatedBy?: string
  createdAt: string
  updatedAt: string
}

export type MarketingWorkflowStatus = 'draft' | 'active' | 'paused' | 'archived'
export type MarketingWorkflowTriggerType = 'manual' | 'scheduled' | 'event' | 'webhook'
export type MarketingWorkflowNodeType = 'agent' | 'tool' | 'gate' | 'approval' | 'output'
export type MarketingRunStatus = 'queued' | 'running' | 'waiting_approval' | 'succeeded' | 'failed' | 'cancelled'
export type MarketingToolRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled'
export type MarketingRunType = 'manual' | 'scheduled' | 'event' | 'retry'
export type MarketingRoutingTier = 'cheap' | 'default' | 'premium' | 'fallback'

export interface MarketingWorkflow {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  workflowKey: string
  name: string
  description: string
  status: MarketingWorkflowStatus
  triggerType: MarketingWorkflowTriggerType
  config: Record<string, unknown>
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface MarketingWorkflowNode {
  id: string
  workflowId: string
  nodeKey: string
  nodeType: MarketingWorkflowNodeType
  agentId?: string
  toolKey?: MarketingToolKey | string
  name: string
  positionX: number
  positionY: number
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingWorkflowEdge {
  id: string
  workflowId: string
  sourceNodeId: string
  targetNodeId: string
  conditionKey: string
  config: Record<string, unknown>
  createdAt: string
}

export interface MarketingWorkflowRun {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  workflowId?: string
  status: MarketingRunStatus
  runType: MarketingRunType
  inputPayload: Record<string, unknown>
  contextSnapshot: Record<string, unknown>
  resultPayload: Record<string, unknown>
  creditDebit: number
  rawCostEstimate: number
  errorMessage?: string
  requestedBy?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface MarketingAgentRun {
  id: string
  workflowRunId: string
  workflowNodeId?: string
  agentId?: string
  templateId?: string
  globalPromptId?: string
  agentType: MarketingAgentType
  status: MarketingRunStatus
  agentPromptSnapshot?: string
  promptConfigSnapshot: Record<string, unknown>
  contextSummary?: string
  compiledPromptHash?: string
  modelProvider?: string
  modelName?: string
  fallbackModelName?: string
  inputPayload: Record<string, unknown>
  outputPayload: Record<string, unknown>
  qualityScore?: number
  inputTokens: number
  outputTokens: number
  rawCostEstimate: number
  creditsCharged: number
  errorMessage?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
}

export interface MarketingToolRun {
  id: string
  workflowRunId: string
  agentRunId?: string
  toolKey: MarketingToolKey | string
  status: MarketingToolRunStatus
  inputPayload: Record<string, unknown>
  outputPayload: Record<string, unknown>
  rawCostEstimate: number
  creditsCharged: number
  errorMessage?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
}

export interface AgentBudgetPolicy {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  agentId?: string
  agentType?: MarketingAgentType
  maxCostPerRun: number
  maxCreditsPerRun: number
  maxRunsPerDay: number
  monthlyCreditLimit: number
  requireApprovalOverCredits: number
  status: 'active' | 'paused' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface ModelRoutingRule {
  id: string
  organizationId?: string
  clientId?: string
  contractId?: string
  agentId?: string
  agentType?: MarketingAgentType
  routingTier: MarketingRoutingTier
  provider: string
  modelName: string
  fallbackModelName?: string
  maxInputTokens: number
  maxOutputTokens: number
  temperature: number
  maxCostPerRun: number
  status: 'active' | 'paused' | 'archived'
  createdAt: string
  updatedAt: string
}

export interface MarketingAgentToolPolicy {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  agentId?: string
  agentType?: MarketingAgentType
  toolKey: MarketingToolKey | string
  enabled: boolean
  requiresHumanApproval: boolean
  maxCallsPerRun: number
  config: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingIdea {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  title: string
  summary: string
  status: MarketingIdeaStatus
  sourceType: 'manual' | 'radar' | 'crm' | 'omnichannel' | 'campaign' | 'report'
  sourceUrl?: string
  sourceReferenceId?: string
  sourceItemId?: string
  radarRunId?: string
  priority: 'low' | 'medium' | 'high'
  opportunityScore: number
  suggestedChannel?: MarketingChannel
  rejectionReason?: string
  curationNotes?: string
  nextAction?: string
  createdAt: string
  updatedAt: string
}

export interface MarketingSource {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  sourceType: MarketingSourceType
  name: string
  sourceUrl?: string
  status: MarketingSourceStatus
  lastReadAt?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingSourceItem {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  sourceId?: string
  radarRunId?: string
  itemType: MarketingSourceItemType
  title: string
  sourceUrl?: string
  normalizedUrl?: string
  author?: string
  publishedAt?: string
  summary: string
  rawExcerpt?: string
  language: string
  contentHash: string
  dedupeKey: string
  relevanceScore: number
  noveltyScore: number
  commercialScore: number
  status: MarketingSourceItemStatus
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface MarketingResearchCacheEntry {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  provider: MarketingResearchProvider
  requestType: MarketingResearchRequestType
  requestKey: string
  requestPayload: Record<string, unknown>
  responseSummary: string
  responsePayload: Record<string, unknown>
  rawCostEstimate: number
  creditsCharged: number
  expiresAt?: string
  createdAt: string
}

export interface MarketingRadarRun {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  workflowRunId?: string
  agentId?: string
  status: MarketingRadarRunStatus
  periodStart?: string
  periodEnd?: string
  query?: string
  sourceCount: number
  itemCount: number
  ideaCount: number
  rejectedCount: number
  summary: string
  errorMessage?: string
  metadata: Record<string, unknown>
  startedAt?: string
  completedAt?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface MarketingContentItem {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  title: string
  contentType: MarketingContentType
  channel: MarketingChannel
  status: MarketingContentStatus
  brief?: string
  body?: string
  cta?: string
  campaignId?: string
  landingPageId?: string
  sourceIdeaId?: string
  createdByAgentId?: string
  approvedBy?: string
  scheduledAt?: string
  publishedAt?: string
  publishedUrl?: string
  internalNotes?: string
  createdAt: string
  updatedAt: string
}

export type PortalMarketingContentItem = Omit<MarketingContentItem, 'internalNotes'> & {
  internalNotes?: never
}

export interface MarketingContentVersion {
  id: string
  contentItemId: string
  versionNumber: number
  title: string
  body?: string
  changeSummary?: string
  createdBy?: string
  createdByAgentId?: string
  createdAt: string
}

export type MarketingReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected'

export interface MarketingContentReview {
  id: string
  contentItemId: string
  reviewerId?: string
  status: MarketingReviewStatus
  qualityScore?: number
  comments?: string
  checklist: Record<string, unknown>
  decidedAt?: string
  createdAt: string
  updatedAt: string
}

export type MarketingCalendarStatus = 'planned' | 'ready' | 'scheduled' | 'published' | 'missed' | 'cancelled'

export interface MarketingCalendarItem {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  contentItemId?: string
  title: string
  channel: MarketingChannel
  status: MarketingCalendarStatus
  startsAt: string
  endsAt?: string
  responsibleUserId?: string
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface PortalMarketingReviewDecision {
  contentItemId: string
  status: Extract<MarketingReviewStatus, 'approved' | 'changes_requested' | 'rejected'>
  comments?: string
}

export interface MarketingUsageLedgerEntry {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  userId?: string
  agentId?: string
  workflowRunId?: string
  action: MarketingUsageAction
  provider?: string
  model?: string
  inputTokens: number
  outputTokens: number
  rawCostEstimate: number
  creditsCharged: number
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'
  createdAt: string
}
