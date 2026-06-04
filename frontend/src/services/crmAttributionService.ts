import { supabase } from '@/lib/supabase'
import {
  buildMroiAlerts,
  derivePrimarySource,
  hydrateRollupMetrics,
  sanitizePortalAttribution,
} from '@/lib/crm/attributionRules'
import type {
  AttributionEventKind,
  CampaignCrmPerformanceSnapshot,
  CrmAttributionDashboard,
  CrmAttributionExport,
  CrmAttributionUtm,
  CrmMroiAlert,
  LeadAttributionEvent,
  LeadSource,
  LeadSourceRollup,
  PortalCrmAttributionDashboard,
} from '@/types/crmAttribution'

type Nullable<T> = T | null | undefined
type Row = Record<string, any>

const optional = <T>(value: Nullable<T>) => value === null || value === undefined || value === '' ? undefined : value
const toNumber = (value: unknown) => Number(value || 0)

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: any }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

export interface RecordLeadAttributionInput {
  organizationId: string
  crmInstanceId?: string
  leadId: string
  eventKind?: AttributionEventKind
  source?: string
  campaignId?: string
  landingPageId?: string
  whatsappClickId?: string
  proposalId?: string
  invoiceId?: string
  revenueAmount?: number
  utm?: Partial<CrmAttributionUtm>
  occurredAt?: string
  metadata?: Record<string, unknown>
}

export interface AttributionDashboardFilters {
  organizationId: string
  crmInstanceId?: string
  periodStart?: string
  periodEnd?: string
  sourceId?: string
  campaignId?: string
  sellerId?: string
  teamId?: string
}

export const buildLeadSourcePayload = (input: RecordLeadAttributionInput) => {
  const source = derivePrimarySource({
    source: input.source,
    campaignId: input.campaignId,
    landingPageId: input.landingPageId,
    whatsappClickId: input.whatsappClickId,
    utm: input.utm,
  })

  return {
    organization_id: input.organizationId,
    crm_instance_id: input.crmInstanceId || null,
    key: source.key,
    name: source.name,
    kind: source.kind,
    campaign_id: source.campaignId || null,
    landing_page_id: source.landingPageId || null,
    utm_source: source.utm?.source || null,
    utm_medium: source.utm?.medium || null,
    utm_campaign: source.utm?.campaign || null,
    utm_content: source.utm?.content || null,
    utm_term: source.utm?.term || null,
    client_visible_cost: 0,
  }
}

export const buildAttributionEventPayload = (input: RecordLeadAttributionInput, sourceId?: string) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId || null,
  lead_id: input.leadId,
  source_id: sourceId || null,
  event_kind: input.eventKind || 'lead_created',
  occurred_at: input.occurredAt || new Date().toISOString(),
  campaign_id: input.campaignId || null,
  landing_page_id: input.landingPageId || null,
  proposal_id: input.proposalId || null,
  invoice_id: input.invoiceId || null,
  revenue_amount: input.revenueAmount ?? null,
  utm_source: input.utm?.source || null,
  utm_medium: input.utm?.medium || null,
  utm_campaign: input.utm?.campaign || null,
  utm_content: input.utm?.content || null,
  utm_term: input.utm?.term || null,
  metadata: input.metadata || {},
})

export const buildReportExportPayload = (input: {
  dashboard: CrmAttributionDashboard | PortalCrmAttributionDashboard
  scope: 'internal' | 'portal'
  requestedBy?: string
}) => {
  const csv = buildAttributionCsv(input.dashboard.sources as LeadSourceRollup[], input.scope)
  return {
    organization_id: input.dashboard.organizationId,
    crm_instance_id: input.dashboard.crmInstanceId || null,
    scope: input.scope,
    period_start: input.dashboard.periodStart,
    period_end: input.dashboard.periodEnd,
    requested_by: input.requestedBy || null,
    row_count: input.dashboard.sources.length,
    csv,
  }
}

