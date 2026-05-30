import { supabase } from '@/lib/supabase'
import type {
  AutomationExecution,
  CrmInteraction,
  CrmLead,
  CrmPipeline,
  CrmPipelineStage,
  CrmSequence,
  CrmSequenceEnrollment,
  CrmTask,
} from '@/types/crm'

type StageRow = { id: string; pipeline_id: string; key: string; name: string; color: string; order_index: number; is_won: boolean; is_lost: boolean; is_active: boolean }
type PipelineRow = { id: string; organization_id: string; name: string; description?: string | null; is_default: boolean; is_active: boolean; crm_pipeline_stages?: StageRow[] }
type LeadRow = { id: string; organization_id: string; pipeline_id: string; stage_id: string; name: string; email: string; phone?: string | null; company?: string | null; source: string; score?: number | null; value?: number | string | null; notes?: string | null; assigned_to?: string | null; next_follow_up_at?: string | null; created_at: string; updated_at: string }
type InteractionRow = { id: string; organization_id: string; lead_id: string; type: CrmInteraction['type']; title: string; description: string; date: string }
type TaskRow = { id: string; organization_id: string; lead_id: string; enrollment_id?: string | null; title: string; description?: string | null; status: CrmTask['status']; due_at: string; assigned_to?: string | null }
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
  score: row.score || 0,
  value: row.value !== null && row.value !== undefined ? Number(row.value) : undefined,
  notes: row.notes || undefined,
  assignedTo: row.assigned_to || undefined,
  nextFollowUpAt: row.next_follow_up_at || undefined,
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
  dueAt: row.due_at,
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
      score: input.score,
      value: input.value ?? null,
      notes: input.notes || null,
      assigned_to: input.assignedTo || null,
      next_follow_up_at: input.nextFollowUpAt || null,
      stage: 'NEW',
    }).select().single()
    if (error) throw error
    return mapLead(data)
  },

  async moveLead(leadId: string, stage: CrmPipelineStage) {
    const legacyStage = stage.key.toUpperCase()
    const { data, error } = await supabase
      .from('leads')
      .update({ stage_id: stage.id, stage: legacyStage })
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
    const { data, error } = await supabase.from('interactions').insert({
      organization_id: organizationId,
      lead_id: leadId,
      ...input,
      date: new Date().toISOString(),
    }).select().single()
    if (error) throw error
    return mapInteraction(data)
  },

  async getTasks(leadId: string) {
    const { data, error } = await supabase.from('crm_tasks').select('*').eq('lead_id', leadId).order('due_at')
    if (error) throw error
    return (data || []).map(mapTask)
  },

  async createTask(organizationId: string, leadId: string, title: string, dueAt: string) {
    const { data, error } = await supabase.from('crm_tasks').insert({ organization_id: organizationId, lead_id: leadId, title, due_at: dueAt }).select().single()
    if (error) throw error
    return mapTask(data)
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
