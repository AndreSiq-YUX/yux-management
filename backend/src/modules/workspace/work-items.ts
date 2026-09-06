import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { requireMembership } from '../../http/guards.js'
import type { RequestContext } from '../../http/request-context.js'
import { resolveHumanTaskInTransaction } from '../action-engine/executor.js'
import { completeCrmTask } from '../crm/task-repository.js'
import { recordDomainEvent } from '../events/repository.js'

type Queryable = {
  query<TRow = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: TRow[]; rowCount?: number | null }>
}

type WorkItemSourceType = 'crm_task' | 'project_task' | 'mission_human_task'
type WorkItemStatus = 'pending' | 'in_progress' | 'blocked' | 'awaiting_approval'

type WorkItem = {
  sourceType: WorkItemSourceType
  sourceId: string
  title: string
  status: WorkItemStatus
  dueAt: string | null
  assigneeId: string | null
  missionId: string | null
  organizationId: string
  version: string
}

type ProjectionRow = {
  source_id: string
  title: string
  status: string
  due_at: string | Date | null
  assignee_id: string | null
  mission_id: string | null
  organization_id: string
  version: string | Date
}

const listSchema = z.object({
  organizationId: z.string().uuid(),
  assigneeId: z.string().uuid().optional(),
  due: z.enum(['all', 'today', 'overdue', 'upcoming']).default('all'),
})
const paramsSchema = z.object({
  sourceType: z.enum(['crm_task', 'project_task', 'mission_human_task']),
  sourceId: z.string().uuid(),
})
const completionSchema = z.object({
  organizationId: z.string().uuid(),
  expectedVersion: z.string().datetime(),
  evidence: z.record(z.string(), z.unknown()).refine(value => Object.keys(value).length > 0, 'evidence_required'),
  minutesSpent: z.number().int().positive().max(24 * 60),
})

export async function listWorkItems(pool: Queryable, context: RequestContext, input: z.infer<typeof listSchema>): Promise<WorkItem[]> {
  const assigneeId = context.role === 'client_member' ? context.userId : input.assigneeId ?? null
  if (context.role === 'client_member' && input.assigneeId && input.assigneeId !== context.userId) {
    throw domainError(403, 'work_item_assignee_forbidden')
  }
  const internal = context.role === 'yux_admin' || context.role === 'yux_operator'
  const [crm, projects, missionTasks] = await Promise.all([
    pool.query<ProjectionRow>(
      `SELECT task.id AS source_id, task.title, task.status, task.due_at,
              task.assigned_to AS assignee_id, NULLIF(task.metadata->>'missionId','') AS mission_id,
              task.organization_id, task.updated_at AS version
       FROM public.lead_tasks task
       WHERE task.organization_id = $1 AND task.status = 'pending'
         AND ($2::uuid IS NULL OR task.assigned_to = $2)`,
      [input.organizationId, assigneeId],
    ),
    pool.query<ProjectionRow>(
      `SELECT task.id AS source_id, task.title, task.status,
              CASE WHEN task.due_date IS NULL THEN NULL ELSE task.due_date::text END AS due_at,
              task.assigned_to AS assignee_id, NULL::uuid AS mission_id,
              organization.id AS organization_id, task.updated_at AS version
       FROM public.project_tasks task
       JOIN public.projects project ON project.id = task.project_id
       JOIN public.organizations organization ON organization.client_id = project.client_id
       WHERE organization.id = $1 AND task.status IN ('pending','in_progress')
         AND ($2::uuid IS NULL OR task.assigned_to = $2)
         AND ($3::boolean OR task.is_client_visible = TRUE)`,
      [input.organizationId, assigneeId, internal],
    ),
    pool.query<ProjectionRow>(
      `SELECT COALESCE(run.output #>> '{output,taskId}', run.output->>'taskId') AS source_id,
              COALESCE(NULLIF(run.input->>'title',''), step.step_key) AS title,
              CASE run.status
                WHEN 'waiting_approval' THEN 'awaiting_approval'
                WHEN 'failed' THEN 'blocked'
                WHEN 'blocked' THEN 'blocked'
                ELSE 'pending'
              END AS status,
              NULLIF(run.input->>'dueAt','') AS due_at,
              CASE WHEN run.input->>'assignedTo' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                THEN (run.input->>'assignedTo')::uuid ELSE NULL END AS assignee_id,
              run.mission_id, run.organization_id, run.updated_at AS version
       FROM public.action_runs run
       JOIN public.action_plan_steps step ON step.id = run.plan_step_id AND step.capability_key = 'human.task.create'
       WHERE run.organization_id = $1
         AND run.status IN ('running','waiting_approval','failed','blocked')
         AND COALESCE(run.output #>> '{output,taskId}', run.output->>'taskId') IS NOT NULL
         AND ($2::uuid IS NULL OR CASE WHEN run.input->>'assignedTo' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              THEN (run.input->>'assignedTo')::uuid ELSE NULL END = $2)`,
      [input.organizationId, assigneeId],
    ),
  ])

  const items = [
    ...crm.rows.map(row => mapRow('crm_task', row)),
    ...projects.rows.map(row => mapRow('project_task', row)),
    ...missionTasks.rows.map(row => mapRow('mission_human_task', row)),
  ].filter(item => matchesDue(item.dueAt, input.due))
  const unique = new Map(items.map(item => [`${item.sourceType}:${item.sourceId}`, item]))
  return [...unique.values()].sort(compareWorkItems)
}

