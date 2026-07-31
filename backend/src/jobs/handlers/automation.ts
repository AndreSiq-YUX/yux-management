import { createHmac } from 'node:crypto'
import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'

type Row = Record<string, any>

export async function handleAutomationDispatch(pool: Pick<pg.Pool, 'query'>, env: AppEnv, data: Row) {
  const event = asRecord(data.event)
  const organizationId = stringValue(event.organizationId)
  if (!organizationId || !stringValue(event.type)) throw new Error('automation_event_context_required')

  const flows = await pool.query<Row>(
    `SELECT f.id, f.organization_id, f.daily_run_limit,
            t.id AS trigger_id, t.trigger_type, t.config AS trigger_config
     FROM public.automation_flows f
     LEFT JOIN public.automation_triggers t ON t.flow_id = f.id
     WHERE f.organization_id = $1 AND f.status = 'published' AND f.is_enabled = TRUE
     ORDER BY f.created_at ASC, t.created_at ASC`,
    [organizationId],
  )

  const grouped = groupByFlow(flows.rows)
  const results: Array<{ flowId: string; runId?: string; status: string; reason?: string }> = []
  const lead = await loadLead(pool, organizationId, stringValue(event.leadId))
  const context = { ...event, ...(asRecord(event.payload)), lead: lead || undefined }

  for (const flow of grouped) {
    const trigger = flow.triggers.find(candidate => matchesTrigger(candidate, event))
    if (!trigger) {
      results.push({ flowId: flow.id, status: 'skipped', reason: 'trigger_not_matched' })
      continue
    }

    const [conditions, actions] = await Promise.all([
      pool.query<Row>(
        'SELECT field, operator, value FROM public.automation_conditions WHERE flow_id = $1 ORDER BY order_index ASC, created_at ASC',
        [flow.id],
      ),
      pool.query<Row>(
        'SELECT id, action_type, order_index, payload FROM public.automation_actions WHERE flow_id = $1 ORDER BY order_index ASC, created_at ASC',
        [flow.id],
      ),
    ])
    if (!evaluateConditions(conditions.rows, context)) {
      results.push({ flowId: flow.id, status: 'skipped', reason: 'conditions_not_matched' })
      continue
    }

    const eventId = stringValue(event.eventId)
    if (eventId) {
      const previousRun = await pool.query<{ id: string; status: string }>(
        `SELECT id, status
         FROM public.automation_execution_runs
         WHERE flow_id = $1
           AND event_payload->>'eventId' = $2
           AND status IN ('processing', 'completed')
         ORDER BY created_at DESC
         LIMIT 1`,
        [flow.id, eventId],
      )
      if (previousRun.rows[0]) {
        results.push({ flowId: flow.id, runId: previousRun.rows[0].id, status: 'skipped', reason: 'duplicate_event' })
        continue
      }
    }

    const dailyLimit = Number(flow.daily_run_limit ?? 500)
    if (dailyLimit > 0) {
      const usage = await pool.query<{ count: number }>(
        `SELECT COUNT(*)::int AS count
         FROM public.automation_execution_runs
         WHERE flow_id = $1 AND created_at >= CURRENT_DATE`,
        [flow.id],
      )
      if (Number(usage.rows[0]?.count || 0) >= dailyLimit) {
        results.push({ flowId: flow.id, status: 'skipped', reason: 'daily_limit_reached' })
        continue
      }
    }

    const run = await pool.query<{ id: string }>(
      `INSERT INTO public.automation_execution_runs (
         organization_id, flow_id, event_type, lead_id, conversation_id,
         ticket_id, status, event_payload, started_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7, NOW())
       RETURNING id`,
      [
        organizationId,
        flow.id,
        stringValue(event.type),
        nullableUuid(event.leadId),
        nullableUuid(event.conversationId),
        nullableUuid(event.ticketId),
        sanitize(event),
      ],
    )
    const runId = run.rows[0]?.id
    if (!runId) throw new Error('automation_run_creation_failed')

    try {
      for (const action of actions.rows) {
        await executeAction(pool, env, runId, action, organizationId, lead, event)
      }
      await pool.query(
        `UPDATE public.automation_execution_runs
         SET status = 'completed', completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [runId],
      )
      results.push({ flowId: flow.id, runId, status: 'completed' })
    } catch (error) {
      const message = safeError(error)
      await pool.query(
        `UPDATE public.automation_execution_runs
         SET status = 'failed', last_error = $2, completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [runId, message],
      )
      results.push({ flowId: flow.id, runId, status: 'failed', reason: message })
    }
  }

  return { eventType: stringValue(event.type), organizationId, results }
}

