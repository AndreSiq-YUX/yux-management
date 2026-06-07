import type {
  MarketingAgentType,
  MarketingAgent,
  MarketingAgentGlobalPrompt,
  MarketingAgentRun,
  MarketingCalendarItem,
  MarketingBrandProfile,
  MarketingContentItem,
  MarketingContentGenerationRun,
  MarketingContentQualityCheck,
  MarketingContentReview,
  MarketingContentStatus,
  MarketingContentVersion,
  MarketingKnowledgeChunk,
  MarketingKnowledgeMatch,
  MarketingOperationMode,
  MarketingProductService,
  MarketingRadarRun,
  MarketingReviewStatus,
  MarketingSource,
  MarketingSourceItem,
  MarketingStudioSettings,
  MarketingToolKey,
  MarketingAgentToolPolicy,
  MarketingCampaignCreativeSuggestion,
  MarketingCampaignDraftRun,
  MarketingPublishingAction,
  MarketingPublishingConnectionStatus,
  MarketingPublishingProvider,
  MarketingUsageAction,
  MarketingWorkflowRun,
  ModelRoutingRule,
  AgentBudgetPolicy,
  PortalMarketingContentItem,
  PortalMarketingBrandProfile,
} from '@/types/marketingStudio'

const transitionMap: Record<MarketingContentStatus, MarketingContentStatus[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['changes_requested', 'approved', 'rejected'],
  changes_requested: ['draft', 'in_review', 'archived'],
  approved: ['scheduled', 'published', 'archived'],
  scheduled: ['published', 'approved', 'archived'],
  published: ['archived'],
  rejected: ['draft', 'archived'],
  archived: [],
}

const creditByAction: Record<MarketingUsageAction, number> = {
  classify_idea: 1,
  summarize_source: 2,
  read_url: 2,
  simple_search: 8,
  generate_short_caption: 3,
  generate_social_post: 5,
  generate_carousel: 10,
  generate_variations: 16,
  generate_blog_article: 30,
  deep_research: 35,
  grounding_short: 10,
  grounding_article: 30,
  generate_image: 25,
  monthly_performance_analysis: 50,
  create_wordpress_draft: 2,
  update_wordpress_draft: 1,
  publish_wordpress: 2,
  generate_campaign_creatives: 18,
  create_campaign_draft: 5,
}

const baseToolsByAgent: Record<MarketingAgentType, MarketingToolKey[]> = {
  content_radar: ['jina_reader', 'jina_search', 'curated_sources'],
  strategic_curator: ['curated_sources', 'rag_search'],
  content_strategist: ['curated_sources', 'rag_search'],
  multichannel_writer: ['rag_search'],
  brand_quality_reviewer: ['rag_search', 'jina_grounding'],
  campaign_strategist: ['campaign_draft', 'rag_search'],
  visual_creative_generator: ['image_generation', 'rag_search'],
  editorial_calendar_manager: ['create_task'],
  controlled_publisher: ['create_task', 'create_wordpress_draft', 'publish_wordpress'],
  performance_analyst: ['rag_search'],
}

const factualPatterns = [
  /\b\d+([,.]\d+)?\s?%/,
  /\br\$\s?\d+/i,
  /\b(estudo|pesquisa|dados|estatistica|relatorio|noticia|ranking|benchmark)\b/i,
]

export function requiresHumanApproval(input: {
  action: 'publish_social' | 'publish_wordpress' | 'paid_campaign_draft' | 'premium_image' | 'regulated_claim' | 'generate_short_caption'
  settings: MarketingStudioSettings
}) {
  if (input.action === 'publish_social') return input.settings.approvalPolicy.publishSocial
  if (input.action === 'publish_wordpress') return input.settings.approvalPolicy.publishWordPress
  if (input.action === 'paid_campaign_draft') return input.settings.approvalPolicy.paidCampaignDraft
  if (input.action === 'premium_image') return input.settings.approvalPolicy.premiumImage
  if (input.action === 'regulated_claim') return input.settings.approvalPolicy.regulatedContent
  return false
}

