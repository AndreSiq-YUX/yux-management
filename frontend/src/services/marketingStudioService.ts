import { supabase } from '@/lib/supabase'
import { sanitizeMarketingContentForPortal } from '@/lib/marketing-studio/marketingStudioRules'
import type {
  MarketingApprovalPolicy,
  MarketingBrandProfile,
  MarketingCalendarItem,
  MarketingChannel,
  MarketingContentItem,
  MarketingContentReview,
  MarketingContentVersion,
  MarketingIdea,
  MarketingKnowledgeChunk,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingProductService,
  MarketingReviewStatus,
  MarketingStudioSettings,
  MarketingUsageLedgerEntry,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'

const defaultApprovalPolicy: MarketingApprovalPolicy = {
  publishSocial: true,
  publishWordPress: true,
  paidCampaignDraft: true,
  premiumImage: true,
  regulatedContent: true,
}

export function mapMarketingSettings(row: any): MarketingStudioSettings {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    operationMode: row.operation_mode,
    monthlyCreditLimit: Number(row.monthly_credit_limit || 0),
    currentCreditBalance: Number(row.current_credit_balance || 0),
    approvalPolicy: { ...defaultApprovalPolicy, ...(row.approval_policy || {}) },
    allowedChannels: (row.allowed_channels || []) as MarketingChannel[],
    toneOfVoice: row.tone_of_voice || undefined,
    persona: row.persona || undefined,
    visualPreferences: row.visual_preferences || undefined,
    forbiddenTopics: row.forbidden_topics || [],
    priorityTopics: row.priority_topics || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingContent(row: any): MarketingContentItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    title: row.title,
    contentType: row.content_type,
    channel: row.channel,
    status: row.status,
    brief: row.brief || undefined,
    body: row.body || undefined,
    cta: row.cta || undefined,
    campaignId: row.campaign_id || undefined,
    landingPageId: row.landing_page_id || undefined,
    sourceIdeaId: row.source_idea_id || undefined,
    createdByAgentId: row.created_by_agent_id || undefined,
    approvedBy: row.approved_by || undefined,
    scheduledAt: row.scheduled_at || undefined,
    publishedAt: row.published_at || undefined,
    publishedUrl: row.published_url || undefined,
    internalNotes: row.internal_notes || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingContentVersion(row: any): MarketingContentVersion {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    versionNumber: Number(row.version_number || 0),
    title: row.title,
    body: row.body || undefined,
    changeSummary: row.change_summary || undefined,
    createdBy: row.created_by || undefined,
    createdByAgentId: row.created_by_agent_id || undefined,
    createdAt: row.created_at,
  }
}

export function mapMarketingContentReview(row: any): MarketingContentReview {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    reviewerId: row.reviewer_id || undefined,
    status: row.status,
    qualityScore: row.quality_score == null ? undefined : Number(row.quality_score),
    comments: row.comments || undefined,
    checklist: row.checklist || {},
    decidedAt: row.decided_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingCalendarItem(row: any): MarketingCalendarItem {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    contentItemId: row.content_item_id || undefined,
    title: row.title,
    channel: row.channel,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at || undefined,
    responsibleUserId: row.responsible_user_id || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingBrandProfile(row: any): MarketingBrandProfile {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    toneOfVoice: row.tone_of_voice || '',
    persona: row.persona || '',
    brandVoiceSummary: row.brand_voice_summary || '',
    vocabularyDo: row.vocabulary_do || [],
    vocabularyDont: row.vocabulary_dont || [],
    forbiddenTopics: row.forbidden_topics || [],
    priorityTopics: row.priority_topics || [],
    visualGuidelines: row.visual_guidelines || undefined,
    complianceNotes: row.compliance_notes || undefined,
    status: row.status || 'draft',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingProductService(row: any): MarketingProductService {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    name: row.name,
    category: row.category || undefined,
    description: row.description || '',
    valueProposition: row.value_proposition || undefined,
    targetAudience: row.target_audience || undefined,
    proofPoints: row.proof_points || [],
    objections: row.objections || [],
    cta: row.cta || undefined,
    status: row.status || 'active',
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingKnowledgeDocument(row: any): MarketingKnowledgeDocument {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    sourceId: row.source_id || undefined,
    title: row.title,
    documentType: row.document_type,
    status: row.status,
    storagePath: row.storage_path || undefined,
    sourceUrl: row.source_url || undefined,
    summary: row.summary || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingKnowledgeChunk(row: any): MarketingKnowledgeChunk {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    documentId: row.document_id || undefined,
    entryId: row.entry_id || undefined,
    chunkIndex: Number(row.chunk_index || 0),
    title: row.title || undefined,
    body: row.body,
    tokenCount: Number(row.token_count || 0),
    embeddingModel: row.embedding_model || undefined,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapMarketingKnowledgeMatch(row: any): MarketingKnowledgeMatch {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id || undefined,
    title: row.title || undefined,
    body: row.body,
    rank: Number(row.rank || 0),
  }
}

export function buildIdeaInsertPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  summary: string
  sourceType: MarketingIdea['sourceType']
  priority?: MarketingIdea['priority']
  opportunityScore?: number
  sourceUrl?: string
  suggestedChannel?: MarketingIdea['suggestedChannel']
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    title: input.title.trim(),
    summary: input.summary.trim(),
    source_type: input.sourceType,
    priority: input.priority || 'medium',
    opportunity_score: input.opportunityScore || 0,
    source_url: input.sourceUrl || null,
    suggested_channel: input.suggestedChannel || null,
  }
}

export function buildContentInsertPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  contentType: MarketingContentItem['contentType']
  channel: MarketingContentItem['channel']
  brief?: string
  body?: string
  cta?: string
  campaignId?: string
  landingPageId?: string
  sourceIdeaId?: string
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    title: input.title.trim(),
    content_type: input.contentType,
    channel: input.channel,
    brief: input.brief?.trim() || null,
    body: input.body?.trim() || null,
    cta: input.cta?.trim() || null,
    campaign_id: input.campaignId || null,
    landing_page_id: input.landingPageId || null,
    source_idea_id: input.sourceIdeaId || null,
  }
}

export function buildContentVersionPayload(input: {
  contentItemId: string
  versionNumber: number
  title: string
  body?: string
  changeSummary?: string
  createdBy?: string
  createdByAgentId?: string
}) {
  return {
    content_item_id: input.contentItemId,
    version_number: input.versionNumber,
    title: input.title.trim(),
    body: input.body?.trim() || null,
    change_summary: input.changeSummary?.trim() || null,
    created_by: input.createdBy || null,
    created_by_agent_id: input.createdByAgentId || null,
  }
}

export function buildContentReviewPayload(input: {
  contentItemId: string
  reviewerId?: string
  status?: MarketingReviewStatus
  qualityScore?: number
  comments?: string
  checklist?: Record<string, unknown>
  decidedAt?: string
}) {
  return {
    content_item_id: input.contentItemId,
    reviewer_id: input.reviewerId || null,
    status: input.status || 'pending',
    quality_score: input.qualityScore ?? null,
    comments: input.comments?.trim() || null,
    checklist: input.checklist || {},
    decided_at: input.decidedAt || null,
  }
}

export function buildCalendarItemPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  channel: MarketingCalendarItem['channel']
  startsAt: string
  contentItemId?: string
  endsAt?: string
  responsibleUserId?: string
  status?: MarketingCalendarItem['status']
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    content_item_id: input.contentItemId || null,
    title: input.title.trim(),
    channel: input.channel,
    status: input.status || 'planned',
    starts_at: input.startsAt,
    ends_at: input.endsAt || null,
    responsible_user_id: input.responsibleUserId || null,
    metadata: input.metadata || {},
  }
}

