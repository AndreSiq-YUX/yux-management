import { campaignDataClient } from '@/lib/campaignDataClient'
import { apiRequest } from '@/lib/apiClient'
import { invokeBackendFunction } from '@/lib/backendFunctions'
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
    opportunities: Number(row.opportunities || row.opportunity_count || 0),
    proposals: Number(row.proposals || row.proposal_count || 0),
    clients: Number(row.clients || row.client_count || 0),
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

const CAMPAIGN_SELECT = '*'

async function requireRows<T>(request: PromiseLike<{ data: T[] | null; error: any }>) {
  const { data, error } = await request
  if (error) throw error
  return data || []
}

async function attachCampaignRelations(rows: any[]) {
  const campaignIds = [...new Set(rows.map(row => row.id).filter(Boolean))]
  if (campaignIds.length === 0) return rows

  const [creatives, recommendations, alerts, runs] = await Promise.all([
    requireRows(campaignDataClient.from('campaign_creatives').select('*').in('campaign_id', campaignIds)),
    requireRows(campaignDataClient.from('campaign_recommendations').select('*').in('campaign_id', campaignIds)),
    requireRows(campaignDataClient.from('campaign_alerts').select('*').in('campaign_id', campaignIds)),
    requireRows(campaignDataClient.from('ad_provider_mutation_runs').select('*').in('campaign_id', campaignIds).order('created_at', { ascending: false })),
  ])

  const groupByCampaign = (items: any[]) => {
    const grouped = new Map<string, any[]>()
    for (const item of items || []) {
      const group = grouped.get(item.campaign_id) || []
      group.push(item)
      grouped.set(item.campaign_id, group)
    }
    return grouped
  }

  const creativesByCampaign = groupByCampaign(creatives)
  const recommendationsByCampaign = groupByCampaign(recommendations)
  const alertsByCampaign = groupByCampaign(alerts)
  const runsByCampaign = groupByCampaign(runs)

  return rows.map(row => ({
    ...row,
    campaign_creatives: creativesByCampaign.get(row.id) || [],
    campaign_recommendations: recommendationsByCampaign.get(row.id) || [],
    campaign_alerts: alertsByCampaign.get(row.id) || [],
    ad_provider_mutation_runs: runsByCampaign.get(row.id) || [],
  }))
}

export const campaignService = {
  async getProviderConnections() {
    const { data, error } = await campaignDataClient.from('ad_provider_connections').select('*').order('provider')
    if (error) throw error
    return (data || []).map(mapProviderConnection)
  },

  async getCampaigns(filters?: { organizationId?: string; clientId?: string; contractId?: string }) {
    let query = campaignDataClient.from('campaigns').select(CAMPAIGN_SELECT).order('updated_at', { ascending: false })
    if (filters?.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters?.clientId) query = query.eq('client_id', filters.clientId)
    if (filters?.contractId) query = query.eq('contract_id', filters.contractId)
    const { data, error } = await query
    if (error) throw error
    return (await attachCampaignRelations(data || [])).map(mapCampaign)
  },

  async getPortalCampaigns(contractId: string) {
    const data = await apiRequest<any[]>(`/campaigns/portal/campaigns?contractId=${encodeURIComponent(contractId)}`)
    const campaigns = (data || []).map(mapCampaign)
    return campaigns.map(sanitizeCampaignForPortal)
  },

  async createCampaignDraft(input: CreateCampaignDraftInput) {
    const { data, error } = await campaignDataClient
      .from('campaigns')
      .insert(buildCampaignDraftPayload(input))
      .select(CAMPAIGN_SELECT)
      .single()
    if (error) throw error
    const [campaign] = await attachCampaignRelations(data ? [data] : [])
    return mapCampaign(campaign)
  },

  async updateCampaignDraft(id: string, input: Partial<CreateCampaignDraftInput>) {
    const payload: Record<string, unknown> = {}
    if (input.name !== undefined) payload.name = input.name.trim()
    if (input.objective !== undefined) payload.objective = input.objective
    if (input.dailyBudget !== undefined) payload.daily_budget = input.dailyBudget
    if (input.totalBudget !== undefined) payload.total_budget = input.totalBudget
    if (input.landingPageId !== undefined) payload.landing_page_id = input.landingPageId || null
    const { data, error } = await campaignDataClient.from('campaigns').update(payload).eq('id', id).select(CAMPAIGN_SELECT).single()
    if (error) throw error
    const [campaign] = await attachCampaignRelations(data ? [data] : [])
    return mapCampaign(campaign)
  },

  async submitCampaignForApproval(id: string) {
    return campaignService.updateCampaignStatus(id, 'pending_approval')
  },

  async approveCampaign(id: string) {
    return campaignService.updateCampaignStatus(id, 'approved')
  },

  async enqueueProviderMutation(input: Parameters<typeof buildProviderMutationPayload>[0]) {
    const { data, error } = await campaignDataClient.from('ad_provider_mutation_runs').insert(buildProviderMutationPayload(input)).select().single()
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
    return invokeBackendFunction<{ success?: boolean; run?: unknown; error?: string }>('execute-ad-provider-mutation', {
        organizationId: input.organizationId,
        provider: input.provider,
        action: input.action,
        campaignId: input.campaignId,
        providerConnectionId: input.providerConnectionId,
        explicitApproval: Boolean(input.explicitApproval),
        activateProvider: Boolean(input.activateProvider),
        requestPayload: input.requestPayload || {},
      })
  },

  async syncCampaignMetrics(campaignId: string) {
    return invokeBackendFunction<{ success?: boolean; run?: unknown; error?: string }>('sync-ad-metrics', { campaignId })
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
    const { data, error } = await campaignDataClient.from('campaigns').update({ daily_budget: input.nextDaily }).eq('id', input.campaignId).select(CAMPAIGN_SELECT).single()
    if (error) throw error
    const [campaign] = await attachCampaignRelations(data ? [data] : [])
    return mapCampaign(campaign)
  },

  async updateCampaignStatus(id: string, lifecycleStatus: CampaignLifecycleStatus) {
    const legacyStatus = lifecycleStatus === 'active' ? 'ACTIVE' : lifecycleStatus === 'paused' ? 'PAUSED' : lifecycleStatus === 'archived' ? 'ENDED' : 'PAUSED'
    const { data, error } = await campaignDataClient
      .from('campaigns')
      .update({ lifecycle_status: lifecycleStatus, status: legacyStatus })
      .eq('id', id)
      .select(CAMPAIGN_SELECT)
      .single()
    if (error) throw error
    const [campaign] = await attachCampaignRelations(data ? [data] : [])
    return mapCampaign(campaign)
  },
}