export function canTransitionContentStatus(from: MarketingContentStatus, to: MarketingContentStatus) {
  return transitionMap[from].includes(to)
}

export function calculateCreditsForAction(input: { action: MarketingUsageAction; premium?: boolean }) {
  const baseCredits = creditByAction[input.action]
  return input.action === 'generate_image' && input.premium ? Math.max(baseCredits, 60) : baseCredits
}

export function shouldBlockCreditDebit(input: { balance: number; monthlyUsed: number; monthlyLimit: number; debit: number }) {
  return input.balance < input.debit || input.monthlyUsed + input.debit > input.monthlyLimit
}

export function selectAllowedAgentTools(input: { agentType: MarketingAgentType; operationMode: MarketingOperationMode }) {
  const tools = baseToolsByAgent[input.agentType]
  if (input.operationMode === 'advanced_partner') return tools
  if (input.operationMode === 'assisted_client') return tools.filter(tool => tool !== 'publish_wordpress')
  return tools.filter(tool => tool !== 'campaign_draft')
}

export function sanitizeMarketingContentForPortal(content: MarketingContentItem): PortalMarketingContentItem {
  const { internalNotes: _internalNotes, ...portalContent } = content
  return portalContent
}

export function getNextVersionNumber(versions: Pick<MarketingContentVersion, 'versionNumber'>[]) {
  if (!versions.length) return 1
  return Math.max(...versions.map(version => version.versionNumber)) + 1
}

export function canSubmitContentForReview(content: MarketingContentItem) {
  return Boolean(content.title.trim() && content.body?.trim() && ['draft', 'changes_requested'].includes(content.status))
}

export function statusAfterReviewDecision(status: MarketingReviewStatus): MarketingContentStatus {
  if (status === 'approved') return 'approved'
  if (status === 'changes_requested') return 'changes_requested'
  if (status === 'rejected') return 'rejected'
  return 'in_review'
}

export function canScheduleContent(input: {
  content: MarketingContentItem
  startsAt: string
  existingCalendarItems?: Pick<MarketingCalendarItem, 'contentItemId' | 'startsAt' | 'status'>[]
}) {
  if (!['approved', 'scheduled'].includes(input.content.status)) return false
  const startTime = new Date(input.startsAt).getTime()
  if (!Number.isFinite(startTime) || startTime <= Date.now()) return false
  return !(input.existingCalendarItems || []).some(item =>
    item.contentItemId === input.content.id &&
    item.status !== 'cancelled' &&
    item.startsAt === input.startsAt
  )
}

export function summarizeReviewQueue(reviews: MarketingContentReview[]) {
  return {
    pending: reviews.filter(review => review.status === 'pending').length,
    approved: reviews.filter(review => review.status === 'approved').length,
    changesRequested: reviews.filter(review => review.status === 'changes_requested').length,
    rejected: reviews.filter(review => review.status === 'rejected').length,
  }
}

export function isBrandProfileReady(profile: Pick<MarketingBrandProfile, 'toneOfVoice' | 'persona' | 'brandVoiceSummary' | 'status'>) {
  return profile.status === 'active'
    && profile.toneOfVoice.trim().length >= 3
    && profile.persona.trim().length >= 3
    && profile.brandVoiceSummary.trim().length >= 20
}

export function sanitizeBrandProfileForPortal(profile: MarketingBrandProfile): PortalMarketingBrandProfile {
  const { complianceNotes: _complianceNotes, ...portalProfile } = profile
  return portalProfile
}

export function buildSimpleKnowledgeChunks(input: { title: string; body: string; maxChars?: number }) {
  const maxChars = Math.max(input.maxChars || 800, 200)
  const paragraphs = input.body
    .split(/\n{2,}/)
    .map(part => part.trim())
    .filter(Boolean)
  const chunks: Array<{ title: string; body: string; chunkIndex: number; tokenCount: number }> = []
  let buffer = ''

  for (const paragraph of paragraphs.length ? paragraphs : [input.body.trim()]) {
    if (buffer && `${buffer}\n\n${paragraph}`.length > maxChars) {
      chunks.push(toChunk(input.title, buffer, chunks.length))
      buffer = paragraph
    } else {
      buffer = buffer ? `${buffer}\n\n${paragraph}` : paragraph
    }
  }

  if (buffer.trim()) chunks.push(toChunk(input.title, buffer, chunks.length))
  return chunks
}

