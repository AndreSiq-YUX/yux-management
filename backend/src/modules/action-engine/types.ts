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
export type MissionMode = 'shadow' | 'prepare' | 'assisted'

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
