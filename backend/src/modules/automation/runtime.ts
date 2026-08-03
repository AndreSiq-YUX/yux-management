import { createHash } from 'node:crypto'
import { createDomainEventEnvelope, isUuid, type DomainEventEnvelope } from '../events/types.js'
import { getDomainEvent, recordDomainEvent } from '../events/repository.js'
import { createDefaultAutomationCommandServices } from './command-adapters.js'
import { executeAutomationAction, type AutomationLead, type AutomationCommandServices } from './action-handlers.js'
import type {
  AutomationAction,
  AutomationFlowSnapshot,
  AutomationJobQueue,
  AutomationRuntimeOptions,
  AutomationRuntimeResult,
  AutomationTrigger,
  LeadCommandContext,
  RawAutomationEvent,
} from './types.js'

type RuntimeDb = {
  query: <T = any>(...args: any[]) => Promise<{ rows: T[]; rowCount?: number | null }>
}

type FlowRow = {
  id: string
  organization_id: string
  crm_instance_id?: string | null
  daily_run_limit?: number | null
  allow_reentry?: boolean | null
  reentry_cooldown_minutes?: number | null
  flow_version_id?: string | null
  snapshot?: unknown
  trigger_id?: string | null
  trigger_type?: string | null
  trigger_config?: Record<string, unknown> | null
}

type RuntimeFlow = {
  id: string
  organizationId: string
  crmInstanceId?: string
  flowVersionId?: string
  dailyRunLimit: number
  allowReentry: boolean
  reentryCooldownMinutes: number
  snapshot: AutomationFlowSnapshot
}

type RunContext = {
  runId: string
  event: DomainEventEnvelope
  flow: RuntimeFlow
  actions: AutomationAction[]
  lead: AutomationLead | null
}

