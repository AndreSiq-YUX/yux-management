import type pg from 'pg'
import { randomUUID } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AuthUser } from '../../auth/routes.js'

export type AutomationFlowInput = {
  organizationId: string
  name: string
  description?: string | null
  sectorTemplateKey?: string | null
  status?: string
  isEnabled?: boolean
  automationKind?: string
  builderMode?: string
  dailyRunLimit?: number
  requiresHumanApproval?: boolean
  riskLevel?: string
  graph?: Record<string, unknown> | null
}

export type SimulationInput = {
  organizationId: string
  flowId: string
  eventType: string
  samplePayload: Record<string, unknown>
  matched: boolean
  conditionResults: unknown[]
  plannedActions: unknown[]
  blockedReasons: string[]
}

export type AutomationEvent = {
  type: string
  organizationId?: string
  leadId?: string
  conversationId?: string
  ticketId?: string
  payload?: Record<string, unknown>
  [key: string]: unknown
}

export type SequenceInput = {
  organizationId: string
  name: string
  description?: string | null
  channel?: string
  sectorTemplateKey?: string | null
  conversionGoal?: string | null
  isActive?: boolean
}

export type SequenceStepInput = {
  stepKind: string
  channel?: string | null
  delayMinutes?: number
  subject?: string | null
  body?: string | null
  templateId?: string | null
  requiresHumanApproval?: boolean
  isActive?: boolean
}

export type MaterialUploadInput = {
  organizationId: string
  name: string
  fileType: string
  byteSize: number
  contentBase64: string
}

