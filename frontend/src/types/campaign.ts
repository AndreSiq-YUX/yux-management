export type AdProviderKey = 'meta' | 'google'
export type ProviderConnectionStatus = 'connected' | 'stale' | 'needs_reauth' | 'failed'
export type CampaignLifecycleStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'syncing'
  | 'active'
  | 'paused'
  | 'archived'
  | 'failed'

export type CampaignObjective = 'lead_generation' | 'traffic' | 'conversions' | 'awareness'
export type ProviderMutationAction = 'create_campaign' | 'update_budget' | 'pause_campaign' | 'sync_metrics'

export interface AdProviderConnection {
  id: string
  organizationId: string
  clientId?: string
  contractId?: string
  provider: AdProviderKey
  name: string
  status: ProviderConnectionStatus
  providerAccountId?: string
  tokenReferenceConfigured?: boolean
  lastSyncAt?: string
  createdAt: string
  updatedAt: string
}

export interface AdAccount {
  id: string
  providerConnectionId: string
  provider: AdProviderKey
  externalAccountId: string
  name: string
  currency: string
  createdAt: string
  updatedAt: string
}

export interface CampaignExecutionLog {
  id: string
  action?: ProviderMutationAction
  status: 'pending' | 'running' | 'succeeded' | 'failed'
  protectedError?: string
  createdAt?: string
}

export interface CampaignCreative {
  id: string
  campaignId: string
  name: string
  format: 'image' | 'video' | 'carousel' | 'text'
  headline?: string
  body?: string
  mediaUrl?: string
  createdAt: string
  updatedAt: string
}

export interface CampaignRecommendation {
  id: string
  campaignId: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high'
}

export interface CampaignAlert {
  id: string
  campaignId: string
  title: string
  severity: 'info' | 'warning' | 'critical'
}

export interface Campaign {
  id: string
  organizationId: string
  clientId: string
  contractId: string
  providerConnectionId?: string
  adAccountId?: string
  landingPageId?: string
  pipelineId?: string
  initialStageId?: string
  name: string
  provider: AdProviderKey
  objective: CampaignObjective
  lifecycleStatus: CampaignLifecycleStatus
  dailyBudget: number
  totalBudget?: number
  startsAt?: string
  endsAt?: string
  spend: number
  attributedRevenue: number
  impressions: number
  clicks: number
  leads: number
  opportunities?: number
  proposals?: number
  clients?: number
  cpl: number
  mroi: number
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  protectedError?: string
  executionLogs?: CampaignExecutionLog[]
  creatives?: CampaignCreative[]
  recommendations?: CampaignRecommendation[]
  alerts?: CampaignAlert[]
  createdAt: string
  updatedAt: string
}

export type PortalCampaign = Omit<Campaign, 'protectedError' | 'executionLogs'> & {
  protectedError?: never
  executionLogs?: never
}

export interface BudgetChangeInput {
  currentDaily: number
  nextDaily: number
  explicitApproval?: boolean
}

export type BudgetChangeValidation =
  | { ok: true }
  | { ok: false; reason: 'budget_change_requires_explicit_approval' | 'budget_must_be_positive' }

export interface CreateCampaignDraftInput {
  organizationId: string
  clientId: string
  contractId: string
  provider: AdProviderKey
  providerConnectionId?: string
  adAccountId?: string
  landingPageId?: string
  pipelineId?: string
  initialStageId?: string
  name: string
  objective: CampaignObjective
  dailyBudget: number
  totalBudget?: number
  startsAt?: string
  endsAt?: string
  utmCampaign?: string
}
