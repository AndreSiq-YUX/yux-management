import type {
  MarketingAgentType,
  MarketingCalendarItem,
  MarketingBrandProfile,
  MarketingContentItem,
  MarketingContentReview,
  MarketingContentStatus,
  MarketingContentVersion,
  MarketingKnowledgeChunk,
  MarketingKnowledgeMatch,
  MarketingOperationMode,
  MarketingProductService,
  MarketingReviewStatus,
  MarketingStudioSettings,
  MarketingToolKey,
  MarketingUsageAction,
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
  controlled_publisher: ['create_task', 'create_wordpress_draft'],
  performance_analyst: ['rag_search'],
}

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
  return tools.filter(tool => tool !== 'publish_wordpress' && tool !== 'campaign_draft')
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