export function rankKnowledgeMatches(input: { query: string; chunks: MarketingKnowledgeChunk[] }): MarketingKnowledgeMatch[] {
  const terms = normalizeTerms(input.query)
  return input.chunks
    .map(chunk => {
      const haystack = `${chunk.title || ''} ${chunk.body}`.toLowerCase()
      const rank = terms.reduce((score, term) => score + (haystack.includes(term) ? 1 : 0), 0)
      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        title: chunk.title,
        body: chunk.body,
        rank,
      }
    })
    .filter(match => !terms.length || match.rank > 0)
    .sort((a, b) => b.rank - a.rank || a.title?.localeCompare(b.title || '') || 0)
}

export function summarizeKnowledgeCoverage(input: {
  brandProfile?: MarketingBrandProfile | null
  products: MarketingProductService[]
  documents: Array<{ status: string }>
  chunks: MarketingKnowledgeChunk[]
}) {
  return {
    brandReady: input.brandProfile ? isBrandProfileReady(input.brandProfile) : false,
    activeProducts: input.products.filter(product => product.status === 'active').length,
    publishedDocuments: input.documents.filter(document => ['indexed', 'published'].includes(document.status)).length,
    chunks: input.chunks.length,
  }
}

export function composeAgentPrompt(input: {
  globalPrompt: Pick<MarketingAgentGlobalPrompt, 'systemPrompt' | 'promptVersion' | 'defaultContextPolicy' | 'defaultQualityGates'>
  agent: Pick<MarketingAgent, 'name' | 'basePrompt' | 'promptConfig' | 'contextPolicy' | 'qualityGates' | 'promptVersion'>
  context: {
    brandSummary?: string
    products?: string[]
    knowledgeSnippets?: string[]
    objective?: string
  }
}) {
  const contextLines = [
    input.context.objective ? `Objetivo: ${input.context.objective}` : '',
    input.context.brandSummary ? `Marca: ${input.context.brandSummary}` : '',
    input.context.products?.length ? `Produtos: ${input.context.products.join('; ')}` : '',
    input.context.knowledgeSnippets?.length ? `Conhecimento: ${input.context.knowledgeSnippets.join(' | ')}` : '',
  ].filter(Boolean)

  return {
    systemPrompt: input.globalPrompt.systemPrompt.trim(),
    agentPrompt: input.agent.basePrompt?.trim() || `Execute a funcao configurada para ${input.agent.name}.`,
    contextBlock: contextLines.join('\n'),
    promptConfig: {
      ...input.globalPrompt.defaultContextPolicy,
      ...input.globalPrompt.defaultQualityGates,
      ...input.agent.contextPolicy,
      ...input.agent.qualityGates,
      ...input.agent.promptConfig,
    },
    promptVersions: {
      global: input.globalPrompt.promptVersion,
      agent: input.agent.promptVersion,
    },
  }
}

export function selectModelRoute(input: {
  agent: Pick<MarketingAgent, 'id' | 'agentType' | 'defaultModel' | 'fallbackModel'>
  routes: ModelRoutingRule[]
  tier?: ModelRoutingRule['routingTier']
}) {
  const tier = input.tier || 'default'
  return input.routes.find(route => route.status === 'active' && route.agentId === input.agent.id && route.routingTier === tier)
    || input.routes.find(route => route.status === 'active' && route.agentType === input.agent.agentType && route.routingTier === tier)
    || input.routes.find(route => route.status === 'active' && route.agentType === input.agent.agentType)
    || {
      provider: 'configured',
      modelName: input.agent.defaultModel || 'unconfigured',
      fallbackModelName: input.agent.fallbackModel,
      routingTier: tier,
      maxInputTokens: 8000,
      maxOutputTokens: 1200,
      temperature: 0.4,
      maxCostPerRun: input.agent.defaultModel ? 0 : Number.POSITIVE_INFINITY,
      status: 'active',
    }
}