type FlowRow = {
  id: string
  organization_id: string
  name: string
  description: string | null
  status: string
  is_enabled: boolean
  automation_kind: string | null
  builder_mode: string | null
  published_version: number | null
  active_version_id: string | null
  daily_run_limit: number | null
  requires_human_approval: boolean | null
  risk_level: string | null
  sector_template_key: string | null
  last_error: string | null
  graph: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type TriggerRow = { id: string; flow_id: string; trigger_type: string; config: Record<string, unknown> | null }
type ConditionRow = { id: string; flow_id: string; field: string; operator: string; value: unknown; order_index?: number }
type ActionRow = { id: string; flow_id: string; action_type: string; order_index: number; payload: Record<string, unknown> | null }
type RunRow = {
  id: string
  flow_id: string | null
  status: string
  event_type: string | null
  lead_id: string | null
  last_error: string | null
  started_at: string | null
  completed_at: string | null
}

type SequenceRow = {
  id: string
  organization_id: string
  name: string
  description: string | null
  is_active: boolean
  channel: string | null
  status: string | null
  sector_template_key: string | null
  conversion_goal: string | null
  active_enrollment_count: number | null
  converted_enrollment_count: number | null
}

type SequenceStepRow = {
  id: string
  sequence_id: string
  order_index: number
  step_kind: string | null
  channel: string | null
  subject: string | null
  body: string | null
  delay_minutes: number | null
  template_id: string | null
  requires_human_approval: boolean | null
  is_active: boolean
}

type MaterialRow = {
  id: string
  organization_id: string
  name: string
  file_url: string
  file_type: string
  byte_size: number
  created_at: string
  updated_at: string
}

export async function listAutomationFlows(pool: pg.Pool, user: AuthUser, filters: { organizationId?: string }) {
  const result = await pool.query<FlowRow>(
    `SELECT *
     FROM public.automation_flows f
     WHERE ($2::uuid IS NULL OR f.organization_id = $2)
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = f.organization_id
         )
       )
     ORDER BY f.updated_at DESC`,
    [user.id, filters.organizationId ?? null, isInternal(user)],
  )

  return hydrateFlows(pool, result.rows)
}

export async function getAutomationFlow(pool: pg.Pool, user: AuthUser, flowId: string) {
  const result = await pool.query<FlowRow>(
    `SELECT *
     FROM public.automation_flows f
     WHERE f.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = f.organization_id
         )
       )
     LIMIT 1`,
    [user.id, flowId, isInternal(user)],
  )
  const flow = result.rows[0]
  if (!flow) throw Object.assign(new Error('automation_flow_not_found'), { statusCode: 404 })

  return (await hydrateFlows(pool, [flow]))[0]
}

export async function listAutomationExecutionRuns(pool: pg.Pool, user: AuthUser, flowId: string) {
  await getAutomationFlow(pool, user, flowId)
  const result = await pool.query<RunRow>(
    `SELECT id, flow_id, status, event_type, lead_id, last_error, started_at, completed_at
     FROM public.automation_execution_runs
     WHERE flow_id = $1
     ORDER BY created_at DESC
     LIMIT 50`,
    [flowId],
  )

  return result.rows.map(run => ({
    id: run.id,
    status: run.status,
    eventType: run.event_type ?? undefined,
    leadId: run.lead_id ?? undefined,
    lastError: run.last_error ?? undefined,
    startedAt: run.started_at ?? undefined,
    completedAt: run.completed_at ?? undefined,
  }))
}

export async function createAutomationFlow(pool: pg.Pool, user: AuthUser, input: AutomationFlowInput) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  const result = await pool.query<FlowRow>(
    `INSERT INTO public.automation_flows (
       organization_id, name, description, sector_template_key, status, is_enabled,
       automation_kind, builder_mode, daily_run_limit, requires_human_approval,
       risk_level, graph
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [
      input.organizationId,
      input.name.trim(),
      input.description || null,
      input.sectorTemplateKey || null,
      input.status ?? 'draft',
      input.isEnabled ?? true,
      input.automationKind ?? 'flow',
      input.builderMode ?? 'guided',
      input.dailyRunLimit ?? 500,
      input.requiresHumanApproval ?? false,
      input.riskLevel ?? 'low',
      input.graph ?? null,
    ],
  )

  return (await hydrateFlows(pool, result.rows))[0]
}

export async function updateAutomationFlow(
  pool: pg.Pool,
  user: AuthUser,
  flowId: string,
  input: Partial<AutomationFlowInput> & { activeVersionId?: string; publishedVersion?: number },
) {
  await getAutomationFlow(pool, user, flowId)
  const update = buildFlowUpdate(input)
  if (update.values.length === 0) return getAutomationFlow(pool, user, flowId)

  const assignments = update.columns.map((column, index) => `${column} = $${index + 2}`)
  await pool.query(
    `UPDATE public.automation_flows
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1`,
    [flowId, ...update.values],
  )

  return getAutomationFlow(pool, user, flowId)
}

export async function deleteAutomationFlow(pool: pg.Pool, user: AuthUser, flowId: string) {
  await getAutomationFlow(pool, user, flowId)
  await pool.query('DELETE FROM public.automation_flows WHERE id = $1', [flowId])
}

export async function createAutomationTrigger(
  pool: pg.Pool,
  user: AuthUser,
  flowId: string,
  input: { triggerType: string; config?: Record<string, unknown> },
) {
  await getAutomationFlow(pool, user, flowId)
  const result = await pool.query<TriggerRow>(
    `INSERT INTO public.automation_triggers (flow_id, trigger_type, config)
     VALUES ($1, $2, $3)
     RETURNING id, flow_id, trigger_type, config`,
    [flowId, input.triggerType, input.config ?? {}],
  )
  return mapTrigger(result.rows[0])
}

export async function updateAutomationTrigger(
  pool: pg.Pool,
  user: AuthUser,
  triggerId: string,
  input: { triggerType: string; config?: Record<string, unknown> },
) {
  await requireChildAccess(pool, user, 'automation_triggers', triggerId)
  const result = await pool.query<TriggerRow>(
    `UPDATE public.automation_triggers
     SET trigger_type = $2, config = $3, updated_at = NOW()
     WHERE id = $1
     RETURNING id, flow_id, trigger_type, config`,
    [triggerId, input.triggerType, input.config ?? {}],
  )
  return mapTrigger(result.rows[0])
}

export async function deleteAutomationChild(pool: pg.Pool, user: AuthUser, table: ChildTable, childId: string) {
  await requireChildAccess(pool, user, table, childId)
  await pool.query(`DELETE FROM public.${table} WHERE id = $1`, [childId])
}

export async function createAutomationCondition(
  pool: pg.Pool,
  user: AuthUser,
  flowId: string,
  input: { field: string; operator: string; value?: unknown },
) {
  await getAutomationFlow(pool, user, flowId)
  const result = await pool.query<ConditionRow>(
    `INSERT INTO public.automation_conditions (flow_id, field, operator, value)
     VALUES ($1, $2, $3, $4)
     RETURNING id, flow_id, field, operator, value, order_index`,
    [flowId, input.field, input.operator, input.value ?? null],
  )
  return mapCondition(result.rows[0])
}

export async function updateAutomationCondition(
  pool: pg.Pool,
  user: AuthUser,
  conditionId: string,
  input: { field: string; operator: string; value?: unknown },
) {
  await requireChildAccess(pool, user, 'automation_conditions', conditionId)
  const result = await pool.query<ConditionRow>(
    `UPDATE public.automation_conditions
     SET field = $2, operator = $3, value = $4, updated_at = NOW()
     WHERE id = $1
     RETURNING id, flow_id, field, operator, value, order_index`,
    [conditionId, input.field, input.operator, input.value ?? null],
  )
  return mapCondition(result.rows[0])
}

export async function createAutomationAction(
  pool: pg.Pool,
  user: AuthUser,
  flowId: string,
  input: { actionType: string; orderIndex?: number; payload?: Record<string, unknown> },
) {
  await getAutomationFlow(pool, user, flowId)
  const result = await pool.query<ActionRow>(
    `INSERT INTO public.automation_actions (flow_id, action_type, order_index, payload)
     VALUES ($1, $2, $3, $4)
     RETURNING id, flow_id, action_type, order_index, payload`,
    [flowId, input.actionType, input.orderIndex ?? 1, input.payload ?? {}],
  )
  return mapAction(result.rows[0])
}

export async function updateAutomationAction(
  pool: pg.Pool,
  user: AuthUser,
  actionId: string,
  input: { actionType?: string; orderIndex?: number; payload?: Record<string, unknown> },
) {
  await requireChildAccess(pool, user, 'automation_actions', actionId)
  const columns: string[] = []
  const values: unknown[] = []
  if (input.actionType !== undefined) {
    columns.push('action_type')
    values.push(input.actionType)
  }
  if (input.orderIndex !== undefined) {
    columns.push('order_index')
    values.push(input.orderIndex)
  }
  if (input.payload !== undefined) {
    columns.push('payload')
    values.push(input.payload)
  }
  if (values.length === 0) {
    const existing = await pool.query<ActionRow>(
      'SELECT id, flow_id, action_type, order_index, payload FROM public.automation_actions WHERE id = $1',
      [actionId],
    )
    return mapAction(existing.rows[0])
  }

  const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
  const result = await pool.query<ActionRow>(
    `UPDATE public.automation_actions
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING id, flow_id, action_type, order_index, payload`,
    [actionId, ...values],
  )
  return mapAction(result.rows[0])
}

export async function saveAutomationSimulation(pool: pg.Pool, user: AuthUser, input: SimulationInput) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  const result = await pool.query(
    `INSERT INTO public.automation_simulation_runs (
       organization_id, flow_id, event_type, sample_payload, matched,
       condition_results, planned_actions, blocked_reasons, created_by
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      input.organizationId,
      input.flowId,
      input.eventType,
      input.samplePayload,
      input.matched,
      input.conditionResults,
      input.plannedActions,
      input.blockedReasons,
      user.id,
    ],
  )
  return result.rows[0]
}

