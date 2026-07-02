export type RadarCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'

export type RadarSourceType =
  | 'manual'
  | 'csv'
  | 'jina_reader'
  | 'jina_search'
  | 'web_search'
  | 'opencnpj'
  | 'public_registry'
  | 'future_paid_api'

export type RadarRunStatus = 'pending' | 'running' | 'succeeded' | 'failed'
export type RadarCandidateStatus = 'pending_review' | 'imported' | 'discarded' | 'duplicate' | 'failed'

export type RadarOpportunityStatus =
  | 'raw'
  | 'enriching'
  | 'enriched'
  | 'diagnosing'
  | 'diagnosed'
  | 'message_drafted'
  | 'review_pending'
  | 'approved'
  | 'rejected'
  | 'discarded'
  | 'opted_out'
  | 'converted'

export type RadarMessageStatus = 'draft' | 'approved' | 'rejected' | 'converted'

export type RadarMetrics = {
  companies: number
  opportunities: number
  enriched: number
  reviewPending: number
  approved: number
  converted: number
  optedOut: number
  estimatedCost: number
  sourceBreakdown: Array<{
    sourceType: string
    companies: number
    opportunities: number
    candidates: number
    converted: number
    estimatedCost: number
  }>
}

export type RadarCampaignRow = {
  id: string
  organization_id: string
  name: string
  campaign_type: 'local_niche'
  target_segment: string
  target_city: string
  target_state: string
  target_keywords: string[]
  target_cnaes: string[]
  offer_type: string
  status: RadarCampaignStatus
  owner_id: string | null
  budget_limit: string | number | null
  daily_limit: number
  automation_level: 'human_review_required'
  strategy_profile_key: string
  created_by: string | null
  created_at: string
  updated_at: string
}

export type RadarCompanyRecordRow = {
  id: string
  organization_id: string
  cnpj: string | null
  legal_name: string | null
  trade_name: string | null
  cnae_main: string | null
  city: string | null
  state: string | null
  address: string | null
  phone_raw: string | null
  email_raw: string | null
  website_url: string | null
  source_type: string
  source_url: string | null
  source_collected_at: string
  dedupe_key: string
  dedupe_status: string
  record_status: string
  created_at: string
  updated_at: string
}

export type RadarDataSourceRow = {
  id: string
  organization_id: string | null
  source_key: string
  source_type: RadarSourceType
  display_name: string
  enabled: boolean
  is_paid: boolean
  requires_secret: boolean
  terms_notes: string | null
  default_cost_per_unit: string | number
  rate_limit_per_day: number
  created_at: string
  updated_at: string
}

export type RadarEnrichmentRunRow = {
  id: string
  organization_id: string
  campaign_id: string
  company_record_id: string | null
  opportunity_id: string | null
  data_source_id: string | null
  agent_execution_run_id: string | null
  status: RadarRunStatus
  provider: string
  input_payload: Record<string, unknown>
  output_payload: Record<string, unknown>
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
  updated_at: string
}

export type RadarCandidateRecordRow = {
  id: string
  organization_id: string
  campaign_id: string
  enrichment_run_id: string | null
  source_type: string
  source_url: string | null
  title: string
  snippet: string | null
  raw_payload: Record<string, unknown>
  normalized_payload: Record<string, unknown>
  dedupe_key: string
  status: RadarCandidateStatus
  imported_company_record_id: string | null
  imported_opportunity_id: string | null
  error_message: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  created_at: string
  updated_at: string
}

export type RadarOpportunityRow = {
  id: string
  organization_id: string
  campaign_id: string
  company_record_id: string
  status: RadarOpportunityStatus
  owner_id: string | null
  priority: 'low' | 'medium' | 'high' | 'urgent'
  latest_score_id: string | null
  latest_diagnostic_id: string | null
  latest_message_suggestion_id: string | null
  converted_lead_id: string | null
  converted_at: string | null
  converted_by: string | null
  created_at: string
  updated_at: string
}

export type RadarScoreRow = {
  id: string
  total_score: number
  fit_score: number
  timing_score: number
  pain_score: number
  contactability_score: number
  budget_score: number
  personalization_score: number
  explanation: string
  created_at: string
}

export type RadarDiagnosticRow = {
  id: string
  summary: string
  detected_services: string[]
  detected_channels: string[]
  pain_hypotheses: string[]
  recommended_offer: string | null
  evidence_json: Array<Record<string, unknown>>
  risk_flags: string[]
  strategy_profile_key: string
  ai_cost_estimate: string | number
  created_at: string
}

export type RadarPolicyDecision = {
  status: 'requires_human_approval' | 'blocked'
  canSendAutomatically: false
  canConvertToLead: boolean
  blockedReasons: string[]
  requiredReviewFields: string[]
}

export type RadarMessageSuggestionRow = {
  id: string
  channel: 'email' | 'linkedin' | 'phone' | 'whatsapp_manual' | 'task'
  subject: string | null
  body: string
  personalization_notes: string | null
  evidence_used: Array<Record<string, unknown>>
  policy_decision: RadarPolicyDecision
  status: RadarMessageStatus
  approved_by: string | null
  approved_at: string | null
  created_at: string
  updated_at: string
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
  status: RadarRunStatus
  provider: string
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
  rawPayload: Record<string, unknown>
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
