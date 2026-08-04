import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { recordDomainEvent } from '../events/repository.js'

export type CrmLeadInput = {
  organizationId: string
  crmInstanceId?: string
  pipelineId: string
  stageId: string
  teamId?: string
  ownerMemberId?: string
  pipelineVersionId?: string
  stageVersionId?: string
  assignmentState?: string
  assignmentMode?: string
  name: string
  email: string
  phone?: string
  company?: string
  source: string
  sourceKind?: string
  status?: string
  score?: number
  value?: number
  notes?: string
  ownerId?: string
  assignedTo?: string
  lastActivityAt?: string
  nextFollowUpAt?: string
  attributionContext?: Record<string, unknown>
}

export type CrmLeadPatch = Partial<CrmLeadInput> & {
  stage?: string
  lostReason?: string | null
  wonAt?: string | null
  lostAt?: string | null
}

export type CrmInteractionInput = {
  organizationId: string
  type: string
  title: string
  description: string
  date?: string
}

export type CrmTaskInput = {
  organizationId: string
  title: string
  description?: string
  dueAt: string
  assignedTo?: string
  priority?: string
}

type PipelineRow = {
  id: string
  organization_id: string
  crm_instance_id: string | null
  name: string
  description: string | null
  is_default: boolean
  is_active: boolean
  crm_pipeline_stages?: StageRow[]
}

type StageRow = {
  id: string
  pipeline_id: string
  key: string
  name: string
  color: string
  order_index: number
  is_won: boolean
  is_lost: boolean
  is_active: boolean
}

type LeadRow = {
  id: string
  organization_id: string
  crm_instance_id: string | null
  pipeline_id: string
  stage_id: string
  team_id: string | null
  owner_member_id: string | null
  pipeline_version_id: string | null
  stage_version_id: string | null
  assignment_state: string | null
  assignment_mode: string | null
  last_assignment_at: string | null
  name: string
  email: string
  phone: string | null
  company: string | null
  source: string
  source_kind: string | null
  status: string | null
  score: number | null
  fit_score: number | null
  intent_score: number | null
  value: string | number | null
  notes: string | null
  owner_id: string | null
  assigned_to: string | null
  lost_reason: string | null
  won_at: string | null
  lost_at: string | null
  last_activity_at: string | null
  next_follow_up_at: string | null
  attribution_context: Record<string, unknown> | null
  ai_summary: string | null
  intent: string | null
  sentiment: string | null
  urgency_detected_at: string | null
  last_conversation_at: string | null
  created_at: string
  updated_at: string
}

type InteractionRow = {
  id: string
  organization_id: string
  lead_id: string
  type: string
  title: string
  description: string
  date: string
}

type TaskRow = {
  id: string
  organization_id: string
  lead_id: string
  enrollment_id: string | null
  title: string
  description: string | null
  status: string
  priority: string | null
  due_at: string
  completed_at: string | null
  assigned_to: string | null
}

type SequenceStepRow = { id: string; sequence_id: string; action_type: string; delay_minutes: number; subject: string | null; body: string; order_index: number; is_active: boolean }
type SequenceRow = { id: string; organization_id: string; name: string; description: string | null; is_active: boolean; crm_sequence_steps?: SequenceStepRow[] }
type EnrollmentRow = { id: string; organization_id: string; sequence_id: string; lead_id: string; status: string; current_step_index: number; next_execution_at: string | null; manual_note: string | null }
type ExecutionRow = {
  id: string
  organization_id: string
  lead_id: string
  enrollment_id: string | null
  step_id: string | null
  action_type: string
  payload: Record<string, unknown> | null
  status: string
  attempt_count: number
  last_error: string | null
  scheduled_at: string
  requested_at: string
  completed_at: string | null
}

type CrmInstanceRow = {
  id: string
  organization_id: string
  contract_id: string
  status: string
  sector_key: string | null
  blueprint_id: string | null
  blueprint_application_run_id: string | null
  seller_seat_limit: number
  manager_seat_limit: number
  admin_seat_limit: number
  max_pipeline_count: number
  max_custom_field_count: number
  max_automation_count: number
  allow_client_pipeline_customization: boolean
  allow_client_field_customization: boolean
  allow_client_category_customization: boolean
  default_assignment_mode: string
  created_at: string
  updated_at: string
}