export async function listFlowVersions(pool: pg.Pool, user: AuthUser, flowId: string) {
  await getAutomationFlow(pool, user, flowId)
  const result = await pool.query(
    `SELECT *
     FROM public.automation_flow_versions
     WHERE flow_id = $1
     ORDER BY version_number DESC`,
    [flowId],
  )
  return result.rows
}

export async function createFlowVersion(
  pool: pg.Pool,
  user: AuthUser,
  input: { flowId: string; versionNumber: number; snapshot: Record<string, unknown>; status?: string },
) {
  await getAutomationFlow(pool, user, input.flowId)
  const publishedAt = input.status === 'published' ? new Date().toISOString() : null
  const result = await pool.query(
    `INSERT INTO public.automation_flow_versions (flow_id, version_number, snapshot, status, published_by, published_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.flowId, input.versionNumber, input.snapshot, input.status ?? 'draft', user.id, publishedAt],
  )
  return result.rows[0]
}

export async function listSequences(pool: pg.Pool, user: AuthUser, organizationId: string) {
  const result = await pool.query<SequenceRow>(
    `SELECT id, organization_id, name, description, is_active, channel, status, sector_template_key,
       conversion_goal, active_enrollment_count, converted_enrollment_count
     FROM public.crm_sequences s
     WHERE s.organization_id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = s.organization_id
         )
       )
     ORDER BY s.updated_at DESC`,
    [user.id, organizationId, isInternal(user)],
  )

  return hydrateSequences(pool, result.rows)
}

export async function getSequence(pool: pg.Pool, user: AuthUser, sequenceId: string) {
  const result = await pool.query<SequenceRow>(
    `SELECT id, organization_id, name, description, is_active, channel, status, sector_template_key,
       conversion_goal, active_enrollment_count, converted_enrollment_count
     FROM public.crm_sequences s
     WHERE s.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = s.organization_id
         )
       )
     LIMIT 1`,
    [user.id, sequenceId, isInternal(user)],
  )
  const sequence = result.rows[0]
  if (!sequence) throw Object.assign(new Error('sequence_not_found'), { statusCode: 404 })
  return (await hydrateSequences(pool, [sequence]))[0]
}

export async function createSequence(pool: pg.Pool, user: AuthUser, input: SequenceInput) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  const result = await pool.query<SequenceRow>(
    `INSERT INTO public.crm_sequences (
       organization_id, name, description, channel, sector_template_key, conversion_goal, is_active, status
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, organization_id, name, description, is_active, channel, status, sector_template_key,
       conversion_goal, active_enrollment_count, converted_enrollment_count`,
    [
      input.organizationId,
      input.name.trim(),
      input.description || null,
      input.channel ?? 'whatsapp',
      input.sectorTemplateKey || null,
      input.conversionGoal || null,
      input.isActive ?? true,
      input.isActive === false ? 'paused' : 'active',
    ],
  )
  return (await hydrateSequences(pool, result.rows))[0]
}

export async function updateSequence(pool: pg.Pool, user: AuthUser, sequenceId: string, input: Partial<SequenceInput> & { status?: string }) {
  await getSequence(pool, user, sequenceId)
  const fields: Array<[string, unknown]> = [
    ['name', input.name?.trim()],
    ['description', input.description ?? undefined],
    ['channel', input.channel],
    ['sector_template_key', input.sectorTemplateKey ?? undefined],
    ['conversion_goal', input.conversionGoal ?? undefined],
    ['is_active', input.isActive],
    ['status', input.status],
  ]
  const columns: string[] = []
  const values: unknown[] = []
  for (const [column, value] of fields) {
    if (value !== undefined) {
      columns.push(column)
      values.push(value)
    }
  }
  if (values.length === 0) return getSequence(pool, user, sequenceId)

  const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
  await pool.query(
    `UPDATE public.crm_sequences
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1`,
    [sequenceId, ...values],
  )
  return getSequence(pool, user, sequenceId)
}

export async function deleteSequence(pool: pg.Pool, user: AuthUser, sequenceId: string) {
  await getSequence(pool, user, sequenceId)
  await pool.query('DELETE FROM public.crm_sequences WHERE id = $1', [sequenceId])
}

export async function createSequenceStep(pool: pg.Pool, user: AuthUser, sequenceId: string, input: SequenceStepInput) {
  await getSequence(pool, user, sequenceId)
  const nextOrder = await pool.query<{ next_order: number }>(
    'SELECT COALESCE(MAX(order_index), -1) + 1 AS next_order FROM public.crm_sequence_steps WHERE sequence_id = $1',
    [sequenceId],
  )
  const result = await pool.query<SequenceStepRow>(
    `INSERT INTO public.crm_sequence_steps (
       sequence_id, step_kind, action_type, channel, delay_minutes, subject, body,
       template_id, requires_human_approval, is_active, order_index
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id, sequence_id, order_index, step_kind, channel, subject, body,
       delay_minutes, template_id, requires_human_approval, is_active`,
    [
      sequenceId,
      input.stepKind,
      stepKindToActionType(input.stepKind, input.channel),
      input.channel ?? null,
      input.delayMinutes ?? 0,
      input.subject || null,
      input.body || '',
      input.templateId || null,
      input.requiresHumanApproval ?? false,
      input.isActive ?? true,
      nextOrder.rows[0]?.next_order ?? 0,
    ],
  )
  return mapSequenceStep(result.rows[0])
}

export async function updateSequenceStep(pool: pg.Pool, user: AuthUser, stepId: string, input: Partial<SequenceStepInput>) {
  await requireSequenceStepAccess(pool, user, stepId)
  const fields: Array<[string, unknown]> = [
    ['step_kind', input.stepKind],
    ['action_type', input.stepKind ? stepKindToActionType(input.stepKind, input.channel) : undefined],
    ['channel', input.channel],
    ['delay_minutes', input.delayMinutes],
    ['subject', input.subject ?? undefined],
    ['body', input.body ?? undefined],
    ['template_id', input.templateId ?? undefined],
    ['requires_human_approval', input.requiresHumanApproval],
    ['is_active', input.isActive],
  ]
  const columns: string[] = []
  const values: unknown[] = []
  for (const [column, value] of fields) {
    if (value !== undefined) {
      columns.push(column)
      values.push(value)
    }
  }
  if (values.length === 0) {
    const existing = await pool.query<SequenceStepRow>(
      `SELECT id, sequence_id, order_index, step_kind, channel, subject, body,
       delay_minutes, template_id, requires_human_approval, is_active
       FROM public.crm_sequence_steps WHERE id = $1`,
      [stepId],
    )
    return mapSequenceStep(existing.rows[0])
  }

  const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
  const result = await pool.query<SequenceStepRow>(
    `UPDATE public.crm_sequence_steps
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING id, sequence_id, order_index, step_kind, channel, subject, body,
       delay_minutes, template_id, requires_human_approval, is_active`,
    [stepId, ...values],
  )
  return mapSequenceStep(result.rows[0])
}

export async function deleteSequenceStep(pool: pg.Pool, user: AuthUser, stepId: string) {
  await requireSequenceStepAccess(pool, user, stepId)
  await pool.query('DELETE FROM public.crm_sequence_steps WHERE id = $1', [stepId])
}

export async function listMaterials(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query<MaterialRow>(
    `SELECT id, organization_id, name, file_url, file_type, byte_size, created_at, updated_at
     FROM public.organization_materials
     WHERE organization_id = $1
     ORDER BY name ASC`,
    [organizationId],
  )
  return result.rows.map(mapMaterial)
}

export async function getUploadLimitMb(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)

  let globalLimit = 10
  const global = await pool.query<{ value: unknown }>(
    "SELECT value FROM public.system_config WHERE key = 'global_max_upload_size_mb' LIMIT 1",
  )
  const globalValue = global.rows[0]?.value
  if (globalValue && typeof globalValue === 'object' && 'limit' in globalValue) {
    const limit = Number((globalValue as { limit?: unknown }).limit)
    if (Number.isFinite(limit) && limit > 0) globalLimit = limit
  }

  const orgLimit = await pool.query<{ max_upload_size_mb: number | null }>(
    'SELECT max_upload_size_mb FROM public.omnichannel_settings WHERE organization_id = $1 LIMIT 1',
    [organizationId],
  )
  return Number(orgLimit.rows[0]?.max_upload_size_mb || globalLimit)
}

export async function createMaterial(pool: pg.Pool, user: AuthUser, input: MaterialUploadInput) {
  await requireOrganizationAccess(pool, user, input.organizationId)

  const limitMb = await getUploadLimitMb(pool, user, input.organizationId)
  if (input.byteSize > limitMb * 1024 * 1024) {
    throw Object.assign(new Error('material_too_large'), { statusCode: 413 })
  }

  const id = randomUUID()
  const safeName = sanitizeFileName(input.name)
  const relativePath = path.join(input.organizationId, `${id}-${safeName}`)
  const absolutePath = materialPath(relativePath)
  const content = Buffer.from(input.contentBase64, 'base64')
  if (content.byteLength !== input.byteSize) {
    throw Object.assign(new Error('invalid_material_size'), { statusCode: 400 })
  }

  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content)

  const result = await pool.query<MaterialRow>(
    `INSERT INTO public.organization_materials (id, organization_id, name, file_url, file_type, byte_size)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, organization_id, name, file_url, file_type, byte_size, created_at, updated_at`,
    [id, input.organizationId, input.name, `/api/automations/materials/${id}/file`, input.fileType, input.byteSize],
  )
  return mapMaterial(result.rows[0])
}

export async function deleteMaterial(pool: pg.Pool, user: AuthUser, materialId: string) {
  const material = await getMaterialRow(pool, user, materialId)
  await pool.query('DELETE FROM public.organization_materials WHERE id = $1', [materialId])

  const filePath = await findMaterialFile(material)
  if (filePath) {
    await unlink(filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}

export async function getMaterialFile(pool: pg.Pool, user: AuthUser, materialId: string) {
  const material = await getMaterialRow(pool, user, materialId)
  const filePath = await findMaterialFile(material)
  if (!filePath) throw Object.assign(new Error('material_file_not_found'), { statusCode: 404 })
  return {
    filePath,
    fileName: material.name,
    fileType: material.file_type,
  }
}

async function hydrateFlows(pool: pg.Pool, rows: FlowRow[]) {
  if (rows.length === 0) return []

  const flowIds = rows.map((row) => row.id)
  const [triggers, conditions, actions, runs] = await Promise.all([
    pool.query<TriggerRow>(
      'SELECT id, flow_id, trigger_type, config FROM public.automation_triggers WHERE flow_id = ANY($1::uuid[]) ORDER BY created_at ASC',
      [flowIds],
    ),
    pool.query<ConditionRow>(
      'SELECT id, flow_id, field, operator, value, order_index FROM public.automation_conditions WHERE flow_id = ANY($1::uuid[]) ORDER BY order_index ASC, created_at ASC',
      [flowIds],
    ),
    pool.query<ActionRow>(
      'SELECT id, flow_id, action_type, order_index, payload FROM public.automation_actions WHERE flow_id = ANY($1::uuid[]) ORDER BY order_index ASC, created_at ASC',
      [flowIds],
    ),
    pool.query<RunRow>(
      'SELECT id, flow_id, status, event_type, lead_id, last_error, started_at, completed_at FROM public.automation_execution_runs WHERE flow_id = ANY($1::uuid[]) ORDER BY created_at DESC',
      [flowIds],
    ),
  ])

  const triggersByFlow = groupRows(triggers.rows, 'flow_id')
  const conditionsByFlow = groupRows(conditions.rows, 'flow_id')
  const actionsByFlow = groupRows(actions.rows, 'flow_id')
  const runsByFlow = groupRows(runs.rows.filter((run): run is RunRow & { flow_id: string } => Boolean(run.flow_id)), 'flow_id')

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description ?? undefined,
    status: row.status,
    isEnabled: row.is_enabled,
    automationKind: row.automation_kind ?? 'flow',
    builderMode: row.builder_mode ?? 'guided',
    publishedVersion: Number(row.published_version ?? 0),
    activeVersionId: row.active_version_id ?? undefined,
    dailyRunLimit: Number(row.daily_run_limit ?? 500),
    requiresHumanApproval: Boolean(row.requires_human_approval),
    riskLevel: row.risk_level ?? 'low',
    sectorTemplateKey: row.sector_template_key ?? undefined,
    lastError: row.last_error ?? undefined,
    triggers: (triggersByFlow.get(row.id) ?? []).map(mapTrigger),
    conditions: (conditionsByFlow.get(row.id) ?? []).map(mapCondition),
    actions: (actionsByFlow.get(row.id) ?? []).map(mapAction),
    executionRuns: (runsByFlow.get(row.id) ?? []).map((run) => ({
      id: run.id,
      status: run.status,
      eventType: run.event_type ?? undefined,
      leadId: run.lead_id ?? undefined,
      lastError: run.last_error ?? undefined,
      startedAt: run.started_at ?? undefined,
      completedAt: run.completed_at ?? undefined,
    })),
    graph: row.graph ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

async function hydrateSequences(pool: pg.Pool, rows: SequenceRow[]) {
  if (rows.length === 0) return []

  const sequenceIds = rows.map((row) => row.id)
  const steps = await pool.query<SequenceStepRow>(
    `SELECT id, sequence_id, order_index, step_kind, channel, subject, body,
       delay_minutes, template_id, requires_human_approval, is_active
     FROM public.crm_sequence_steps
     WHERE sequence_id = ANY($1::uuid[])
     ORDER BY order_index ASC, created_at ASC`,
    [sequenceIds],
  )
  const stepsBySequence = groupRows(steps.rows, 'sequence_id')

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description ?? undefined,
    channel: row.channel ?? 'whatsapp',
    status: row.status ?? (row.is_active ? 'active' : 'paused'),
    sectorTemplateKey: row.sector_template_key ?? undefined,
    conversionGoal: row.conversion_goal ?? undefined,
    activeEnrollmentCount: Number(row.active_enrollment_count ?? 0),
    convertedEnrollmentCount: Number(row.converted_enrollment_count ?? 0),
    steps: (stepsBySequence.get(row.id) ?? []).map(mapSequenceStep),
  }))
}

type ChildTable = 'automation_triggers' | 'automation_conditions' | 'automation_actions'

async function requireChildAccess(pool: pg.Pool, user: AuthUser, table: ChildTable, childId: string) {
  const result = await pool.query<{ flow_id: string }>(
    `SELECT flow_id FROM public.${table} WHERE id = $1 LIMIT 1`,
    [childId],
  )
  const child = result.rows[0]
  if (!child) throw Object.assign(new Error('automation_child_not_found'), { statusCode: 404 })
  await getAutomationFlow(pool, user, child.flow_id)
}

async function requireSequenceStepAccess(pool: pg.Pool, user: AuthUser, stepId: string) {
  const result = await pool.query<{ sequence_id: string }>(
    'SELECT sequence_id FROM public.crm_sequence_steps WHERE id = $1 LIMIT 1',
    [stepId],
  )
  const step = result.rows[0]
  if (!step) throw Object.assign(new Error('sequence_step_not_found'), { statusCode: 404 })
  await getSequence(pool, user, step.sequence_id)
}

async function requireOrganizationAccess(pool: pg.Pool, user: AuthUser, organizationId: string) {
  if (isInternal(user)) return

  const result = await pool.query<{ ok: number }>(
    'SELECT 1 AS ok FROM public.memberships WHERE user_id = $1 AND organization_id = $2 LIMIT 1',
    [user.id, organizationId],
  )
  if (!result.rows[0]) throw Object.assign(new Error('organization_forbidden'), { statusCode: 403 })
}

function isInternal(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}

function buildFlowUpdate(input: Partial<AutomationFlowInput> & { activeVersionId?: string; publishedVersion?: number }) {
  const fields: Array<[string, unknown]> = [
    ['name', input.name?.trim()],
    ['description', input.description ?? undefined],
    ['sector_template_key', input.sectorTemplateKey ?? undefined],
    ['status', input.status],
    ['is_enabled', input.isEnabled],
    ['automation_kind', input.automationKind],
    ['builder_mode', input.builderMode],
    ['daily_run_limit', input.dailyRunLimit],
    ['requires_human_approval', input.requiresHumanApproval],
    ['risk_level', input.riskLevel],
    ['graph', input.graph],
    ['active_version_id', input.activeVersionId],
    ['published_version', input.publishedVersion],
  ]
  const columns: string[] = []
  const values: unknown[] = []

  for (const [column, value] of fields) {
    if (value !== undefined) {
      columns.push(column)
      values.push(value)
    }
  }

  return { columns, values }
}

function mapTrigger(row: TriggerRow) {
  return {
    id: row.id,
    triggerType: row.trigger_type,
    config: row.config ?? {},
  }
}

function mapCondition(row: ConditionRow) {
  return {
    id: row.id,
    field: row.field,
    operator: row.operator,
    value: row.value ?? undefined,
  }
}

function mapAction(row: ActionRow) {
  return {
    id: row.id,
    actionType: row.action_type,
    orderIndex: row.order_index,
    payload: row.payload ?? {},
  }
}

function mapSequenceStep(row: SequenceStepRow) {
  return {
    id: row.id,
    sequenceId: row.sequence_id,
    orderIndex: Number(row.order_index ?? 0),
    stepKind: row.step_kind ?? 'message',
    channel: row.channel ?? undefined,
    subject: row.subject ?? undefined,
    body: row.body ?? undefined,
    delayMinutes: Number(row.delay_minutes ?? 0),
    templateId: row.template_id ?? undefined,
    requiresHumanApproval: Boolean(row.requires_human_approval),
    isActive: Boolean(row.is_active),
  }
}

function mapMaterial(row: MaterialRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    fileUrl: row.file_url,
    fileType: row.file_type,
    byteSize: row.byte_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

async function getMaterialRow(pool: pg.Pool, user: AuthUser, materialId: string) {
  const result = await pool.query<MaterialRow>(
    `SELECT id, organization_id, name, file_url, file_type, byte_size, created_at, updated_at
     FROM public.organization_materials m
     WHERE m.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships ms
           WHERE ms.user_id = $1 AND ms.organization_id = m.organization_id
         )
       )
     LIMIT 1`,
    [user.id, materialId, isInternal(user)],
  )
  const material = result.rows[0]
  if (!material) throw Object.assign(new Error('material_not_found'), { statusCode: 404 })
  return material
}

async function findMaterialFile(material: MaterialRow) {
  const directory = materialPath(material.organization_id)
  const filePrefix = `${material.id}-`
  const { readdir } = await import('node:fs/promises')
  const files = await readdir(directory).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  const file = files.find((candidate) => candidate.startsWith(filePrefix))
  return file ? path.join(directory, file) : null
}

function materialPath(...parts: string[]) {
  return path.resolve(process.env.MATERIALS_STORAGE_DIR ?? path.join(process.cwd(), 'storage', 'materials'), ...parts)
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'material'
}

function stepKindToActionType(stepKind: string, channel?: string | null) {
  if (stepKind === 'task') return 'internal_task'
  if (channel === 'email') return 'email'
  return 'whatsapp'
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
