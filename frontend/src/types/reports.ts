import type { CrmAttributionDashboard } from './crmAttribution'

export interface ReportMetric {
  label: string
  value: number
  unit?: string
}

export interface SourceBreakdown {
  source: string
  leads: number
}

export interface StageConversion {
  stage: string
  entered: number
  advanced: number
  conversionRate: number
}

export interface CampaignReportMetric {
  campaignId: string
  name: string
  spend: number
  impressions?: number
  clicks?: number
  leads: number
  cpl: number
  opportunities?: number
  proposals?: number
  clients?: number
  revenue?: number
  mroi: number
  syncStatus?: 'connected' | 'stale' | 'needs_reauth' | 'failed' | 'not_configured'
  aiRecommendation?: string
}

export interface ExecutiveCampaignMetric {
  campaignId: string
  name: string
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number
  opportunities: number
  proposals: number
  clients: number
  revenue: number
  mroi: number
  syncStatus: 'connected' | 'stale' | 'needs_reauth' | 'failed' | 'not_configured'
  aiRecommendation: string
}

export interface ExecutiveCampaignSummary {
  spend: number
  impressions: number
  clicks: number
  leads: number
  cpl: number
  opportunities: number
  proposals: number
  clients: number
  revenue: number
  mroi: number
  syncStatus: ExecutiveCampaignMetric['syncStatus']
  aiRecommendation: string
}

export type ReportPresetKey =
  | 'campaign_performance'
  | 'lead_source_roi'
  | 'landing_page_conversion'
  | 'whatsapp_follow_up'
  | 'automation_impact'
  | 'sector_onboarding_progress'
  | 'brand_knowledge_readiness'

export interface ReportPreset {
  key: ReportPresetKey
  label: string
  description: string
  moduleKey: string
  portalVisible: boolean
}

export interface ReportAiInsight {
  topOpportunity: string
  periodChange: string
  dataGaps: string[]
  attributionCaveat?: string
}

export interface LandingPageReportMetric {
  landingPageId: string
  name: string
  visits: number
  leads: number
  conversionRate: number
}

export interface ProposalReportMetric {
  sent: number
  approved: number
  approvalRate: number
}

export interface OwnerActivityMetric {
  owner: string
  activities: number
}

export interface OperationalReport {
  organizationId: string
  generatedAt: string
  leadsBySource: SourceBreakdown[]
  stageConversions: StageConversion[]
  responseTimeHours: number
  stalledOpportunities: number
  campaignMetrics: CampaignReportMetric[]
  landingPageMetrics: LandingPageReportMetric[]
  proposalMetrics: ProposalReportMetric
  ownerActivity: OwnerActivityMetric[]
  projectDelivery: ReportMetric[]
  crmAttribution?: CrmAttributionDashboard
  executiveCampaignMetrics?: ExecutiveCampaignMetric[]
  executiveCampaignSummary?: ExecutiveCampaignSummary
  reportPresets?: ReportPreset[]
  aiInsight?: ReportAiInsight
}

export type PortalOperationalReport = Omit<OperationalReport, 'ownerActivity'> & {
  ownerActivity?: never
}
