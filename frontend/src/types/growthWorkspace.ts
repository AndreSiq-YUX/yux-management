import type { CrmInteraction, CrmTask } from './crm'

export type Record360Type = 'lead' | 'contact' | 'company' | 'opportunity' | 'client'

export type Record360TabKey =
  | 'summary'
  | 'about'
  | 'activities'
  | 'conversations'
  | 'proposals_revenue'
  | 'intelligence'

export interface Record360Tab {
  key: Record360TabKey
  label: string
  isAvailable: boolean
}

export type RecordAssociationKind =
  | 'company'
  | 'contacts'
  | 'opportunities'
  | 'campaigns'
  | 'tickets'
  | 'documents'
  | 'contracts'
  | 'invoices'
  | 'automations'

export interface RecordAssociationSummary {
  kind: RecordAssociationKind
  label: string
  count: number
}

export type RecordMissingDataKey = 'email' | 'phone' | 'owner' | 'company' | 'source' | 'nextAction'

export interface RecordMissingDataItem {
  key: RecordMissingDataKey
  label: string
  priority: 'high' | 'medium' | 'low'
}

export type RecordNextActionKind =
  | 'overdue_task'
  | 'open_proposal'
  | 'unanswered_conversation'
  | 'missing_owner'
  | 'ai_suggestion'
  | 'review'

export interface RecordNextAction {
  kind: RecordNextActionKind
  label: string
  description: string
  priority: number
  dueAt?: string
  sourceId?: string
}

export type CampaignPlanObjective =
  | 'lead_generation'
  | 'whatsapp_capture'
  | 'offer_promotion'
  | 'reactivation'
  | 'appointment_booking'
  | 'service_launch'
  | 'remarketing'

export type CampaignPlanStatus =
  | 'draft'
  | 'planning'
  | 'waiting_assets'
  | 'waiting_approval'
  | 'ready'
  | 'active'
  | 'paused'
  | 'completed'
  | 'cancelled'

export type CampaignPlanStepKey =
  | 'segment'
  | 'landing_page'
  | 'form'
  | 'creative'
  | 'ad'
  | 'organic_post'
  | 'whatsapp_or_email_followup'
  | 'automation'
  | 'approval'
  | 'report'

export type CampaignPlanStepStatus =
  | 'not_started'
  | 'blocked'
  | 'in_progress'
  | 'linked'
  | 'completed'
  | 'skipped'

export interface CampaignPlanStepTemplate {
  key: CampaignPlanStepKey
  label: string
  description: string
  moduleKey: string
  sortOrder: number
  isRequired: boolean
  dependsOn: CampaignPlanStepKey[]
  actionLabel: string
}

export interface CampaignPlanStep extends CampaignPlanStepTemplate {
  id: string
  planId: string
  status: CampaignPlanStepStatus
  linkedEntityType?: string
  linkedEntityId?: string
  ownerId?: string
  dueAt?: string
  completedAt?: string
  blockedReason?: string
}

export interface CampaignPlan {
  id: string
  organizationId: string
  contractId?: string
  name: string
  objective: CampaignPlanObjective
  status: CampaignPlanStatus
  ownerId?: string
  sourceBlueprintId?: string
  steps: CampaignPlanStep[]
  createdAt?: string
  updatedAt?: string
}

export type GrowthTemplateKind =
  | 'campaign'
  | 'landing_page'
  | 'post'
  | 'paid_ad'
  | 'whatsapp_message'
  | 'email'
  | 'smart_segment'
  | 'automation'
  | 'report'

export type GrowthTemplateModule =
  | 'crm'
  | 'campaigns'
  | 'landing_pages'
  | 'marketing_studio'
  | 'whatsapp_ai'
  | 'automations'
  | 'bi_reports'
  | 'projects'

export type GrowthTemplateChannel =
  | 'crm'
  | 'meta_ads'
  | 'google_ads'
  | 'landing_page'
  | 'instagram'
  | 'facebook'
  | 'whatsapp'
  | 'email'
  | 'dashboard'

export type GrowthTemplateObjective = CampaignPlanObjective | 'approval' | 'follow_up' | 'retention'

export interface GrowthTemplate {
  id: string
  label: string
  description: string
  kind: GrowthTemplateKind
  moduleKey: GrowthTemplateModule
  sectorKeys: string[]
  objectiveKeys: GrowthTemplateObjective[]
  channels: GrowthTemplateChannel[]
  requiredModuleKeys: GrowthTemplateModule[]
  portalVisible: boolean
  recommendedForCampaignStepKeys: CampaignPlanStepKey[]
}

export interface GrowthTemplateFilter {
  sectorKey?: string
  objectiveKey?: GrowthTemplateObjective
  moduleKey?: GrowthTemplateModule
  channel?: GrowthTemplateChannel
  requiredModuleKey?: GrowthTemplateModule
  portalVisibleOnly?: boolean
  campaignStepKey?: CampaignPlanStepKey
}

export interface GrowthTemplateCoverage {
  total: number
  portalVisible: number
  byKind: Record<GrowthTemplateKind, number>
  byModule: Partial<Record<GrowthTemplateModule, number>>
}

export type SmartSegmentFilterKey =
  | 'source'
  | 'stage'
  | 'status'
  | 'owner'
  | 'last_activity'
  | 'campaign'
  | 'score'
  | 'proposal_status'

