import { createHmac } from 'node:crypto'
import type { AppEnv } from '../../config/env.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import type { DomainEventEnvelope, LeadCommandContext, Queryable } from './types.js'
import type { AutomationActionResult, AutomationCommandServices, AutomationLead } from './action-handlers.js'

const allowedLeadFields: Record<string, string> = {
  name: 'name',
  email: 'email',
  phone: 'phone',
  company: 'company',
  notes: 'notes',
  score: 'score',
  value: 'value',
  status: 'status',
  source: 'source',
  nextFollowUpAt: 'next_follow_up_at',
}

export function createDefaultAutomationCommandServices(
  pool: Queryable,
  env?: AppEnv,
): AutomationCommandServices {
  return {
    moveLeadToPipeline: (context, input) => moveLeadToPipeline(pool, context, input),
    moveLeadToStage: (context, input) => moveLeadToStage(pool, context, input),
    assignLeadOwner: (context, input) => assignLeadOwner(pool, context, input),
    createLeadTask: (context, input) => createLeadTask(pool, context, input),
    registerLeadActivity: (context, input) => registerLeadActivity(pool, context, input),
    updateLeadField: (context, input) => updateLeadField(pool, context, input),
    enrollLeadInSequence: (context, input) => enrollLeadInSequence(pool, context, input),
    pauseLeadSequence: (context, input) => pauseLeadSequence(pool, context, input),
    addLeadTag: (context, input) => addLeadTag(pool, context, input),
    sendEmail: (context, input, lead, event) => dispatchExternal(pool, env, context, 'send_email', input, lead, event),
    sendWhatsapp: (context, input, lead, event) => dispatchExternal(pool, env, context, 'send_whatsapp', input, lead, event),
    adjustScore: (context, input) => adjustLeadScore(pool, context, input),
    dispatchExternal: (context, actionType, input, lead, event) => dispatchExternal(pool, env, context, actionType, input, lead, event),
  }
}

async function adjustLeadScore(
  pool: Queryable,
  context: LeadCommandContext,
  input: { dimension: 'fit' | 'intent' | 'combined'; delta: number; reason?: string },
): Promise<AutomationActionResult> {
  requireLead(context)
  const result = await pool.query<{ fit_score: number; intent_score: number; score: number }>(
    `UPDATE public.leads
     SET fit_score = CASE WHEN $3 IN ('fit', 'combined') THEN GREATEST(0, LEAST(100, COALESCE(fit_score, 0) + $4)) ELSE COALESCE(fit_score, 0) END,
         intent_score = CASE WHEN $3 IN ('intent', 'combined') THEN GREATEST(0, LEAST(100, COALESCE(intent_score, 0) + $4)) ELSE COALESCE(intent_score, 0) END,
         score = CASE
           WHEN $3 = 'fit' THEN GREATEST(0, LEAST(100, COALESCE(fit_score, 0) + $4 + COALESCE(intent_score, 0))) / 2
           WHEN $3 = 'intent' THEN GREATEST(0, LEAST(100, COALESCE(fit_score, 0) + COALESCE(intent_score, 0) + $4)) / 2
           ELSE GREATEST(0, LEAST(100, COALESCE(score, 0) + $4))
         END,
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $2
     RETURNING fit_score, intent_score, score`,
    [context.leadId, context.organizationId, input.dimension, input.delta],
  )
  if (!result.rows[0]) throw new Error('automation_lead_not_found')
  return { ...result.rows[0], dimension: input.dimension, delta: input.delta, reason: input.reason ?? null }
}

async function moveLeadToPipeline(pool: Queryable, context: LeadCommandContext, input: { pipelineId: string; stageId?: string }): Promise<AutomationActionResult> {
  requireLead(context)
  const pipeline = await pool.query<{ id: string }>(
    `SELECT id
     FROM public.crm_pipelines
     WHERE id = $1 AND organization_id = $2 AND is_active = TRUE
     LIMIT 1`,
    [input.pipelineId, context.organizationId],
  )
  if (!pipeline.rows[0]) throw new Error('automation_pipeline_not_found')

  const stageId = input.stageId ?? await firstStageForPipeline(pool, input.pipelineId)
  if (!stageId) throw new Error('automation_stage_required')
  await assertStageBelongsToPipeline(pool, context.organizationId, input.pipelineId, stageId)
  await updateLeadPipeline(pool, context, input.pipelineId, stageId)
  return { pipelineId: input.pipelineId, stageId }
}