export function filterToolsByPolicies(input: {
  agent: Pick<MarketingAgent, 'id' | 'agentType' | 'allowedTools'>
  policies: MarketingAgentToolPolicy[]
}) {
  return input.agent.allowedTools.filter(tool => {
    const policy = input.policies.find(item => item.agentId === input.agent.id && item.toolKey === tool)
      || input.policies.find(item => item.agentType === input.agent.agentType && item.toolKey === tool)
    return policy ? policy.enabled : true
  })
}

export function shouldBlockAgentRun(input: {
  policy?: AgentBudgetPolicy
  estimatedCredits: number
  estimatedCost: number
  runsToday: number
}) {
  if (!input.policy || input.policy.status !== 'active') return false
  if (input.policy.maxCreditsPerRun > 0 && input.estimatedCredits > input.policy.maxCreditsPerRun) return true
  if (input.policy.maxCostPerRun > 0 && input.estimatedCost > input.policy.maxCostPerRun) return true
  return input.policy.maxRunsPerDay > 0 && input.runsToday >= input.policy.maxRunsPerDay
}

export function summarizeHarnessTelemetry(input: {
  workflowRuns: MarketingWorkflowRun[]
  agentRuns: MarketingAgentRun[]
}) {
  const failedWorkflowRuns = input.workflowRuns.filter(run => run.status === 'failed').length
  return {
    queuedWorkflowRuns: input.workflowRuns.filter(run => run.status === 'queued').length,
    runningWorkflowRuns: input.workflowRuns.filter(run => run.status === 'running').length,
    failedWorkflowRuns,
    totalCredits: input.agentRuns.reduce((sum, run) => sum + run.creditsCharged, 0),
    averageQualityScore: average(input.agentRuns.map(run => run.qualityScore).filter(score => score != null) as number[]),
  }
}

export function normalizeResearchUrl(value?: string) {
  if (!value?.trim()) return ''
  try {
    const url = new URL(value.trim())
    url.hash = ''
    url.searchParams.delete('utm_source')
    url.searchParams.delete('utm_medium')
    url.searchParams.delete('utm_campaign')
    url.searchParams.delete('utm_content')
    url.searchParams.delete('utm_term')
    return url.toString().replace(/\/$/, '').toLowerCase()
  } catch {
    return value.trim().toLowerCase()
  }
}

export function buildSourceItemDedupeKey(input: { title: string; sourceUrl?: string; sourceId?: string }) {
  const normalizedUrl = normalizeResearchUrl(input.sourceUrl)
  if (normalizedUrl) return normalizedUrl
  return `${input.sourceId || 'manual'}:${normalizeTerms(input.title).join('-') || input.title.trim().toLowerCase()}`
}

export function scoreSourceItemOpportunity(item: Pick<MarketingSourceItem, 'relevanceScore' | 'noveltyScore' | 'commercialScore'>) {
  return Math.round((item.relevanceScore * 0.4) + (item.commercialScore * 0.4) + (item.noveltyScore * 0.2))
}

export function prioritizeSourceItems(items: MarketingSourceItem[]) {
  return [...items].sort((a, b) => scoreSourceItemOpportunity(b) - scoreSourceItemOpportunity(a) || b.createdAt.localeCompare(a.createdAt))
}

export function summarizeRadar(input: { sources: MarketingSource[]; sourceItems: MarketingSourceItem[]; radarRuns: MarketingRadarRun[] }) {
  return {
    activeSources: input.sources.filter(source => source.status === 'active').length,
    failedSources: input.sources.filter(source => source.status === 'failed').length,
    capturedItems: input.sourceItems.filter(item => item.status === 'captured').length,
    ideaGeneratedItems: input.sourceItems.filter(item => item.status === 'idea_generated').length,
    runningRuns: input.radarRuns.filter(run => ['queued', 'collecting', 'curating'].includes(run.status)).length,
    completedRuns: input.radarRuns.filter(run => run.status === 'completed').length,
  }
}

