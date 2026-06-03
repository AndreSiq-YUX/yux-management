import { supabase } from '@/lib/supabase'
import { calculateCpl, calculateMroi, calculateStageConversion, sanitizeReportForPortal } from '@/lib/reports/reportRules'
import type {
  CampaignReportMetric,
  LandingPageReportMetric,
  OperationalReport,
  OwnerActivityMetric,
  PortalOperationalReport,
  SourceBreakdown,
  StageConversion,
} from '@/types/reports'

type Row = Record<string, any>

export function buildOperationalReport(input: {
  organizationId: string
  leads?: Row[]
  campaigns?: Row[]
  landingPages?: Row[]
  proposals?: Row[]
  conversations?: Row[]
  interactions?: Row[]
  projects?: Row[]
}): OperationalReport {
  const leads = input.leads || []
  const campaigns = input.campaigns || []
  const landingPages = input.landingPages || []
  const proposals = input.proposals || []
  const conversations = input.conversations || []
  const interactions = input.interactions || []
  const projects = input.projects || []

  const leadsBySource = Object.entries(leads.reduce<Record<string, number>>((acc, lead) => {
    const source = lead.source_kind || lead.source || 'manual'
    acc[source] = (acc[source] || 0) + 1
    return acc
  }, {})).map(([source, count]) => ({ source, leads: count } satisfies SourceBreakdown))

  const stageCounts = leads.reduce<Record<string, number>>((acc, lead) => {
    const stage = lead.stage || lead.status || 'open'
    acc[stage] = (acc[stage] || 0) + 1
    return acc
  }, {})
  const stageConversions: StageConversion[] = Object.entries(stageCounts).map(([stage, entered], index, all) => {
    const advanced = all.slice(index + 1).reduce((sum, [, count]) => sum + count, 0)
    return { stage, entered, advanced, conversionRate: calculateStageConversion({ entered, advanced }) }
  })

  const campaignMetrics: CampaignReportMetric[] = campaigns.map(campaign => {
    const spend = Number(campaign.spend || 0)
    const leads = Number(campaign.leads || campaign.conversions || 0)
    return {
      campaignId: campaign.id,
      name: campaign.name,
      spend,
      leads,
      cpl: calculateCpl({ spend, leads }),
      mroi: calculateMroi({ spend, attributedRevenue: Number(campaign.attributed_revenue || campaign.attributedRevenue || 0) }),
    }
  })

  const landingPageMetrics: LandingPageReportMetric[] = landingPages.map(page => {
    const visits = Number(page.visits || 0)
    const leads = Number(page.leads || 0)
    return {
      landingPageId: page.id,
      name: page.name,
      visits,
      leads,
      conversionRate: calculateStageConversion({ entered: visits, advanced: leads }),
    }
  })

  const sent = proposals.filter(proposal => ['sent', 'approved', 'signed', 'converted'].includes(proposal.status)).length
  const approved = proposals.filter(proposal => ['approved', 'signed', 'converted'].includes(proposal.status)).length
  const responseTimes = conversations.map(conversation => Number(conversation.first_response_minutes || 0)).filter(Boolean)

  const ownerActivity = Object.entries(interactions.reduce<Record<string, number>>((acc, interaction) => {
    const owner = interaction.owner_name || interaction.owner || 'Sem responsavel'
    acc[owner] = (acc[owner] || 0) + 1
    return acc
  }, {})).map(([owner, activities]) => ({ owner, activities } satisfies OwnerActivityMetric))

  return {
    organizationId: input.organizationId,
    generatedAt: new Date().toISOString(),
    leadsBySource,
    stageConversions,
    responseTimeHours: responseTimes.length ? Math.round((responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length / 60) * 10) / 10 : 0,
    stalledOpportunities: leads.filter(lead => lead.status === 'open' && lead.last_activity_at && Date.now() - new Date(lead.last_activity_at).getTime() > 7 * 24 * 60 * 60 * 1000).length,
    campaignMetrics,
    landingPageMetrics,
    proposalMetrics: { sent, approved, approvalRate: calculateStageConversion({ entered: sent, advanced: approved }) },
    ownerActivity,
    projectDelivery: [{ label: 'Projetos ativos', value: projects.filter(project => project.status !== 'completed' && project.status !== 'cancelled').length }],
  }
}

export function mapReportSnapshot(row: Row) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    scope: row.scope,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    generatedAt: row.generated_at,
    metrics: row.metrics || {},
  }
}

export const buildMetricCachePayload = (input: { organizationId: string; metricKey: string; value: number; dimensions?: Record<string, unknown> }) => ({
  organization_id: input.organizationId,
  metric_key: input.metricKey,
  metric_value: input.value,
  dimensions: input.dimensions || {},
})

async function readTable(table: string, organizationId: string) {
  const { data, error } = await supabase.from(table).select('*').eq('organization_id', organizationId)
  if (error) return []
  return data || []
}

export const reportService = {
  async getOperationalReport(organizationId: string): Promise<OperationalReport> {
    const [leads, campaigns, landingPages, proposals, conversations, interactions, projects] = await Promise.all([
      readTable('leads', organizationId),
      readTable('campaigns', organizationId),
      readTable('landing_pages', organizationId),
      readTable('proposals', organizationId),
      readTable('conversations', organizationId),
      readTable('interactions', organizationId),
      readTable('projects', organizationId),
    ])
    return buildOperationalReport({ organizationId, leads, campaigns, landingPages, proposals, conversations, interactions, projects })
  },

  async getPortalReport(organizationId: string): Promise<PortalOperationalReport> {
    return sanitizeReportForPortal(await this.getOperationalReport(organizationId))
  },

  async saveSnapshot(report: OperationalReport, scope: 'internal' | 'portal' = 'internal') {
    const { data, error } = await supabase.from('report_snapshots').insert({
      organization_id: report.organizationId,
      scope,
      metrics: report,
      period_start: new Date().toISOString().slice(0, 10),
      period_end: new Date().toISOString().slice(0, 10),
    }).select().single()
    if (error) throw error
    return mapReportSnapshot(data)
  },
}
