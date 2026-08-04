import type pg from 'pg'
import type { AuthUser } from '../../auth/routes.js'
import { recordDomainEvent } from '../events/repository.js'

type Queryable = {
  query: <TRow = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: TRow[]; rowCount?: number | null }>
}

export type CrmTaskFilters = {
  organizationId: string
  crmInstanceId: string
  status?: 'pending' | 'completed' | 'cancelled'
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  assignedTo?: string
  leadId?: string
  due?: 'overdue' | 'today' | 'upcoming'
  search?: string
  cursor?: string
  limit?: number
}

export type CrmTaskPatch = {
  title?: string
  description?: string | null
  dueAt?: string
  assignedTo?: string | null
  priority?: 'low' | 'medium' | 'high' | 'urgent'
  status?: 'pending' | 'completed' | 'cancelled'
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
  cancelled_at: string | null
  assigned_to: string | null
  lead_name: string
  lead_company: string | null
  pipeline_name: string | null
  stage_name: string | null
  assigned_to_name: string | null
}

type TaskAccessRow = TaskRow & {
  crm_instance_id: string | null
  member_role: string | null
  member_status: string | null
}

export async function listCrmTasks(pool: pg.Pool, user: AuthUser, filters: CrmTaskFilters) {
  await assertInstanceAccess(pool, user, filters.organizationId, filters.crmInstanceId)

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 100)
  const values: unknown[] = [filters.organizationId, filters.crmInstanceId]
  const clauses = [
    'task.organization_id = $1',
    'lead.crm_instance_id = $2',
  ]

  const add = (sql: string, value: unknown) => {
    values.push(value)
    clauses.push(sql.replace('?', `$${values.length}`))
  }

  if (filters.status) add('task.status = ?', filters.status)
  if (filters.priority) add('task.priority = ?', filters.priority)
  if (filters.assignedTo) add('task.assigned_to = ?', filters.assignedTo)
  if (filters.leadId) add('task.lead_id = ?', filters.leadId)
  if (filters.search?.trim()) {
    add('(task.title ILIKE ? OR lead.name ILIKE ? OR COALESCE(lead.company, \'\') ILIKE ?)', `%${filters.search.trim()}%`)
    const index = values.length
    values.push(`%${filters.search.trim()}%`, `%${filters.search.trim()}%`)
    clauses[clauses.length - 1] = `(task.title ILIKE $${index} OR lead.name ILIKE $${index + 1} OR COALESCE(lead.company, '') ILIKE $${index + 2})`
  }

  if (filters.due === 'overdue') clauses.push("task.due_at < NOW() AND task.status = 'pending'")
  if (filters.due === 'today') clauses.push("task.due_at >= CURRENT_DATE AND task.due_at < CURRENT_DATE + INTERVAL '1 day'")
  if (filters.due === 'upcoming') clauses.push("task.due_at >= CURRENT_DATE + INTERVAL '1 day'")

  if (filters.cursor) {
    const cursor = decodeCursor(filters.cursor)
    values.push(cursor.dueAt, cursor.id)
    clauses.push(`(task.due_at, task.id) > ($${values.length - 1}, $${values.length})`)
  }

  const where = clauses.join(' AND ')
  const count = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
     FROM public.lead_tasks task
     JOIN public.leads lead ON lead.id = task.lead_id
     WHERE ${where}`,
    values,
  )
  const result = await pool.query<TaskRow>(
    `SELECT task.id, task.organization_id, task.lead_id, task.enrollment_id,
            task.title, task.description, task.status, task.priority, task.due_at,
            task.completed_at, task.cancelled_at, task.assigned_to,
            lead.name AS lead_name, lead.company AS lead_company,
            pipeline.name AS pipeline_name, stage.name AS stage_name,
            assignee.name AS assigned_to_name
     FROM public.lead_tasks task
     JOIN public.leads lead ON lead.id = task.lead_id
     LEFT JOIN public.crm_pipelines pipeline ON pipeline.id = lead.pipeline_id
     LEFT JOIN public.crm_pipeline_stages stage ON stage.id = lead.stage_id
     LEFT JOIN public.users assignee ON assignee.id = task.assigned_to
     WHERE ${where}
     ORDER BY task.due_at ASC, task.id ASC
     LIMIT ${limit + 1}`,
    values,
  )

  const hasMore = result.rows.length > limit
  const items = result.rows.slice(0, limit).map(mapTask)
  const last = items[items.length - 1]
  return {
    items,
    total: Number(count.rows[0]?.total ?? 0),
    ...(hasMore && last ? { nextCursor: encodeCursor(last.dueAt, last.id) } : {}),
  }
}

export async function patchCrmTask(pool: pg.Pool, user: AuthUser, taskId: string, patch: CrmTaskPatch) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const existing = await getTaskForUpdate(client, user, taskId)
    const nextStatus = patch.status ?? existing.status
    assertTransition(existing.status, nextStatus)

    const fields: Array<[string, unknown]> = [
      ['title', patch.title === undefined ? undefined : patch.title.trim()],
      ['description', patch.description === undefined ? undefined : patch.description?.trim() || null],
      ['due_at', patch.dueAt],
      ['assigned_to', patch.assignedTo],
      ['priority', patch.priority],
      ['status', patch.status],
      ['completed_at', patch.status === 'completed' ? new Date().toISOString() : patch.status ? null : undefined],
      ['cancelled_at', patch.status === 'cancelled' ? new Date().toISOString() : patch.status ? null : undefined],
      ['updated_by', user.id],
    ]
    const columns: string[] = []
    const values: unknown[] = []
    for (const [column, value] of fields) {
      if (value !== undefined) {
        columns.push(column)
        values.push(value)
      }
    }
    const assignments = columns.map((column, index) => `${column} = $${index + 2}`)
    const result = await client.query<TaskRow>(
      `UPDATE public.lead_tasks task
       SET ${assignments.join(', ')}, updated_at = NOW()
       WHERE task.id = $1
       RETURNING task.id, task.organization_id, task.lead_id, task.enrollment_id,
                 task.title, task.description, task.status, task.priority, task.due_at,
                 task.completed_at, task.cancelled_at, task.assigned_to,
                 ''::text AS lead_name, NULL::text AS lead_company,
                 NULL::text AS pipeline_name, NULL::text AS stage_name,
                 NULL::text AS assigned_to_name`,
      [taskId, ...values],
    )
    const updated = result.rows[0]
    if (!updated) throw domainError(500, 'task_update_failed')

    await client.query(
      `UPDATE public.leads
       SET next_follow_up_at = (
         SELECT MIN(due_at) FROM public.lead_tasks
         WHERE lead_id = $1 AND status = 'pending'
       ), updated_at = NOW()
       WHERE id = $1`,
      [existing.lead_id],
    )

    const eventType = nextStatus === 'completed'
      ? 'lead.task_completed'
      : nextStatus === 'cancelled'
        ? 'lead.task_cancelled'
        : existing.status !== 'pending' && nextStatus === 'pending'
          ? 'lead.task_reopened'
          : undefined
    if (eventType) {
      await recordDomainEvent(client, {
        eventType,
        organizationId: existing.organization_id,
        crmInstanceId: existing.crm_instance_id ?? undefined,
        aggregateType: 'task',
        aggregateId: taskId,
        leadId: existing.lead_id,
        actor: { type: 'user', id: user.id },
        payload: { taskId, leadId: existing.lead_id, status: nextStatus, dueAt: updated.due_at, priority: updated.priority, assignedTo: updated.assigned_to },
      })
    }

    await client.query('COMMIT')
    return mapTask(updated)
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function getTaskForUpdate(pool: Queryable, user: AuthUser, taskId: string) {
  const result = await pool.query<TaskAccessRow>(
    `SELECT task.id, task.organization_id, task.lead_id, task.enrollment_id,
            task.title, task.description, task.status, task.priority, task.due_at,
            task.completed_at, task.cancelled_at, task.assigned_to,
            lead.name AS lead_name, lead.company AS lead_company,
            pipeline.name AS pipeline_name, stage.name AS stage_name,
            assignee.name AS assigned_to_name,
            lead.crm_instance_id, member.role AS member_role, member.status AS member_status
     FROM public.lead_tasks task
     JOIN public.leads lead ON lead.id = task.lead_id
     LEFT JOIN public.crm_pipelines pipeline ON pipeline.id = lead.pipeline_id
     LEFT JOIN public.crm_pipeline_stages stage ON stage.id = lead.stage_id
     LEFT JOIN public.users assignee ON assignee.id = task.assigned_to
     LEFT JOIN public.crm_instance_members member
       ON member.crm_instance_id = lead.crm_instance_id AND member.user_id = $1
     WHERE task.id = $2
       AND ($3::boolean = TRUE OR EXISTS (
         SELECT 1 FROM public.memberships membership
         WHERE membership.user_id = $1 AND membership.organization_id = task.organization_id
       ))
     FOR UPDATE`,
    [user.id, taskId, isInternal(user)],
  )
  const task = result.rows[0]
  if (!task) throw domainError(404, 'task_not_found')
  if (!isInternal(user) && task.member_status !== 'active') throw domainError(403, 'crm_instance_forbidden')
  if (!isInternal(user) && task.member_role === 'seller' && task.assigned_to && task.assigned_to !== user.id) {
    throw domainError(403, 'task_assignment_forbidden')
  }
  return task
}

async function assertInstanceAccess(pool: Queryable, user: AuthUser, organizationId: string, crmInstanceId: string) {
  const result = await pool.query<{ id: string }>(
    `SELECT ci.id
     FROM public.crm_instances ci
     LEFT JOIN public.crm_instance_members member ON member.crm_instance_id = ci.id AND member.user_id = $3
     WHERE ci.id = $2 AND ci.organization_id = $1 AND ($4::boolean = TRUE OR (
       member.status = 'active' OR EXISTS (
         SELECT 1 FROM public.memberships membership
         WHERE membership.user_id = $3 AND membership.organization_id = ci.organization_id
       )
     ))
     LIMIT 1`,
    [organizationId, crmInstanceId, user.id, isInternal(user)],
  )
  if (!result.rows[0]) throw domainError(403, 'crm_instance_forbidden')
}

function assertTransition(current: string, next: string) {
  if (current === next) return
  const allowed: Record<string, string[]> = {
    pending: ['completed', 'cancelled'],
    completed: ['pending'],
    cancelled: ['pending'],
  }
  if (!allowed[current]?.includes(next)) throw domainError(409, 'task_transition_invalid')
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
    cancelledAt: row.cancelled_at ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    leadName: row.lead_name,
    leadCompany: row.lead_company ?? undefined,
    pipelineName: row.pipeline_name ?? undefined,
    stageName: row.stage_name ?? undefined,
    assignedToName: row.assigned_to_name ?? undefined,
  }
}

function encodeCursor(dueAt: string, id: string) {
  return Buffer.from(JSON.stringify({ dueAt, id }), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string) {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { dueAt?: unknown; id?: unknown }
    if (typeof parsed.dueAt !== 'string' || typeof parsed.id !== 'string') throw new Error('invalid')
    return parsed
  } catch {
    throw domainError(400, 'task_cursor_invalid')
  }
}

function domainError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}

function isInternal(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}
