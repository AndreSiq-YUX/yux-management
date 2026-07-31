import { apiRequest } from '@/lib/apiClient'
import type {
  AutomationExecution,
  CreateLeadTaskInput,
  CrmInteraction,
  CrmLead,
  CrmPipeline,
  CrmPipelineStage,
  CrmSequence,
  CrmSequenceEnrollment,
  CrmTask,
  MarkLeadLostInput,
  MarkLeadWonInput,
  RecordLeadActivityInput,
} from '@/types/crm'

type StageRow = { id: string; pipeline_id: string; key: string; name: string; color: string; order_index: number; is_won: boolean; is_lost: boolean; is_active: boolean }
type PipelineRow = { id: string; organization_id: string; crm_instance_id?: string | null; name: string; description?: string | null; is_default: boolean; is_active: boolean; crm_pipeline_stages?: StageRow[] }
type LeadRow = {
  id: string
  organization_id: string
  crm_instance_id?: string | null
  pipeline_id: string
  stage_id: string
  team_id?: string | null
  owner_member_id?: string | null
  pipeline_version_id?: string | null
  stage_version_id?: string | null
  assignment_state?: CrmLead['assignmentState'] | null
  assignment_mode?: CrmLead['assignmentMode'] | null
  last_assignment_at?: string | null
  name: string
  email: string
  phone?: string | null
  company?: string | null
  source: string
  source_kind?: CrmLead['sourceKind'] | null
  status?: CrmLead['status'] | null
  score?: number | null
  value?: number | string | null
  notes?: string | null
  owner_id?: string | null
  assigned_to?: string | null
  lost_reason?: string | null
  won_at?: string | null
  lost_at?: string | null
  last_activity_at?: string | null
  next_follow_up_at?: string | null
  attribution_context?: CrmLead['attributionContext'] | null
  ai_summary?: string | null
  intent?: string | null
  sentiment?: CrmLead['sentiment'] | null
  urgency_detected_at?: string | null
  last_conversation_at?: string | null
  created_at: string
  updated_at: string
}
type InteractionRow = { id: string; organization_id: string; lead_id: string; type: CrmInteraction['type']; title: string; description: string; date: string }
type TaskRow = {
  id: string
  organization_id: string
  lead_id: string
  enrollment_id?: string | null
  title: string
  description?: string | null
  status: CrmTask['status']
  priority?: CrmTask['priority'] | null
  due_at: string
  completed_at?: string | null
  assigned_to?: string | null
}
type SequenceStepRow = { id: string; sequence_id: string; action_type: AutomationExecution['actionType']; delay_minutes: number; subject?: string | null; body: string; order_index: number; is_active: boolean }
type SequenceRow = { id: string; organization_id: string; name: string; description?: string | null; is_active: boolean; crm_sequence_steps?: SequenceStepRow[] }
type EnrollmentRow = { id: string; organization_id: string; sequence_id: string; lead_id: string; status: CrmSequenceEnrollment['status']; current_step_index: number; next_execution_at?: string | null; manual_note?: string | null }
type ExecutionRow = { id: string; organization_id: string; lead_id: string; enrollment_id?: string | null; step_id?: string | null; action_type: AutomationExecution['actionType']; payload?: Record<string, unknown> | null; status: AutomationExecution['status']; attempt_count: number; last_error?: string | null; scheduled_at: string; requested_at: string; completed_at?: string | null }

const mapStage = (row: StageRow): CrmPipelineStage => ({
  id: row.id,
  pipelineId: row.pipeline_id,
  key: row.key,
  name: row.name,
  color: row.color,
  orderIndex: row.order_index,
  isWon: row.is_won,
  isLost: row.is_lost,
  isActive: row.is_active,
})

const mapPipeline = (row: PipelineRow): CrmPipeline => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: row.crm_instance_id || undefined,
  name: row.name,
  description: row.description || undefined,
  isDefault: row.is_default,
  isActive: row.is_active,
  stages: (row.crm_pipeline_stages || []).map(mapStage),
})

