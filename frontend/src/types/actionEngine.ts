export type MissionStatus =
  | 'draft' | 'qualifying' | 'planning' | 'pending_plan_approval' | 'ready'
  | 'active' | 'paused' | 'blocked' | 'evaluating' | 'pending_replan_approval'
  | 'succeeded' | 'failed' | 'expired' | 'cancelled'

export type PlanStatus = 'proposed' | 'validating' | 'invalid' | 'pending_approval' | 'approved' | 'active' | 'superseded' | 'completed' | 'cancelled'
export type ActionRunStatus = 'pending' | 'ready' | 'waiting_approval' | 'queued' | 'running' | 'retry_scheduled' | 'succeeded' | 'failed' | 'blocked' | 'skipped' | 'cancelled'
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'expired' | 'cancelled'
export type MissionMode = 'shadow' | 'prepare' | 'assisted' | 'autonomous'
export type DecisionReasonKey = 'wrong_icp' | 'wrong_tone' | 'cost_too_high' | 'scope_too_broad' | 'scope_too_narrow' | 'timing_wrong' | 'channel_wrong' | 'compliance_risk' | 'outcome_wrong' | 'other'

export type MissionConversationStatus =
  | 'collecting_context' | 'awaiting_user' | 'brief_confirmation' | 'planning'
  | 'awaiting_plan_approval' | 'converted' | 'blocked' | 'cancelled'

export interface MissionConversationSource {
  ref: string
  kind: 'strategy_card' | 'strategy_chunk' | 'knowledge_source' | 'knowledge_chunk' | 'mission_memory'
  id: string
  version: string
  contentHash: string
  visibility: 'internal_only' | 'client_safe' | 'internal' | 'external' | 'both'
  title: string
  displayMode: 'named' | 'generic' | 'hidden'
}

export interface MissionConversationQuestion {
  key: string
  label: string
  whyNeeded: string
  priority: number
  answerType: 'text' | 'number' | 'currency' | 'date' | 'single_choice' | 'multiple_choice' | 'boolean'
  choices?: string[]
  defaultValue?: unknown
  defaultSourceRef?: string
}

export interface MissionConversationMissingContext {
  key: string
  category: 'company' | 'brand' | 'offer' | 'audience' | 'budget' | 'deadline' | 'integration' | 'permission' | 'consent'
  reason: string
  requiredFor?: string[]
  correctionKey?: string
}

export interface MissionConversationReadiness {
  status: 'needs_information' | 'needs_configuration' | 'ready_for_brief_confirmation' | 'ready_for_plan'
  knownFacts?: Array<{ key: string; value: unknown; sourceRef: string }>
  assumptions?: Array<{ key: string; value: unknown; sourceRef?: string }>
  missing?: MissionConversationMissingContext[]
  processingError?: string
}

export interface MissionConversationBrief {
  title?: string | null
  objective?: string
  requestedOutcome?: string
  scopeHints?: string[]
  constraints?: Record<string, unknown>
  acceptanceCriteria?: Array<Record<string, unknown>>
  packKeys?: string[]
  deadlineAt?: string | null
  maxTotalCostBrl?: string | null
  maxHumanHours?: string | null
  maxExternalContacts?: number | null
  mode?: MissionMode | null
}

export interface MissionConversationSuggestedAction {
  key: string
  label: string
  kind: 'quick_reply' | 'open_correction' | 'confirm_brief' | 'cancel'
  payload?: Record<string, unknown>
  correctionKey?: string
  capabilityKey?: string
  packKey?: string
}

export interface MissionConversationMessagePayload {
  kind?: 'message' | 'questions' | 'brief_confirmation' | 'blocked'
  understood?: Record<string, unknown>
  questions?: MissionConversationQuestion[]
  readiness?: MissionConversationReadiness
  brief?: MissionConversationBrief
  suggestedActions?: MissionConversationSuggestedAction[]
  usage?: { inputTokens: number; outputTokens: number; totalTokens: number }
  latencyMs?: number
  [key: string]: unknown
}

export interface MissionConversationMessage {
  id: string
  organizationId: string
  conversationId: string
  sequence: number
  actorType: 'user' | 'agent' | 'system'
  messageKind: 'text' | 'question' | 'brief' | 'plan' | 'status' | 'error'
  content: string
  structuredPayload: MissionConversationMessagePayload
  sourceRefs: MissionConversationSource[]
  clientMessageId?: string
  harnessRunId?: string
  createdBy?: string
  createdAt: string
}

