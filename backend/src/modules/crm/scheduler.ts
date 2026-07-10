import type pg from 'pg'
import { createHmac } from 'node:crypto'

export type CrmSequenceSchedulerOptions = {
  now?: Date
  limit?: number
  crmWebhookUrl?: string
  crmWebhookSecret?: string
  fetchImpl?: typeof fetch
}

type ExecutionRow = {
  id: string
  organization_id: string
  lead_id: string
  enrollment_id: string | null
  step_id: string | null
  action_type: string
  payload: Record<string, unknown>
  status: string
  attempt_count: number
}

type StepRow = {
  id: string
  sequence_id: string
  action_type: string
  delay_minutes: number
  subject: string | null
  body: string
  order_index: number
  is_active: boolean
}

export async function runCrmSequenceScheduler(pool: pg.Pool, options: CrmSequenceSchedulerOptions = {}) {
  const created = await enqueueMissingDueExecutions(pool, options)
  const processed = await processDueExecutions(pool, options)
  return { created, processed }
}

export async function enqueueMissingDueExecutions(pool: pg.Pool, options: CrmSequenceSchedulerOptions = {}) {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 100
  const result = await pool.query(
    `WITH due AS (
       SELECT e.id AS enrollment_id, e.organization_id, e.lead_id, e.sequence_id, e.current_step_index, e.next_execution_at
       FROM public.crm_sequence_enrollments e
       WHERE e.status = 'active'
         AND e.next_execution_at IS NOT NULL
         AND e.next_execution_at <= $1
         AND NOT EXISTS (
           SELECT 1
           FROM public.automation_executions x
           WHERE x.enrollment_id = e.id
             AND x.status IN ('pending', 'processing')
         )
       ORDER BY e.next_execution_at ASC
       LIMIT $2
     ),
     next_steps AS (
       SELECT due.*, s.id AS step_id, s.action_type, s.subject, s.body, s.order_index
       FROM due
       JOIN LATERAL (
         SELECT *
         FROM public.crm_sequence_steps
         WHERE sequence_id = due.sequence_id
           AND is_active = TRUE
           AND order_index >= due.current_step_index
         ORDER BY order_index ASC
         LIMIT 1
       ) s ON TRUE
     )
     INSERT INTO public.automation_executions (
       organization_id, lead_id, enrollment_id, step_id, action_type, payload, scheduled_at
     )
     SELECT organization_id, lead_id, enrollment_id, step_id, action_type,
       jsonb_build_object('subject', subject, 'body', body),
       next_execution_at
     FROM next_steps
     RETURNING id`,
    [now.toISOString(), limit],
  )

  return result.rowCount ?? 0
}

export async function processDueExecutions(pool: pg.Pool, options: CrmSequenceSchedulerOptions = {}) {
  const now = options.now ?? new Date()
  const limit = options.limit ?? 100
  const due = await pool.query<{ id: string }>(
    `SELECT id
     FROM public.automation_executions
     WHERE status = 'pending' AND scheduled_at <= $1
     ORDER BY scheduled_at ASC
     LIMIT $2`,
    [now.toISOString(), limit],
  )

  let processed = 0
  for (const row of due.rows) {
    await processSequenceExecution(pool, row.id, options)
    processed += 1
  }
  return processed
}

export async function processSequenceExecution(pool: pg.Pool, executionId: string, options: CrmSequenceSchedulerOptions = {}) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await client.query<ExecutionRow & { lead_name: string | null; lead_email: string | null; lead_phone: string | null }>(
      `SELECT x.*, l.name AS lead_name, l.email AS lead_email, l.phone AS lead_phone
       FROM public.automation_executions x
       JOIN public.leads l ON l.id = x.lead_id
       WHERE x.id = $1
       FOR UPDATE OF x`,
      [executionId],
    )
    const execution = result.rows[0]
    if (!execution) throw Object.assign(new Error('execution_not_found'), { statusCode: 404 })
    if (execution.status === 'completed') {
      await client.query('COMMIT')
      return { success: true, duplicate: true }
    }

    await client.query(
      `UPDATE public.automation_executions
       SET status = 'processing', attempt_count = attempt_count + 1, last_error = NULL
       WHERE id = $1`,
      [executionId],
    )

    await executeSequenceAction(client, execution, options)
    await client.query(
      `UPDATE public.automation_executions
       SET status = 'completed', completed_at = $2
       WHERE id = $1`,
      [executionId, (options.now ?? new Date()).toISOString()],
    )
    await enqueueNextStep(client, execution, options.now ?? new Date())
    await client.query('COMMIT')
    return { success: true }
  } catch (error) {
    await client.query('ROLLBACK')
    const message = error instanceof Error ? error.message : 'unknown_sequence_error'
    await pool.query(
      `UPDATE public.automation_executions
       SET status = 'failed', last_error = $2
       WHERE id = $1`,
      [executionId, message],
    )
    throw error
  } finally {
    client.release()
  }
}