async function executeAction(
  pool: Pick<pg.Pool, 'query'>,
  env: AppEnv,
  runId: string,
  action: Row,
  organizationId: string,
  lead: Row | null,
  event: Row,
) {
  const actionType = stringValue(action.action_type)
  const payload = asRecord(action.payload)
  const step = await pool.query<{ id: string }>(
    `INSERT INTO public.automation_execution_steps (
       run_id, action_id, action_type, status, sanitized_payload, started_at
     )
     VALUES ($1, $2, $3, 'processing', $4, NOW())
     RETURNING id`,
    [runId, action.id, actionType, sanitize(payload)],
  )
  const stepId = step.rows[0]?.id
  try {
    const result = await dispatchAction(pool, env, actionType, payload, organizationId, lead, event)
    await pool.query(
      `UPDATE public.automation_execution_steps
       SET status = 'completed', sanitized_result = $2, completed_at = NOW()
       WHERE id = $1`,
      [stepId, sanitize(asRecord(result))],
    )
  } catch (error) {
    await pool.query(
      `UPDATE public.automation_execution_steps
       SET status = 'failed', protected_error = $2, completed_at = NOW()
       WHERE id = $1`,
      [stepId, safeError(error)],
    )
    throw error
  }
}

async function dispatchAction(
  pool: Pick<pg.Pool, 'query'>,
  env: AppEnv,
  actionType: string,
  payload: Row,
  organizationId: string,
  lead: Row | null,
  event: Row,
) {
  if (actionType === 'create_task') {
    requireLead(lead)
    const dueAt = payload.dueAt || new Date(Date.now() + Number(payload.delayMinutes || 0) * 60_000).toISOString()
    const result = await pool.query<{ id: string }>(
      `INSERT INTO public.lead_tasks (
         organization_id, lead_id, title, description, due_at, assigned_to, priority, metadata
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        organizationId,
        lead.id,
        stringValue(payload.title) || 'Follow-up de lead',
        stringValue(payload.description) || null,
        dueAt,
        nullableUuid(payload.assignedTo || lead.assigned_to),
        ['low', 'medium', 'high', 'urgent'].includes(stringValue(payload.priority)) ? payload.priority : 'medium',
        { source: 'automation', eventType: event.type },
      ],
    )
    return { taskId: result.rows[0]?.id }
  }

  if (actionType === 'register_activity') {
    requireLead(lead)
    const result = await pool.query<{ id: string }>(
      `INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING id`,
      [
        organizationId,
        lead.id,
        ['call', 'email', 'meeting', 'note'].includes(stringValue(payload.type)) ? payload.type : 'note',
        stringValue(payload.title) || 'Atividade de automação',
        stringValue(payload.description) || stringValue(payload.body) || 'Atividade registrada por automação.',
      ],
    )
    return { interactionId: result.rows[0]?.id }
  }

  if (actionType === 'change_stage') {
    requireLead(lead)
    const stageId = stringValue(payload.stageId)
    if (!stageId) throw new Error('automation_stage_id_required')
    const stage = await pool.query<Row>(
      `SELECT s.id, s.pipeline_id, s.is_won, s.is_lost
       FROM public.crm_pipeline_stages s
       JOIN public.crm_pipelines p ON p.id = s.pipeline_id
       WHERE s.id = $1 AND p.organization_id = $2 AND s.is_active = TRUE
       LIMIT 1`,
      [stageId, organizationId],
    )
    if (!stage.rows[0]) throw new Error('automation_stage_not_found')
    await pool.query(
      `UPDATE public.leads
       SET stage_id = $2,
           status = $3,
           won_at = CASE WHEN $3 = 'won' THEN NOW() ELSE NULL END,
           lost_at = CASE WHEN $3 = 'lost' THEN NOW() ELSE NULL END,
           last_activity_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND organization_id = $4`,
      [lead.id, stageId, stage.rows[0].is_won ? 'won' : stage.rows[0].is_lost ? 'lost' : 'open', organizationId],
    )
    return { stageId }
  }

  if (actionType === 'assign_owner') {
    requireLead(lead)
    const ownerId = stringValue(payload.userId || payload.ownerId || payload.assignedTo)
    await pool.query(
      `UPDATE public.leads SET owner_id = $2, assigned_to = $2, updated_at = NOW()
       WHERE id = $1 AND organization_id = $3`,
      [lead.id, nullableUuid(ownerId), organizationId],
    )
    return { ownerId: ownerId || null }
  }

  if (actionType === 'update_field') {
    requireLead(lead)
    const fieldMap: Record<string, string> = {
      name: 'name', email: 'email', phone: 'phone', company: 'company', notes: 'notes',
      score: 'score', value: 'value', status: 'status', source: 'source',
      nextFollowUpAt: 'next_follow_up_at',
    }
    const column = fieldMap[stringValue(payload.field)]
    if (!column) throw new Error('automation_field_not_allowed')
    await pool.query(
      `UPDATE public.leads SET ${column} = $2, updated_at = NOW() WHERE id = $1 AND organization_id = $3`,
      [lead.id, payload.value ?? null, organizationId],
    )
    return { field: payload.field }
  }

  if (['send_whatsapp', 'send_email', 'webhook', 'call_api', 'ai_classify_lead', 'ai_generate_message', 'ai_generate_proposal'].includes(actionType)) {
    return dispatchExternalAction(env, actionType, payload, organizationId, lead, event)
  }

  throw new Error(`automation_action_not_supported:${actionType}`)
}

async function dispatchExternalAction(env: AppEnv, actionType: string, payload: Row, organizationId: string, lead: Row | null, event: Row) {
  if (!env.N8N_CRM_WEBHOOK_URL || !env.N8N_WEBHOOK_SECRET) {
    throw new Error('N8N_CRM_WEBHOOK_URL is not configured')
  }
  const body = JSON.stringify({ organizationId, actionType, lead: lead ? sanitize(lead) : null, payload: sanitize(payload), event: sanitize(event) })
  const response = await fetch(env.N8N_CRM_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-YUX-Signature': `sha256=${createHmac('sha256', env.N8N_WEBHOOK_SECRET).update(body).digest('hex')}`,
    },
    body,
  })
  if (!response.ok) throw new Error(`automation_external_dispatch_failed:${response.status}`)
  return { dispatched: true, actionType }
}

async function loadLead(pool: Pick<pg.Pool, 'query'>, organizationId: string, leadId: string) {
  if (!leadId) return null
  const result = await pool.query<Row>(
    `SELECT id, organization_id, name, email, phone, company, source, source_kind,
            status, score, owner_id, assigned_to, pipeline_id, stage_id
     FROM public.leads WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [leadId, organizationId],
  )
  return result.rows[0] || null
}

function groupByFlow(rows: Row[]) {
  const groups = new Map<string, { id: string; daily_run_limit: number; triggers: Row[] }>()
  for (const row of rows) {
    const flow: { id: string; daily_run_limit: number; triggers: Row[] } = groups.get(row.id) || {
      id: row.id,
      daily_run_limit: row.daily_run_limit,
      triggers: [] as Row[],
    }
    if (row.trigger_id) flow.triggers.push({ type: row.trigger_type, config: asRecord(row.trigger_config) })
    groups.set(row.id, flow)
  }
  return [...groups.values()]
}

function matchesTrigger(trigger: Row, event: Row) {
  if (trigger.type !== event.type) return false
  const config = asRecord(trigger.config)
  return (!config.stageId || config.stageId === event.stageId)
    && (!config.status || config.status === event.status)
    && (!config.source || config.source === event.source)
}

function evaluateConditions(conditions: Row[], context: Row) {
  return conditions.every(condition => {
    const current = valueAt(context, stringValue(condition.field))
    const expected = condition.value
    if (condition.operator === 'exists') return current !== undefined && current !== null && current !== ''
    if (condition.operator === 'equals') return normalize(current) === normalize(expected)
    if (condition.operator === 'not_equals') return normalize(current) !== normalize(expected)
    if (condition.operator === 'contains') return normalize(current).includes(normalize(expected))
    if (condition.operator === 'greater_than') return Number(current) > Number(expected)
    if (condition.operator === 'less_than') return Number(current) < Number(expected)
    return false
  })
}

function valueAt(source: Row, path: string) {
  return path.split('.').reduce<unknown>((current, key) => current && typeof current === 'object' ? (current as Row)[key] : undefined, source)
}

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase()
}

function requireLead(lead: Row | null): asserts lead is Row {
  if (!lead) throw new Error('automation_lead_required')
}

function nullableUuid(value: unknown) {
  const candidate = stringValue(value)
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate) ? candidate : null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value)
}

function asRecord(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Row).map(([key, entry]) => {
    const normalizedKey = key.toLowerCase()
    const redacted = ['token', 'secret', 'password', 'authorization', 'api_key', 'apikey'].some(part => normalizedKey.includes(part))
    return [key, redacted ? '[redacted]' : sanitize(entry)]
  }))
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000).replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
}
