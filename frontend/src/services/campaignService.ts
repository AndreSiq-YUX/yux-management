import { supabase } from '@/lib/supabase'
import { sanitizeCampaignForPortal, validateBudgetChange } from '@/lib/campaigns/campaignRules'
import type {
  AdProviderConnection,
  Campaign,
  CampaignLifecycleStatus,
  CreateCampaignDraftInput,
  ProviderMutationAction,
} from '@/types/campaign'

export const buildCampaignDraftPayload = (input: CreateCampaignDraftInput) => ({
  organization_id: input.organizationId,
  client_id: input.clientId,
  contract_id: input.contractId,
  provider_connection_id: input.providerConnectionId || null,
  ad_account_id: input.adAccountId || null,
  landing_page_id: input.landingPageId || null,
  pipeline_id: input.pipelineId || null,
  initial_stage_id: input.initialStageId || null,
  provider: input.provider,
  platform: input.provider === 'meta' ? 'META' : 'GOOGLE',
  name: input.name.trim(),
  objective: input.objective,
  lifecycle_status: 'draft',
  status: 'PAUSED',
  daily_budget: input.dailyBudget,
  total_budget: input.totalBudget ?? input.dailyBudget,
  budget: input.totalBudget ?? input.dailyBudget,
  starts_at: input.startsAt || null,
  ends_at: input.endsAt || null,
  start_date: input.startsAt?.slice(0, 10) || new Date().toISOString().slice(0, 10),
  end_date: input.endsAt?.slice(0, 10) || null,
  utm_source: input.provider,
  utm_medium: 'paid',
  utm_campaign: input.utmCampaign || input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''),
})

export const buildProviderMutationPayload = (input: {
  organizationId: string
  provider: 'meta' | 'google'
  action: ProviderMutationAction
  campaignId?: string
  providerConnectionId?: string
  requestPayload?: Record<string, unknown>
}) => ({
  organization_id: input.organizationId,
  provider: input.provider,
  action: input.action,
  campaign_id: input.campaignId || null,
  provider_connection_id: input.providerConnectionId || null,
  request_payload: input.requestPayload || {},
  idempotency_key: `${input.provider}:${input.action}:${input.campaignId || crypto.randomUUID()}`,
})