async function executeSequenceAction(client: pg.PoolClient, execution: ExecutionRow & { lead_name: string | null; lead_email: string | null; lead_phone: string | null }, options: CrmSequenceSchedulerOptions) {
  if (execution.action_type === 'internal_task') {
    await client.query(
      `INSERT INTO public.lead_tasks (
         organization_id, lead_id, title, description, due_at, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        execution.organization_id,
        execution.lead_id,
        textValue(execution.payload.subject) || 'Follow-up comercial',
        textValue(execution.payload.body) || null,
        (options.now ?? new Date()).toISOString(),
        { source: 'crm_sequence_scheduler', executionId: execution.id, enrollmentId: execution.enrollment_id },
      ],
    )
    return
  }

  const webhookUrl = options.crmWebhookUrl ?? process.env.N8N_CRM_WEBHOOK_URL
  if (!webhookUrl) {
    throw new Error('N8N_CRM_WEBHOOK_URL is not configured')
  }
  const webhookSecret = options.crmWebhookSecret ?? process.env.N8N_WEBHOOK_SECRET
  if (!webhookSecret) throw new Error('N8N_WEBHOOK_SECRET is not configured')

  const fetchImpl = options.fetchImpl ?? fetch
  const body = JSON.stringify({
    executionId: execution.id,
    actionType: execution.action_type,
    lead: {
      id: execution.lead_id,
      name: execution.lead_name,
      email: execution.lead_email,
      phone: execution.lead_phone,
    },
    payload: execution.payload,
  })
  const response = await fetchImpl(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-YUX-Signature': `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`,
    },
    body,
  })

  if (!response.ok) {
    throw new Error(`CRM webhook returned ${response.status}`)
  }
}

async function enqueueNextStep(client: pg.PoolClient, execution: ExecutionRow, now: Date) {
  if (!execution.enrollment_id || !execution.step_id) return

  const currentStepResult = await client.query<StepRow>(
    `SELECT id, sequence_id, action_type, delay_minutes, subject, body, order_index, is_active
     FROM public.crm_sequence_steps
     WHERE id = $1
     LIMIT 1`,
    [execution.step_id],
  )
  const currentStep = currentStepResult.rows[0]
  if (!currentStep) return

  const nextStepResult = await client.query<StepRow>(
    `SELECT id, sequence_id, action_type, delay_minutes, subject, body, order_index, is_active
     FROM public.crm_sequence_steps
     WHERE sequence_id = $1
       AND is_active = TRUE
       AND order_index > $2
     ORDER BY order_index ASC
     LIMIT 1`,
    [currentStep.sequence_id, currentStep.order_index],
  )
  const nextStep = nextStepResult.rows[0]
  if (!nextStep) {
    await client.query(
      `UPDATE public.crm_sequence_enrollments
       SET status = 'completed', next_execution_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [execution.enrollment_id],
    )
    return
  }

  const scheduledAt = new Date(now.getTime() + nextStep.delay_minutes * 60_000)
  await client.query(
    `UPDATE public.crm_sequence_enrollments
     SET current_step_index = $2, next_execution_at = $3, updated_at = NOW()
     WHERE id = $1`,
    [execution.enrollment_id, nextStep.order_index, scheduledAt.toISOString()],
  )
  await client.query(
    `INSERT INTO public.automation_executions (
       organization_id, lead_id, enrollment_id, step_id, action_type, payload, scheduled_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      execution.organization_id,
      execution.lead_id,
      execution.enrollment_id,
      nextStep.id,
      nextStep.action_type,
      { subject: nextStep.subject, body: nextStep.body },
      scheduledAt.toISOString(),
    ],
  )
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