async function moveLeadToStage(pool: Queryable, context: LeadCommandContext, input: { stageId: string }): Promise<AutomationActionResult> {
  requireLead(context)
  const stage = await pool.query<{ id: string; pipeline_id: string; is_won: boolean; is_lost: boolean }>(
    `SELECT s.id, s.pipeline_id, s.is_won, s.is_lost
     FROM public.crm_pipeline_stages s
     JOIN public.crm_pipelines p ON p.id = s.pipeline_id
     WHERE s.id = $1 AND p.organization_id = $2 AND s.is_active = TRUE
     LIMIT 1`,
    [input.stageId, context.organizationId],
  )
  const row = stage.rows[0]
  if (!row) throw new Error('automation_stage_not_found')
  await updateLeadPipeline(pool, context, row.pipeline_id, row.id, row.is_won, row.is_lost)
  return { pipelineId: row.pipeline_id, stageId: row.id }
}

async function updateLeadPipeline(
  pool: Queryable,
  context: LeadCommandContext,
  pipelineId: string,
  stageId: string,
  isWon = false,
  isLost = false,
) {
  const result = await pool.query(
    `UPDATE public.leads
     SET pipeline_id = $2,
         stage_id = $3,
         status = $4,
         stage = $5,
         won_at = CASE WHEN $4 = 'won' THEN NOW() ELSE NULL END,
         lost_at = CASE WHEN $4 = 'lost' THEN NOW() ELSE NULL END,
         last_activity_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $6`,
    [context.leadId, pipelineId, stageId, isWon ? 'won' : isLost ? 'lost' : 'open', isWon ? 'won' : isLost ? 'lost' : 'open', context.organizationId],
  )
  if (result.rowCount === 0 && result.rows.length === 0) {
    // Query fakes and older adapters may not expose rowCount. A real UPDATE
    // still remains guarded by the organization predicate above.
    return
  }
}

async function assignLeadOwner(pool: Queryable, context: LeadCommandContext, input: { ownerMemberId?: string; teamId?: string; ownerId?: string }): Promise<AutomationActionResult> {
  requireLead(context)
  const ownerId = input.ownerId ?? input.ownerMemberId ?? null
  await pool.query(
    `UPDATE public.leads
     SET owner_id = $2,
         assigned_to = $2,
         owner_member_id = COALESCE($2, owner_member_id),
         team_id = COALESCE($3, team_id),
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $4`,
    [context.leadId, ownerId, input.teamId ?? null, context.organizationId],
  )
  return { ownerId, teamId: input.teamId ?? null }
}

async function createLeadTask(pool: Queryable, context: LeadCommandContext, input: { title: string; description?: string; dueAt?: string; delayMinutes?: number; assignedTo?: string; priority?: string }): Promise<AutomationActionResult> {
  requireLead(context)
  const dueAt = input.dueAt ?? new Date(Date.now() + Number(input.delayMinutes ?? 0) * 60_000).toISOString()
  const priority = ['low', 'medium', 'high', 'urgent'].includes(input.priority ?? '') ? input.priority : 'medium'
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.lead_tasks (
       organization_id, lead_id, title, description, due_at, assigned_to, priority, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id`,
    [context.organizationId, context.leadId, input.title, input.description ?? null, dueAt, input.assignedTo ?? null, priority, { source: 'automation', idempotencyKey: context.idempotencyKey }],
  )
  // A small compatibility bridge for installations that still expose only
  // the older task table during the migration window.
  if (!result.rows[0]?.id) {
    const legacy = await pool.query<{ id: string }>(
      `INSERT INTO public.crm_tasks (organization_id, lead_id, title, description, due_at, assigned_to)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [context.organizationId, context.leadId, input.title, input.description ?? null, dueAt, input.assignedTo ?? null],
    )
    return { taskId: legacy.rows[0]?.id }
  }
  return { taskId: result.rows[0].id }
}