export type SmartSegmentStatus = 'draft' | 'active' | 'archived'

export interface SmartSegmentFilter {
  key: SmartSegmentFilterKey
  value: string
}

export interface SmartSegmentDraft {
  name: string
  filters: SmartSegmentFilter[]
  estimatedSize: number
  status: SmartSegmentStatus
}

export interface CampaignPlanProgress {
  completed: number
  total: number
  percentage: number
  blockers: CampaignPlanStep[]
}

export interface CampaignPlanRecommendedAction {
  stepKey: CampaignPlanStepKey
  stepId: string
  label: string
  description: string
  status: CampaignPlanStepStatus
  sortOrder: number
  reason?: string
}

export type GrowthOnboardingStepStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped'

export type GrowthOnboardingChecklistStatus = 'active' | 'completed' | 'paused' | 'cancelled'

export type GrowthOnboardingStepKey =
  | 'company_profile'
  | 'users_and_permissions'
  | 'brand_voice'
  | 'knowledge_base'
  | 'channels'
  | 'crm_pipeline'
  | 'campaign_plan'
  | 'landing_page'
  | 'automation'
  | 'reports'
  | 'finance'

export interface GrowthOnboardingStepTemplate {
  key: GrowthOnboardingStepKey
  label: string
  moduleKey: string
  estimatedMinutes: number
  sortOrder: number
  href: string
}

export interface GrowthOnboardingStep extends GrowthOnboardingStepTemplate {
  id: string
  checklistId: string
  status: GrowthOnboardingStepStatus
  assignedTo?: string
  completedAt?: string
  skippedReason?: string
}

export interface GrowthOnboardingChecklist {
  id: string
  organizationId: string
  contractId?: string
  sourceBlueprintId?: string
  status: GrowthOnboardingChecklistStatus
  steps: GrowthOnboardingStep[]
  createdAt?: string
  updatedAt?: string
}

export interface GrowthOnboardingProgress {
  completed: number
  total: number
  percentage: number
  pending: GrowthOnboardingStep[]
}

export type UnifiedActivityKind =
  | 'note'
  | 'task'
  | 'call'
  | 'meeting'
  | 'email'
  | 'whatsapp'
  | 'stage_change'
  | 'proposal'
  | 'campaign'
  | 'automation'
  | 'invoice'
  | 'support_ticket'
  | 'ai_insight'

export type UnifiedActivityStatus = 'open' | 'pending' | 'completed' | 'cancelled'

export type UnifiedActivityGroup = 'overdue' | 'future' | 'recent'

export interface UnifiedActivity {
  id: string
  kind: UnifiedActivityKind
  title: string
  description?: string
  occurredAt?: string
  dueAt?: string
  status: UnifiedActivityStatus
  sourceId?: string
  sourceLabel?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  group: UnifiedActivityGroup
}

export interface BuildUnifiedActivityConversation {
  id: string
  status?: string
  lastMessageAt?: string
  channel?: string
  summary?: string
}

export interface BuildUnifiedActivityAiInsight {
  id: string
  summary?: string
  nextBestAction?: string
  createdAt?: string
}

export interface BuildUnifiedActivityNextAction {
  id: string
  title: string
  dueAt?: string
  completedAt?: string
  taskId?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
}

export interface BuildUnifiedActivitiesInput {
  interactions?: CrmInteraction[]
  tasks?: CrmTask[]
  conversations?: BuildUnifiedActivityConversation[]
  aiInsights?: BuildUnifiedActivityAiInsight[]
  nextActions?: BuildUnifiedActivityNextAction[]
  currentDate?: string | Date
}

export interface Record360TaskSummary {
  id?: string
  title?: string
  dueAt?: string
  status?: 'pending' | 'open' | 'overdue' | 'completed' | 'cancelled'
}

export interface Record360ProposalSummary {
  id?: string
  title?: string
  value?: number
  status?: 'draft' | 'open' | 'sent' | 'viewed' | 'accepted' | 'rejected' | 'expired' | 'cancelled'
}

export interface Record360Input {
  type: Record360Type
  recordId?: string
  name?: string
  email?: string | null
  phone?: string | null
  ownerId?: string | null
  ownerName?: string | null
  assignedTo?: string | null
  companyId?: string | null
  companyName?: string | null
  company?: string | null
  source?: string | null
  sourceLabel?: string | null
  nextActionLabel?: string | null
  nextActionAt?: string | null
  currentDate?: string | Date
  tasks?: Record360TaskSummary[]
  pendingTaskCount?: number
  overdueTaskCount?: number
  conversationCount?: number
  hasConversationModule?: boolean
  unansweredConversationCount?: number
  recentUnansweredConversationAt?: string | null
  hasRecentUnansweredConversation?: boolean
  proposalCount?: number
  openProposalCount?: number
  proposals?: Record360ProposalSummary[]
  revenueValue?: number
  hasRevenueModule?: boolean
  aiSummary?: string | null
  aiInsightCount?: number
  hasAiModule?: boolean
  aiSuggestedAction?: string | null
  associationCounts?: Partial<Record<RecordAssociationKind, number>>
  companyCount?: number
  contactCount?: number
  opportunityCount?: number
  campaignCount?: number
  ticketCount?: number
  documentCount?: number
  contractCount?: number
  invoiceCount?: number
  automationCount?: number
}
