export type LeadSourceKind =
  | 'paid_campaign'
  | 'landing_page'
  | 'whatsapp'
  | 'organic'
  | 'referral'
  | 'direct'
  | 'manual'

export type AttributionEventKind =
  | 'first_touch'
  | 'lead_created'
  | 'campaign_click'
  | 'landing_page_submit'
  | 'whatsapp_click'
  | 'proposal_approved'
  | 'invoice_paid'

export type SourceConfidence = 'high' | 'medium' | 'low'
export type MroiAlertSeverity = 'info' | 'warning' | 'critical' | 'success'
export type MroiAlertStatus = 'open' | 'acknowledged' | 'resolved'
export type CrmPerformanceStatus = 'excellent' | 'healthy' | 'watch' | 'critical' | 'unknown'

export interface CrmAttributionUtm {
  source?: string
  medium?: string
  campaign?: string
  content?: string
  term?: string
}

export interface LeadSource {
  id: string
  organizationId: string
  crmInstanceId?: string
  key: string
  name: string
  kind: LeadSourceKind
  provider?: string
  campaignId?: string
  landingPageId?: string
  utm?: CrmAttributionUtm
  mediaCost: number
  operationalCost: number
  clientVisibleCost: number
  isClientCostVisible: boolean
  createdAt: string
  updatedAt: string
}

export interface LeadAttributionEvent {
  id: string
  organizationId: string
  crmInstanceId?: string
  leadId: string
  sourceId?: string
  eventKind: AttributionEventKind
  occurredAt: string
  campaignId?: string
  landingPageId?: string
  proposalId?: string
  invoiceId?: string
  revenueAmount?: number
  utm?: CrmAttributionUtm
  metadata?: Record<string, unknown>
}

export interface LeadPrimarySourceDerivation {
  key: string
  name: string
  kind: LeadSourceKind
  confidence: SourceConfidence
  campaignId?: string
  landingPageId?: string
  utm?: CrmAttributionUtm
}

export interface LeadSourceRollup {
  id?: string
  organizationId: string
  crmInstanceId?: string
  sourceId: string
  sourceKey: string
  sourceName: string
  sourceKind: LeadSourceKind
  periodStart: string
  periodEnd: string
  leads: number
  opportunities: number
  sales: number
  mediaCost: number
  operationalCost: number
  clientVisibleCost: number
  attributedRevenue: number
  cpl: number
  opportunityRate: number
  conversionRate: number
  mroi: number
  sellerId?: string
  teamId?: string
  campaignId?: string
  landingPageId?: string
}

export interface CampaignCrmPerformanceSnapshot {
  id?: string
  organizationId: string
  crmInstanceId?: string
  campaignId: string
  sourceId?: string
  periodStart: string
  periodEnd: string
  leads: number
  opportunities: number
  sales: number
  spend: number
  attributedRevenue: number
  cpl: number
  conversionRate: number
  mroi: number
  status: CrmPerformanceStatus
}

export interface CrmRevenueAttribution {
  id?: string
  organizationId: string
  crmInstanceId?: string
  leadId: string
  sourceId?: string
  proposalId?: string
  contractId?: string
  invoiceId?: string
  amount: number
  attributionModel: 'primary_source' | 'manual' | 'proposal_source' | 'invoice_source'
  occurredAt: string
}

export interface CrmMroiAlert {
  id?: string
  organizationId: string
  crmInstanceId?: string
  sourceId?: string
  campaignId?: string
  severity: MroiAlertSeverity
  status: MroiAlertStatus
  title: string
  description: string
  metricKey: 'cpl' | 'conversion_rate' | 'mroi' | 'revenue'
  metricValue: number
  thresholdValue: number
  createdAt?: string
  resolvedAt?: string
}

export interface CrmAttributionDashboard {
  organizationId: string
  crmInstanceId?: string
  periodStart: string
  periodEnd: string
  totals: {
    leads: number
    opportunities: number
    sales: number
    clientVisibleCost: number
    attributedRevenue: number
    cpl: number
    conversionRate: number
    mroi: number
  }
  sources: LeadSourceRollup[]
  alerts: CrmMroiAlert[]
}

export type PortalLeadSourceRollup = Omit<LeadSourceRollup, 'mediaCost' | 'operationalCost'> & {
  mediaCost?: never
  operationalCost?: never
}

export type PortalCrmAttributionDashboard = Omit<CrmAttributionDashboard, 'sources'> & {
  sources: PortalLeadSourceRollup[]
}

export interface CrmAttributionExport {
  id?: string
  organizationId: string
  crmInstanceId?: string
  scope: 'internal' | 'portal'
  periodStart: string
  periodEnd: string
  requestedBy?: string
  rowCount: number
  csv: string
  createdAt?: string
}
