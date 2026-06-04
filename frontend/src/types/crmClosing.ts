import type { BillingCycle, PackageDefinition } from './platform'
import type { CrmLead } from './crm'
import type { ProposalConversionRun, ProposalDraft, ProposalStatus } from './proposal'

export type ProposalViewEventType = 'sent' | 'viewed' | 'adjustment_requested' | 'accepted' | 'rejected' | 'converted'
export type ProposalFollowUpStatus = 'pending' | 'completed' | 'cancelled'
export type ProposalObjectionStatus = 'open' | 'handled' | 'dismissed'
export type ClosingChecklistStatus = 'open' | 'completed' | 'blocked'
export type ClosingChecklistStepKey = 'contract' | 'modules' | 'project' | 'finance' | 'onboarding'
export type CrmProposalConversionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'
export type ClientOnboardingStatus = 'pending' | 'in_progress' | 'completed' | 'blocked'

export interface LeadProposalRecommendation {
  id: string
  organizationId: string
  crmInstanceId?: string
  leadId: string
  packageId: string
  moduleKeys: string[]
  score: number
  reasons: string[]
  status: 'suggested' | 'accepted' | 'dismissed'
  createdAt: string
  updatedAt: string
}

export interface ProposalViewEvent {
  id: string
  organizationId: string
  crmInstanceId?: string
  leadId: string
  proposalId: string
  eventType: ProposalViewEventType
  actorType: 'internal' | 'client' | 'system'
  actorId?: string
  metadata?: Record<string, unknown>
  createdAt: string
}

export interface ProposalFollowUpTask {
  id: string
  organizationId: string
  crmInstanceId?: string
  leadId: string
  proposalId: string
  title: string
  status: ProposalFollowUpStatus
  dueAt: string
  assignedToMemberId?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProposalObjection {
  id: string
  organizationId: string
  crmInstanceId?: string
  leadId: string
  proposalId: string
  category: string
  description: string
  status: ProposalObjectionStatus
  handledBy?: string
  handledAt?: string
  createdAt: string
  updatedAt: string
}

export interface ProposalClosingChecklist {
  id: string
  organizationId: string
  crmInstanceId?: string
  leadId: string
  proposalId: string
  status: ClosingChecklistStatus
  steps: ProposalClosingChecklistStep[]
  createdAt: string
  updatedAt: string
}

export interface ProposalClosingChecklistStep {
  key: ClosingChecklistStepKey
  label: string
  completed: boolean
  blocked?: boolean
  referenceId?: string
}

export interface CrmProposalConversionRun {
  id: string
  organizationId: string
  crmInstanceId?: string
  leadId: string
  proposalId: string
  idempotencyKey: string
  status: CrmProposalConversionStatus
  attemptNumber: number
  clientId?: string
  contractId?: string
  projectId?: string
  invoiceId?: string
  error?: string
  createdAt: string
  completedAt?: string
}

export interface ClientOnboardingChecklist {
  id: string
  organizationId: string
  crmInstanceId?: string
  leadId?: string
  clientId: string
  proposalId?: string
  contractId?: string
  projectId?: string
  status: ClientOnboardingStatus
  createdAt: string
  updatedAt: string
}

export interface ClientOnboardingTask {
  id: string
  checklistId: string
  title: string
  description?: string
  status: ClientOnboardingStatus
  dueAt?: string
  completedAt?: string
  createdAt: string
  updatedAt: string
}

export interface PackageRecommendation {
  package: PackageDefinition
  score: number
  reasons: string[]
  moduleKeys: string[]
}

export interface ProposalFromLeadDraft {
  organizationId: string
  leadId: string
  packageId: string
  recommendedPackageId?: string
  crmInstanceId?: string
  title: string
  billingCycle: BillingCycle
  selectedModuleKeys: string[]
  scope: string
}

export interface ClosingApprovalDecision {
  required: boolean
  reasons: string[]
}

export interface ConversionPlan {
  canRun: boolean
  idempotencyKey: string
  nextAttemptNumber: number
  blockedReason?: 'proposal_not_approved' | 'already_converted' | 'conversion_in_progress'
}

export type ClosingProposalLike = Pick<ProposalDraft, 'id' | 'organizationId' | 'leadId' | 'status' | 'finalValue' | 'packageId' | 'selectedModuleKeys' | 'billingCycle'> & {
  crmInstanceId?: string
}

export type ConversionRunLike = Pick<ProposalConversionRun, 'status' | 'attemptNumber'> | Pick<CrmProposalConversionRun, 'status' | 'attemptNumber'>

export type ProposalStatusForClosing = ProposalStatus | CrmProposalConversionStatus
