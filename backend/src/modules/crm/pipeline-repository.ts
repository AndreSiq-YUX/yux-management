import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'

type Queryable = {
  query: <TRow = any>(sql: string, params?: unknown[]) => Promise<{ rows: TRow[]; rowCount?: number | null }>
}

export type PipelineInput = {
  organizationId: string
  crmInstanceId: string
  name: string
  description?: string
  isDefault?: boolean
}

export type PipelinePatch = {
  name?: string
  description?: string | null
  isDefault?: boolean
  isActive?: boolean
}

export type PipelineStageInput = {
  name: string
  key: string
  color: string
  isWon?: boolean
  isLost?: boolean
}

export type PipelineStagePatch = Partial<PipelineStageInput> & {
  isActive?: boolean
}

type PipelineRow = {
  id: string
  organization_id: string
  crm_instance_id: string | null
  name: string
  description: string | null
  is_default: boolean
  is_active: boolean
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

type InstanceAccessRow = {
  id: string
  organization_id: string
  allow_client_pipeline_customization: boolean
  max_pipeline_count: number
  member_role: string | null
  member_status: string | null
}

type PipelineAccessRow = PipelineRow & InstanceAccessRow

export async function listPipelines(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)

  const result = await pool.query<PipelineRow>(
    `SELECT id, organization_id, crm_instance_id, name, description, is_default, is_active
     FROM public.crm_pipelines
     WHERE organization_id = $1
       AND is_active = TRUE
     ORDER BY name ASC`,
    [organizationId],
  )

  return hydratePipelines(pool, result.rows)
}

