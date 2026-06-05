import { supabase } from '@/lib/supabase'
import { sanitizeMarketingContentForPortal } from '@/lib/marketing-studio/marketingStudioRules'
import type {
  MarketingApprovalPolicy,
  MarketingChannel,
  MarketingContentItem,
  MarketingIdea,
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

const CONTENT_SELECT = '*'

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
