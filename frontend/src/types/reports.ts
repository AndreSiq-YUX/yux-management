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
  leads: number
  cpl: number
  mroi: number
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
}

export type PortalOperationalReport = Omit<OperationalReport, 'ownerActivity'> & {
  ownerActivity?: never
}
