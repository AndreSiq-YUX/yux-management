export type MissionStatus =
  | 'draft'
  | 'qualifying'
  | 'planning'
  | 'pending_plan_approval'
  | 'ready'
  | 'active'
  | 'paused'
  | 'blocked'
  | 'evaluating'
  | 'pending_replan_approval'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'cancelled'

export type PlanStatus =
  | 'proposed'
  | 'validating'
  | 'invalid'
  | 'pending_approval'
  | 'approved'
  | 'active'
  | 'superseded'
  | 'completed'
  | 'cancelled'

export type ActionRunStatus =
  | 'pending'
  | 'ready'
  | 'waiting_approval'
  | 'queued'
  | 'running'
  | 'retry_scheduled'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'skipped'
  | 'cancelled'

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'expired' | 'cancelled'
export type OwnershipMode = 'observe' | 'shared' | 'exclusive'
export type OwnershipConflictPolicy = 'allow_disjoint' | 'mission_wins' | 'block_new'
export type MissionMode = 'shadow' | 'prepare' | 'assisted' | 'autonomous'

export type MissionConversationStatus =
  | 'collecting_context'
  | 'awaiting_user'
  | 'brief_confirmation'
  | 'planning'
  | 'awaiting_plan_approval'
  | 'converted'
  | 'blocked'
  | 'cancelled'

export type MissionConversationActorType = 'user' | 'agent' | 'system'
export type MissionConversationMessageKind = 'text' | 'question' | 'brief' | 'plan' | 'status' | 'error'

export type MissionConversationMessage = {
  id: string
  organizationId: string
  conversationId: string
  sequence: number
  actorType: MissionConversationActorType
  messageKind: MissionConversationMessageKind
  content: string
  structuredPayload: Record<string, unknown>
  sourceRefs: Array<Record<string, unknown>>
  clientMessageId?: string
  harnessRunId?: string
  createdBy?: string
  createdAt: string
}

export type MissionConversation = {
  id: string
  organizationId: string
  contractId?: string
  missionId?: string
  status: MissionConversationStatus
  title: string
  currentBrief: Record<string, unknown>
  briefHash: string
  contextReadiness: Record<string, unknown>
  lastContextHash?: string
  lastHarnessRunId?: string
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  messages: MissionConversationMessage[]
}

export type MissionGoal = {
  statement: string
  requestedOutcome: string
  scopeHints: string[]
  constraints: Record<string, unknown>
  acceptanceCriteria: Array<{ key: string; operator: string; target: string; unit: string }>
}

export type AutonomyEnvelope = {
  mode: MissionMode
  allowedModules: string[]
  allowedCapabilityKeys: string[]
  maxTotalCostBrl: string
  maxHumanHours: string
  maxExternalContacts?: number
  expiresAt: string
  alwaysRequireApprovalFor: string[]
}

export type AutonomyGrantStatus = 'pending' | 'active' | 'revoked' | 'expired'

export type AutonomyGrant = {
  id: string
  organizationId: string
  missionId: string
  grantVersion: number
  missionVersion: number
  envelope: AutonomyEnvelope
  envelopeHash: string
  status: AutonomyGrantStatus
  startsAt: string
  expiresAt: string
  requestedBy: string
  approvedBy?: string
  approvedAt?: string
  revokedBy?: string
  revokedAt?: string
  revocationReason?: string
  createdAt: string
}

export type LearningRecommendationType = 'pack_change' | 'prompt_change' | 'policy_change' | 'knowledge_candidate'
export type LearningRecommendationStatus = 'proposed' | 'shadow_testing' | 'approved' | 'rejected' | 'promoted'

export type MissionLearningMemory = {
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

export type LearningRecommendation = {
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
  decidedBy?: string
  decidedAt?: string
  createdAt: string
}

export type MissionContextSnapshot = {
  id: string
  organizationId: string
  missionId: string
  contextHash: string
  query: string
  companyContext: Record<string, unknown>
  knowledgeItems: Array<Record<string, unknown>>
  strategyItems: Array<Record<string, unknown>>
  approvedLearningMemory: Array<Record<string, unknown>>
  liveState: Record<string, unknown>
  capabilityManifest: Array<Record<string, unknown>>
  capabilityCatalogHash: string
  sourceIds: string[]
  harnessRetrievalTraceId?: string
  harnessKnowledgeContextHash?: string
  createdAt: string
}

export type MissionDecisionSummary = {
  headline: string
  changes: Array<{ entityType: string; operation: string; quantity: number; label: string }>
  contactImpact: { existingContacts: number; futureEligibleContacts: boolean; channels: string[] }
  economics: { estimatedCostBrl: string; maximumCostBrl: string; estimatedHumanMinutes: number }
  irreversibleEffects: Array<{ capabilityKey: string; description: string }>
  assumptions: Array<{ key: string; value: string; source: 'company_context' | 'user' | 'pack_default' }>
  technicalProof: { planRevision: number; planHash: string; manifestHash: string; sourceCount: number }
  decisionSubjectHash: string
}

export type DecimalString = `${number}`

export type MetricValue =
  | { kind: 'known'; value: DecimalString; unit: string }
  | { kind: 'unknown'; reason: string; unit: string }
  | { kind: 'not_applicable'; reason: string; unit: string }

export type MissionMetricAttribution = {
  status: 'not_applicable' | 'legacy_unversioned' | 'versioned'
  policyVersion?: number
  policyHash?: string
  sourceEventIds: string[]
}

export type MissionActor = {
  type: 'user' | 'system' | 'provider'
  id?: string
}

export type ActionMission = {
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
  packSelection: Record<string, unknown>
  parameters: Record<string, unknown>
  budget: Record<string, unknown>
  deadlineAt?: string
  activePlanId?: string
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type MissionCommand =
  | { type: 'qualify'; reason: string }
  | { type: 'plan'; reason: string }
  | { type: 'submit_plan'; reason: string }
  | { type: 'approve_plan'; reason: string }
  | { type: 'start'; reason: string }
  | { type: 'pause'; reason: string }
  | { type: 'resume'; reason: string }
  | { type: 'evaluate'; reason: string }
  | { type: 'request_replan'; reason: string }
  | { type: 'complete'; reason: string }
  | { type: 'fail'; reason: string }
  | { type: 'expire'; reason: string }
  | { type: 'cancel'; reason: string }

export type ActionPlanStep = {
  stepKey: string
  capabilityKey: string
  capabilityVersion: number
  capabilityDefinitionHash?: string
  dependsOn: string[]
  parameters: Record<string, unknown>
  approvalRequired: boolean
  protected: boolean
  extensionPoint?: string
}

export type ProposedMissionPlan = {
  schemaVersion: 1
  packKey: string
  packVersion: string
  packContentHash: string
  parameters: Record<string, unknown>
  deviations: Array<{ extensionPoint: string; rationale: string }>
  steps: ActionPlanStep[]
  estimatedEconomics: Record<string, unknown>
}