type CrmInstanceMemberRow = {
  id: string
  crm_instance_id: string
  user_id: string
  role: string
  status: string
  display_name: string | null
  email: string | null
  created_at: string
  updated_at: string
}

type CrmTeamRow = {
  id: string
  crm_instance_id: string
  name: string
  description: string | null
  assignment_mode: string
  is_active: boolean
  created_at: string
  updated_at: string
}

type CrmTeamMemberRow = {
  id: string
  team_id: string
  member_id: string
  role: string
  created_at: string
}

export async function getCrmGovernanceContext(pool: pg.Pool, user: AuthUser, crmInstanceId: string) {
  const instanceResult = await pool.query<CrmInstanceRow>(
    `SELECT ci.*
     FROM public.crm_instances ci
     WHERE ci.id = $1
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1
           FROM public.memberships m
           WHERE m.user_id = $2
             AND m.organization_id = ci.organization_id
         )
       )
     LIMIT 1`,
    [crmInstanceId, user.id, isInternal(user)],
  )

  const instance = instanceResult.rows[0]
  if (!instance) throw Object.assign(new Error('crm_instance_not_found'), { statusCode: 404 })

  const [membersResult, teamsResult, teamMembershipsResult] = await Promise.all([
    pool.query<CrmInstanceMemberRow>(
      `SELECT id, crm_instance_id, user_id, role, status, display_name, email, created_at, updated_at
       FROM public.crm_instance_members
       WHERE crm_instance_id = $1
       ORDER BY created_at ASC`,
      [crmInstanceId],
    ),
    pool.query<CrmTeamRow>(
      `SELECT id, crm_instance_id, name, description, assignment_mode, is_active, created_at, updated_at
       FROM public.crm_teams
       WHERE crm_instance_id = $1
         AND is_active = TRUE
       ORDER BY name ASC`,
      [crmInstanceId],
    ),
    pool.query<CrmTeamMemberRow>(
      `SELECT ctm.id, ctm.team_id, ctm.member_id, ctm.role, ctm.created_at
       FROM public.crm_team_members ctm
       JOIN public.crm_teams ct ON ct.id = ctm.team_id
       WHERE ct.crm_instance_id = $1
         AND ct.is_active = TRUE
       ORDER BY ctm.created_at ASC`,
      [crmInstanceId],
    ),
  ])

  const members = membersResult.rows.map(mapCrmInstanceMember)

  return {
    instance: mapCrmInstance(instance),
    currentMember: members.find((member) => member.userId === user.id),
    members,
    teams: teamsResult.rows.map(mapCrmTeam),
    teamMemberships: teamMembershipsResult.rows.map(mapCrmTeamMember),
  }
}

export async function listLeads(
  pool: pg.Pool,
  user: AuthUser,
  filters: { organizationId?: string; pipelineId?: string; crmInstanceId?: string },
) {
  const result = await pool.query<LeadRow>(
    `SELECT *
     FROM public.leads l
     WHERE ($2::uuid IS NULL OR l.organization_id = $2)
       AND ($3::uuid IS NULL OR l.pipeline_id = $3)
       AND ($4::uuid IS NULL OR l.crm_instance_id = $4)
       AND (
         $5::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = l.organization_id
         )
       )
     ORDER BY l.updated_at DESC`,
    [user.id, filters.organizationId ?? null, filters.pipelineId ?? null, filters.crmInstanceId ?? null, isInternal(user)],
  )

  return result.rows.map(mapLead)
}

export async function listPipelines(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)

  const result = await pool.query<Omit<PipelineRow, 'crm_pipeline_stages'>>(
    `SELECT id, organization_id, crm_instance_id, name, description, is_default, is_active
     FROM public.crm_pipelines
     WHERE organization_id = $1 AND is_active = TRUE
     ORDER BY name ASC`,
    [organizationId],
  )

  return hydratePipelines(pool, result.rows)
}