export async function registerWorkspaceWorkItemRoutes(app: FastifyInstance) {
  app.get('/work-items', async (request, reply) => {
    const parsed = listSchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_work_item_query' })
    const context = requireMembership(request, parsed.data.organizationId)
    try {
      return { items: await listWorkItems(app.pg, context, parsed.data) }
    } catch (error) {
      return sendError(reply, error)
    }
  })

  app.post('/work-items/:sourceType/:sourceId/complete', async (request, reply) => {
    const params = paramsSchema.safeParse(request.params)
    const body = completionSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_work_item_completion' })
    const context = requireMembership(request, body.data.organizationId)
    const client = await app.pg.connect()
    try {
      await client.query('BEGIN')
      const result = await completeWorkItem(client, context, params.data.sourceType, params.data.sourceId, body.data)
      await client.query('COMMIT')
      if (result.missionId) await app.jobQueue.add('action-engine.scheduleReadyActions', { missionId: result.missionId })
      return result.item
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      return sendError(reply, error)
    } finally {
      client.release()
    }
  })
}

async function completeWorkItem(
  client: Queryable,
  context: RequestContext,
  sourceType: WorkItemSourceType,
  sourceId: string,
  input: z.infer<typeof completionSchema>,
) {
  if (sourceType === 'crm_task') {
    const task = await completeCrmTask(client, { id: context.userId, role: context.role }, {
      taskId: sourceId,
      organizationId: input.organizationId,
      expectedVersion: input.expectedVersion,
      evidence: input.evidence,
      minutesSpent: input.minutesSpent,
    })
    return {
      item: { sourceType, sourceId, status: 'completed', organizationId: input.organizationId, version: task.version ?? input.expectedVersion },
      missionId: null,
    }
  }
  if (sourceType === 'project_task') return completeProjectTask(client, context, sourceId, input)
  return completeMissionHumanTask(client, context, sourceId, input)
}

async function completeProjectTask(
  client: Queryable,
  context: RequestContext,
  sourceId: string,
  input: z.infer<typeof completionSchema>,
) {
  const selected = await client.query<{
    id: string; project_id: string; title: string; status: string; assigned_to: string | null; updated_at: string | Date
  }>(
    `SELECT task.id, task.project_id, task.title, task.status, task.assigned_to, task.updated_at
     FROM public.project_tasks task
     JOIN public.projects project ON project.id = task.project_id
     JOIN public.organizations organization ON organization.client_id = project.client_id
     WHERE task.id = $1 AND organization.id = $2 FOR UPDATE OF task`,
    [sourceId, input.organizationId],
  )
  const task = selected.rows[0]
  if (!task) throw domainError(404, 'work_item_not_found')
  assertAssignment(context, task.assigned_to)
  if (!['pending', 'in_progress'].includes(task.status)) throw domainError(409, 'work_item_already_resolved')
  assertVersion(task.updated_at, input.expectedVersion)
  const updated = await client.query<{ updated_at: string | Date }>(
    `UPDATE public.project_tasks
     SET status = 'completed', completed_at = NOW(), actual_hours = $3::numeric / 60, updated_at = NOW()
     WHERE id = $1 AND project_id = $2 AND updated_at = $4::timestamptz
     RETURNING updated_at`,
    [sourceId, task.project_id, input.minutesSpent, input.expectedVersion],
  )
  if (!updated.rows[0]) throw domainError(409, 'work_item_version_conflict')
  await client.query(
    `INSERT INTO public.project_timeline_entries
       (project_id, entry_type, title, body, metadata, origin, is_client_visible, created_by)
     VALUES ($1,'manual_update',$2,$3,$4,'manual',TRUE,$5)`,
    [task.project_id, `Tarefa concluída: ${task.title}`, 'Conclusão registrada pela fila diária.',
      {
        entityType: 'project_task', entityId: sourceId, evidence: input.evidence, minutesSpent: input.minutesSpent,
        before: { status: task.status, version: toIso(task.updated_at) },
        after: { status: 'completed', version: toIso(updated.rows[0].updated_at) },
      }, context.userId],
  )
  await recordDomainEvent(client, {
    eventType: 'project.task_completed', organizationId: input.organizationId,
    aggregateType: 'task', aggregateId: sourceId, actor: { type: 'user', id: context.userId },
    payload: { projectId: task.project_id, evidence: input.evidence, minutesSpent: input.minutesSpent },
  })
  return {
    item: { sourceType: 'project_task' as const, sourceId, status: 'completed', organizationId: input.organizationId, version: toIso(updated.rows[0].updated_at) },
    missionId: null,
  }
}