export async function dispatchAutomationEvent(
  db: RuntimeDb,
  raw: RawAutomationEvent,
  options: AutomationRuntimeOptions = {},
): Promise<AutomationRuntimeResult> {
  const event = normalizeEvent(raw)
  const flows = await loadFlows(db, event.organizationId)
  const lead = event.leadId ? await loadLead(db, event.organizationId, event.leadId) : null
  const results: AutomationRuntimeResult['runs'] = []
  const matchedFlowIds: string[] = []

  for (const flow of flows) {
    if (!flow.snapshot.triggers.some((trigger) => matchesTrigger(trigger, event))) {
      results.push({ flowId: flow.id, status: 'skipped', reason: 'trigger_not_matched' })
      continue
    }

    const context = buildConditionContext(event, lead)
    if (!evaluateConditions(flow.snapshot, context)) {
      results.push({ flowId: flow.id, status: 'skipped', reason: 'conditions_not_matched' })
      continue
    }

    if (event.automationTrace.includes(flow.id)) {
      results.push({ flowId: flow.id, status: 'skipped', reason: 'automation_loop_prevented' })
      continue
    }
    if (event.depth >= (options.maxDepth ?? 12)) {
      results.push({ flowId: flow.id, status: 'skipped', reason: 'domain_event_max_depth_reached' })
      continue
    }

    const usage = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS count
       FROM public.automation_execution_runs
       WHERE flow_id = $1 AND created_at >= CURRENT_DATE`,
      [flow.id],
    )
    if (flow.dailyRunLimit > 0 && Number(usage.rows[0]?.count ?? 0) >= flow.dailyRunLimit) {
      results.push({ flowId: flow.id, status: 'skipped', reason: 'daily_limit_reached' })
      continue
    }

    if (!flow.allowReentry && flow.reentryCooldownMinutes > 0) {
      const recent = await db.query<{ id: string }>(
        `SELECT id
         FROM public.automation_execution_runs
         WHERE flow_id = $1 AND correlation_id = $2
           AND created_at >= NOW() - ($3::int * INTERVAL '1 minute')
         LIMIT 1`,
        [flow.id, event.correlationId, flow.reentryCooldownMinutes],
      )
      if (recent.rows[0]) {
        results.push({ flowId: flow.id, status: 'skipped', reason: 'reentry_cooldown' })
        continue
      }
    }

    const run = await db.query<{ id: string }>(
      `INSERT INTO public.automation_execution_runs (
         organization_id, flow_id, flow_version_id, event_id, event_type, lead_id,
         status, event_payload, correlation_id, automation_trace, started_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, 'queued', $7::jsonb, $8, $9::uuid[], NOW())
       ON CONFLICT (flow_id, event_id) DO NOTHING
       RETURNING id`,
      [
        flow.organizationId,
        flow.id,
        flow.flowVersionId ?? null,
        event.eventId,
        event.eventType,
        event.leadId ?? null,
        JSON.stringify(event),
        event.correlationId,
        [...event.automationTrace, flow.id],
      ],
    )
    const runId = run.rows[0]?.id
    if (!runId) {
      const existing = await db.query<{ id: string; status: string }>(
        `SELECT id, status FROM public.automation_execution_runs WHERE flow_id = $1 AND event_id = $2 LIMIT 1`,
        [flow.id, event.eventId],
      )
      results.push({ flowId: flow.id, runId: existing.rows[0]?.id, status: 'skipped', reason: 'duplicate_event' })
      continue
    }

    matchedFlowIds.push(flow.id)
    const runContext: RunContext = { runId, event, flow, actions: flow.snapshot.actions, lead }
    if (options.queue) {
      await options.queue.add('automation.executeRun', { runId, eventId: event.eventId, flowId: flow.id }, { jobId: `automation-run:${runId}` })
      results.push({ flowId: flow.id, runId, status: 'queued' })
    } else {
      const result = await executeAutomationRun(db, runContext, options)
      results.push({ flowId: flow.id, runId, status: result.status, reason: result.reason })
    }
  }

  return { eventId: event.eventId, eventType: event.eventType, organizationId: event.organizationId, matchedFlowIds, runs: results, results }
}

export async function executeAutomationRun(
  db: RuntimeDb,
  input: { runId: string; eventId?: string; flowId?: string; event?: DomainEventEnvelope; flow?: RuntimeFlow; actions?: AutomationAction[]; lead?: AutomationLead | null },
  options: AutomationRuntimeOptions = {},
): Promise<{ status: 'completed' | 'failed'; reason?: string }> {
  const context = await resolveRunContext(db, input)
  await db.query(`UPDATE public.automation_execution_runs SET status = 'processing', started_at = NOW() WHERE id = $1`, [context.runId])
  const services = options.commandServices ?? createDefaultAutomationCommandServices(db, options.env)

  try {
    for (let index = 0; index < context.actions.length; index += 1) {
      const action = context.actions[index]
      const effectKey = `${context.runId}:${action.id ?? index}`
      const effect = await db.query<{ id: string; status: string; result: Record<string, unknown> }>(
        `INSERT INTO public.automation_action_effects (run_id, action_id, idempotency_key, status)
         VALUES ($1, $2, $3, 'processing')
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id, status, result`,
        [context.runId, action.id ?? null, effectKey],
      )
      if (!effect.rows[0]) {
        const previous = await db.query<{ status: string; result: Record<string, unknown> }>(
          `SELECT status, result FROM public.automation_action_effects WHERE idempotency_key = $1 LIMIT 1`,
          [effectKey],
        )
        if (previous.rows[0]?.status === 'completed') {
          await emitActionEvent(db, context, action.actionType, previous.rows[0].result ?? {}, effectKey)
          continue
        }
      }

      const step = await db.query<{ id: string }>(
        `INSERT INTO public.automation_execution_steps (run_id, action_id, action_type, status, sanitized_payload, started_at)
         VALUES ($1, $2, $3, 'processing', $4::jsonb, NOW()) RETURNING id`,
        [context.runId, action.id ?? null, action.actionType, JSON.stringify(sanitize(action.payload))],
      )
      const commandContext = buildCommandContext(context)
      const result = await executeAutomationAction({
        pool: db as any,
        env: options.env,
        services,
        actionType: action.actionType,
        payload: action.payload,
        context: commandContext,
        lead: context.lead,
        event: context.event,
      })

      await emitActionEvent(db, context, action.actionType, result, effectKey)
      await db.query(
        `UPDATE public.automation_execution_steps
         SET status = 'completed', sanitized_result = $2::jsonb, completed_at = NOW()
         WHERE id = $1`,
        [step.rows[0]?.id ?? null, JSON.stringify(sanitize(result))],
      )
      await db.query(
        `UPDATE public.automation_action_effects
         SET status = 'completed', result = $2::jsonb, updated_at = NOW()
         WHERE idempotency_key = $1`,
        [effectKey, JSON.stringify(sanitize(result))],
      )
    }

    await db.query(`UPDATE public.automation_execution_runs SET status = 'completed', completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [context.runId])
    return { status: 'completed' }
  } catch (error) {
    const reason = safeError(error)
    await db.query(`UPDATE public.automation_execution_runs SET status = 'failed', last_error = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $1`, [context.runId, reason])
    return { status: 'failed', reason }
  }
}

