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
  priority: 'low' | 'medium' | 'high'
  opportunityScore: number
  suggestedChannel?: MarketingChannel
  rejectionReason?: string
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