async function completeMissionHumanTask(
  client: Queryable,
  context: RequestContext,
  sourceId: string,
  input: z.infer<typeof completionSchema>,
) {
  if (context.role !== 'yux_admin' && context.role !== 'yux_operator') {
    throw domainError(403, 'work_item_completion_forbidden')
  }
  const selected = await client.query<{
    action_id: string; mission_id: string; assigned_to: string | null; updated_at: string | Date; status: string
  }>(
    `SELECT run.id AS action_id, run.mission_id, run.status, run.updated_at,
            CASE WHEN run.input->>'assignedTo' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
              THEN (run.input->>'assignedTo')::uuid ELSE NULL END AS assigned_to
     FROM public.action_runs run
     JOIN public.action_plan_steps step ON step.id = run.plan_step_id AND step.capability_key = 'human.task.create'
     WHERE run.organization_id = $2
       AND COALESCE(run.output #>> '{output,taskId}', run.output->>'taskId') = $1
     FOR UPDATE OF run`,
    [sourceId, input.organizationId],
  )
  const task = selected.rows[0]
  if (!task) throw domainError(404, 'work_item_not_found')
  assertAssignment(context, task.assigned_to)
  if (task.status !== 'running') throw domainError(409, 'work_item_already_resolved')
  assertVersion(task.updated_at, input.expectedVersion)
  const result = await resolveHumanTaskInTransaction(client, {
    actionId: task.action_id,
    organizationId: input.organizationId,
    actualMinutes: input.minutesSpent,
    actorId: context.userId,
    result: input.evidence,
    expectedVersion: input.expectedVersion,
  })
  const version = await client.query<{ updated_at: string | Date }>('SELECT updated_at FROM public.action_runs WHERE id = $1', [task.action_id])
  return {
    item: { sourceType: 'mission_human_task' as const, sourceId, status: 'completed', organizationId: input.organizationId, version: toIso(version.rows[0]!.updated_at) },
    missionId: result.missionId,
  }
}

function mapRow(sourceType: WorkItemSourceType, row: ProjectionRow): WorkItem {
  return {
    sourceType,
    sourceId: row.source_id,
    title: row.title,
    status: normalizeStatus(row.status),
    dueAt: row.due_at ? dueIso(row.due_at) : null,
    assigneeId: row.assignee_id,
    missionId: row.mission_id,
    organizationId: row.organization_id,
    version: toIso(row.version),
  }
}

function normalizeStatus(status: string): WorkItemStatus {
  if (status === 'in_progress') return 'in_progress'
  if (status === 'blocked' || status === 'failed') return 'blocked'
  if (status === 'waiting_approval' || status === 'awaiting_approval') return 'awaiting_approval'
  return 'pending'
}

function dueIso(value: string | Date) {
  if (value instanceof Date) return value.toISOString()
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T23:59:59.999Z`
  return new Date(value).toISOString()
}

function matchesDue(dueAt: string | null, due: z.infer<typeof listSchema>['due']) {
  if (due === 'all') return true
  if (!dueAt) return false
  const target = new Date(dueAt)
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
  if (due === 'overdue') return target < start
  if (due === 'today') return target >= start && target < end
  return target >= end
}

function compareWorkItems(left: WorkItem, right: WorkItem) {
  const rank: Record<WorkItemStatus, number> = { blocked: 0, awaiting_approval: 1, pending: 2, in_progress: 2 }
  return rank[left.status] - rank[right.status]
    || (left.dueAt ? new Date(left.dueAt).getTime() : Number.MAX_SAFE_INTEGER)
      - (right.dueAt ? new Date(right.dueAt).getTime() : Number.MAX_SAFE_INTEGER)
    || left.sourceId.localeCompare(right.sourceId)
}

function assertAssignment(context: RequestContext, assigneeId: string | null) {
  if (assigneeId && assigneeId !== context.userId && context.role !== 'yux_admin') {
    throw domainError(403, 'work_item_assignment_forbidden')
  }
}

function assertVersion(current: string | Date, expected: string) {
  if (toIso(current) !== toIso(expected)) throw domainError(409, 'work_item_version_conflict')
}

function toIso(value: string | Date) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function domainError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}

function sendError(reply: { code(statusCode: number): { send(payload: unknown): unknown } }, error: unknown) {
  const statusCode = error && typeof error === 'object' && typeof Reflect.get(error, 'statusCode') === 'number'
    ? Number(Reflect.get(error, 'statusCode'))
    : error instanceof Error && ['action_not_human_task', 'action_version_conflict'].includes(error.message) ? 409 : 500
  const code = error instanceof Error ? error.message : 'work_item_completion_failed'
  return reply.code(statusCode).send({ error: statusCode === 500 ? 'work_item_completion_failed' : code })
}
