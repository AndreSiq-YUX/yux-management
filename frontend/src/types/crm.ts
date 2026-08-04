import type { AttributionContext, LeadSourceKind } from './commercial'

export type CrmActionType = 'whatsapp' | 'email' | 'internal_task'
export type CrmEnrollmentStatus = 'active' | 'paused' | 'manual' | 'completed' | 'cancelled'
export type CrmTaskStatus = 'pending' | 'completed' | 'cancelled'
export type CrmTaskPriority = 'low' | 'medium' | 'high' | 'urgent'
export type AutomationExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type CrmLeadStatus = 'open' | 'won' | 'lost'
export type CrmLeadAttentionState = 'on_track' | 'due_today' | 'overdue' | 'stale' | 'won' | 'lost'
export type CrmInstanceStatus = 'draft' | 'active' | 'paused' | 'archived'
export type CrmInstanceRole = 'seller' | 'manager' | 'client_admin' | 'yux_admin'
export type CrmAssignmentMode = 'manual' | 'queue' | 'round_robin' | 'pull_next'
export type CrmAssignmentState = 'unassigned' | 'assigned' | 'in_queue' | 'reassigned'
export type CrmPublicationStatus = 'draft' | 'reviewing' | 'published' | 'failed'
export type CrmMigrationStrategy = 'keep_existing' | 'migrate_all' | 'migrate_open' | 'mapped_stages'

export interface CrmInstance {
  id: string
  organizationId: string
  contractId: string
  status: CrmInstanceStatus
  sectorKey?: string
  blueprintId?: string
  blueprintApplicationRunId?: string
  sellerSeatLimit: number
  managerSeatLimit: number
  adminSeatLimit: number
  maxPipelineCount: number
  maxCustomFieldCount: number
  maxAutomationCount: number
  allowClientPipelineCustomization: boolean
  allowClientFieldCustomization: boolean
  allowClientCategoryCustomization: boolean
  defaultAssignmentMode: CrmAssignmentMode
  createdAt: string
  updatedAt: string
}

export interface CrmInstanceMember {
  id: string
  crmInstanceId: string
  userId: string
  role: CrmInstanceRole
  displayName?: string
  email?: string
  status: 'active' | 'invited' | 'disabled'
  createdAt: string
  updatedAt: string
}

