export type RadarCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type RadarOpportunityStatus = 'raw' | 'enriching' | 'enriched' | 'diagnosing' | 'diagnosed' | 'message_drafted' | 'review_pending' | 'approved' | 'rejected' | 'discarded' | 'opted_out' | 'converted'
export type RadarMessageStatus = 'draft' | 'approved' | 'rejected' | 'converted'
export type RadarSourceType = 'manual' | 'csv' | 'jina_reader' | 'jina_search' | 'web_search' | 'opencnpj' | 'public_registry' | 'future_paid_api'
export type RadarRunStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type RadarCandidateStatus = 'pending_review' | 'imported' | 'discarded' | 'duplicate' | 'failed'
export type RadarDuplicateStatus = 'pending' | 'confirmed' | 'dismissed' | 'merged'

export interface RadarDataSource {
  id: string
  organizationId?: string
  sourceKey: string
  sourceType: RadarSourceType
  displayName: string
  enabled: boolean
  isPaid: boolean
  requiresSecret: boolean
  termsNotes?: string
  defaultCostPerUnit: number
  rateLimitPerDay: number
  createdAt: string
  updatedAt: string
}

export interface RadarEnrichmentRun {
  id: string
  organizationId: string
  campaignId: string
  companyRecordId?: string
  opportunityId?: string
  dataSourceId?: string
  agentExecutionRunId?: string
  provider: string
  status: RadarRunStatus
  inputPayload: Record<string, unknown>
  outputPayload: Record<string, unknown>
  errorMessage?: string
  startedAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface RadarCandidateRecord {
  id: string
  organizationId: string
  campaignId: string
  enrichmentRunId?: string
  sourceType: string
  sourceUrl?: string
  title: string
  snippet?: string
  rawPayload?: Record<string, unknown>
  normalizedPayload: Record<string, unknown>
  dedupeKey: string
  status: RadarCandidateStatus
  importedCompanyRecordId?: string
  importedOpportunityId?: string
  errorMessage?: string
  reviewedBy?: string
  reviewedAt?: string
  createdAt: string
  updatedAt: string
}

export interface RadarDuplicateCandidate {
  id: string
  organization_id?: string
  organizationId?: string
  campaign_id?: string
  campaignId?: string
  company_record_id?: string
  companyRecordId?: string
  duplicate_company_record_id?: string
  duplicateCompanyRecordId?: string
  match_type?: string
  matchType?: string
  confidence_score?: number
  confidenceScore?: number
  status: RadarDuplicateStatus
  created_at?: string
  createdAt?: string
  updated_at?: string
  updatedAt?: string
}

export interface RadarImportIssue {
  rowNumber?: number
  url?: string
  code: string
  message: string
  sourceType?: string
  limit?: number
  used?: number
}

export interface RadarImportSummary {
  kind: 'csv' | 'urls' | 'search'
  importedCount: number
  candidateCount: number
  issueCount: number
  issues: RadarImportIssue[]
  runId?: string
}

export interface RadarCampaign {
  id: string
  organizationId: string
  name: string
  campaignType: 'local_niche'
  targetSegment: string
  targetCity: string
  targetState: string
  targetKeywords: string[]
  targetCnaes: string[]
  offerType: string
  status: RadarCampaignStatus
  ownerId?: string
  budgetLimit?: number
  dailyLimit: number
  automationLevel: 'human_review_required'
  strategyProfileKey: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface RadarCompanyRecord {
  id: string
  organizationId: string
  cnpj?: string
  legalName?: string
  tradeName?: string
  cnaeMain?: string
  city?: string
  state?: string
  address?: string
  phoneRaw?: string
  emailRaw?: string
  websiteUrl?: string
  sourceType: string
  sourceUrl?: string
  sourceCollectedAt: string
  dedupeKey: string
  dedupeStatus: string
  recordStatus: string
  createdAt: string
  updatedAt: string
}

export interface RadarScore {
  id: string
  totalScore: number
  fitScore: number
  timingScore: number
  painScore: number
  contactabilityScore: number
  budgetScore: number
  personalizationScore: number
  explanation: string
  createdAt: string
}

export interface RadarDiagnostic {
  id: string
  summary: string
  detectedServices: string[]
  detectedChannels: string[]
  painHypotheses: string[]
  recommendedOffer?: string
  evidence: Array<Record<string, unknown>>
  riskFlags: string[]
  strategyProfileKey: string
  aiCostEstimate: number
  createdAt: string
}

export interface RadarPolicyDecision {
  status: 'requires_human_approval' | 'blocked'
  canSendAutomatically: false
  canConvertToLead: boolean
  blockedReasons: string[]
  requiredReviewFields: string[]
}

export interface RadarMessageSuggestion {
  id: string
  channel: 'email' | 'linkedin' | 'phone' | 'whatsapp_manual' | 'task'
  subject?: string
  body: string
  personalizationNotes?: string
  evidenceUsed: Array<Record<string, unknown>>
  policyDecision: RadarPolicyDecision
  status: RadarMessageStatus
  approvedBy?: string
  approvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface RadarOpportunity {
  id: string
  organizationId: string
  campaignId: string
  companyRecordId: string
  status: RadarOpportunityStatus
  ownerId?: string
  priority: 'low' | 'medium' | 'high' | 'urgent'
  latestScoreId?: string
  latestDiagnosticId?: string
  latestMessageSuggestionId?: string
  convertedLeadId?: string
  convertedAt?: string
  convertedBy?: string
  company?: RadarCompanyRecord
  latestScore?: RadarScore
  latestDiagnostic?: RadarDiagnostic
  latestMessageSuggestion?: RadarMessageSuggestion
  createdAt: string
  updatedAt: string
}

export interface RadarMetrics {
  companies: number
  opportunities: number
  enriched: number
  reviewPending: number
  approved: number
  converted: number
  optedOut: number
  estimatedCost: number
  sourceBreakdown?: Array<{
    sourceType: string
    companies: number
    opportunities: number
    candidates: number
    converted: number
    estimatedCost: number
  }>
}