export function normalizeEvent(raw: RawAutomationEvent): DomainEventEnvelope {
  const source = isRecord(raw.event) ? raw.event as RawAutomationEvent : raw
  const eventType = source.eventType ?? source.type
  const organizationId = source.organizationId
  const aggregateId = source.aggregateId ?? source.leadId ?? source.eventId
  if (typeof eventType !== 'string' || typeof organizationId !== 'string' || typeof aggregateId !== 'string') throw new Error('automation_event_context_required')
  const eventId = coerceUuid(source.eventId, `event:${eventType}:${organizationId}:${aggregateId}`)
  const leadId = typeof source.leadId === 'string' && isUuid(source.leadId) ? source.leadId : undefined
  const normalizedAggregateId = isUuid(aggregateId) ? aggregateId : eventId
  const correlationId = coerceUuid(source.correlationId, eventId)
  const causationId = source.causationId ? coerceUuid(source.causationId, `${eventId}:causation`) : undefined
  return createDomainEventEnvelope({
    eventId,
    eventType,
    organizationId,
    crmInstanceId: source.crmInstanceId,
    aggregateType: source.aggregateType === 'email' ? 'email' : 'lead',
    aggregateId: normalizedAggregateId,
    leadId,
    correlationId,
    causationId,
    depth: source.depth,
    actor: isRecord(source.actor) ? source.actor as DomainEventEnvelope['actor'] : { type: 'system' },
    automationTrace: source.automationTrace?.filter(isUuid),
    payload: isRecord(source.payload) ? source.payload : {},
  })
}

function coerceUuid(value: unknown, seed: string) {
  if (typeof value === 'string' && isUuid(value)) return value
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  const normalized = hex.join('')
  return `${normalized.slice(0, 8)}-${normalized.slice(8, 12)}-${normalized.slice(12, 16)}-${normalized.slice(16, 20)}-${normalized.slice(20)}`
}

async function resolveRunContext(db: RuntimeDb, input: { runId: string; eventId?: string; flowId?: string; event?: DomainEventEnvelope; flow?: RuntimeFlow; actions?: AutomationAction[]; lead?: AutomationLead | null }): Promise<RunContext> {
  if (input.event && input.flow) return { runId: input.runId, event: input.event, flow: input.flow, actions: input.actions ?? input.flow.snapshot.actions, lead: input.lead ?? null }
  const run = await db.query<any>(
    `SELECT r.id, r.event_id, r.event_payload, f.id AS flow_id, f.organization_id, f.crm_instance_id,
            f.daily_run_limit, f.allow_reentry, f.reentry_cooldown_minutes, r.flow_version_id,
            v.snapshot, r.lead_id
     FROM public.automation_execution_runs r
     JOIN public.automation_flows f ON f.id = r.flow_id
     LEFT JOIN public.automation_flow_versions v ON v.id = r.flow_version_id
     WHERE r.id = $1 LIMIT 1`,
    [input.runId],
  )
  const row = run.rows[0]
  if (!row) throw new Error('automation_run_not_found')
  const event = row.event_payload?.eventId ? normalizeEvent(row.event_payload) : await getDomainEvent(db as any, input.eventId ?? row.event_id)
  const flow = toRuntimeFlow({ ...row, id: row.flow_id, flow_version_id: row.flow_version_id, snapshot: row.snapshot })
  const lead = event.leadId ? await loadLead(db, event.organizationId, event.leadId) : null
  return { runId: row.id, event, flow, actions: flow.snapshot.actions, lead }
}