export interface CrmTeam {
  id: string
  crmInstanceId: string
  name: string
  description?: string
  assignmentMode: CrmAssignmentMode
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface CrmTeamMember {
  id: string
  teamId: string
  memberId: string
  role: 'seller' | 'manager'
  createdAt: string
}

export interface CrmGovernanceContext {
  instance: CrmInstance
  currentMember?: CrmInstanceMember
  members?: CrmInstanceMember[]
  teams: CrmTeam[]
  teamMemberships: CrmTeamMember[]
}

export interface CrmPipeline {
  id: string
  organizationId: string
  crmInstanceId?: string
  name: string
  description?: string
  isDefault: boolean
  isActive: boolean
  stages?: CrmPipelineStage[]
}

export interface CrmPipelineStage {
  id: string
  pipelineId: string
  key: string
  name: string
  color: string
  orderIndex: number
  isWon: boolean
  isLost: boolean
  isActive: boolean
}

export interface CrmPipelineCreateInput {
  organizationId: string
  crmInstanceId: string
  name: string
  description?: string
  isDefault?: boolean
  isActive?: boolean
}

export interface CrmPipelinePatch {
  name?: string
  description?: string
  isDefault?: boolean
  isActive?: boolean
}

export interface CrmPipelineStageCreateInput {
  pipelineId: string
  name: string
  key: string
  color: string
  isWon?: boolean
  isLost?: boolean
  isActive?: boolean
}

export interface CrmPipelineStagePatch {
  name?: string
  key?: string
  color?: string
  isWon?: boolean
  isLost?: boolean
  isActive?: boolean
}

export interface CrmPipelineMetrics {
  leadCount: number
  openValue: number
  staleCount: number
  wonCount: number
  lostCount: number
  conversionRate: number | null
}

export interface CrmPipelineStageMetrics extends CrmPipelineMetrics {
  stageId: string
}

export interface CrmLead {
  id: string
  organizationId: string
  crmInstanceId?: string
  pipelineId: string
  stageId: string
  teamId?: string
  ownerMemberId?: string
  pipelineVersionId?: string
  stageVersionId?: string
  assignmentState?: CrmAssignmentState
  assignmentMode?: CrmAssignmentMode
  lastAssignmentAt?: string
  name: string
  email: string
  phone?: string
  company?: string
  source: string
  sourceKind?: LeadSourceKind
  status?: CrmLeadStatus
  whatsappPhone?: string
  city?: string
  state?: string
  segment?: string
  interest?: string
  temperature?: 'hot' | 'warm' | 'cold' | 'unqualified'
  urgency?: 'high' | 'medium' | 'low'
  consentLgpd?: boolean
  whatsappOptIn?: boolean
  emailOptIn?: boolean
  competitor?: string
  objections?: string[]
  currentStageEnteredAt?: string
  tagIds?: string[]
  aiSummary?: string
  intent?: string
  sentiment?: 'positive' | 'neutral' | 'negative' | 'unknown'
  urgencyDetectedAt?: string
  lastConversationAt?: string
  score: number
  fitScore?: number
  intentScore?: number
  value?: number
  notes?: string
  ownerId?: string
  assignedTo?: string
  lostReason?: string
  wonAt?: string
  lostAt?: string
  lastActivityAt?: string
  nextFollowUpAt?: string
  attributionContext?: AttributionContext
  createdAt: string
  updatedAt: string
}

export interface CrmPipelineSummary {
  newLeads: number
  staleLeads: number
  tasksDue: number
  openPipelineValue: number
  conversionRate: number
}

export interface CrmInteraction {
  id: string
  organizationId: string
  leadId: string
  type: 'call' | 'email' | 'meeting' | 'note'
  title: string
  description: string
  date: string
}

export interface CrmTask {
  id: string
  organizationId: string
  leadId: string
  enrollmentId?: string
  title: string
  description?: string
  status: CrmTaskStatus
  priority?: CrmTaskPriority
  dueAt: string
  completedAt?: string
  cancelledAt?: string
  assignedTo?: string
}

export interface CrmTaskListItem extends CrmTask {
  leadName: string
  leadCompany?: string
  pipelineName?: string
  stageName?: string
  assignedToName?: string
}

export interface CrmTaskPage {
  items: CrmTaskListItem[]
  total: number
  nextCursor?: string
}

export interface CrmTaskFilters {
  organizationId: string
  crmInstanceId: string
  status?: CrmTaskStatus
  priority?: CrmTaskPriority
  assignedTo?: string
  leadId?: string
  due?: 'overdue' | 'today' | 'upcoming'
  search?: string
  cursor?: string
  limit?: number
}

export interface CrmTaskPatch {
  title?: string
  description?: string | null
  dueAt?: string
  assignedTo?: string | null
  priority?: CrmTaskPriority
  status?: CrmTaskStatus
}

export type LeadScoreDimension = 'fit' | 'intent'
export type LeadScoringOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than' | 'exists'

export interface LeadScoringModel {
  id: string
  crmInstanceId: string
  name: string
  fitWeight: number
  intentWeight: number
  thresholds: number[]
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface LeadScoringRule {
  id: string
  modelId: string
  name: string
  dimension: LeadScoreDimension
  eventType: string
  fieldPath?: string
  operator?: LeadScoringOperator
  comparisonValue?: unknown
  points: number
  isActive: boolean
}

export interface LeadScoreEvent {
  id: string
  leadId: string
  eventType: string
  dimension: LeadScoreDimension
  points: number
  previousScore: number
  resultingScore: number
  context: Record<string, unknown>
  occurredAt: string
}

export interface CreateLeadTaskInput {
  organizationId: string
  leadId: string
  title: string
  description?: string
  dueAt: string
  assignedTo?: string
  priority?: CrmTaskPriority
}

export interface RecordLeadActivityInput {
  organizationId: string
  leadId: string
  type: CrmInteraction['type']
  title: string
  description: string
  date?: string
}

export interface MarkLeadWonInput {
  leadId: string
  stageId?: string
  value?: number
}

export interface MarkLeadLostInput {
  leadId: string
  stageId?: string
  lostReason: string
}

export interface CrmSequence {
  id: string
  organizationId: string
  name: string
  description?: string
  isActive: boolean
  steps?: CrmSequenceStep[]
}

export interface CrmSequenceStep {
  id: string
  sequenceId: string
  actionType: CrmActionType
  delayMinutes: number
  subject?: string
  body: string
  orderIndex: number
  isActive: boolean
}

export interface CrmSequenceEnrollment {
  id: string
  organizationId: string
  sequenceId: string
  leadId: string
  status: CrmEnrollmentStatus
  currentStepIndex: number
  nextExecutionAt?: string
  manualNote?: string
}

export interface AutomationExecution {
  id: string
  organizationId: string
  leadId: string
  enrollmentId?: string
  stepId?: string
  actionType: CrmActionType
  payload: Record<string, unknown>
  status: AutomationExecutionStatus
  attemptCount: number
  lastError?: string
  scheduledAt: string
  requestedAt: string
  completedAt?: string
}