function mapProviderConnection(row: any): AdProviderConnection {
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id || undefined,
    contractId: row.contract_id || undefined,
    provider: row.provider,
    name: row.name,
    status: row.status,
    providerAccountId: row.provider_account_id || undefined,
    tokenReferenceConfigured: Boolean(row.token_reference),
    lastSyncAt: row.last_sync_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCampaign(row: any): Campaign {
  const leads = row.leads || row.conversions || 0
  const spend = Number(row.spend || 0)
  return {
    id: row.id,
    organizationId: row.organization_id,
    clientId: row.client_id,
    contractId: row.contract_id,
    providerConnectionId: row.provider_connection_id || undefined,
    adAccountId: row.ad_account_id || undefined,
    landingPageId: row.landing_page_id || undefined,
    pipelineId: row.pipeline_id || undefined,
    initialStageId: row.initial_stage_id || undefined,
    name: row.name,
    provider: row.provider || (row.platform === 'META' ? 'meta' : 'google'),
    objective: row.objective || 'lead_generation',
    lifecycleStatus: row.lifecycle_status || (row.status === 'ACTIVE' ? 'active' : row.status === 'PAUSED' ? 'paused' : 'archived'),
    dailyBudget: Number(row.daily_budget ?? row.budget ?? 0),
    totalBudget: row.total_budget !== null && row.total_budget !== undefined ? Number(row.total_budget) : undefined,
    startsAt: row.starts_at || undefined,
    endsAt: row.ends_at || undefined,
    spend,
    attributedRevenue: Number(row.attributed_revenue || 0),
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    leads,
    cpl: Number(row.cpl || (leads > 0 ? spend / leads : 0)),
    mroi: Number(row.mroi || 0),
    utmSource: row.utm_source || undefined,
    utmMedium: row.utm_medium || undefined,
    utmCampaign: row.utm_campaign || undefined,
    protectedError: row.protected_error || undefined,
    executionLogs: Array.isArray(row.ad_provider_mutation_runs)
      ? row.ad_provider_mutation_runs.map((run: any) => ({
        id: run.id,
        action: run.action,
        status: run.status,
        protectedError: run.protected_error || undefined,
        createdAt: run.created_at,
      }))
      : [],
    creatives: Array.isArray(row.campaign_creatives)
      ? row.campaign_creatives.map((creative: any) => ({
        id: creative.id,
        campaignId: creative.campaign_id,
        name: creative.name,
        format: creative.format,
        headline: creative.headline || undefined,
        body: creative.body || undefined,
        mediaUrl: creative.media_url || undefined,
        createdAt: creative.created_at,
        updatedAt: creative.updated_at,
      }))
      : [],
    recommendations: Array.isArray(row.campaign_recommendations)
      ? row.campaign_recommendations.map((recommendation: any) => ({
        id: recommendation.id,
        campaignId: recommendation.campaign_id,
        title: recommendation.title,
        description: recommendation.description,
        priority: recommendation.priority,
      }))
      : [],
    alerts: Array.isArray(row.campaign_alerts)
      ? row.campaign_alerts.map((alert: any) => ({
        id: alert.id,
        campaignId: alert.campaign_id,
        title: alert.title,
        severity: alert.severity,
      }))
      : [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const CAMPAIGN_SELECT = `
  *,
  campaign_creatives(*),
  campaign_recommendations(*),
  campaign_alerts(*),
  ad_provider_mutation_runs(*)
`

export const campaignService = {
  async getProviderConnections() {
    const { data, error } = await supabase.from('ad_provider_connections').select('*').order('provider')
    if (error) throw error
    return (data || []).map(mapProviderConnection)
  },

  async getCampaigns(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = supabase.from('campaigns').select(CAMPAIGN_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (data || []).map(mapCampaign)
  },

  async getPortalCampaigns(contractId: string) {
    const campaigns = await campaignService.getCampaigns({ contractId })
    return campaigns.map(sanitizeCampaignForPortal)
  },

  async createCampaignDraft(input: CreateCampaignDraftInput) {
    const { data, error } = await supabase
      .from('campaigns')
      .insert(buildCampaignDraftPayload(input))
      .select(CAMPAIGN_SELECT)
      .single()
    if (error) throw error
    return mapCampaign(data)
  },

  async updateCampaignDraft(id: string, input: Partial<CreateCampaignDraftInput>) {
    const payload: Record<string, unknown> = {}
    if (input.name !== undefined) payload.name = input.name.trim()
    if (input.objective !== undefined) payload.objective = input.objective
    if (input.dailyBudget !== undefined) payload.daily_budget = input.dailyBudget
    if (input.totalBudget !== undefined) payload.total_budget = input.totalBudget
    if (input.landingPageId !== undefined) payload.landing_page_id = input.landingPageId || null
    const { data, error } = await supabase.from('campaigns').update(payload).eq('id', id).select(CAMPAIGN_SELECT).single()
    if (error) throw error
    return mapCampaign(data)
  },

  async submitCampaignForApproval(id: string) {
    return campaignService.updateCampaignStatus(id, 'pending_approval')
  },

  async approveCampaign(id: string) {
    return campaignService.updateCampaignStatus(id, 'approved')
  },

  async enqueueProviderMutation(input: Parameters<typeof buildProviderMutationPayload>[0]) {
    const { data, error } = await supabase.from('ad_provider_mutation_runs').insert(buildProviderMutationPayload(input)).select().single()
    if (error) throw error
    return data
  },

  async executeProviderMutation(input: {
    organizationId: string
    provider: 'meta' | 'google'
    action: ProviderMutationAction
    campaignId: string
    providerConnectionId: string
    explicitApproval?: boolean
    activateProvider?: boolean
    requestPayload?: Record<string, unknown>
  }) {
    const { data, error } = await supabase.functions.invoke('execute-ad-provider-mutation', {
      body: {
        organizationId: input.organizationId,
        provider: input.provider,
        action: input.action,
        campaignId: input.campaignId,
        providerConnectionId: input.providerConnectionId,
        explicitApproval: Boolean(input.explicitApproval),
        activateProvider: Boolean(input.activateProvider),
        requestPayload: input.requestPayload || {},
      },
    })
    if (error) throw error
    return data as { success?: boolean; run?: unknown; error?: string }
  },

  async syncCampaignMetrics(campaignId: string) {
    const { data, error } = await supabase.functions.invoke('sync-ad-metrics', {
      body: { campaignId },
    })
    if (error) throw error
    return data as { success?: boolean; run?: unknown; error?: string }
  },

  async pauseCampaign(campaignId: string) {
    const campaign = (await campaignService.getCampaigns()).find(item => item.id === campaignId)
    if (!campaign) throw new Error('Campaign not found')
    if (!campaign.providerConnectionId) throw new Error('Provider connection not configured')
    return campaignService.executeProviderMutation({
      organizationId: campaign.organizationId,
      provider: campaign.provider,
      action: 'pause_campaign',
      campaignId,
      providerConnectionId: campaign.providerConnectionId,
      explicitApproval: true,
    })
  },

  async updateCampaignBudget(input: { campaignId: string; currentDaily: number; nextDaily: number; explicitApproval?: boolean }) {
    const validation = validateBudgetChange(input)
    if (!validation.ok) throw new Error(validation.reason)
    const { data, error } = await supabase.from('campaigns').update({ daily_budget: input.nextDaily }).eq('id', input.campaignId).select(CAMPAIGN_SELECT).single()
    if (error) throw error
    return mapCampaign(data)
  },

  async updateCampaignStatus(id: string, lifecycleStatus: CampaignLifecycleStatus) {
    const legacyStatus = lifecycleStatus === 'active' ? 'ACTIVE' : lifecycleStatus === 'paused' ? 'PAUSED' : lifecycleStatus === 'archived' ? 'ENDED' : 'PAUSED'
    const { data, error } = await supabase
      .from('campaigns')
      .update({ lifecycle_status: lifecycleStatus, status: legacyStatus })
      .eq('id', id)
      .select(CAMPAIGN_SELECT)
      .single()
    if (error) throw error
    return mapCampaign(data)
  },
}