export interface MissionConversation {
  id: string
  organizationId: string
  contractId?: string
  missionId?: string
  status: MissionConversationStatus
  title: string
  currentBrief: MissionConversationBrief
  contextReadiness: MissionConversationReadiness | Record<string, unknown>
  lastContextHash?: string
  lastHarnessRunId?: string
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  messages: MissionConversationMessage[]
}

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
  metricSpec?: MissionMetricSpec
  packContentHash?: string | null
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
  metricSpec?: MissionMetricSpec
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
    | 'campaign_brief' | 'campaign_audience' | 'campaign_creative'
    | 'campaign_landing_page' | 'campaign_lead_form' | 'campaign_tracking' | 'campaign_provider'
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

export interface MissionMetricDefinition {
  key: string
  unit?: string
  group: 'primary' | 'leading' | 'operational' | 'economics' | 'guardrail'
  attributionPolicy?: Record<string, unknown>
  attributionPolicyHash?: string
}

export interface MissionMetricSpec {
  primary?: MissionMetricDefinition | MissionMetricDefinition[]
  leading?: string[]
  operational?: string[]
  economics?: string[]
  guardrails?: string[]
  unknownPolicy?: string
}

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
  autonomy: MissionAutonomyControlStatus
}

export interface MissionAutonomyGrant {
  id: string
  grantVersion: number
  missionVersion: number
  envelope: AutonomyEnvelope
  envelopeHash: string
  status: 'pending' | 'active' | 'revoked' | 'expired'
  startsAt: string
  expiresAt: string
  approvedAt?: string
  revokedAt?: string
  revocationReason?: string
}

export interface MissionAutonomyControlStatus {
  grants: MissionAutonomyGrant[]
  usage: { costBrl: string; humanMinutes: string; externalContacts: number; unresolvedExternalEffects: number }
  remaining: { costBrl: string; humanMinutes: string; externalContacts: number; seconds: number } | null
  health: { status: 'healthy' | 'degraded' | 'blocked'; warnings: Array<{ code: string; message: string }> }
}

export type LearningRecommendationType = 'pack_change' | 'prompt_change' | 'policy_change' | 'knowledge_candidate'
export type LearningRecommendationStatus = 'proposed' | 'shadow_testing' | 'approved' | 'rejected' | 'promoted'

export interface MissionLearningMemory {
  id: string
  organizationId: string
  missionId: string
  packKey: string
  packVersion: string
  outcomeHash: string
  summary: Record<string, unknown>
  evidenceIds: string[]
  reviewStatus: 'pending' | 'approved' | 'rejected'
  reviewedBy?: string
  reviewedAt?: string
  createdAt: string
}

export interface LearningRecommendation {
  id: string
  organizationId: string
  missionId: string
  memorySummaryId: string
  recommendationType: LearningRecommendationType
  targetKey: string
  rationale: string
  evidenceIds: string[]
  expectedImpact: Record<string, string>
  recommendationHash: string
  status: LearningRecommendationStatus
  createdAt: string
}

export interface LearningExperiment {
  id: string
  organizationId: string
  recommendationId: string
  contextSnapshotId?: string
  baselineHash: string
  candidateConfig: Record<string, unknown>
  candidateConfigHash: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'rejected'
  baselineMetrics: Record<string, string>
  candidateMetrics: Record<string, string>
  comparison: { passed?: boolean; deltas?: Record<string, string>; regressions?: string[] }
  goldenCorpusHash?: string
  goldenGatePassed?: boolean
  productionEffectsObserved: false
  failureReason?: string
  createdBy: string
  createdAt: string
}

export interface LearningPromotionRequest {
  id: string
  organizationId: string
  recommendationId: string
  experimentId: string
  changeType: LearningRecommendationType
  targetKey: string
  requestedChange: Record<string, unknown>
  requestedChangeHash: string
  status: 'pending' | 'approved' | 'rejected' | 'implemented'
  requestedBy: string
  createdAt: string
}

export interface MissionLearningWorkspace {
  memories: MissionLearningMemory[]
  recommendations: LearningRecommendation[]
  experiments: LearningExperiment[]
  promotions: LearningPromotionRequest[]
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
  quickStart?: 'revenue_recovery' | 'funnel_nurture' | 'campaign_launch'
  recipeSelection?: { key: string; version: number; contentHash: string }
}

export interface MissionRecipe {
  id: string
  key: string
  version: number
  title: string
  sector: string
  packSelections: Array<{ key: string; version: string; contentHash: string }>
  defaultGoal: Record<string, unknown>
  editableKeys: string[]
  contentHash: string
}

export interface SandboxSeedManifest {
  id: string
  organizationId: string
  recipeKey: string
  recipeVersion: number
  status: 'active' | 'cleaned' | 'review_required'
  manifestHash: string
  itemCount: number
  reused?: boolean
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
