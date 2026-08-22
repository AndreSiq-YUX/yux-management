export type MissionStatus =
  | 'draft' | 'qualifying' | 'planning' | 'pending_plan_approval' | 'ready'
  | 'active' | 'paused' | 'blocked' | 'evaluating' | 'pending_replan_approval'
  | 'succeeded' | 'failed' | 'expired' | 'cancelled'

export type PlanStatus = 'proposed' | 'validating' | 'invalid' | 'pending_approval' | 'approved' | 'active' | 'superseded' | 'completed' | 'cancelled'
export type ActionRunStatus = 'pending' | 'ready' | 'waiting_approval' | 'queued' | 'running' | 'retry_scheduled' | 'succeeded' | 'failed' | 'blocked' | 'skipped' | 'cancelled'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'expired' | 'cancelled'
export type MissionMode = 'shadow' | 'prepare' | 'assisted'

export interface ActionMission {
  id: string
  organizationId: string
  contractId?: string
  packVersionId: string
  status: MissionStatus
  mode: MissionMode
  title: string
  objective: string
  parameters: RevenueRecoveryParameters
  budget: Record<string, unknown>
  deadlineAt?: string
  activePlanId?: string
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface RevenueRecoveryParameters {
  targetRevenueBrl: string
  deadlineDays: number
  inactiveDays: number
  canarySize: number
  maxPopulation: number
  maxTotalCostBrl: string
  maxHumanHours: string
  humanHourlyRateBrl?: string
  minimumValueCostRatio: string
  channels: Array<'human_task' | 'email' | 'whatsapp' | 'automation'>
}

export interface ActionPack {
  key: 'revenue_recovery'
  semanticVersion: '0.1.0'
  outcomeType: string
  contentHash: string
  status: string
  topologyTemplate: { steps: Array<{ stepKey: string; capabilityKey: string; dependsOn: string[]; protected: boolean }> }
  protectedStepKeys: string[]
  extensionPoints: Array<{ key: string; afterStepKey: string; beforeStepKey: string; maxAdditionalSteps: number }>
  allowedCapabilities: Array<{ key: string; versions: number[]; required: boolean }>
}

export interface MissionPlanStep {
  id?: string
  stepKey: string
  position?: number
  capabilityKey: string
  capabilityVersion: number
  dependsOn: string[]
  parameters: Record<string, unknown>
  approvalRequired: boolean
  protected: boolean
  extensionPoint?: string
}

export interface MissionPlan {
  id: string
  organizationId: string
  missionId: string
  revision: number
  status: PlanStatus
  packVersionId: string
  packContentHash: string
  planHash: string
  parameters: Record<string, unknown>
  deviations: Array<{ extensionPoint: string; rationale: string }>
  estimatedEconomics: Record<string, unknown>
  steps?: MissionPlanStep[]
  approvedAt?: string
  createdAt: string
  updatedAt: string
}

export interface MissionActionRun {
  id: string
  missionId: string
  planId: string
  status: ActionRunStatus
  input: Record<string, unknown>
  output: Record<string, unknown>
  availableAt?: string
  completedAt?: string
  lastError?: string
  stepKey: string
  capabilityKey: string
  capabilityVersion: number
  approvalRequired: boolean
}

export interface MissionApproval {
  id: string
  missionId: string
  planId?: string
  runId?: string
  approvalType: 'plan' | 'action' | 'budget_increase' | 'scope_change' | 'replan' | 'exception' | 'population' | 'external_effect' | 'canary'
  status: ApprovalStatus
  subjectHash: string
  requestedPayload: Record<string, unknown>
  decisionReason?: string
  expiresAt?: string
  decidedAt?: string
  createdAt: string
}

export type MissionMetric =
  | { kind: 'known'; value: string; unit: string }
  | { kind: 'unknown' | 'not_applicable'; reason: string; unit: string }

export type MissionMetrics = Record<string, MissionMetric>

export interface MissionEconomics {
  producedValueBrl: string
  totalExecutionCostBrl?: string
  netValueBrl?: string
  valueCostRatio?: string | 'not_applicable'
  valuePerHumanHourBrl?: string | 'not_applicable'
  humanFreeExecutionRate: string | 'not_applicable'
}

export interface MissionReadinessCheck {
  code: string
  status: 'pass' | 'warn' | 'block'
  message: string
  fixHref?: string
  capabilityKey?: string
}

export interface MissionReadiness {
  ready: boolean
  checks: MissionReadinessCheck[]
  availableChannels: Array<'human_task' | 'email' | 'whatsapp'>
}

export interface CreateMissionInput {
  organizationId: string
  contractId?: string
  title: string
  objective: string
  mode: MissionMode
  deadlineAt: string
  parameters: RevenueRecoveryParameters
}