async function loadFlows(db: RuntimeDb, organizationId: string): Promise<RuntimeFlow[]> {
  const result = await db.query<FlowRow>(
    `SELECT f.id, f.organization_id, f.daily_run_limit, f.allow_reentry, f.reentry_cooldown_minutes,
            v.id AS flow_version_id, v.snapshot,
            t.id AS trigger_id, t.trigger_type, t.config AS trigger_config
     FROM public.automation_flows f
     LEFT JOIN public.automation_flow_versions v
       ON v.id = f.active_version_id AND v.status = 'published'
     LEFT JOIN public.automation_triggers t ON t.flow_id = f.id
     WHERE f.organization_id = $1 AND f.status = 'published' AND f.is_enabled = TRUE
     ORDER BY f.created_at ASC, t.created_at ASC`,
    [organizationId],
  )
  const grouped = new Map<string, FlowRow[]>()
  for (const row of result.rows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row])
  const flows: RuntimeFlow[] = []
  for (const rows of grouped.values()) {
    const first = rows[0]
    let snapshot = parseSnapshot(first.snapshot)
    if (!snapshot) {
      const [conditions, actions] = await Promise.all([
        db.query<any>('SELECT id, field, operator, value, order_index FROM public.automation_conditions WHERE flow_id = $1 ORDER BY order_index ASC, created_at ASC', [first.id]),
        db.query<any>('SELECT id, action_type, order_index, payload FROM public.automation_actions WHERE flow_id = $1 ORDER BY order_index ASC, created_at ASC', [first.id]),
      ])
      snapshot = {
        triggers: rows.filter((row) => row.trigger_type).map((row) => ({ id: row.trigger_id ?? undefined, triggerType: row.trigger_type!, config: row.trigger_config ?? {} })),
        conditions: conditions.rows.map((row) => ({ id: row.id, field: row.field, operator: row.operator, value: row.value, orderIndex: Number(row.order_index ?? 0) })),
        actions: actions.rows.map((row) => ({ id: row.id, actionType: row.action_type, orderIndex: Number(row.order_index ?? 0), payload: row.payload ?? {} })),
      }
    }
    flows.push(toRuntimeFlow({ ...first, snapshot }))
  }
  return flows
}

function toRuntimeFlow(row: any): RuntimeFlow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    crmInstanceId: row.crm_instance_id ?? undefined,
    flowVersionId: row.flow_version_id ?? undefined,
    dailyRunLimit: Number(row.daily_run_limit ?? 500),
    allowReentry: row.allow_reentry === true,
    reentryCooldownMinutes: Number(row.reentry_cooldown_minutes ?? 0),
    snapshot: parseSnapshot(row.snapshot) ?? { triggers: [], conditions: [], actions: [] },
  }
}

function parseSnapshot(value: unknown): AutomationFlowSnapshot | null {
  if (!isRecord(value)) return null
  const triggers = Array.isArray(value.triggers) ? value.triggers : Array.isArray(value.trigger) ? value.trigger : []
  const conditions = Array.isArray(value.conditions) ? value.conditions : []
  const actions = Array.isArray(value.actions) ? value.actions : []
  return {
    triggers: triggers.map((item) => ({ id: stringValue((item as any).id), triggerType: stringValue((item as any).triggerType ?? (item as any).trigger_type ?? (item as any).type), config: isRecord((item as any).config) ? (item as any).config : {} })).filter((item) => item.triggerType) as any,
    conditions: conditions.map((item) => ({ id: stringValue((item as any).id), field: stringValue((item as any).field), operator: stringValue((item as any).operator), value: (item as any).value, orderIndex: Number((item as any).orderIndex ?? (item as any).order_index ?? 0) })).filter((item) => item.field && item.operator) as any,
    actions: actions.map((item) => ({ id: stringValue((item as any).id), actionType: stringValue((item as any).actionType ?? (item as any).action_type ?? (item as any).type), orderIndex: Number((item as any).orderIndex ?? (item as any).order_index ?? 0), payload: isRecord((item as any).payload) ? (item as any).payload : {} })).filter((item) => item.actionType).sort((left, right) => left.orderIndex - right.orderIndex) as any,
  }
}