export async function createLead(pool: pg.Pool, user: AuthUser, input: CrmLeadInput) {
  await requireOrganizationAccess(pool, user, input.organizationId)

  const result = await pool.query<LeadRow>(
    `INSERT INTO public.leads (
       organization_id, crm_instance_id, pipeline_id, stage_id, team_id, owner_member_id,
       pipeline_version_id, stage_version_id, assignment_state, assignment_mode,
       name, email, phone, company, source, source_kind, status, score, value, notes,
       owner_id, assigned_to, last_activity_at, next_follow_up_at, attribution_context, stage
     )
     VALUES (
       $1, $2, $3, $4, $5, $6,
       $7, $8, $9, $10,
       $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
       $21, $22, $23, $24, $25, 'NEW'
     )
     RETURNING *`,
    [
      input.organizationId,
      input.crmInstanceId ?? null,
      input.pipelineId,
      input.stageId,
      input.teamId ?? null,
      input.ownerMemberId ?? null,
      input.pipelineVersionId ?? null,
      input.stageVersionId ?? null,
      input.assignmentState ?? (input.ownerMemberId ? 'assigned' : null),
      input.assignmentMode ?? null,
      input.name,
      input.email,
      input.phone ?? null,
      input.company ?? null,
      input.source,
      input.sourceKind ?? 'manual',
      input.status ?? 'open',
      input.score ?? 0,
      input.value ?? null,
      input.notes ?? null,
      input.ownerId ?? input.assignedTo ?? null,
      input.assignedTo ?? null,
      input.lastActivityAt ?? new Date().toISOString(),
      input.nextFollowUpAt ?? null,
      input.attributionContext ?? {},
    ],
  )

  return mapLead(result.rows[0])
}