const mapLead = (row: LeadRow): CrmLead => ({
  id: row.id,
  organizationId: row.organization_id,
  crmInstanceId: row.crm_instance_id || undefined,
  pipelineId: row.pipeline_id,
  stageId: row.stage_id,
  teamId: row.team_id || undefined,
  ownerMemberId: row.owner_member_id || undefined,
  pipelineVersionId: row.pipeline_version_id || undefined,
  stageVersionId: row.stage_version_id || undefined,
  assignmentState: row.assignment_state || undefined,
  assignmentMode: row.assignment_mode || undefined,
  lastAssignmentAt: row.last_assignment_at || undefined,
  name: row.name,
  email: row.email,
  phone: row.phone || undefined,
  company: row.company || undefined,
  source: row.source,
  sourceKind: row.source_kind || undefined,
  status: row.status || 'open',
  score: row.score || 0,
  value: row.value !== null && row.value !== undefined ? Number(row.value) : undefined,
  notes: row.notes || undefined,
  ownerId: row.owner_id || undefined,
  assignedTo: row.assigned_to || undefined,
  lostReason: row.lost_reason || undefined,
  wonAt: row.won_at || undefined,
  lostAt: row.lost_at || undefined,
  lastActivityAt: row.last_activity_at || undefined,
  nextFollowUpAt: row.next_follow_up_at || undefined,
  attributionContext: row.attribution_context || undefined,
  aiSummary: row.ai_summary || undefined,
  intent: row.intent || undefined,
  sentiment: row.sentiment || undefined,
  urgencyDetectedAt: row.urgency_detected_at || undefined,
  lastConversationAt: row.last_conversation_at || undefined,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapInteraction = (row: InteractionRow): CrmInteraction => ({
  id: row.id,
  organizationId: row.organization_id,
  leadId: row.lead_id,
  type: row.type,
  title: row.title,
  description: row.description,
  date: row.date,
})

const mapTask = (row: TaskRow): CrmTask => ({
  id: row.id,
  organizationId: row.organization_id,
  leadId: row.lead_id,
  enrollmentId: row.enrollment_id || undefined,
  title: row.title,
  description: row.description || undefined,
  status: row.status,
  priority: row.priority || undefined,
  dueAt: row.due_at,
  completedAt: row.completed_at || undefined,
  assignedTo: row.assigned_to || undefined,
})

const mapSequence = (row: SequenceRow): CrmSequence => ({
  id: row.id,
  organizationId: row.organization_id,
  name: row.name,
  description: row.description || undefined,
  isActive: row.is_active,
  steps: (row.crm_sequence_steps || []).map(step => ({
    id: step.id,
    sequenceId: step.sequence_id,
    actionType: step.action_type,
    delayMinutes: step.delay_minutes,
    subject: step.subject || undefined,
    body: step.body,
    orderIndex: step.order_index,
    isActive: step.is_active,
  })),
})

const mapEnrollment = (row: EnrollmentRow): CrmSequenceEnrollment => ({
  id: row.id,
  organizationId: row.organization_id,
  sequenceId: row.sequence_id,
  leadId: row.lead_id,
  status: row.status,
  currentStepIndex: row.current_step_index,
  nextExecutionAt: row.next_execution_at || undefined,
  manualNote: row.manual_note || undefined,
})

const mapExecution = (row: ExecutionRow): AutomationExecution => ({
  id: row.id,
  organizationId: row.organization_id,
  leadId: row.lead_id,
  enrollmentId: row.enrollment_id || undefined,
  stepId: row.step_id || undefined,
  actionType: row.action_type,
  payload: row.payload || {},
  status: row.status,
  attemptCount: row.attempt_count,
  lastError: row.last_error || undefined,
  scheduledAt: row.scheduled_at,
  requestedAt: row.requested_at,
  completedAt: row.completed_at || undefined,
})

const toLegacyStage = (stage: Pick<CrmPipelineStage, 'key' | 'isWon' | 'isLost'>) => {
  if (stage.isWon) return 'WON'
  if (stage.isLost) return 'LOST'
  const key = stage.key.toLowerCase()
  if (key === 'qualified') return 'QUALIFIED'
  if (key === 'proposal') return 'PROPOSAL'
  if (key === 'negotiation') return 'NEGOTIATION'
  return 'NEW'
}

const buildQuery = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value)
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export const buildLeadScoreUpdatePayload = (score: number) => ({
  score: Math.max(0, Math.min(100, Math.round(score))),
})

export const buildLeadTaskInsertPayload = (input: CreateLeadTaskInput) => ({
  organization_id: input.organizationId,
  lead_id: input.leadId,
  title: input.title.trim(),
  description: input.description?.trim() || null,
  due_at: input.dueAt,
  assigned_to: input.assignedTo || null,
  priority: input.priority || 'medium',
})

export const buildLeadActivityInsertPayload = (input: RecordLeadActivityInput) => ({
  organization_id: input.organizationId,
  lead_id: input.leadId,
  type: input.type,
  title: input.title.trim(),
  description: input.description.trim(),
  date: input.date || new Date().toISOString(),
})

export interface CreateGovernedLeadInput extends Omit<CrmLead, 'id' | 'createdAt' | 'updatedAt'> {
  crmInstanceId: string
  teamId?: string
  ownerMemberId?: string
}

export interface AssignLeadInput {
  teamId?: string
  ownerMemberId?: string
  assignmentMode: NonNullable<CrmLead['assignmentMode']>
}

export const buildGovernedLeadInsertPayload = (input: CreateGovernedLeadInput) => ({
  organization_id: input.organizationId,
  crm_instance_id: input.crmInstanceId,
  pipeline_id: input.pipelineId,
  stage_id: input.stageId,
  team_id: input.teamId || null,
  owner_member_id: input.ownerMemberId || null,
  pipeline_version_id: input.pipelineVersionId || null,
  stage_version_id: input.stageVersionId || null,
  name: input.name,
  email: input.email,
  phone: input.phone || null,
  company: input.company || null,
  source: input.source,
  source_kind: input.sourceKind || 'manual',
  status: input.status || 'open',
  score: input.score,
  value: input.value ?? null,
  notes: input.notes || null,
  owner_id: input.ownerId || input.assignedTo || null,
  assigned_to: input.assignedTo || null,
  assignment_mode: input.assignmentMode || 'queue',
  assignment_state: input.ownerMemberId ? 'assigned' : 'in_queue',
  last_assignment_at: input.ownerMemberId ? new Date().toISOString() : null,
  last_activity_at: input.lastActivityAt || new Date().toISOString(),
  next_follow_up_at: input.nextFollowUpAt || null,
  attribution_context: input.attributionContext || {},
  stage: 'NEW',
})

export const buildLeadAssignmentPayload = (input: AssignLeadInput) => ({
  team_id: input.teamId || null,
  owner_member_id: input.ownerMemberId || null,
  assignment_mode: input.assignmentMode,
  assignment_state: input.ownerMemberId ? 'reassigned' : 'in_queue',
  last_assignment_at: new Date().toISOString(),
})

export const buildLeadWonPayload = (input: MarkLeadWonInput) => ({
  ...(input.stageId ? { stage_id: input.stageId, stage: 'WON' } : { stage: 'WON' }),
  status: 'won',
  ...(input.value !== undefined ? { value: input.value } : {}),
  won_at: new Date().toISOString(),
  lost_at: null,
  lost_reason: null,
})

export const buildLeadLostPayload = (input: MarkLeadLostInput) => ({
  ...(input.stageId ? { stage_id: input.stageId, stage: 'LOST' } : { stage: 'LOST' }),
  status: 'lost',
  lost_reason: input.lostReason.trim(),
  lost_at: new Date().toISOString(),
  won_at: null,
})

export const crmService = {
  async getPipelines(organizationId: string) {
    return apiRequest<CrmPipeline[]>(`/crm/pipelines?organizationId=${encodeURIComponent(organizationId)}`)
  },

  async getPipelinesForOrganization(organizationId: string) {
    return crmService.getPipelines(organizationId)
  },

  async getLeads(organizationId: string, pipelineId: string) {
    return apiRequest<CrmLead[]>(`/crm/leads${buildQuery({ organizationId, pipelineId })}`)
  },

  async getLeadsForPipeline(pipelineId: string) {
    return apiRequest<CrmLead[]>(`/crm/leads${buildQuery({ pipelineId })}`)
  },

  async createLead(input: Omit<CrmLead, 'id' | 'createdAt' | 'updatedAt'>) {
    return apiRequest<CrmLead>('/crm/leads', {
      method: 'POST',
      body: {
        ...input,
        sourceKind: input.sourceKind || 'manual',
        status: input.status || 'open',
        lastActivityAt: input.lastActivityAt || new Date().toISOString(),
        attributionContext: input.attributionContext || {},
      },
    })
  },

  async createGovernedLead(input: CreateGovernedLeadInput) {
    return apiRequest<CrmLead>('/crm/leads', {
      method: 'POST',
      body: {
        ...input,
        assignmentState: input.ownerMemberId ? 'assigned' : 'in_queue',
        lastActivityAt: input.lastActivityAt || new Date().toISOString(),
        sourceKind: input.sourceKind || 'manual',
        status: input.status || 'open',
        attributionContext: input.attributionContext || {},
      },
    })
  },

  async getLeadsForInstance(crmInstanceId: string, pipelineId?: string) {
    return apiRequest<CrmLead[]>(`/crm/leads${buildQuery({ crmInstanceId, pipelineId })}`)
  },

  async assignLead(leadId: string, input: AssignLeadInput) {
    return apiRequest<CrmLead>(`/crm/leads/${leadId}`, {
      method: 'PATCH',
      body: {
        teamId: input.teamId,
        ownerMemberId: input.ownerMemberId,
        assignmentMode: input.assignmentMode,
      },
    })
  },

  async moveLead(leadId: string, stage: CrmPipelineStage) {
    const legacyStage = toLegacyStage(stage)
    return apiRequest<CrmLead>(`/crm/leads/${leadId}`, {
      method: 'PATCH',
      body: {
        stageId: stage.id,
        stage: legacyStage,
        status: stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open',
        wonAt: stage.isWon ? new Date().toISOString() : null,
        lostAt: stage.isLost ? new Date().toISOString() : null,
        lastActivityAt: new Date().toISOString(),
      },
    })
  },

  async moveLeadToStage(leadId: string, stageId: string) {
    return apiRequest<CrmLead>(`/crm/leads/${leadId}/stage`, {
      method: 'PATCH',
      body: { stageId },
    })
  },

  async updateLeadScore(leadId: string, score: number) {
    return apiRequest<CrmLead>(`/crm/leads/${leadId}`, {
      method: 'PATCH',
      body: buildLeadScoreUpdatePayload(score),
    })
  },

  async getInteractions(leadId: string) {
    return apiRequest<CrmInteraction[]>(`/crm/leads/${leadId}/interactions`)
  },

  async createInteraction(organizationId: string, leadId: string, input: Pick<CrmInteraction, 'type' | 'title' | 'description'>) {
    return crmService.recordLeadActivity({ organizationId, leadId, ...input })
  },

  async recordLeadActivity(input: RecordLeadActivityInput) {
    return apiRequest<CrmInteraction>(`/crm/leads/${input.leadId}/interactions`, {
      method: 'POST',
      body: {
        organizationId: input.organizationId,
        type: input.type,
        title: input.title.trim(),
        description: input.description.trim(),
        date: input.date || new Date().toISOString(),
      },
    })
  },

  async getTasks(leadId: string) {
    return apiRequest<CrmTask[]>(`/crm/leads/${leadId}/tasks`)
  },

  async createTask(organizationId: string, leadId: string, title: string, dueAt: string) {
    return crmService.createLeadTask({ organizationId, leadId, title, dueAt })
  },

  async createLeadTask(input: CreateLeadTaskInput) {
    return apiRequest<CrmTask>(`/crm/leads/${input.leadId}/tasks`, {
      method: 'POST',
      body: {
        organizationId: input.organizationId,
        title: input.title.trim(),
        description: input.description?.trim() || undefined,
        dueAt: input.dueAt,
        assignedTo: input.assignedTo,
        priority: input.priority || 'medium',
      },
    })
  },

  async completeLeadTask(taskId: string) {
    return apiRequest<CrmTask>(`/crm/tasks/${taskId}/complete`, {
      method: 'PATCH',
    })
  },

  async markLeadWon(input: MarkLeadWonInput) {
    return apiRequest<CrmLead>(`/crm/leads/${input.leadId}`, {
      method: 'PATCH',
      body: {
        ...(input.stageId ? { stageId: input.stageId, stage: 'WON' } : { stage: 'WON' }),
        status: 'won',
        ...(input.value !== undefined ? { value: input.value } : {}),
        wonAt: new Date().toISOString(),
        lostAt: null,
        lostReason: null,
      },
    })
  },

  async markLeadLost(input: MarkLeadLostInput) {
    return apiRequest<CrmLead>(`/crm/leads/${input.leadId}`, {
      method: 'PATCH',
      body: {
        ...(input.stageId ? { stageId: input.stageId, stage: 'LOST' } : { stage: 'LOST' }),
        status: 'lost',
        lostReason: input.lostReason.trim(),
        lostAt: new Date().toISOString(),
        wonAt: null,
      },
    })
  },

  async getSequences(organizationId: string) {
    return apiRequest<CrmSequence[]>(`/crm/sequences?organizationId=${encodeURIComponent(organizationId)}`)
  },

  async getEnrollments(leadId: string) {
    return apiRequest<CrmSequenceEnrollment[]>(`/crm/leads/${leadId}/enrollments`)
  },

  async enrollLead(organizationId: string, leadId: string, sequenceId: string) {
    const enrollment = await apiRequest<CrmSequenceEnrollment>(`/crm/leads/${leadId}/enrollments`, {
      method: 'POST',
      body: { organizationId, sequenceId },
    })
    await apiRequest('/automations/dispatch', {
      method: 'POST',
      body: {
        event: {
          type: 'crm.sequence.enrolled',
          organizationId,
          leadId,
          payload: { enrollmentId: enrollment.id, sequenceId },
        },
      },
    })
    return enrollment
  },

  async updateEnrollment(id: string, updates: Partial<Pick<CrmSequenceEnrollment, 'status' | 'nextExecutionAt' | 'manualNote'>>) {
    return apiRequest<CrmSequenceEnrollment>(`/crm/enrollments/${id}`, {
      method: 'PATCH',
      body: updates,
    })
  },

  async getExecutions(leadId: string) {
    return apiRequest<AutomationExecution[]>(`/crm/leads/${leadId}/executions`)
  },

  async retryExecution(executionId: string) {
    return apiRequest('/automations/dispatch', {
      method: 'POST',
      body: {
        event: {
          type: 'crm.execution.retry',
          payload: { executionId },
        },
      },
    })
  },
}