export function buildUsageLedgerPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  action: MarketingUsageLedgerEntry['action']
  creditsCharged: number
  userId?: string
  agentId?: string
  provider?: string
  model?: string
  inputTokens?: number
  outputTokens?: number
  rawCostEstimate?: number
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    user_id: input.userId || null,
    agent_id: input.agentId || null,
    action: input.action,
    provider: input.provider || null,
    model: input.model || null,
    input_tokens: input.inputTokens || 0,
    output_tokens: input.outputTokens || 0,
    raw_cost_estimate: input.rawCostEstimate || 0,
    credits_charged: input.creditsCharged,
    status: 'pending',
  }
}

export function buildBrandProfilePayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  toneOfVoice: string
  persona: string
  brandVoiceSummary: string
  vocabularyDo?: string[]
  vocabularyDont?: string[]
  forbiddenTopics?: string[]
  priorityTopics?: string[]
  visualGuidelines?: string
  complianceNotes?: string
  status?: MarketingBrandProfile['status']
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    tone_of_voice: input.toneOfVoice.trim(),
    persona: input.persona.trim(),
    brand_voice_summary: input.brandVoiceSummary.trim(),
    vocabulary_do: input.vocabularyDo || [],
    vocabulary_dont: input.vocabularyDont || [],
    forbidden_topics: input.forbiddenTopics || [],
    priority_topics: input.priorityTopics || [],
    visual_guidelines: input.visualGuidelines?.trim() || null,
    compliance_notes: input.complianceNotes?.trim() || null,
    status: input.status || 'draft',
  }
}

