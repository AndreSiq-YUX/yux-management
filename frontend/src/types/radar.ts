export type RadarCampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived'
export type RadarOpportunityStatus = 'raw' | 'enriching' | 'enriched' | 'diagnosing' | 'diagnosed' | 'message_drafted' | 'review_pending' | 'approved' | 'rejected' | 'discarded' | 'opted_out' | 'converted'
export type RadarMessageStatus = 'draft' | 'approved' | 'rejected' | 'converted'

export interface RadarDataSource {
  id: string
  organizationId?: string
  sourceKey: string
  sourceType: string
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
}
