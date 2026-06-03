import type { AttributionContext, LeadSourceKind } from './commercial'

export type CrmActionType = 'whatsapp' | 'email' | 'internal_task'
export type CrmEnrollmentStatus = 'active' | 'paused' | 'manual' | 'completed' | 'cancelled'
export type CrmTaskStatus = 'pending' | 'completed' | 'cancelled'
export type AutomationExecutionStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type CrmLeadStatus = 'open' | 'won' | 'lost'
export type CrmLeadAttentionState = 'on_track' | 'due_today' | 'overdue' | 'stale' | 'won' | 'lost'

export interface CrmPipeline {
  id: string
  organizationId: string
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

export interface CrmLead {
  id: string
  organizationId: string
  pipelineId: string
  stageId: string
  name: string
  email: string
  phone?: string
  company?: string
  source: string
  sourceKind?: LeadSourceKind
  status?: CrmLeadStatus
  score: number
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
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  dueAt: string
  completedAt?: string
  assignedTo?: string
}

export interface CreateLeadTaskInput {
  organizationId: string
  leadId: string
  title: string
  description?: string
  dueAt: string
  assignedTo?: string
  priority?: 'low' | 'medium' | 'high' | 'urgent'
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