export function shouldRequireGrounding(input: {
  title?: string
  body?: string
  contentType?: MarketingContentItem['contentType']
  sourceUrls?: string[]
  riskFlags?: string[]
}) {
  const text = `${input.title || ''} ${input.body || ''}`
  if (input.sourceUrls?.some(Boolean)) return true
  if (input.riskFlags?.some(flag => ['factual_claim', 'regulated_claim', 'statistics'].includes(flag))) return true
  if (input.contentType === 'blog_article' && factualPatterns.some(pattern => pattern.test(text))) return true
  return factualPatterns.some(pattern => pattern.test(text))
}

export function evaluateContentQuality(input: {
  title: string
  body?: string
  cta?: string
  channel?: MarketingContentItem['channel']
  brandProfile?: Pick<MarketingBrandProfile, 'toneOfVoice' | 'forbiddenTopics' | 'priorityTopics'> | null
}) {
  const title = input.title.trim()
  const body = input.body?.trim() || ''
  const forbiddenTopics = input.brandProfile?.forbiddenTopics || []
  const priorityTopics = input.brandProfile?.priorityTopics || []
  const lowerBody = `${title} ${body}`.toLowerCase()
  const hasForbiddenTopic = forbiddenTopics.some(topic => topic && lowerBody.includes(topic.toLowerCase()))
  const hasPriorityTopic = priorityTopics.length === 0 || priorityTopics.some(topic => topic && lowerBody.includes(topic.toLowerCase()))
  const checklist = {
    hasTitle: title.length >= 6,
    hasBody: body.length >= 80,
    hasCta: Boolean(input.cta?.trim()) || /\b(fale|converse|agende|solicite|saiba mais|entre em contato)\b/i.test(body),
    matchesBrandTone: Boolean(input.brandProfile?.toneOfVoice),
    avoidsForbiddenTopics: !hasForbiddenTopic,
    includesPriorityTopic: hasPriorityTopic,
    formattedForChannel: Boolean(input.channel),
  }
  const score = Object.values(checklist).filter(Boolean).length * 14 + (body.length >= 280 ? 2 : 0)
  const riskFlags = [
    hasForbiddenTopic ? 'forbidden_topic' : '',
    shouldRequireGrounding({ title, body, contentType: input.channel === 'blog' ? 'blog_article' : undefined }) ? 'factual_claim' : '',
    !checklist.hasCta ? 'missing_cta' : '',
  ].filter(Boolean)

  return {
    qualityScore: Math.min(100, score),
    checklist,
    riskFlags,
    groundingRequired: shouldRequireGrounding({ title, body, riskFlags }),
    status: score >= 76 && !hasForbiddenTopic ? 'passed' : 'needs_changes',
  } as const
}

export function summarizeWritingPipeline(input: {
  generationRuns: MarketingContentGenerationRun[]
  qualityChecks: MarketingContentQualityCheck[]
}) {
  return {
    queued: input.generationRuns.filter(run => run.status === 'queued').length,
    active: input.generationRuns.filter(run => ['writing', 'reviewing', 'grounding'].includes(run.status)).length,
    waitingApproval: input.generationRuns.filter(run => run.status === 'waiting_approval').length,
    succeeded: input.generationRuns.filter(run => run.status === 'succeeded').length,
    failed: input.generationRuns.filter(run => run.status === 'failed').length,
    groundingRequired: input.generationRuns.filter(run => run.requiresGrounding || run.groundingStatus === 'required').length,
    averageQualityScore: average(input.qualityChecks.map(check => check.qualityScore).filter(score => score > 0)),
  }
}

export function canCreateWordPressDraft(content: MarketingContentItem) {
  return content.channel === 'blog'
    && Boolean(content.title.trim())
    && Boolean(content.body?.trim())
    && ['in_review', 'approved', 'scheduled'].includes(content.status)
}