export async function patchLead(pool: pg.Pool, user: AuthUser, leadId: string, patch: CrmLeadPatch) {
  const existing = await getLeadForAccess(pool, user, leadId)
  const update = buildLeadUpdate(patch)

  if (update.values.length === 0) return mapLead(existing)

  const assignments = update.columns.map((column, index) => `${column} = $${index + 2}`)
  const result = await pool.query<LeadRow>(
    `UPDATE public.leads
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [leadId, ...update.values],
  )

  return mapLead(result.rows[0])
}

export async function moveLeadToStage(pool: pg.Pool, user: AuthUser, leadId: string, stageId: string) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const leadResult = await client.query<LeadRow>(
      `SELECT *
       FROM public.leads l
       WHERE l.id = $2
         AND (
           $3::boolean = TRUE
           OR EXISTS (
             SELECT 1 FROM public.memberships m
             WHERE m.user_id = $1 AND m.organization_id = l.organization_id
           )
         )
       LIMIT 1
       FOR UPDATE`,
      [user.id, leadId, isInternal(user)],
    )
    const lead = leadResult.rows[0]
    if (!lead) throw Object.assign(new Error('lead_not_found'), { statusCode: 404 })

    const stageResult = await client.query<StageRow & { organization_id: string; crm_instance_id: string | null }>(
      `SELECT s.id, s.pipeline_id, s.key, s.name, s.color, s.order_index, s.is_won, s.is_lost, s.is_active,
              p.organization_id, p.crm_instance_id
       FROM public.crm_pipeline_stages s
       JOIN public.crm_pipelines p ON p.id = s.pipeline_id
       WHERE s.id = $1
         AND s.is_active = TRUE
         AND p.is_active = TRUE
         AND p.organization_id = $2
         AND (
           $3::boolean = TRUE
           OR EXISTS (
             SELECT 1 FROM public.memberships m
             WHERE m.user_id = $4 AND m.organization_id = p.organization_id
           )
         )
       LIMIT 1`,
      [stageId, lead.organization_id, isInternal(user), user.id],
    )
    const stage = stageResult.rows[0]
    if (!stage) throw Object.assign(new Error('stage_not_found'), { statusCode: 404 })
    if (stage.crm_instance_id && lead.crm_instance_id && stage.crm_instance_id !== lead.crm_instance_id) {
      throw Object.assign(new Error('crm_instance_mismatch'), { statusCode: 409 })
    }
    if (!stage.crm_instance_id) throw Object.assign(new Error('crm_instance_required'), { statusCode: 409 })

    const now = new Date().toISOString()
    const result = await client.query<LeadRow>(
      `UPDATE public.leads
       SET crm_instance_id = $2,
           pipeline_id = $3,
           stage_id = $4,
           stage = $5,
           status = $6,
           won_at = $7,
           lost_at = $8,
           last_activity_at = $9,
           updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [
        leadId,
        stage.crm_instance_id,
        stage.pipeline_id,
        stage.id,
        toLegacyStage(stage),
        stage.is_won ? 'won' : stage.is_lost ? 'lost' : 'open',
        stage.is_won ? now : null,
        stage.is_lost ? now : null,
        now,
      ],
    )
    const updatedLead = result.rows[0]
    if (!updatedLead) throw Object.assign(new Error('lead_update_failed'), { statusCode: 500 })

    await client.query(
      `INSERT INTO public.lead_stage_history (
         crm_instance_id, lead_id, from_stage_id, to_stage_id, changed_by, changed_at
       ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [stage.crm_instance_id, leadId, lead.stage_id, stage.id, user.id, now],
    )

    await recordDomainEvent(client, {
      eventType: 'lead.stage_changed',
      organizationId: lead.organization_id,
      crmInstanceId: stage.crm_instance_id,
      aggregateType: 'lead',
      aggregateId: leadId,
      leadId,
      actor: { type: 'user', id: user.id },
      payload: {
        leadId,
        pipelineId: stage.pipeline_id,
        fromStageId: lead.stage_id,
        stageId: stage.id,
        toStageId: stage.id,
        status: updatedLead.status,
      },
    })

    await client.query('COMMIT')
    return mapLead(updatedLead)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function listLeadInteractions(pool: pg.Pool, user: AuthUser, leadId: string) {
  await getLeadForAccess(pool, user, leadId)
  const result = await pool.query<InteractionRow>(
    `SELECT id, organization_id, lead_id, type, title, description, date
     FROM public.interactions
     WHERE lead_id = $1
     ORDER BY date DESC`,
    [leadId],
  )

  return result.rows.map(mapInteraction)
}

export async function createLeadInteraction(
  pool: pg.Pool,
  user: AuthUser,
  leadId: string,
  input: CrmInteractionInput,
) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  await getLeadForAccess(pool, user, leadId)
  const date = input.date ?? new Date().toISOString()
  const result = await pool.query<InteractionRow>(
    `INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, organization_id, lead_id, type, title, description, date`,
    [input.organizationId, leadId, input.type, input.title.trim(), input.description.trim(), date],
  )
  await pool.query('UPDATE public.leads SET last_activity_at = $2, updated_at = NOW() WHERE id = $1', [leadId, date])

  return mapInteraction(result.rows[0])
}

export async function listLeadTasks(pool: pg.Pool, user: AuthUser, leadId: string) {
  await getLeadForAccess(pool, user, leadId)
  const result = await pool.query<TaskRow>(
    `SELECT id, organization_id, lead_id, enrollment_id, title, description, status, priority, due_at, completed_at, assigned_to
     FROM public.lead_tasks
     WHERE lead_id = $1
     ORDER BY due_at ASC`,
    [leadId],
  )

  return result.rows.map(mapTask)
}

export async function createLeadTask(pool: pg.Pool, user: AuthUser, leadId: string, input: CrmTaskInput) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  const lead = await getLeadForAccess(pool, user, leadId)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<TaskRow>(
      `INSERT INTO public.lead_tasks (organization_id, lead_id, title, description, due_at, assigned_to, priority, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, organization_id, lead_id, enrollment_id, title, description, status, priority, due_at, completed_at, assigned_to`,
      [
        input.organizationId,
        leadId,
        input.title.trim(),
        input.description?.trim() || null,
        input.dueAt,
        input.assignedTo ?? null,
        input.priority ?? 'medium',
        user.id,
      ],
    )
    const task = result.rows[0]
    if (!task) throw Object.assign(new Error('task_create_failed'), { statusCode: 500 })
    await client.query(
      `UPDATE public.leads
       SET next_follow_up_at = LEAST(COALESCE(next_follow_up_at, $2), $2), updated_at = NOW()
       WHERE id = $1`,
      [leadId, input.dueAt],
    )
    await recordDomainEvent(client, {
      eventType: 'lead.task_created',
      organizationId: lead.organization_id,
      crmInstanceId: lead.crm_instance_id ?? undefined,
      aggregateType: 'task',
      aggregateId: task.id,
      leadId,
      actor: { type: 'user', id: user.id },
      payload: { taskId: task.id, leadId, dueAt: task.due_at, priority: task.priority, assignedTo: task.assigned_to },
    })
    await client.query('COMMIT')
    return mapTask(task)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function completeLeadTask(pool: pg.Pool, user: AuthUser, taskId: string) {
  const existing = await pool.query<{ id: string; lead_id: string }>(
    `SELECT id, lead_id
     FROM public.lead_tasks
     WHERE id = $1
     LIMIT 1`,
    [taskId],
  )
  const task = existing.rows[0]
  if (!task) throw Object.assign(new Error('task_not_found'), { statusCode: 404 })
  await getLeadForAccess(pool, user, task.lead_id)

  const result = await pool.query<TaskRow>(
    `UPDATE public.lead_tasks
     SET status = 'completed', completed_at = $2, updated_at = NOW()
     WHERE id = $1
     RETURNING id, organization_id, lead_id, enrollment_id, title, description, status, priority, due_at, completed_at, assigned_to`,
    [taskId, new Date().toISOString()],
  )

  return mapTask(result.rows[0])
}

export async function listCrmSequences(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query<Omit<SequenceRow, 'crm_sequence_steps'>>(
    `SELECT id, organization_id, name, description, is_active
     FROM public.crm_sequences
     WHERE organization_id = $1 AND is_active = TRUE
     ORDER BY updated_at DESC`,
    [organizationId],
  )
  return hydrateSequences(pool, result.rows)
}

export async function listLeadEnrollments(pool: pg.Pool, user: AuthUser, leadId: string) {
  await getLeadForAccess(pool, user, leadId)
  const result = await pool.query<EnrollmentRow>(
    `SELECT id, organization_id, sequence_id, lead_id, status, current_step_index, next_execution_at, manual_note
     FROM public.crm_sequence_enrollments
     WHERE lead_id = $1
     ORDER BY created_at DESC`,
    [leadId],
  )
  return result.rows.map(mapEnrollment)
}

export async function enrollLeadInSequence(
  pool: pg.Pool,
  user: AuthUser,
  input: { organizationId: string; leadId: string; sequenceId: string },
) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  await getLeadForAccess(pool, user, input.leadId)
  const result = await pool.query<EnrollmentRow>(
    `INSERT INTO public.crm_sequence_enrollments (organization_id, lead_id, sequence_id, next_execution_at)
     VALUES ($1, $2, $3, $4)
     RETURNING id, organization_id, sequence_id, lead_id, status, current_step_index, next_execution_at, manual_note`,
    [input.organizationId, input.leadId, input.sequenceId, new Date().toISOString()],
  )
  return mapEnrollment(result.rows[0])
}

export async function updateEnrollment(
  pool: pg.Pool,
  user: AuthUser,
  enrollmentId: string,
  updates: { status?: string; nextExecutionAt?: string | null; manualNote?: string | null },
) {
  const existing = await pool.query<EnrollmentRow>(
    `SELECT id, organization_id, sequence_id, lead_id, status, current_step_index, next_execution_at, manual_note
     FROM public.crm_sequence_enrollments
     WHERE id = $1
     LIMIT 1`,
    [enrollmentId],
  )
  const enrollment = existing.rows[0]
  if (!enrollment) throw Object.assign(new Error('enrollment_not_found'), { statusCode: 404 })
  await getLeadForAccess(pool, user, enrollment.lead_id)

  const fields: Array<[string, unknown]> = [
    ['status', updates.status],
    ['next_execution_at', updates.nextExecutionAt],
    ['manual_note', updates.manualNote],
  ]
  const columns: string[] = []
  const values: unknown[] = []
  for (const [column, value] of fields) {
    if (value !== undefined) {
      columns.push(column)
      values.push(value)
    }
  }
  if (values.length === 0) return mapEnrollment(enrollment)

  const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
  const result = await pool.query<EnrollmentRow>(
    `UPDATE public.crm_sequence_enrollments
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING id, organization_id, sequence_id, lead_id, status, current_step_index, next_execution_at, manual_note`,
    [enrollmentId, ...values],
  )
  return mapEnrollment(result.rows[0])
}

export async function listLeadExecutions(pool: pg.Pool, user: AuthUser, leadId: string) {
  await getLeadForAccess(pool, user, leadId)
  const result = await pool.query<ExecutionRow>(
    `SELECT id, organization_id, lead_id, enrollment_id, step_id, action_type, payload, status,
       attempt_count, last_error, scheduled_at, requested_at, completed_at
     FROM public.automation_executions
     WHERE lead_id = $1
     ORDER BY requested_at DESC`,
    [leadId],
  )
  return result.rows.map(mapExecution)
}

async function getLeadForAccess(pool: pg.Pool, user: AuthUser, leadId: string) {
  const result = await pool.query<LeadRow>(
    `SELECT *
     FROM public.leads l
     WHERE l.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = l.organization_id
         )
       )
     LIMIT 1`,
    [user.id, leadId, isInternal(user)],
  )
  const lead = result.rows[0]
  if (!lead) throw Object.assign(new Error('lead_not_found'), { statusCode: 404 })
  return lead
}

async function requireOrganizationAccess(pool: pg.Pool, user: AuthUser, organizationId: string) {
  if (isInternal(user)) return

  const result = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM public.memberships
     WHERE user_id = $1 AND organization_id = $2
     LIMIT 1`,
    [user.id, organizationId],
  )
  if (!result.rows[0]) throw Object.assign(new Error('organization_forbidden'), { statusCode: 403 })
}

