import { supabase } from '@/lib/supabase'
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
type PipelineRow = { id: string; organization_id: string; name: string; description?: string | null; is_default: boolean; is_active: boolean; crm_pipeline_stages?: StageRow[] }
type LeadRow = {
  id: string
  organization_id: string
  pipeline_id: string
  stage_id: string
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
  name: row.name,
  description: row.description || undefined,
  isDefault: row.is_default,
  isActive: row.is_active,
  stages: (row.crm_pipeline_stages || []).map(mapStage),
})

const mapLead = (row: LeadRow): CrmLead => ({
  id: row.id,
  organizationId: row.organization_id,
  pipelineId: row.pipeline_id,
  stageId: row.stage_id,
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
    const { data, error } = await supabase
      .from('crm_pipelines')
      .select('*, crm_pipeline_stages(*)')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .order('name')
    if (error) throw error
    return (data || []).map(mapPipeline)
  },

  async getPipelinesForOrganization(organizationId: string) {
    return crmService.getPipelines(organizationId)
  },

  async getLeads(organizationId: string, pipelineId: string) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('pipeline_id', pipelineId)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapLead)
  },

  async getLeadsForPipeline(pipelineId: string) {
    const { data, error } = await supabase
      .from('leads')
      .select('*')
      .eq('pipeline_id', pipelineId)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapLead)
  },

  async createLead(input: Omit<CrmLead, 'id' | 'createdAt' | 'updatedAt'>) {
    const { data, error } = await supabase.from('leads').insert({
      organization_id: input.organizationId,
      pipeline_id: input.pipelineId,
      stage_id: input.stageId,
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
      last_activity_at: input.lastActivityAt || new Date().toISOString(),
      next_follow_up_at: input.nextFollowUpAt || null,
      attribution_context: input.attributionContext || {},
      stage: 'NEW',
    }).select().single()
    if (error) throw error
    return mapLead(data)
  },

  async moveLead(leadId: string, stage: CrmPipelineStage) {
    const legacyStage = toLegacyStage(stage)
    const { data, error } = await supabase
      .from('leads')
      .update({
        stage_id: stage.id,
        stage: legacyStage,
        status: stage.isWon ? 'won' : stage.isLost ? 'lost' : 'open',
        won_at: stage.isWon ? new Date().toISOString() : null,
        lost_at: stage.isLost ? new Date().toISOString() : null,
        last_activity_at: new Date().toISOString(),
      })
      .eq('id', leadId)
      .select()
      .single()
    if (error) throw error
    return mapLead(data)
  },

  async moveLeadToStage(leadId: string, stageId: string) {
    const { data: stage, error: stageError } = await supabase
      .from('crm_pipeline_stages')
      .select('*')
      .eq('id', stageId)
      .single()
    if (stageError) throw stageError
    return crmService.moveLead(leadId, mapStage(stage))
  },

  async updateLeadScore(leadId: string, score: number) {
    const { data, error } = await supabase
      .from('leads')
      .update(buildLeadScoreUpdatePayload(score))
      .eq('id', leadId)
      .select()
      .single()
    if (error) throw error
    return mapLead(data)
  },

  async getInteractions(leadId: string) {
    const { data, error } = await supabase.from('interactions').select('*').eq('lead_id', leadId).order('date', { ascending: false })
    if (error) throw error
    return (data || []).map(mapInteraction)
  },

  async createInteraction(organizationId: string, leadId: string, input: Pick<CrmInteraction, 'type' | 'title' | 'description'>) {
    return crmService.recordLeadActivity({ organizationId, leadId, ...input })
  },

  async recordLeadActivity(input: RecordLeadActivityInput) {
    const payload = buildLeadActivityInsertPayload(input)
    const { data, error } = await supabase.from('interactions').insert(payload).select().single()
    if (error) throw error
    const { error: leadError } = await supabase
      .from('leads')
      .update({ last_activity_at: payload.date })
      .eq('id', input.leadId)
    if (leadError) throw leadError
    return mapInteraction(data)
  },

  async getTasks(leadId: string) {
    const { data, error } = await supabase.from('lead_tasks').select('*').eq('lead_id', leadId).order('due_at')
    if (error) throw error
    return (data || []).map(mapTask)
  },

  async createTask(organizationId: string, leadId: string, title: string, dueAt: string) {
    return crmService.createLeadTask({ organizationId, leadId, title, dueAt })
  },

  async createLeadTask(input: CreateLeadTaskInput) {
    const { data, error } = await supabase.from('lead_tasks').insert(buildLeadTaskInsertPayload(input)).select().single()
    if (error) throw error
    return mapTask(data)
  },

  async completeLeadTask(taskId: string) {
    const { data, error } = await supabase
      .from('lead_tasks')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', taskId)
      .select()
      .single()
    if (error) throw error
    return mapTask(data)
  },

  async markLeadWon(input: MarkLeadWonInput) {
    const { data, error } = await supabase
      .from('leads')
      .update(buildLeadWonPayload(input))
      .eq('id', input.leadId)
      .select()
      .single()
    if (error) throw error
    return mapLead(data)
  },

  async markLeadLost(input: MarkLeadLostInput) {
    const { data, error } = await supabase
      .from('leads')
      .update(buildLeadLostPayload(input))
      .eq('id', input.leadId)
      .select()
      .single()
    if (error) throw error
    return mapLead(data)
  },

  async getSequences(organizationId: string) {
    const { data, error } = await supabase.from('crm_sequences').select('*, crm_sequence_steps(*)').eq('organization_id', organizationId).eq('is_active', true)
    if (error) throw error
    return (data || []).map(mapSequence)
  },

  async getEnrollments(leadId: string) {
    const { data, error } = await supabase.from('crm_sequence_enrollments').select('*').eq('lead_id', leadId).order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapEnrollment)
  },

  async enrollLead(organizationId: string, leadId: string, sequenceId: string) {
    const { data, error } = await supabase.from('crm_sequence_enrollments').insert({ organization_id: organizationId, lead_id: leadId, sequence_id: sequenceId, next_execution_at: new Date().toISOString() }).select().single()
    if (error) throw error
    const { data: execution, error: executionError } = await supabase
      .from('automation_executions')
      .select('id')
      .eq('enrollment_id', data.id)
      .order('scheduled_at')
      .limit(1)
      .maybeSingle()
    if (executionError) throw executionError
    if (execution) await supabase.functions.invoke('dispatch-crm-automation', { body: { executionId: execution.id } })
    return mapEnrollment(data)
  },

  async updateEnrollment(id: string, updates: Partial<Pick<CrmSequenceEnrollment, 'status' | 'nextExecutionAt' | 'manualNote'>>) {
    const { data, error } = await supabase.from('crm_sequence_enrollments').update({
      status: updates.status,
      next_execution_at: updates.nextExecutionAt,
      manual_note: updates.manualNote,
    }).eq('id', id).select().single()
    if (error) throw error
    return mapEnrollment(data)
  },

  async getExecutions(leadId: string) {
    const { data, error } = await supabase.from('automation_executions').select('*').eq('lead_id', leadId).order('requested_at', { ascending: false })
    if (error) throw error
    return (data || []).map(mapExecution)
  },

  async retryExecution(executionId: string) {
    const { data, error } = await supabase.functions.invoke('dispatch-crm-automation', { body: { executionId } })
    if (error) throw error
    return data
  },
}