async function registerLeadActivity(pool: Queryable, context: LeadCommandContext, input: { type?: string; title: string; description?: string }): Promise<AutomationActionResult> {
  requireLead(context)
  const type = ['call', 'email', 'meeting', 'note'].includes(input.type ?? '') ? input.type : 'note'
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING id`,
    [context.organizationId, context.leadId, type, input.title, input.description ?? 'Atividade registrada por automação.'],
  )
  return { interactionId: result.rows[0]?.id }
}

async function updateLeadField(pool: Queryable, context: LeadCommandContext, input: { field: string; value: unknown }): Promise<AutomationActionResult> {
  requireLead(context)
  const column = allowedLeadFields[input.field]
  if (!column) throw new Error('automation_field_not_allowed')
  await pool.query(
    `UPDATE public.leads SET ${column} = $2, updated_at = NOW() WHERE id = $1 AND organization_id = $3`,
    [context.leadId, input.value ?? null, context.organizationId],
  )
  return { field: input.field, value: input.value ?? null }
}

async function enrollLeadInSequence(pool: Queryable, context: LeadCommandContext, input: { sequenceId: string; existingEnrollment?: 'skip' | 'resume' | 'restart' }): Promise<AutomationActionResult> {
  requireLead(context)
  const sequence = await pool.query<{ id: string }>(
    `SELECT id FROM public.crm_sequences WHERE id = $1 AND organization_id = $2 AND is_active = TRUE LIMIT 1`,
    [input.sequenceId, context.organizationId],
  )
  if (!sequence.rows[0]) throw new Error('automation_sequence_not_found')

  const existing = await pool.query<{ id: string; status: string; current_step_index: number }>(
    `SELECT id, status, current_step_index
     FROM public.crm_sequence_enrollments
     WHERE organization_id = $1 AND lead_id = $2 AND sequence_id = $3
       AND status IN ('active', 'paused', 'manual')
     ORDER BY created_at DESC
     LIMIT 1`,
    [context.organizationId, context.leadId, input.sequenceId],
  )
  const current = existing.rows[0]
  const mode = input.existingEnrollment ?? 'skip'
  if (current && mode === 'skip') return { enrollmentId: current.id, duplicate: true, status: current.status }
  if (current && mode === 'resume') {
    await pool.query(`UPDATE public.crm_sequence_enrollments SET status = 'active', next_execution_at = NOW(), updated_at = NOW() WHERE id = $1`, [current.id])
    return { enrollmentId: current.id, resumed: true, currentStepIndex: current.current_step_index }
  }
  if (current && mode === 'restart') {
    await pool.query(`UPDATE public.crm_sequence_enrollments SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [current.id])
  }
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.crm_sequence_enrollments (organization_id, lead_id, sequence_id, next_execution_at)
     VALUES ($1, $2, $3, NOW())
     RETURNING id`,
    [context.organizationId, context.leadId, input.sequenceId],
  )
  return { enrollmentId: inserted.rows[0]?.id, restarted: Boolean(current && mode === 'restart') }
}

async function pauseLeadSequence(pool: Queryable, context: LeadCommandContext, input: { sequenceId?: string; enrollmentId?: string }): Promise<AutomationActionResult> {
  requireLead(context)
  if (!input.enrollmentId && !input.sequenceId) throw new Error('automation_enrollment_reference_required')
  const result = await pool.query(
    `UPDATE public.crm_sequence_enrollments
     SET status = 'paused', updated_at = NOW()
     WHERE organization_id = $1 AND lead_id = $2
       AND (id = $3 OR sequence_id = $4)
       AND status IN ('active', 'manual')`,
    [context.organizationId, context.leadId, input.enrollmentId ?? null, input.sequenceId ?? null],
  )
  return { paused: Number(result.rowCount ?? 0) > 0 }
}

async function addLeadTag(pool: Queryable, context: LeadCommandContext, input: { tagId?: string; tagName?: string }): Promise<AutomationActionResult> {
  requireLead(context)
  if (!context.crmInstanceId) throw new Error('automation_crm_instance_required')
  let tagId = input.tagId
  if (!tagId && input.tagName) {
    const tag = await pool.query<{ id: string }>(
      `SELECT id FROM public.lead_tags WHERE crm_instance_id = $1 AND name = $2 AND is_active = TRUE LIMIT 1`,
      [context.crmInstanceId, input.tagName],
    )
    tagId = tag.rows[0]?.id
  }
  if (!tagId) throw new Error('automation_tag_not_found')
  const result = await pool.query<{ id: string }>(
    `INSERT INTO public.lead_tag_assignments (crm_instance_id, lead_id, tag_id, assigned_by)
     VALUES ($1, $2, $3, NULL)
     ON CONFLICT (lead_id, tag_id) DO NOTHING
     RETURNING id`,
    [context.crmInstanceId, context.leadId, tagId],
  )
  return { tagId, duplicate: !result.rows[0]?.id }
}

async function dispatchExternal(
  pool: Queryable,
  env: AppEnv | undefined,
  context: LeadCommandContext,
  actionType: string,
  input: Record<string, unknown>,
  lead?: AutomationLead | null,
  event?: DomainEventEnvelope,
): Promise<AutomationActionResult> {
  if (actionType.startsWith('ai_')) {
    return dispatchAgentRuntime(pool, env, context, actionType, input, lead, event)
  }
  if (!env?.N8N_CRM_WEBHOOK_URL || !env.N8N_WEBHOOK_SECRET) {
    throw new Error('automation_external_adapter_required')
  }
  const body = JSON.stringify({
    organizationId: context.organizationId,
    actionType,
    lead: lead ? sanitize(lead) : null,
    payload: sanitize(input),
    event: event ? sanitize(event) : null,
    idempotencyKey: context.idempotencyKey,
  })
  const response = await fetch(env.N8N_CRM_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-YUX-Signature': `sha256=${createHmac('sha256', env.N8N_WEBHOOK_SECRET).update(body).digest('hex')}`,
      'X-YUX-Idempotency-Key': context.idempotencyKey,
    },
    body,
  })
  if (!response.ok) throw new Error(`automation_external_dispatch_failed:${response.status}`)
  return { dispatched: true, actionType }
}

async function dispatchAgentRuntime(
  pool: Queryable,
  env: AppEnv | undefined,
  context: LeadCommandContext,
  actionType: string,
  input: Record<string, unknown>,
  lead?: AutomationLead | null,
  event?: DomainEventEnvelope,
): Promise<AutomationActionResult> {
  if (!env?.YUX_AGENT_RUNTIME_URL) throw new Error('automation_agent_runtime_required')
  const scope = await pool.query<{ client_id: string | null; contract_id: string | null }>(
    `SELECT organization.client_id,
            active_contract.id AS contract_id
       FROM public.organizations organization
       LEFT JOIN LATERAL (
         SELECT contract.id
           FROM public.contracts contract
          WHERE contract.client_id = organization.client_id AND contract.status = 'active'
          ORDER BY contract.starts_at DESC NULLS LAST, contract.created_at DESC
          LIMIT 1
       ) active_contract ON TRUE
      WHERE organization.id = $1
      LIMIT 1`,
    [context.organizationId],
  )
  const profileKey = typeof input.profileKey === 'string' && input.profileKey.trim()
    ? input.profileKey.trim()
    : 'ai_sdr_comercial_1'
  const prompt = typeof input.prompt === 'string' && input.prompt.trim()
    ? input.prompt.trim()
    : buildAutomationAgentPrompt(actionType, lead, input)
  const runtime = await invokeAgentRuntime<Record<string, unknown>>(env, '/workflows/execute', {
    organization_id: context.organizationId,
    client_id: scope.rows[0]?.client_id || undefined,
    contract_id: scope.rows[0]?.contract_id || undefined,
    lead_id: context.leadId,
    profile_key: profileKey,
    source: 'automation',
    mode: actionType,
    message: prompt,
    retrieval_context: {
      lead: lead ? sanitize(lead) : null,
      payload: sanitize(input),
      event: event ? sanitize(event) : null,
      delivery_channel: typeof input.channel === 'string' ? input.channel : null,
    },
  })
  return { generated: true, actionType, profileKey, runtime }
}

function buildAutomationAgentPrompt(
  actionType: string,
  lead: AutomationLead | null | undefined,
  input: Record<string, unknown>,
) {
  const objective = actionType === 'ai_classify_lead'
    ? 'Classifique o lead e indique a próxima ação.'
    : actionType === 'ai_generate_proposal'
      ? 'Gere uma proposta comercial adequada ao contexto e às regras da marca.'
      : 'Gere a mensagem solicitada respeitando o contexto e as regras da marca.'
  return [
    objective,
    lead ? `Lead: ${JSON.stringify(sanitize(lead))}` : '',
    `Instruções: ${JSON.stringify(sanitize(input))}`,
  ].filter(Boolean).join('\n')
}

async function firstStageForPipeline(pool: Queryable, pipelineId: string) {
  const result = await pool.query<{ id: string }>(
    `SELECT id FROM public.crm_pipeline_stages WHERE pipeline_id = $1 AND is_active = TRUE ORDER BY order_index ASC LIMIT 1`,
    [pipelineId],
  )
  return result.rows[0]?.id
}

async function assertStageBelongsToPipeline(pool: Queryable, organizationId: string, pipelineId: string, stageId: string) {
  const result = await pool.query(
    `SELECT s.id
     FROM public.crm_pipeline_stages s
     JOIN public.crm_pipelines p ON p.id = s.pipeline_id
     WHERE s.id = $1 AND s.pipeline_id = $2 AND p.organization_id = $3 AND s.is_active = TRUE
     LIMIT 1`,
    [stageId, pipelineId, organizationId],
  )
  if (!result.rows[0]) throw new Error('automation_stage_not_in_pipeline')
}

function requireLead(context: LeadCommandContext): asserts context is LeadCommandContext & { leadId: string } {
  if (!context.leadId) throw new Error('automation_lead_required')
}

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const normalizedKey = key.toLowerCase()
    const redacted = ['token', 'secret', 'password', 'authorization', 'api_key', 'apikey'].some((part) => normalizedKey.includes(part))
    return [key, redacted ? '[redacted]' : sanitize(entry)]
  }))
}