export async function createPipeline(pool: pg.Pool, user: AuthUser, input: PipelineInput) {
  await requirePipelineMutationAccess(pool, user, input.organizationId, input.crmInstanceId)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const access = await getInstanceAccess(client, user, input.organizationId, input.crmInstanceId)
    const count = await client.query<{ pipeline_count: number }>(
      `SELECT COUNT(*)::int AS pipeline_count
       FROM public.crm_pipelines
       WHERE organization_id = $1
         AND crm_instance_id = $2
         AND is_active = TRUE`,
      [input.organizationId, input.crmInstanceId],
    )
    if (Number(count.rows[0]?.pipeline_count ?? 0) >= access.max_pipeline_count) {
      throw domainError(409, 'pipeline_limit_reached')
    }

    const activeCount = Number(count.rows[0]?.pipeline_count ?? 0)
    const isDefault = input.isDefault === true || activeCount === 0
    if (isDefault) await clearDefaultPipeline(client, input.crmInstanceId)

    let result: { rows: PipelineRow[] }
    try {
      result = await client.query<PipelineRow>(
        `INSERT INTO public.crm_pipelines (
           organization_id, crm_instance_id, name, description, is_default, is_active
         ) VALUES ($1, $2, $3, $4, $5, TRUE)
         RETURNING id, organization_id, crm_instance_id, name, description, is_default, is_active`,
        [input.organizationId, input.crmInstanceId, input.name.trim(), input.description?.trim() || null, isDefault],
      )
    } catch (error) {
      throw mapPipelineDatabaseError(error)
    }

    await client.query('COMMIT')
    return mapPipeline({ ...result.rows[0], crm_pipeline_stages: [] })
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function patchPipeline(pool: pg.Pool, user: AuthUser, pipelineId: string, patch: PipelinePatch) {
  const pipeline = await getPipelineForMutation(pool, user, pipelineId)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const current = await getPipelineForMutation(client, user, pipelineId)
    if (patch.isActive === false && current.is_active) {
      const activeCount = await client.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM public.crm_pipelines
         WHERE crm_instance_id = $1 AND is_active = TRUE`,
        [current.crm_instance_id],
      )
      if (Number(activeCount.rows[0]?.count ?? 0) <= 1) throw domainError(409, 'pipeline_last_active')
    }
    if (patch.isDefault === true) await clearDefaultPipeline(client, current.crm_instance_id)

    const fields: Array<[string, unknown]> = [
      ['name', patch.name === undefined ? undefined : patch.name.trim()],
      ['description', patch.description === undefined ? undefined : patch.description?.trim() || null],
      ['is_default', patch.isDefault],
      ['is_active', patch.isActive],
    ]
    const columns: string[] = []
    const values: unknown[] = []
    for (const [column, value] of fields) {
      if (value !== undefined) {
        columns.push(column)
        values.push(value)
      }
    }

    let updatedId = current.id
    if (values.length > 0) {
      const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
      try {
        const result = await client.query<PipelineRow>(
          `UPDATE public.crm_pipelines
           SET ${assignments.join(', ')}, updated_at = NOW()
           WHERE id = $1
           RETURNING id, organization_id, crm_instance_id, name, description, is_default, is_active`,
          [pipelineId, ...values],
        )
        const updated = result.rows[0]
        if (!updated) throw domainError(500, 'pipeline_update_failed')
        updatedId = updated.id
      } catch (error) {
        throw mapPipelineDatabaseError(error)
      }
    }
    await client.query('COMMIT')
    return getPipeline(pool, updatedId)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function createPipelineStage(pool: pg.Pool, user: AuthUser, pipelineId: string, input: PipelineStageInput) {
  const pipeline = await getPipelineForMutation(pool, user, pipelineId)
  await ensureOutcomeIsAvailable(pool, pipeline, input.isWon === true, input.isLost === true)

  const orderResult = await pool.query<{ max_order: number | null }>(
    `SELECT MAX(order_index)::int AS max_order
     FROM public.crm_pipeline_stages
     WHERE pipeline_id = $1`,
    [pipelineId],
  )
  try {
    const result = await pool.query<StageRow>(
      `INSERT INTO public.crm_pipeline_stages (
         pipeline_id, key, name, color, order_index, is_won, is_lost, is_active
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
       RETURNING id, pipeline_id, key, name, color, order_index, is_won, is_lost, is_active`,
      [
        pipelineId,
        input.key.trim(),
        input.name.trim(),
        input.color.trim(),
        Number(orderResult.rows[0]?.max_order ?? -1) + 1,
        input.isWon === true,
        input.isLost === true,
      ],
    )
    return mapStage(result.rows[0])
  } catch (error) {
    throw mapPipelineDatabaseError(error)
  }
}

export async function patchPipelineStage(pool: pg.Pool, user: AuthUser, stageId: string, patch: PipelineStagePatch) {
  const stage = await getStageForMutation(pool, user, stageId)
  await ensureOutcomeIsAvailable(pool, stage, patch.isWon === true, patch.isLost === true, stageId)

  if (patch.isActive === false && stage.is_active) {
    const activeStages = await pool.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM public.crm_pipeline_stages
       WHERE pipeline_id = $1 AND is_active = TRUE`,
      [stage.pipeline_id],
    )
    if (Number(activeStages.rows[0]?.count ?? 0) <= 1) throw domainError(409, 'pipeline_last_active_stage')

    const inUse = await pool.query<{ count: number }>(
      `SELECT (
         (SELECT COUNT(*) FROM public.leads WHERE stage_id = $1)
         + (SELECT COUNT(*) FROM public.lead_stage_history WHERE to_stage_id = $1 OR from_stage_id = $1)
       )::int AS count`,
      [stageId],
    )
    if (Number(inUse.rows[0]?.count ?? 0) > 0) throw domainError(409, 'pipeline_stage_in_use')
  }

  const fields: Array<[string, unknown]> = [
    ['key', patch.key === undefined ? undefined : patch.key.trim()],
    ['name', patch.name === undefined ? undefined : patch.name.trim()],
    ['color', patch.color === undefined ? undefined : patch.color.trim()],
    ['is_won', patch.isWon],
    ['is_lost', patch.isLost],
    ['is_active', patch.isActive],
  ]
  const columns: string[] = []
  const values: unknown[] = []
  for (const [column, value] of fields) {
    if (value !== undefined) {
      columns.push(column)
      values.push(value)
    }
  }
  if (values.length === 0) return mapStage(stage)

  const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
  try {
    const result = await pool.query<StageRow>(
      `UPDATE public.crm_pipeline_stages
       SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE id = $1
       RETURNING id, pipeline_id, key, name, color, order_index, is_won, is_lost, is_active`,
      [stageId, ...values],
    )
    return mapStage(result.rows[0])
  } catch (error) {
    throw mapPipelineDatabaseError(error)
  }
}

export async function reorderPipelineStages(pool: pg.Pool, user: AuthUser, pipelineId: string, stageIds: string[]) {
  await getPipelineForMutation(pool, user, pipelineId)
  const existing = await pool.query<{ id: string }>(
    `SELECT id
     FROM public.crm_pipeline_stages
     WHERE pipeline_id = $1 AND is_active = TRUE
     ORDER BY order_index ASC, id ASC`,
    [pipelineId],
  )
  if (existing.rows.length !== stageIds.length || existing.rows.some((row) => !stageIds.includes(row.id))) {
    throw domainError(400, 'pipeline_stage_order_invalid')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const [index, stageId] of stageIds.entries()) {
      await client.query(
        `UPDATE public.crm_pipeline_stages
         SET order_index = $2, updated_at = NOW()
         WHERE id = $1 AND pipeline_id = $3`,
        [stageId, index, pipelineId],
      )
    }
    await client.query('COMMIT')
    return getPipeline(pool, pipelineId)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function getPipeline(pool: Queryable, pipelineId: string) {
  const result = await pool.query<PipelineRow>(
    `SELECT id, organization_id, crm_instance_id, name, description, is_default, is_active
     FROM public.crm_pipelines
     WHERE id = $1
     LIMIT 1`,
    [pipelineId],
  )
  const row = result.rows[0]
  if (!row) throw domainError(404, 'pipeline_not_found')
  return (await hydratePipelines(pool, [row]))[0]
}

async function getPipelineForMutation(pool: Queryable, user: AuthUser, pipelineId: string) {
  const result = await pool.query<PipelineAccessRow>(
    `SELECT p.id, p.organization_id, p.crm_instance_id, p.name, p.description, p.is_default, p.is_active,
            ci.id AS instance_id,
            ci.allow_client_pipeline_customization,
            ci.max_pipeline_count,
            member.role AS member_role,
            member.status AS member_status
     FROM public.crm_pipelines p
     JOIN public.crm_instances ci
       ON ci.id = p.crm_instance_id
      AND ci.organization_id = p.organization_id
     LEFT JOIN public.crm_instance_members member
       ON member.crm_instance_id = ci.id
      AND member.user_id = $1
     WHERE p.id = $2
       AND p.is_active = TRUE
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships membership
           WHERE membership.user_id = $1
             AND membership.organization_id = p.organization_id
         )
       )
     LIMIT 1`,
    [user.id, pipelineId, isInternal(user)],
  )
  const pipeline = result.rows[0]
  if (!pipeline) throw domainError(404, 'pipeline_not_found')
  await assertPipelineCustomization(pipeline, user)
  return pipeline
}

async function getStageForMutation(pool: Queryable, user: AuthUser, stageId: string) {
  const result = await pool.query<StageRow & PipelineAccessRow>(
    `SELECT s.id, s.pipeline_id, s.key, s.name, s.color, s.order_index, s.is_won, s.is_lost, s.is_active,
            p.organization_id, p.crm_instance_id, p.name AS pipeline_name,
            p.description AS pipeline_description, p.is_default, p.is_active AS pipeline_is_active,
            ci.id AS instance_id,
            ci.allow_client_pipeline_customization,
            ci.max_pipeline_count,
            member.role AS member_role,
            member.status AS member_status
     FROM public.crm_pipeline_stages s
     JOIN public.crm_pipelines p ON p.id = s.pipeline_id
     JOIN public.crm_instances ci ON ci.id = p.crm_instance_id AND ci.organization_id = p.organization_id
     LEFT JOIN public.crm_instance_members member
       ON member.crm_instance_id = ci.id
      AND member.user_id = $1
     WHERE s.id = $2
       AND s.is_active = TRUE
       AND p.is_active = TRUE
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships membership
           WHERE membership.user_id = $1
             AND membership.organization_id = p.organization_id
         )
       )
     LIMIT 1`,
    [user.id, stageId, isInternal(user)],
  )
  const stage = result.rows[0]
  if (!stage) throw domainError(404, 'pipeline_stage_not_found')
  await assertPipelineCustomization(stage, user)
  return stage
}

async function requirePipelineMutationAccess(pool: Queryable, user: AuthUser, organizationId: string, crmInstanceId: string) {
  const access = await getInstanceAccess(pool, user, organizationId, crmInstanceId)
  await assertPipelineCustomization(access, user)
  return access
}

async function getInstanceAccess(pool: Queryable, user: AuthUser, organizationId: string, crmInstanceId: string) {
  const result = await pool.query<InstanceAccessRow>(
    `SELECT ci.id, ci.organization_id, ci.allow_client_pipeline_customization, ci.max_pipeline_count,
            member.role AS member_role, member.status AS member_status
     FROM public.crm_instances ci
     LEFT JOIN public.crm_instance_members member
       ON member.crm_instance_id = ci.id
      AND member.user_id = $3
     WHERE ci.id = $2
       AND ci.organization_id = $1
       AND (
         $4::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships membership
           WHERE membership.user_id = $3
             AND membership.organization_id = ci.organization_id
         )
       )
     LIMIT 1`,
    [organizationId, crmInstanceId, user.id, isInternal(user)],
  )
  const access = result.rows[0]
  if (!access) throw domainError(404, 'crm_instance_not_found')
  return access
}

async function requireOrganizationAccess(pool: Queryable, user: AuthUser, organizationId: string) {
  if (isInternal(user)) return
  const result = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM public.memberships
     WHERE user_id = $1 AND organization_id = $2
     LIMIT 1`,
    [user.id, organizationId],
  )
  if (!result.rows[0]) throw domainError(403, 'organization_forbidden')
}

async function assertPipelineCustomization(access: Pick<InstanceAccessRow, 'allow_client_pipeline_customization' | 'member_role' | 'member_status'>, user: AuthUser) {
  if (isInternal(user)) return
  if (
    access.allow_client_pipeline_customization !== true
    || access.member_status !== 'active'
    || !['client_admin', 'manager'].includes(access.member_role ?? '')
  ) {
    throw domainError(403, 'pipeline_customization_forbidden')
  }
}

async function clearDefaultPipeline(pool: Queryable, crmInstanceId: string | null) {
  if (!crmInstanceId) throw domainError(409, 'pipeline_crm_instance_required')
  await pool.query(
    `UPDATE public.crm_pipelines
     SET is_default = FALSE, updated_at = NOW()
     WHERE crm_instance_id = $1 AND is_default = TRUE`,
    [crmInstanceId],
  )
}

async function ensureOutcomeIsAvailable(
  pool: Queryable,
  pipeline: Pick<PipelineAccessRow, 'id'> | Pick<StageRow, 'pipeline_id'>,
  isWon: boolean,
  isLost: boolean,
  currentStageId?: string,
) {
  if (isWon && isLost) throw domainError(400, 'pipeline_stage_outcome_invalid')
  if (!isWon && !isLost) return
  const pipelineId = 'id' in pipeline ? pipeline.id : pipeline.pipeline_id
  const outcome = isWon ? 'is_won' : 'is_lost'
  const result = await pool.query<{ id: string }>(
    `SELECT id
     FROM public.crm_pipeline_stages
     WHERE pipeline_id = $1
       AND ${outcome} = TRUE
       AND is_active = TRUE
       AND ($2::uuid IS NULL OR id <> $2)
     LIMIT 1`,
    [pipelineId, currentStageId ?? null],
  )
  if (result.rows[0]) throw domainError(409, isWon ? 'pipeline_won_stage_conflict' : 'pipeline_lost_stage_conflict')
}

async function hydratePipelines(pool: Queryable, rows: PipelineRow[]) {
  if (rows.length === 0) return []
  const stages = await pool.query<StageRow>(
    `SELECT id, pipeline_id, key, name, color, order_index, is_won, is_lost, is_active
     FROM public.crm_pipeline_stages
     WHERE pipeline_id = ANY($1::uuid[])
       AND is_active = TRUE
     ORDER BY order_index ASC, id ASC`,
    [rows.map((row) => row.id)],
  )
  const stagesByPipeline = new Map<string, StageRow[]>()
  for (const stage of stages.rows) stagesByPipeline.set(stage.pipeline_id, [...(stagesByPipeline.get(stage.pipeline_id) ?? []), stage])
  return rows.map((row) => mapPipeline({ ...row, crm_pipeline_stages: stagesByPipeline.get(row.id) ?? [] }))
}

function mapPipeline(row: PipelineRow & { crm_pipeline_stages?: StageRow[] }) {
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

function mapPipelineDatabaseError(error: unknown): Error {
  const code = error && typeof error === 'object' && 'code' in error ? Reflect.get(error, 'code') : undefined
  const constraint = error && typeof error === 'object' && 'constraint' in error ? Reflect.get(error, 'constraint') : undefined
  if (code === '23505') {
    if (constraint === 'crm_pipelines_organization_id_name_key') return domainError(409, 'pipeline_name_conflict')
    if (constraint === 'crm_pipeline_stages_pipeline_id_key_key') return domainError(409, 'pipeline_stage_key_conflict')
    if (constraint === 'idx_crm_pipelines_one_default_per_instance') return domainError(409, 'pipeline_default_conflict')
  }
  if (code === '23514') return domainError(400, 'pipeline_stage_outcome_invalid')
  return error instanceof Error ? error : domainError(500, 'pipeline_operation_failed')
}

function domainError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}

function isInternal(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}