async function getStageForAccess(pool: pg.Pool, user: AuthUser, stageId: string) {
  const result = await pool.query<StageRow & { organization_id: string }>(
    `SELECT s.id, s.pipeline_id, s.key, s.name, s.color, s.order_index, s.is_won, s.is_lost, s.is_active, p.organization_id
     FROM public.crm_pipeline_stages s
     JOIN public.crm_pipelines p ON p.id = s.pipeline_id
     WHERE s.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = p.organization_id
         )
       )
     LIMIT 1`,
    [user.id, stageId, isInternal(user)],
  )
  const stage = result.rows[0]
  if (!stage) throw Object.assign(new Error('stage_not_found'), { statusCode: 404 })
  return stage
}

function isInternal(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}

function mapCrmInstance(row: CrmInstanceRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    contractId: row.contract_id,
    status: row.status,
    sectorKey: row.sector_key ?? undefined,
    blueprintId: row.blueprint_id ?? undefined,
    blueprintApplicationRunId: row.blueprint_application_run_id ?? undefined,
    sellerSeatLimit: row.seller_seat_limit,
    managerSeatLimit: row.manager_seat_limit,
    adminSeatLimit: row.admin_seat_limit,
    maxPipelineCount: row.max_pipeline_count,
    maxCustomFieldCount: row.max_custom_field_count,
    maxAutomationCount: row.max_automation_count,
    allowClientPipelineCustomization: row.allow_client_pipeline_customization,
    allowClientFieldCustomization: row.allow_client_field_customization,
    allowClientCategoryCustomization: row.allow_client_category_customization,
    defaultAssignmentMode: row.default_assignment_mode,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCrmInstanceMember(row: CrmInstanceMemberRow) {
  return {
    id: row.id,
    crmInstanceId: row.crm_instance_id,
    userId: row.user_id,
    role: row.role,
    status: row.status,
    displayName: row.display_name ?? undefined,
    email: row.email ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCrmTeam(row: CrmTeamRow) {
  return {
    id: row.id,
    crmInstanceId: row.crm_instance_id,
    name: row.name,
    description: row.description ?? undefined,
    assignmentMode: row.assignment_mode,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapCrmTeamMember(row: CrmTeamMemberRow) {
  return {
    id: row.id,
    teamId: row.team_id,
    memberId: row.member_id,
    role: row.role,
    createdAt: row.created_at,
  }
}

function toLegacyStage(stage: Pick<StageRow, 'key' | 'is_won' | 'is_lost'>) {
  if (stage.is_won) return 'WON'
  if (stage.is_lost) return 'LOST'
  const key = stage.key.toLowerCase()
  if (key === 'qualified') return 'QUALIFIED'
  if (key === 'proposal') return 'PROPOSAL'
  if (key === 'negotiation') return 'NEGOTIATION'
  return 'NEW'
}

function buildLeadUpdate(patch: CrmLeadPatch) {
  const fields: Array<[string, unknown]> = [
    ['crm_instance_id', patch.crmInstanceId],
    ['pipeline_id', patch.pipelineId],
    ['stage_id', patch.stageId],
    ['team_id', patch.teamId],
    ['owner_member_id', patch.ownerMemberId],
    ['pipeline_version_id', patch.pipelineVersionId],
    ['stage_version_id', patch.stageVersionId],
    ['assignment_state', patch.assignmentState],
    ['assignment_mode', patch.assignmentMode],
    ['name', patch.name],
    ['email', patch.email],
    ['phone', patch.phone],
    ['company', patch.company],
    ['source', patch.source],
    ['source_kind', patch.sourceKind],
    ['status', patch.status],
    ['score', patch.score],
    ['value', patch.value],
    ['notes', patch.notes],
    ['owner_id', patch.ownerId],
    ['assigned_to', patch.assignedTo],
    ['lost_reason', patch.lostReason],
    ['won_at', patch.wonAt],
    ['lost_at', patch.lostAt],
    ['last_activity_at', patch.lastActivityAt],
    ['next_follow_up_at', patch.nextFollowUpAt],
    ['attribution_context', patch.attributionContext],
    ['stage', patch.stage],
  ]
  const columns: string[] = []
  const values: unknown[] = []

  for (const [column, value] of fields) {
    if (value !== undefined) {
      columns.push(column)
      values.push(value)
    }
  }

  if (patch.ownerMemberId !== undefined && patch.assignmentState === undefined) {
    columns.push('assignment_state')
    values.push(patch.ownerMemberId ? 'reassigned' : 'in_queue')
  }
  if (patch.ownerMemberId !== undefined) {
    columns.push('last_assignment_at')
    values.push(new Date().toISOString())
  }

  return { columns, values }
}

function mapLead(row: LeadRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    crmInstanceId: row.crm_instance_id ?? undefined,
    pipelineId: row.pipeline_id,
    stageId: row.stage_id,
    teamId: row.team_id ?? undefined,
    ownerMemberId: row.owner_member_id ?? undefined,
    pipelineVersionId: row.pipeline_version_id ?? undefined,
    stageVersionId: row.stage_version_id ?? undefined,
    assignmentState: row.assignment_state ?? undefined,
    assignmentMode: row.assignment_mode ?? undefined,
    lastAssignmentAt: row.last_assignment_at ?? undefined,
    name: row.name,
    email: row.email,
    phone: row.phone ?? undefined,
    company: row.company ?? undefined,
    source: row.source,
    sourceKind: row.source_kind ?? undefined,
    status: row.status ?? 'open',
    score: row.score ?? 0,
    fitScore: row.fit_score ?? undefined,
    intentScore: row.intent_score ?? undefined,
    value: row.value !== null && row.value !== undefined ? Number(row.value) : undefined,
    notes: row.notes ?? undefined,
    ownerId: row.owner_id ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    lostReason: row.lost_reason ?? undefined,
    wonAt: row.won_at ?? undefined,
    lostAt: row.lost_at ?? undefined,
    lastActivityAt: row.last_activity_at ?? undefined,
    nextFollowUpAt: row.next_follow_up_at ?? undefined,
    attributionContext: row.attribution_context ?? undefined,
    aiSummary: row.ai_summary ?? undefined,
    intent: row.intent ?? undefined,
    sentiment: row.sentiment ?? undefined,
    urgencyDetectedAt: row.urgency_detected_at ?? undefined,
    lastConversationAt: row.last_conversation_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapInteraction(row: InteractionRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    type: row.type,
    title: row.title,
    description: row.description,
    date: row.date,
  }
}

function mapTask(row: TaskRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    enrollmentId: row.enrollment_id ?? undefined,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status,
    priority: row.priority ?? undefined,
    dueAt: row.due_at,
    completedAt: row.completed_at ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
  }
}

async function hydratePipelines(pool: pg.Pool, rows: Array<Omit<PipelineRow, 'crm_pipeline_stages'>>) {
  if (rows.length === 0) return []

  const pipelineIds = rows.map((row) => row.id)
  const stages = await pool.query<StageRow>(
    `SELECT id, pipeline_id, key, name, color, order_index, is_won, is_lost, is_active
     FROM public.crm_pipeline_stages
     WHERE pipeline_id = ANY($1::uuid[])
     ORDER BY order_index ASC`,
    [pipelineIds],
  )
  const stagesByPipeline = groupRows(stages.rows, 'pipeline_id')

  return rows.map((row) => mapPipeline({ ...row, crm_pipeline_stages: stagesByPipeline.get(row.id) ?? [] }))
}

function mapPipeline(row: PipelineRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    crmInstanceId: row.crm_instance_id ?? undefined,
    name: row.name,
    description: row.description ?? undefined,
    isDefault: row.is_default,
    isActive: row.is_active,
    stages: (row.crm_pipeline_stages ?? []).map(mapStage),
  }
}

function mapStage(row: StageRow) {
  return {
    id: row.id,
    pipelineId: row.pipeline_id,
    key: row.key,
    name: row.name,
    color: row.color,
    orderIndex: row.order_index,
    isWon: row.is_won,
    isLost: row.is_lost,
    isActive: row.is_active,
  }
}

async function hydrateSequences(pool: pg.Pool, rows: Array<Omit<SequenceRow, 'crm_sequence_steps'>>) {
  if (rows.length === 0) return []

  const sequenceIds = rows.map((row) => row.id)
  const steps = await pool.query<SequenceStepRow>(
    `SELECT id, sequence_id, action_type, delay_minutes, subject, body, order_index, is_active
     FROM public.crm_sequence_steps
     WHERE sequence_id = ANY($1::uuid[])
     ORDER BY order_index ASC`,
    [sequenceIds],
  )
  const stepsBySequence = groupRows(steps.rows, 'sequence_id')

  return rows.map((row) => mapSequence({ ...row, crm_sequence_steps: stepsBySequence.get(row.id) ?? [] }))
}

function mapSequence(row: SequenceRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.is_active,
    steps: (row.crm_sequence_steps ?? []).map((step) => ({
      id: step.id,
      sequenceId: step.sequence_id,
      actionType: step.action_type,
      delayMinutes: step.delay_minutes,
      subject: step.subject ?? undefined,
      body: step.body,
      orderIndex: step.order_index,
      isActive: step.is_active,
    })),
  }
}

function mapEnrollment(row: EnrollmentRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    sequenceId: row.sequence_id,
    leadId: row.lead_id,
    status: row.status,
    currentStepIndex: row.current_step_index,
    nextExecutionAt: row.next_execution_at ?? undefined,
    manualNote: row.manual_note ?? undefined,
  }
}

function mapExecution(row: ExecutionRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    enrollmentId: row.enrollment_id ?? undefined,
    stepId: row.step_id ?? undefined,
    actionType: row.action_type,
    payload: row.payload ?? {},
    status: row.status,
    attemptCount: row.attempt_count,
    lastError: row.last_error ?? undefined,
    scheduledAt: row.scheduled_at,
    requestedAt: row.requested_at,
    completedAt: row.completed_at ?? undefined,
  }
}

function groupRows<Row extends Record<Key, string>, Key extends keyof Row>(rows: Row[], key: Key) {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const groupKey = row[key]
    const group = groups.get(groupKey) ?? []
    group.push(row)
    groups.set(groupKey, group)
  }
  return groups
}