export function buildProductServicePayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  name: string
  category?: string
  description?: string
  valueProposition?: string
  targetAudience?: string
  proofPoints?: string[]
  objections?: string[]
  cta?: string
  status?: MarketingProductService['status']
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    name: input.name.trim(),
    category: input.category?.trim() || null,
    description: input.description?.trim() || '',
    value_proposition: input.valueProposition?.trim() || null,
    target_audience: input.targetAudience?.trim() || null,
    proof_points: input.proofPoints || [],
    objections: input.objections || [],
    cta: input.cta?.trim() || null,
    status: input.status || 'active',
    metadata: input.metadata || {},
  }
}

export function buildKnowledgeDocumentPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  title: string
  documentType: MarketingKnowledgeDocument['documentType']
  sourceId?: string
  status?: MarketingKnowledgeDocument['status']
  storagePath?: string
  sourceUrl?: string
  summary?: string
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    source_id: input.sourceId || null,
    title: input.title.trim(),
    document_type: input.documentType,
    status: input.status || 'draft',
    storage_path: input.storagePath || null,
    source_url: input.sourceUrl || null,
    summary: input.summary?.trim() || null,
    metadata: input.metadata || {},
  }
}

export function buildKnowledgeChunkPayload(input: {
  organizationId: string
  clientId: string
  contractId: string
  body: string
  chunkIndex?: number
  title?: string
  documentId?: string
  entryId?: string
  tokenCount?: number
  embeddingModel?: string
  metadata?: Record<string, unknown>
}) {
  return {
    organization_id: input.organizationId,
    client_id: input.clientId,
    contract_id: input.contractId,
    document_id: input.documentId || null,
    entry_id: input.entryId || null,
    chunk_index: input.chunkIndex || 0,
    title: input.title?.trim() || null,
    body: input.body.trim(),
    token_count: input.tokenCount || 0,
    embedding_model: input.embeddingModel || null,
    metadata: input.metadata || {},
  }
}

const CONTENT_SELECT = '*'
const VERSION_SELECT = '*'
const REVIEW_SELECT = '*'
const CALENDAR_SELECT = '*'
const BRAND_SELECT = '*'
const PRODUCT_SELECT = '*'
const DOCUMENT_SELECT = '*'
const CHUNK_SELECT = '*'

