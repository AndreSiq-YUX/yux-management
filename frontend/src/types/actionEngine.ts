export type MissionStatus =
  | 'draft' | 'qualifying' | 'planning' | 'pending_plan_approval' | 'ready'
  | 'active' | 'paused' | 'blocked' | 'evaluating' | 'pending_replan_approval'
  | 'succeeded' | 'failed' | 'expired' | 'cancelled'

export type PlanStatus = 'proposed' | 'validating' | 'invalid' | 'pending_approval' | 'approved' | 'active' | 'superseded' | 'completed' | 'cancelled'
export type ActionRunStatus = 'pending' | 'ready' | 'waiting_approval' | 'queued' | 'running' | 'retry_scheduled' | 'succeeded' | 'failed' | 'blocked' | 'skipped' | 'cancelled'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'expired' | 'cancelled'
export type MissionMode = 'shadow' | 'prepare' | 'assisted' | 'autonomous'
export type DecisionReasonKey = 'wrong_icp' | 'wrong_tone' | 'cost_too_high' | 'scope_too_broad' | 'scope_too_narrow' | 'timing_wrong' | 'channel_wrong' | 'compliance_risk' | 'outcome_wrong' | 'other'

export interface MissionGoal {
  statement: string
  requestedOutcome: string
  scopeHints: string[]
  constraints: Record<string, unknown>
  acceptanceCriteria: Array<{ key: string; operator: string; target: string; unit: string }>
}

export interface AutonomyEnvelope {
  mode: MissionMode
  allowedModules: string[]
  allowedCapabilityKeys: string[]
  maxTotalCostBrl: string
  maxHumanHours: string
  maxExternalContacts?: number
  expiresAt: string
  alwaysRequireApprovalFor: string[]
}

export interface MissionClarificationQuestion {
  key: string
  label: string
  whyNeeded: string
  priority: number
  answerType: 'text' | 'number' | 'currency' | 'date' | 'single_choice' | 'multiple_choice' | 'boolean'
  defaultValue?: unknown
  defaultSourceId?: string
}

export interface MissionDecisionSummary {
  headline: string
  changes: Array<{ entityType: string; operation: string; quantity: number; label: string }>
  contactImpact: { existingContacts: number; futureEligibleContacts: boolean; channels: string[] }
  economics: { estimatedCostBrl: string; maximumCostBrl: string; estimatedHumanMinutes: number }
  irreversibleEffects: Array<{ capabilityKey: string; description: string }>
  assumptions: Array<{ key: string; value: string; source: 'company_context' | 'user' | 'pack_default' }>
  technicalProof: { planRevision: number; planHash: string; manifestHash: string; sourceCount: number }
  decisionSubjectHash: string
}

export interface ActionMission {
  id: string
  organizationId: string
  contractId?: string
  packVersionId: string
  status: MissionStatus
  mode: MissionMode
  title: string
  objective: string
  goal: MissionGoal
  autonomyEnvelope: AutonomyEnvelope
  packSelection: {
    strategy?: string
    packs?: Array<{ key: string; version: string }>
    clarification?: { interpretation: Record<string, unknown>; questions: MissionClarificationQuestion[]; contextSnapshotId?: string }
    clarificationAnswers?: Record<string, unknown>
    [key: string]: unknown
  }
  parameters: RevenueRecoveryParameters & Record<string, unknown>
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
  key: string
  semanticVersion: string
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
  capabilityDefinitionHash?: string
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
  capabilityManifest?: Array<{
    key: string
    version: number
    definitionHash: string
    effect: 'none' | 'draft' | 'internal' | 'external' | 'destructive'
    recoveryKind: 'compensatable' | 'pausable' | 'irreversible'
  }>
  capabilityManifestHash?: string
  parameters: Record<string, unknown>
  deviations: Array<{ extensionPoint: string; rationale: string }>
  estimatedEconomics: Record<string, unknown>
  proposedPayload?: Record<string, unknown>
  compiledPayload?: Record<string, unknown>
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

export interface MissionArtifactVersion {
  status: 'proposed' | 'draft' | 'published'
  contentHash: string
  entityId?: string
  versionId?: string
}

export interface MissionArtifact {
  key: string
  kind: 'funnel' | 'email' | 'sequence' | 'automation'
  title: string
  status: MissionArtifactVersion['status']
  contentHash: string
  entityId?: string
  versionId?: string
  approvalSubjectHash?: string
  staleApproval: boolean
  proposedVersion: MissionArtifactVersion
  currentVersion?: MissionArtifactVersion
  data: Record<string, unknown>
  citations: Array<{ id: string; label: string; category: string }>
  complianceWarnings: string[]
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

export interface MissionBudgetBurnDown {
  currency: 'BRL'
  envelopeVersion: number
  actualCostBrl: string
  reservedCostBrl: string
  consumedCostBrl: string
  remainingCostBrl: string
  maximumCostBrl: string
  consumedPercent: string
  alertThresholds: Array<50 | 80 | 95>
  nextAlertThreshold?: 50 | 80 | 95
  exhausted: boolean
}

export interface MissionCapabilityControl {
  capabilityKey: string
  capabilityVersion: number
  disabled: boolean
  reason?: string
}

export interface MissionOperationalControls {
  budget: MissionBudgetBurnDown
  readiness: MissionReadiness
  capabilities: MissionCapabilityControl[]
  canManagePolicy: boolean
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

export interface CreateMissionIntentInput {
  organizationId: string
  contractId?: string
  title?: string
  objective: string
  mode: MissionMode
  deadlineAt: string
  allowedModules: string[]
  maxTotalCostBrl: string
  maxHumanHours: string
  maxExternalContacts?: number
  expectedValueBrl?: string
  quickStart?: 'revenue_recovery' | 'funnel_nurture'
}

export interface ClarificationAnswerInput {
  organizationId: string
  expectedVersion: number
  answers: Record<string, unknown>
}

export interface MissionContextPreview {
  snapshotId: string | null
  contextHash: string | null
  sources: Array<{ id: string; title: string; category: 'knowledge' | 'strategy' | string }>
  createdAt: string | null
}

export interface SimulationReportSnapshot {
  schemaVersion: 1
  redactionVersion: 1
  reportId: string
  reportHash: string
  missionTitle: string
  objective: string
  planRevision: number
  changes: Array<{ quantity: number; label: string }>
  contactImpact: { existingContacts: number; futureEligibleContacts: boolean; channels: string[] }
  economics: { estimatedCostBrl: string; maximumCostBrl: string; estimatedHumanMinutes: number }
  irreversibleEffects: Array<{ description: string }>
  assumptions: Array<{ key: string; value: string; source: string }>
  technicalProof: { packVersion: string; planHash: string; manifestHash: string; sourceCount: number; decisionSubjectHash: string }
  createdAt: string
  expiresAt: string
  disclaimer: string
}

export interface SimulationReportShare {
  id: string
  token: string
  url: string
  expiresAt: string
  reportHash: string
  snapshot: SimulationReportSnapshot
}

export interface PublicSimulationReport {
  id: string
  reportHash: string
  expiresAt: string
  snapshot: SimulationReportSnapshot
}