export function canPublishWordPressContent(content: MarketingContentItem) {
  return content.channel === 'blog'
    && Boolean(content.title.trim())
    && Boolean(content.body?.trim())
    && ['approved', 'scheduled'].includes(content.status)
}

export function buildPublishingIdempotencyKey(input: {
  connectionId: string
  contentItemId: string
  action: 'create_draft' | 'update_draft' | 'publish'
  version?: number | string
}) {
  return [
    input.connectionId,
    input.contentItemId,
    input.action,
    input.version || 'latest',
  ].join(':')
}

type NativePublishGuardInput = {
  provider: MarketingPublishingProvider
  contentStatus: MarketingContentStatus
  connectionStatus: MarketingPublishingConnectionStatus
  action: MarketingPublishingAction
}

export type NativePublishGuardResult =
  | { ok: true }
  | { ok: false; reason: 'content_must_be_approved' | 'provider_needs_reauth' | 'provider_not_connected' }

export function canExecuteNativePublishingRun(input: NativePublishGuardInput): NativePublishGuardResult {
  if (input.action === 'publish' && !['approved', 'scheduled'].includes(input.contentStatus)) {
    return { ok: false, reason: 'content_must_be_approved' }
  }
  if (input.connectionStatus === 'needs_reauth') return { ok: false, reason: 'provider_needs_reauth' }
  if (!['connected', 'stale'].includes(input.connectionStatus)) return { ok: false, reason: 'provider_not_connected' }
  return { ok: true }
}

export function buildNativePublishingIdempotencyKey(input: {
  provider: MarketingPublishingProvider
  connectionId: string
  contentItemId: string
  action: MarketingPublishingAction
}) {
  return `${input.provider}:${input.connectionId}:${input.contentItemId}:${input.action}`
}

export function canSubmitCampaignCreativeSuggestionForApproval(suggestion: MarketingCampaignCreativeSuggestion) {
  return ['draft', 'changes_requested'].includes(suggestion.status)
    && suggestion.campaignName.trim().length >= 3
    && suggestion.angle.trim().length >= 10
    && suggestion.copyVariations.length > 0
    && suggestion.creativeConcepts.length > 0
}

export function canConvertSuggestionToCampaignDraft(suggestion: MarketingCampaignCreativeSuggestion) {
  return suggestion.status === 'approved'
    && suggestion.dailyBudget > 0
    && suggestion.provider.length > 0
    && suggestion.objective.length > 0
    && suggestion.campaignName.trim().length >= 3
}

export function buildCampaignDraftIdempotencyKey(input: { suggestionId: string; campaignId?: string; version?: number | string }) {
  return [
    input.suggestionId,
    input.campaignId || 'new_campaign',
    input.version || 'latest',
  ].join(':')
}

export function summarizeCampaignCreativePipeline(input: {
  suggestions: MarketingCampaignCreativeSuggestion[]
  draftRuns: MarketingCampaignDraftRun[]
}) {
  return {
    draft: input.suggestions.filter(suggestion => suggestion.status === 'draft').length,
    inReview: input.suggestions.filter(suggestion => suggestion.status === 'in_review').length,
    approved: input.suggestions.filter(suggestion => suggestion.status === 'approved').length,
    converted: input.suggestions.filter(suggestion => suggestion.status === 'converted').length,
    failedDraftRuns: input.draftRuns.filter(run => run.status === 'failed').length,
    averageQualityScore: average(input.suggestions.map(suggestion => suggestion.qualityScore).filter(score => score != null) as number[]),
  }
}

function toChunk(title: string, body: string, chunkIndex: number) {
  return {
    title,
    body,
    chunkIndex,
    tokenCount: Math.ceil(body.length / 4),
  }
}

function normalizeTerms(query: string) {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(term => term.trim())
    .filter(term => term.length >= 3)
}

function average(values: number[]) {
  if (!values.length) return 0
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length)
}