export const marketingStudioService = {
  async getSettings(contractId: string) {
    const { data, error } = await supabase
      .from('marketing_studio_settings')
      .select('*')
      .eq('contract_id', contractId)
      .maybeSingle()
    if (error) throw error
    return data ? mapMarketingSettings(data) : null
  },

  async getContents(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('content_items').select(CONTENT_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingContent)
  },

  async getPortalContents(contractId: string): Promise<PortalMarketingContentItem[]> {
    const contents = await marketingStudioService.getContents({ contractId })
    return contents.map(sanitizeMarketingContentForPortal)
  },

  async getContentVersions(contentItemId: string) {
    const { data, error } = await supabase
      .from('content_versions')
      .select(VERSION_SELECT)
      .eq('content_item_id', contentItemId)
      .order('version_number', { ascending: false })
    if (error) throw error
    return (data || []).map(mapMarketingContentVersion)
  },

  async getReviews(filters?: { contentItemId?: string; contractId?: string }) {
    let query = supabase.from('content_reviews').select(REVIEW_SELECT).order('created_at', { ascending: false })
    if (filters?.contentItemId) query = query.eq('content_item_id', filters.contentItemId)
    if (filters?.contractId) {
      const contentIds = (await marketingStudioService.getContents({ contractId: filters.contractId })).map(content => content.id)
      if (!contentIds.length) return []
      query = query.in('content_item_id', contentIds)
    }
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingContentReview)
  },

  async getCalendarItems(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('editorial_calendar_items').select(CALENDAR_SELECT).order('starts_at', { ascending: true })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingCalendarItem)
  },

  async getBrandProfile(contractId: string) {
    const { data, error } = await supabase
      .from('marketing_brand_profiles')
      .select(BRAND_SELECT)
      .eq('contract_id', contractId)
      .maybeSingle()
    if (error) throw error
    return data ? mapMarketingBrandProfile(data) : null
  },

  async getProductsServices(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('marketing_products_services').select(PRODUCT_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingProductService)
  },

  async getKnowledgeDocuments(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('marketing_knowledge_documents').select(DOCUMENT_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingKnowledgeDocument)
  },

  async getKnowledgeChunks(filters?: { documentId?: string; contractId?: string }) {
    let query = supabase.from('marketing_knowledge_chunks').select(CHUNK_SELECT).order('chunk_index', { ascending: true })
    if (filters?.documentId) query = query.eq('document_id', filters.documentId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapMarketingKnowledgeChunk)
  },

  async searchKnowledge(contractId: string, query: string, matchCount = 5) {
    const { data, error } = await supabase.rpc('match_marketing_knowledge', {
      target_contract_id: contractId,
      search_query: query,
      match_count: matchCount,
    })
    if (error) throw error
    return (data || []).map(mapMarketingKnowledgeMatch)
  },

  async createIdea(input: Parameters<typeof buildIdeaInsertPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_ideas')
      .insert(buildIdeaInsertPayload(input))
      .select()
      .single()
    if (error) throw error
    return data
  },

  async createContent(input: Parameters<typeof buildContentInsertPayload>[0]) {
    const { data, error } = await supabase
      .from('content_items')
      .insert(buildContentInsertPayload(input))
      .select(CONTENT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContent(data)
  },

  async updateContentStatus(id: string, status: MarketingContentItem['status']) {
    const { data, error } = await supabase
      .from('content_items')
      .update({ status })
      .eq('id', id)
      .select(CONTENT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContent(data)
  },

  async createContentVersion(input: Parameters<typeof buildContentVersionPayload>[0]) {
    const { data, error } = await supabase
      .from('content_versions')
      .insert(buildContentVersionPayload(input))
      .select(VERSION_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContentVersion(data)
  },

  async createReview(input: Parameters<typeof buildContentReviewPayload>[0]) {
    const { data, error } = await supabase
      .from('content_reviews')
      .insert(buildContentReviewPayload(input))
      .select(REVIEW_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContentReview(data)
  },

  async updateReviewDecision(id: string, input: {
    status: Exclude<MarketingReviewStatus, 'pending'>
    comments?: string
    qualityScore?: number
    checklist?: Record<string, unknown>
  }) {
    const { data, error } = await supabase
      .from('content_reviews')
      .update({
        status: input.status,
        comments: input.comments?.trim() || null,
        quality_score: input.qualityScore ?? null,
        checklist: input.checklist || {},
        decided_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select(REVIEW_SELECT)
      .single()
    if (error) throw error
    return mapMarketingContentReview(data)
  },

  async createCalendarItem(input: Parameters<typeof buildCalendarItemPayload>[0]) {
    const { data, error } = await supabase
      .from('editorial_calendar_items')
      .insert(buildCalendarItemPayload(input))
      .select(CALENDAR_SELECT)
      .single()
    if (error) throw error
    return mapMarketingCalendarItem(data)
  },

  async upsertBrandProfile(input: Parameters<typeof buildBrandProfilePayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_brand_profiles')
      .upsert(buildBrandProfilePayload(input), { onConflict: 'contract_id' })
      .select(BRAND_SELECT)
      .single()
    if (error) throw error
    return mapMarketingBrandProfile(data)
  },

  async createProductService(input: Parameters<typeof buildProductServicePayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_products_services')
      .insert(buildProductServicePayload(input))
      .select(PRODUCT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingProductService(data)
  },

  async createKnowledgeDocument(input: Parameters<typeof buildKnowledgeDocumentPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_knowledge_documents')
      .insert(buildKnowledgeDocumentPayload(input))
      .select(DOCUMENT_SELECT)
      .single()
    if (error) throw error
    return mapMarketingKnowledgeDocument(data)
  },

  async createKnowledgeChunk(input: Parameters<typeof buildKnowledgeChunkPayload>[0]) {
    const { data, error } = await supabase
      .from('marketing_knowledge_chunks')
      .insert(buildKnowledgeChunkPayload(input))
      .select(CHUNK_SELECT)
      .single()
    if (error) throw error
    return mapMarketingKnowledgeChunk(data)
  },

  async recordUsage(input: Parameters<typeof buildUsageLedgerPayload>[0]) {
    const { data, error } = await supabase
      .from('ai_usage_ledger')
      .insert(buildUsageLedgerPayload(input))
      .select()
      .single()
    if (error) throw error
    return data
  },
}
