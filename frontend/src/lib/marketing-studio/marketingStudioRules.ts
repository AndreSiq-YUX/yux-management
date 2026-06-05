import type {
  MarketingAgentType,
  MarketingContentItem,
  MarketingContentStatus,
  MarketingOperationMode,
  MarketingStudioSettings,
  MarketingToolKey,
  MarketingUsageAction,
  PortalMarketingContentItem,
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
