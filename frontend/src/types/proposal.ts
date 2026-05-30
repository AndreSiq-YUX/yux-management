import type { BillingCycle } from '@/types/platform'

export type ProposalStatus = 'draft' | 'sent' | 'adjustments_requested' | 'approved' | 'rejected' | 'conversion_failed' | 'converted'
export type ProposalVersionStatus = 'pending' | 'approved' | 'rejected' | 'adjustments_requested' | 'superseded'
export type ProposalDecisionValue = 'approved' | 'rejected' | 'adjustments_requested'
export type ProposalDecisionSource = 'public_token' | 'portal'
export type AiGenerationStatus = 'completed' | 'fallback' | 'failed'
export type ProposalConversionStatus = 'completed' | 'failed'

export interface CommercialDiagnostic {
  id: string
  organizationId: string
  leadId: string
  summary: string
  painPoints: string[]
  goals: string[]
  budgetRange?: string
  timeline?: string
  decisionProcess?: string
  notes?: string
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface ProposalPriceRule {
  id: string
  organizationId: string
  packageId: string
  itemKey: string
  label: string
  minimumValue: number
  recommendedValue: number
  maximumValue: number
}

export interface ProposalItem {
  id: string
  proposalId: string
  itemKey: string
  label: string
  description?: string
  quantity: number
  unitValue: number
  totalValue: number
  orderIndex: number
}

export interface ProjectPresetTask {
  title: string
  description?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  orderIndex?: number
}

export interface ProjectPresetPhase {
  name: string
  description?: string
  orderIndex?: number
  tasks: ProjectPresetTask[]
}

export interface PackageProjectPreset {
  id: string
  packageId: string
  phases: ProjectPresetPhase[]
}

export interface BlueprintProjectPreset {
  id: string
  blueprintId: string
  phases: ProjectPresetPhase[]
}

export type ProjectPreset = PackageProjectPreset | BlueprintProjectPreset

export interface ProposalDraft {
  id: string
  organizationId: string
  leadId: string
  clientId?: string
  packageId: string
  blueprintId?: string
  assignedTo?: string
  status: ProposalStatus
  title: string
  scope: string
  whatsappMessage?: string
  emailSubject?: string
  emailBody?: string
  billingCycle: BillingCycle
  selectedModuleKeys: string[]
  finalValue: number
  overrideReason?: string
  currentVersionId?: string
  convertedClientId?: string
  contractId?: string
  projectId?: string
  items: ProposalItem[]
}

export type ProposalSnapshot = Omit<ProposalDraft, 'currentVersionId' | 'convertedClientId' | 'contractId' | 'projectId'>

export interface ProposalVersion {
  id: string
  proposalId: string
  versionNumber: number
  snapshot: ProposalSnapshot
  status: ProposalVersionStatus
  sentAt: string
  decidedAt?: string
}

export interface ProposalDecision {
  id: string
  proposalVersionId: string
  decision: ProposalDecisionValue
  source: ProposalDecisionSource
  comment?: string
  decidedBy?: string
  createdAt: string
}

export interface ProposalAccessLink {
  token: string
  expiresAt: string
  publicUrl: string
}

export interface AiGenerationRun {
  id: string
  proposalId: string
  status: AiGenerationStatus
  inputSummary: Record<string, unknown>
  resultMetadata: Record<string, unknown>
  error?: string
  createdAt: string
  completedAt?: string
}

export interface ProposalConversionRun {
  id: string
  proposalId: string
  attemptNumber: number
  status: ProposalConversionStatus
  clientId?: string
  contractId?: string
  projectId?: string
  error?: string
  createdAt: string
  completedAt?: string
}