function matchesTrigger(trigger: AutomationTrigger, event: DomainEventEnvelope) {
  if (trigger.triggerType !== event.eventType && trigger.triggerType !== '*') return false
  const config = trigger.config
  for (const [key, expected] of Object.entries(config)) {
    if (key === 'eventType' || key === 'event_type') continue
    const actual = readPath({ ...event, ...(event.payload ?? {}) }, key)
    if (expected !== undefined && actual !== expected) return false
  }
  return true
}

function evaluateConditions(snapshot: AutomationFlowSnapshot, context: Record<string, unknown>) {
  return snapshot.conditions.every((condition) => {
    const actual = readPath(context, condition.field)
    const expected = condition.value
    if (condition.operator === 'exists') return (actual !== undefined && actual !== null && actual !== '') === Boolean(expected ?? true)
    if (condition.operator === 'equals') return actual === expected
    if (condition.operator === 'not_equals') return actual !== expected
    if (condition.operator === 'contains') return String(actual ?? '').toLowerCase().includes(String(expected ?? '').toLowerCase())
    if (condition.operator === 'greater_than') return Number(actual) > Number(expected)
    if (condition.operator === 'less_than') return Number(actual) < Number(expected)
    return false
  })
}

function buildConditionContext(event: DomainEventEnvelope, lead: AutomationLead | null) {
  return { ...event, ...(event.payload ?? {}), lead: lead ?? undefined }
}

async function loadLead(db: RuntimeDb, organizationId: string, leadId: string): Promise<AutomationLead | null> {
  const result = await db.query<AutomationLead>(
    `SELECT id, organization_id, crm_instance_id, email, name, phone, owner_id, assigned_to, pipeline_id, stage_id, status, score, fit_score, intent_score
     FROM public.leads WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [leadId, organizationId],
  )
  return result.rows[0] ?? null
}

function buildCommandContext(context: RunContext): LeadCommandContext {
  if (!context.event.leadId) throw new Error('automation_lead_required')
  return {
    organizationId: context.event.organizationId,
    crmInstanceId: context.flow.crmInstanceId ?? context.event.crmInstanceId,
    leadId: context.event.leadId,
    idempotencyKey: `${context.runId}`,
    correlationId: context.event.correlationId,
    causationId: context.event.eventId,
    depth: context.event.depth + 1,
    automationTrace: [...context.event.automationTrace, context.flow.id],
    actor: { type: 'system' },
  }
}

async function emitActionEvent(db: RuntimeDb, context: RunContext, actionType: string, result: Record<string, unknown>, effectKey: string) {
  const eventType = actionEventType(actionType)
  if (!eventType || !context.event.leadId) return
  await recordDomainEvent(db as any, {
    eventId: coerceUuid(undefined, `automation-effect:${effectKey}:${eventType}`),
    eventType,
    organizationId: context.event.organizationId,
    crmInstanceId: context.flow.crmInstanceId ?? context.event.crmInstanceId,
    aggregateType: 'lead',
    aggregateId: context.event.leadId,
    leadId: context.event.leadId,
    actor: { type: 'system' },
    parent: context.event,
    payload: { automationRunId: context.runId, actionType, ...result },
  })
}

function actionEventType(actionType: string) {
  if (actionType === 'move_to_pipeline') return 'lead.pipeline_changed'
  if (actionType === 'change_stage') return 'lead.stage_changed'
  if (actionType === 'assign_owner') return 'lead.owner_changed'
  if (actionType === 'create_task') return 'lead.task_created'
  if (actionType === 'register_activity') return 'lead.interaction_recorded'
  if (actionType === 'enroll_sequence' || actionType === 'pause_sequence') return 'lead.sequence_enrolled'
  if (actionType === 'adjust_score') return 'lead.score_changed'
  return null
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, key) => isRecord(current) ? current[key] : undefined, value)
}

function isRecord(value: unknown): value is Record<string, any> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)) }
function stringValue(value: unknown) { return typeof value === 'string' && value.trim() ? value.trim() : '' }
function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!isRecord(value)) return value
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [/token|secret|password|authorization|api[_-]?key/i.test(key) ? [key, '[redacted]'] : [key, sanitize(entry)] ]))
}
function safeError(error: unknown) { return (error instanceof Error ? error.message : String(error)).slice(0, 1000) }