export function mapLeadSource(row: Row): LeadSource {
  return {
    id: row.id,
    organizationId: row.organization_id,
    crmInstanceId: optional(row.crm_instance_id),
    key: row.key,
    name: row.name,
    kind: row.kind,
    provider: optional(row.provider),
    campaignId: optional(row.campaign_id),
    landingPageId: optional(row.landing_page_id),
    utm: {
      source: optional(row.utm_source),
      medium: optional(row.utm_medium),
      campaign: optional(row.utm_campaign),
      content: optional(row.utm_content),
      term: optional(row.utm_term),
    },
    mediaCost: toNumber(row.media_cost),
    operationalCost: toNumber(row.operational_cost),
    clientVisibleCost: toNumber(row.client_visible_cost),
    isClientCostVisible: row.is_client_cost_visible !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function mapLeadSourceRollup(row: Row): LeadSourceRollup {
  const source = row.lead_sources || row.source || {}
  return {
    id: optional(row.id),
    organizationId: row.organization_id,
    crmInstanceId: optional(row.crm_instance_id),
    sourceId: row.source_id,
    sourceKey: source.key || row.source_key || row.source_id,
    sourceName: source.name || row.source_name || row.source_id,
    sourceKind: source.kind || row.source_kind || 'manual',
    periodStart: row.period_start,
    periodEnd: row.period_end,
    leads: Number(row.leads || 0),
    opportunities: Number(row.opportunities || 0),
    sales: Number(row.sales || 0),
    mediaCost: toNumber(row.media_cost),
    operationalCost: toNumber(row.operational_cost),
    clientVisibleCost: toNumber(row.client_visible_cost),
    attributedRevenue: toNumber(row.attributed_revenue),
    cpl: toNumber(row.cpl),
    opportunityRate: toNumber(row.opportunity_rate),
    conversionRate: toNumber(row.conversion_rate),
    mroi: toNumber(row.mroi),
    sellerId: optional(row.seller_id),
    teamId: optional(row.team_id),
    campaignId: optional(row.campaign_id),
    landingPageId: optional(row.landing_page_id),
  }
}

export function mapAttributionEvent(row: Row): LeadAttributionEvent {
  return {
    id: row.id,
    organizationId: row.organization_id,
    crmInstanceId: optional(row.crm_instance_id),
    leadId: row.lead_id,
    sourceId: optional(row.source_id),
    eventKind: row.event_kind,
    occurredAt: row.occurred_at,
    campaignId: optional(row.campaign_id),
    landingPageId: optional(row.landing_page_id),
    proposalId: optional(row.proposal_id),
    invoiceId: optional(row.invoice_id),
    revenueAmount: row.revenue_amount !== null && row.revenue_amount !== undefined ? Number(row.revenue_amount) : undefined,
    utm: {
      source: optional(row.utm_source),
      medium: optional(row.utm_medium),
      campaign: optional(row.utm_campaign),
      content: optional(row.utm_content),
      term: optional(row.utm_term),
    },
    metadata: row.metadata || {},
  }
}

export function mapCampaignSnapshot(row: Row): CampaignCrmPerformanceSnapshot {
  return {
    id: optional(row.id),
    organizationId: row.organization_id,
    crmInstanceId: optional(row.crm_instance_id),
    campaignId: row.campaign_id,
    sourceId: optional(row.source_id),
    periodStart: row.period_start,
    periodEnd: row.period_end,
    leads: Number(row.leads || 0),
    opportunities: Number(row.opportunities || 0),
    sales: Number(row.sales || 0),
    spend: toNumber(row.spend),
    attributedRevenue: toNumber(row.attributed_revenue),
    cpl: toNumber(row.cpl),
    conversionRate: toNumber(row.conversion_rate),
    mroi: toNumber(row.mroi),
    status: row.status || 'unknown',
  }
}

export function mapMroiAlert(row: Row): CrmMroiAlert {
  return {
    id: optional(row.id),
    organizationId: row.organization_id,
    crmInstanceId: optional(row.crm_instance_id),
    sourceId: optional(row.source_id),
    campaignId: optional(row.campaign_id),
    severity: row.severity,
    status: row.status,
    title: row.title,
    description: row.description,
    metricKey: row.metric_key,
    metricValue: toNumber(row.metric_value),
    thresholdValue: toNumber(row.threshold_value),
    createdAt: optional(row.created_at),
    resolvedAt: optional(row.resolved_at),
  }
}

export function mapReportExport(row: Row): CrmAttributionExport {
  return {
    id: optional(row.id),
    organizationId: row.organization_id,
    crmInstanceId: optional(row.crm_instance_id),
    scope: row.scope,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    requestedBy: optional(row.requested_by),
    rowCount: Number(row.row_count || 0),
    csv: row.csv || '',
    createdAt: optional(row.created_at),
  }
}

export function buildAttributionDashboard(input: {
  organizationId: string
  crmInstanceId?: string
  periodStart: string
  periodEnd: string
  rollups: LeadSourceRollup[]
  alerts?: CrmMroiAlert[]
}): CrmAttributionDashboard {
  const hydrated = input.rollups.map(rollup => {
    const {
      cpl: _cpl,
      opportunityRate: _opportunityRate,
      conversionRate: _conversionRate,
      mroi: _mroi,
      ...rawRollup
    } = rollup
    return hydrateRollupMetrics(rawRollup)
  })
  const leads = hydrated.reduce((sum, item) => sum + item.leads, 0)
  const opportunities = hydrated.reduce((sum, item) => sum + item.opportunities, 0)
  const sales = hydrated.reduce((sum, item) => sum + item.sales, 0)
  const clientVisibleCost = hydrated.reduce((sum, item) => sum + item.clientVisibleCost, 0)
  const attributedRevenue = hydrated.reduce((sum, item) => sum + item.attributedRevenue, 0)
  const syntheticRollup = hydrateRollupMetrics({
    organizationId: input.organizationId,
    crmInstanceId: input.crmInstanceId,
    sourceId: 'total',
    sourceKey: 'total',
    sourceName: 'Total',
    sourceKind: 'manual',
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    leads,
    opportunities,
    sales,
    mediaCost: hydrated.reduce((sum, item) => sum + item.mediaCost, 0),
    operationalCost: hydrated.reduce((sum, item) => sum + item.operationalCost, 0),
    clientVisibleCost,
    attributedRevenue,
  })

  return {
    organizationId: input.organizationId,
    crmInstanceId: input.crmInstanceId,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    totals: {
      leads,
      opportunities,
      sales,
      clientVisibleCost,
      attributedRevenue,
      cpl: syntheticRollup.cpl,
      conversionRate: syntheticRollup.conversionRate,
      mroi: syntheticRollup.mroi,
    },
    sources: hydrated,
    alerts: input.alerts?.length ? input.alerts : buildMroiAlerts({
      rollups: hydrated,
      highCplThreshold: 250,
      lowConversionThreshold: 5,
      highConversionThreshold: 25,
    }),
  }
}

export function buildAttributionCsv(sources: Array<Partial<LeadSourceRollup>>, scope: 'internal' | 'portal' = 'internal') {
  const headers = scope === 'internal'
    ? ['Fonte', 'Tipo', 'Leads', 'Oportunidades', 'Vendas', 'Custo midia', 'Custo operacional', 'Custo portal', 'Receita', 'CPL', 'Conversao', 'MROI']
    : ['Fonte', 'Tipo', 'Leads', 'Oportunidades', 'Vendas', 'Investimento', 'Receita', 'CPL', 'Conversao', 'MROI']

  const rows = sources.map(source => {
    const common = [
      source.sourceName || source.sourceKey || source.sourceId || '',
      source.sourceKind || '',
      source.leads || 0,
      source.opportunities || 0,
      source.sales || 0,
    ]
    const metrics = scope === 'internal'
      ? [source.mediaCost || 0, source.operationalCost || 0, source.clientVisibleCost || 0, source.attributedRevenue || 0, source.cpl || 0, source.conversionRate || 0, source.mroi || 0]
      : [source.clientVisibleCost || 0, source.attributedRevenue || 0, source.cpl || 0, source.conversionRate || 0, source.mroi || 0]
    return [...common, ...metrics].map(escapeCsv).join(',')
  })

  return [headers.join(','), ...rows].join('\n')
}

function applyDashboardFilters(query: any, filters: AttributionDashboardFilters) {
  let nextQuery = query.eq('organization_id', filters.organizationId)
  if (filters.crmInstanceId) nextQuery = nextQuery.eq('crm_instance_id', filters.crmInstanceId)
  if (filters.periodStart) nextQuery = nextQuery.gte('period_start', filters.periodStart)
  if (filters.periodEnd) nextQuery = nextQuery.lte('period_end', filters.periodEnd)
  if (filters.sourceId) nextQuery = nextQuery.eq('source_id', filters.sourceId)
  if (filters.campaignId) nextQuery = nextQuery.eq('campaign_id', filters.campaignId)
  if (filters.sellerId) nextQuery = nextQuery.eq('seller_id', filters.sellerId)
  if (filters.teamId) nextQuery = nextQuery.eq('team_id', filters.teamId)
  return nextQuery
}

function escapeCsv(value: unknown) {
  const text = String(value ?? '')
  if (!/[",\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}

export const crmAttributionService = {
  async recordLeadAttribution(input: RecordLeadAttributionInput): Promise<LeadAttributionEvent> {
    const sourcePayload = buildLeadSourcePayload(input)
    const source = await requireData<Row>(supabase
      .from('lead_sources')
      .upsert(sourcePayload, { onConflict: 'organization_id,crm_instance_id,key' })
      .select()
      .single())

    const event = await requireData<Row>(supabase
      .from('lead_attribution_events')
      .insert(buildAttributionEventPayload(input, source.id))
      .select()
      .single())

    await supabase
      .from('leads')
      .update({ primary_source_id: source.id, source_confidence: derivePrimarySource({ source: input.source, campaignId: input.campaignId, landingPageId: input.landingPageId, whatsappClickId: input.whatsappClickId, utm: input.utm }).confidence })
      .eq('id', input.leadId)
      .is('primary_source_id', null)

    return mapAttributionEvent(event)
  },

  async getLeadSourcesDashboard(filters: AttributionDashboardFilters): Promise<CrmAttributionDashboard> {
    const periodStart = filters.periodStart || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    const periodEnd = filters.periodEnd || new Date().toISOString().slice(0, 10)
    const [rollupRows, alertRows] = await Promise.all([
      requireData<Row[]>(applyDashboardFilters(
        supabase.from('lead_source_rollups').select('*, lead_sources(*)').order('leads', { ascending: false }),
        { ...filters, periodStart, periodEnd },
      )),
      requireData<Row[]>(supabase
        .from('crm_mroi_alerts')
        .select('*')
        .eq('organization_id', filters.organizationId)
        .eq('status', 'open')
        .order('created_at', { ascending: false })),
    ])

    return buildAttributionDashboard({
      organizationId: filters.organizationId,
      crmInstanceId: filters.crmInstanceId,
      periodStart,
      periodEnd,
      rollups: (rollupRows || []).map(mapLeadSourceRollup),
      alerts: (alertRows || []).map(mapMroiAlert),
    })
  },

  async getSourceFunnel(filters: AttributionDashboardFilters) {
    const dashboard = await this.getLeadSourcesDashboard(filters)
    return dashboard.sources.map(source => ({
      sourceId: source.sourceId,
      sourceName: source.sourceName,
      leads: source.leads,
      opportunities: source.opportunities,
      sales: source.sales,
      opportunityRate: source.opportunityRate,
      conversionRate: source.conversionRate,
    }))
  },

  async getCampaignMroi(campaignId: string): Promise<CampaignCrmPerformanceSnapshot[]> {
    const rows = await requireData<Row[]>(supabase
      .from('campaign_crm_performance_snapshots')
      .select('*')
      .eq('campaign_id', campaignId)
      .order('period_start', { ascending: false }))
    return (rows || []).map(mapCampaignSnapshot)
  },

  async getPortalSafeMroi(filters: AttributionDashboardFilters): Promise<PortalCrmAttributionDashboard> {
    return sanitizePortalAttribution(await this.getLeadSourcesDashboard(filters))
  },

  async createMroiAlert(alert: Omit<CrmMroiAlert, 'id' | 'createdAt' | 'resolvedAt'>): Promise<CrmMroiAlert> {
    const row = await requireData<Row>(supabase.from('crm_mroi_alerts').insert({
      organization_id: alert.organizationId,
      crm_instance_id: alert.crmInstanceId || null,
      source_id: alert.sourceId || null,
      campaign_id: alert.campaignId || null,
      severity: alert.severity,
      status: alert.status,
      title: alert.title,
      description: alert.description,
      metric_key: alert.metricKey,
      metric_value: alert.metricValue,
      threshold_value: alert.thresholdValue,
    }).select().single())
    return mapMroiAlert(row)
  },

  async exportAttributionCsv(input: {
    dashboard: CrmAttributionDashboard | PortalCrmAttributionDashboard
    scope?: 'internal' | 'portal'
    requestedBy?: string
  }): Promise<CrmAttributionExport> {
    const payload = buildReportExportPayload({
      dashboard: input.dashboard,
      scope: input.scope || 'internal',
      requestedBy: input.requestedBy,
    })
    const row = await requireData<Row>(supabase.from('crm_report_exports').insert(payload).select().single())
    return mapReportExport(row)
  },
}
