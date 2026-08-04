import { createHmac } from 'node:crypto'
import type pg from 'pg'
import { queueEmailRequest, sendEmailRequest } from '../email-delivery/service.js'
import { resolveProspectingEligibility } from '../prospecting/repository.js'

export type CrmSequenceSchedulerOptions = {
  now?: Date
  limit?: number
  crmWebhookUrl?: string
  crmWebhookSecret?: string
  fetchImpl?: typeof fetch
  emailKeyMaterial?: string
  emailJobQueue?: {
    add(name: 'email.send', data: Record<string, unknown>): Promise<unknown>
  }
  whatsappJobQueue?: {
    add(name: 'omnichannel.dispatchOutbound', data: Record<string, unknown>): Promise<unknown>
  }
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
  metadata: Record<string, unknown>
}

type EnrollmentDatabaseRow = {
  id: string
  organization_id: string
  sequence_id: string
  lead_id: string
  status: string
  current_step_index: number
  next_execution_at: string | null
  manual_note: string | null
}

export type SequenceEnrollmentMode = 'skip' | 'resume' | 'restart'

export type EnrollLeadInSequenceInput = {
  organizationId: string
  leadId: string
  sequenceId: string
  existingEnrollment: SequenceEnrollmentMode
  now?: Date
  correlationId?: string
  causationId?: string
  depth?: number
  automationTrace?: string[]
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
       SELECT e.id AS enrollment_id, e.organization_id, e.lead_id, e.sequence_id, e.current_step_index, e.next_execution_at, e.manual_note
       FROM public.crm_sequence_enrollments e
       WHERE e.status = 'active'
         AND e.next_execution_at IS NOT NULL
         AND e.next_execution_at <= $1
         AND NOT EXISTS (
           SELECT 1
           FROM public.automation_executions x
           WHERE x.enrollment_id = e.id
             AND x.status IN ('pending', 'processing', 'failed', 'completed')
             AND x.step_id = (
               SELECT s.id FROM public.crm_sequence_steps s
               WHERE s.sequence_id = e.sequence_id
                 AND s.is_active = TRUE
                 AND s.order_index >= e.current_step_index
               ORDER BY s.order_index ASC
               LIMIT 1
             )
         )
       ORDER BY e.next_execution_at ASC
       LIMIT $2
     ),
     next_steps AS (
       SELECT due.*, s.id AS step_id, s.action_type, s.subject, s.body, s.order_index, s.metadata
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
       jsonb_build_object(
         'subject', subject,
         'body', body,
         'prospectingPlanId', CASE WHEN manual_note LIKE 'prospecting-plan:%' THEN split_part(manual_note, ':', 2) ELSE NULL END
       ) || COALESCE(metadata, '{}'::jsonb), next_execution_at
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
     WHERE status IN ('pending', 'failed') AND scheduled_at <= $1
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
  let emailRequestId: string | null = null
  let whatsappMessageId: string | null = null
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
    if (execution.status === 'processing') {
      await client.query('COMMIT')
      return { success: true, duplicate: true, inProgress: true }
    }

    await client.query(
      `UPDATE public.automation_executions
       SET status = 'processing', attempt_count = attempt_count + 1, last_error = NULL
       WHERE id = $1`,
      [executionId],
    )

    await enforceProspectingExecutionPolicy(client, execution)
    const actionResult = await executeSequenceAction(client, execution, options)
    emailRequestId = actionResult?.emailRequestId ?? null
    whatsappMessageId = actionResult?.whatsappMessageId ?? null
    if (textValue(execution.payload.prospectingPlanId) && (emailRequestId || whatsappMessageId)) {
      await client.query(
        `INSERT INTO public.radar_outreach_events (
           organization_id, opportunity_id, lead_id, channel, event_type, notes
         )
         SELECT plan.organization_id, plan.radar_opportunity_id, plan.lead_id, $2, 'contact_queued', $3
         FROM public.prospecting_plans plan WHERE plan.id = $1`,
        [textValue(execution.payload.prospectingPlanId), execution.action_type, `execution:${execution.id}`],
      )
    }
    await client.query(
      `UPDATE public.automation_executions
       SET status = 'completed', completed_at = $2
       WHERE id = $1`,
      [executionId, (options.now ?? new Date()).toISOString()],
    )
    await enqueueNextStep(client, execution, options.now ?? new Date())

    if (emailRequestId && options.emailJobQueue) {
      await options.emailJobQueue.add('email.send', { requestId: emailRequestId })
    }
    if (whatsappMessageId && options.whatsappJobQueue) {
      await options.whatsappJobQueue.add('omnichannel.dispatchOutbound', { messageId: whatsappMessageId })
    }
    await client.query('COMMIT')

    if (emailRequestId && !options.emailJobQueue) {
      const keyMaterial = options.emailKeyMaterial ?? process.env.SESSION_SECRET
      if (keyMaterial) await sendEmailRequest(pool, emailRequestId, keyMaterial)
    }
    return { success: true, emailRequestId, whatsappMessageId }
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

async function executeSequenceAction(
  client: pg.PoolClient,
  execution: ExecutionRow & { lead_name: string | null; lead_email: string | null; lead_phone: string | null },
  options: CrmSequenceSchedulerOptions,
) {
  if (execution.action_type === 'internal_task') {
    await client.query(
      `INSERT INTO public.lead_tasks (
         organization_id, lead_id, title, description, due_at, metadata
       )
       SELECT $1, $2, $3, $4, $5, $6::jsonb
       WHERE NOT EXISTS (
         SELECT 1 FROM public.lead_tasks
         WHERE lead_id = $2 AND metadata->>'executionId' = $7
       )`,
      [
        execution.organization_id,
        execution.lead_id,
        textValue(execution.payload.subject) || 'Follow-up comercial',
        textValue(execution.payload.body) || null,
        (options.now ?? new Date()).toISOString(),
        JSON.stringify({ source: 'crm_sequence_scheduler', executionId: execution.id, enrollmentId: execution.enrollment_id }),
        execution.id,
      ],
    )
    return undefined
  }

  if (execution.action_type === 'email') {
    const payload = execution.payload
    const template = await resolveEmailTemplate(client, execution.organization_id, payload)
    const bodyText = textValue(payload.textBody) || textValue(payload.body) || template?.bodyText || ''
    const bodyHtml = textValue(payload.htmlBody) || template?.bodyHtml || (bodyText ? `<p>${escapeHtml(bodyText)}</p>` : '')
    const subject = textValue(payload.subject) || template?.subject || ''
    const emailKind = emailKindValue(payload.emailKind || template?.emailKind)
    const request = await queueEmailRequest(client, {
      organizationId: execution.organization_id,
      leadId: execution.lead_id,
      templateId: template?.templateId ?? textValue(payload.templateId) ?? null,
      templateVersionId: template?.templateVersionId ?? textValue(payload.templateVersionId) ?? null,
      emailKind,
      recipientEmail: execution.lead_email || textValue(payload.recipientEmail) || '',
      recipientOptIn: payload.recipientOptIn === true,
      subject,
      bodyHtml,
      bodyText,
      renderedVariables: recordValue(payload.variables),
      idempotencyKey: `${execution.id}:email`,
      sourceEntityType: 'crm_sequence_execution',
      sourceEntityId: execution.id,
      metadata: {
        executionId: execution.id,
        enrollmentId: execution.enrollment_id,
        correlationId: textValue(payload.correlationId) || execution.id,
        unsubscribeUrl: textValue(payload.unsubscribeUrl) || null,
        prospectingPlanId: textValue(payload.prospectingPlanId) || null,
      },
      correlationId: textValue(payload.correlationId) || execution.id,
      causationId: textValue(payload.causationId),
      depth: typeof payload.depth === 'number' ? payload.depth : 0,
      automationTrace: Array.isArray(payload.automationTrace)
        ? payload.automationTrace.filter((value): value is string => typeof value === 'string')
        : [],
    })
    return { emailRequestId: request.id }
  }

  if (execution.action_type === 'whatsapp') {
    if (!execution.lead_phone) throw new Error('whatsapp_recipient_phone_required')
    const payload = execution.payload
    const connection = await client.query<{ id: string }>(
      `SELECT id FROM public.channel_connections
       WHERE organization_id = $1 AND channel = 'whatsapp' AND is_active = TRUE
         AND ($2::uuid IS NULL OR id = $2)
       ORDER BY updated_at DESC LIMIT 1`,
      [execution.organization_id, textValue(payload.connectionId) || null],
    )
    if (!connection.rows[0]) throw new Error('whatsapp_connection_required')
    const existingContact = await client.query<{ id: string }>(
      `SELECT id FROM public.omnichannel_contacts
       WHERE organization_id = $1 AND (lead_id = $2 OR phone = $3)
       ORDER BY updated_at DESC LIMIT 1`,
      [execution.organization_id, execution.lead_id, execution.lead_phone],
    )
    const contactId = existingContact.rows[0]?.id || (await client.query<{ id: string }>(
      `INSERT INTO public.omnichannel_contacts (organization_id, display_name, phone, lead_id, external_identities)
       VALUES ($1,$2,$3,$4,jsonb_build_object('source','crm_sequence'))
       RETURNING id`,
      [execution.organization_id, execution.lead_name || execution.lead_phone, execution.lead_phone, execution.lead_id],
    )).rows[0]?.id
    if (!contactId) throw new Error('whatsapp_contact_required')
    const conversation = await client.query<{ id: string }>(
      `SELECT id FROM public.conversations
       WHERE organization_id = $1 AND contact_id = $2 AND connection_id = $3 AND status <> 'resolved'
       ORDER BY updated_at DESC LIMIT 1`,
      [execution.organization_id, contactId, connection.rows[0].id],
    )
    const conversationId = conversation.rows[0]?.id || (await client.query<{ id: string }>(
      `INSERT INTO public.conversations (
         organization_id, contact_id, connection_id, channel, status, response_mode, lead_id, last_message_at
       ) VALUES ($1,$2,$3,'whatsapp','open','assisted',$4,NOW()) RETURNING id`,
      [execution.organization_id, contactId, connection.rows[0].id, execution.lead_id],
    )).rows[0]?.id
    if (!conversationId) throw new Error('whatsapp_conversation_required')
    const templateName = textValue(payload.templateName)
    const message = await client.query<{ id: string }>(
      `INSERT INTO public.messages (
         conversation_id, connection_id, direction, author_type, content_type, body, delivery_status, metadata
       ) VALUES ($1,$2,'outbound','system',$3,$4,'queued',$5::jsonb)
       RETURNING id`,
      [
        conversationId,
        connection.rows[0].id,
        templateName ? 'template' : 'text',
        textValue(payload.body) || '',
        JSON.stringify({
          source: 'crm_sequence', executionId: execution.id, enrollmentId: execution.enrollment_id,
          prospectingPlanId: textValue(payload.prospectingPlanId) || undefined,
          approvalStatus: 'approved', templateName: templateName || undefined,
          languageCode: textValue(payload.languageCode) || 'pt_BR',
          components: Array.isArray(payload.components) ? payload.components : undefined,
        }),
      ],
    )
    return { whatsappMessageId: message.rows[0]?.id ?? null }
  }

  // Unknown legacy actions remain on the signed adapter during migration.
  const webhookUrl = options.crmWebhookUrl ?? process.env.N8N_CRM_WEBHOOK_URL
  if (!webhookUrl) throw new Error('N8N_CRM_WEBHOOK_URL is not configured')
  const webhookSecret = options.crmWebhookSecret ?? process.env.N8N_WEBHOOK_SECRET
  if (!webhookSecret) throw new Error('N8N_WEBHOOK_SECRET is not configured')

  const body = JSON.stringify({
    executionId: execution.id,
    actionType: execution.action_type,
    lead: { id: execution.lead_id, name: execution.lead_name, email: execution.lead_email, phone: execution.lead_phone },
    payload: execution.payload,
  })
  const response = await (options.fetchImpl ?? fetch)(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-YUX-Signature': `sha256=${createHmac('sha256', webhookSecret).update(body).digest('hex')}`,
    },
    body,
  })
  if (!response.ok) throw new Error(`CRM webhook returned ${response.status}`)
  return undefined
}

async function resolveEmailTemplate(client: pg.PoolClient, organizationId: string, payload: Record<string, unknown>) {
  const templateId = textValue(payload.templateId)
  if (!templateId) return null
  const result = await client.query<{
    id: string
    published_version_id: string | null
    template_organization_id: string | null
    email_kind: string
    subject: string
    body_html: string
    body_text: string | null
    version_id: string | null
  }>(
    `SELECT t.id, t.published_version_id, t.organization_id AS template_organization_id,
            t.email_kind, COALESCE(v.subject, t.subject) AS subject,
            COALESCE(v.body_html, t.body_html) AS body_html,
            COALESCE(v.body_text, t.body_text) AS body_text, v.id AS version_id
     FROM public.email_templates t
     LEFT JOIN public.email_template_versions v ON v.id = t.published_version_id
     WHERE t.id = $1 AND t.status = 'published'
       AND (t.organization_id = $2 OR t.organization_id IS NULL)
     LIMIT 1`,
    [templateId, organizationId],
  )
  const row = result.rows[0]
  if (!row || !row.published_version_id || !row.version_id) throw new Error('published_email_template_required')
  return {
    templateId: row.id,
    templateVersionId: row.version_id,
    emailKind: emailKindValue(row.email_kind),
    subject: row.subject,
    bodyHtml: row.body_html,
    bodyText: row.body_text || '',
  }
}

async function enqueueNextStep(client: pg.PoolClient, execution: ExecutionRow, now: Date) {
  if (!execution.enrollment_id || !execution.step_id) return
  const currentStepResult = await client.query<StepRow>(
    `SELECT id, sequence_id, action_type, delay_minutes, subject, body, order_index, is_active, metadata
     FROM public.crm_sequence_steps WHERE id = $1 LIMIT 1`,
    [execution.step_id],
  )
  const currentStep = currentStepResult.rows[0]
  if (!currentStep) return

  const nextStepResult = await client.query<StepRow>(
    `SELECT id, sequence_id, action_type, delay_minutes, subject, body, order_index, is_active, metadata
     FROM public.crm_sequence_steps
     WHERE sequence_id = $1 AND is_active = TRUE AND order_index > $2
     ORDER BY order_index ASC LIMIT 1`,
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
    await recordSequenceDomainEvent(client, {
      eventType: 'lead.sequence_completed',
      organizationId: execution.organization_id,
      leadId: execution.lead_id,
      enrollmentId: execution.enrollment_id,
      payload: { sequenceId: currentStep.sequence_id, executionId: execution.id },
      correlationId: execution.id,
    })
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
     SELECT $1, $2, $3, $4, $5, $6::jsonb, $7
     WHERE NOT EXISTS (
       SELECT 1 FROM public.automation_executions WHERE enrollment_id = $3 AND step_id = $4
     )`,
    [
      execution.organization_id,
      execution.lead_id,
      execution.enrollment_id,
      nextStep.id,
      nextStep.action_type,
      JSON.stringify({
        subject: nextStep.subject,
        body: nextStep.body,
        ...(nextStep.metadata || {}),
        ...(textValue(execution.payload.prospectingPlanId) ? { prospectingPlanId: textValue(execution.payload.prospectingPlanId) } : {}),
      }),
      scheduledAt.toISOString(),
    ],
  )
}

async function enforceProspectingExecutionPolicy(client: pg.PoolClient, execution: ExecutionRow & { lead_email: string | null; lead_phone: string | null }) {
  const planId = textValue(execution.payload.prospectingPlanId)
  if (!planId || (execution.action_type !== 'email' && execution.action_type !== 'whatsapp')) return
  const plan = await client.query<{ organization_id: string; radar_opportunity_id: string; primary_channel: 'email' | 'whatsapp' }>(
    `SELECT organization_id, radar_opportunity_id, primary_channel
     FROM public.prospecting_plans WHERE id = $1 AND status = 'active' LIMIT 1`,
    [planId],
  )
  if (!plan.rows[0]) throw new Error('active_prospecting_plan_required')
  const eligibility = await resolveProspectingEligibility(client, {
    organizationId: plan.rows[0].organization_id,
    leadId: execution.lead_id,
    opportunityId: plan.rows[0].radar_opportunity_id,
    channel: execution.action_type,
    address: execution.action_type === 'email' ? execution.lead_email : execution.lead_phone,
  })
  if (!eligibility.allowed) {
    await client.query(
      `UPDATE public.prospecting_plans SET status = 'blocked', blocked_reasons = $2, updated_at = NOW() WHERE id = $1`,
      [planId, eligibility.blockedReasons],
    )
    throw new Error(eligibility.blockedReasons.join(','))
  }
}

export async function enrollLeadInSequence(pool: pg.Pool, input: EnrollLeadInSequenceInput) {
  const now = input.now ?? new Date()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${input.organizationId}:${input.leadId}:${input.sequenceId}`])
    const sequenceResult = await client.query<{ id: string }>(
      `SELECT id FROM public.crm_sequences
       WHERE id = $1 AND organization_id = $2 AND is_active = TRUE FOR SHARE`,
      [input.sequenceId, input.organizationId],
    )
    if (!sequenceResult.rows[0]) throw Object.assign(new Error('sequence_not_found'), { statusCode: 404 })
    const leadResult = await client.query<{ id: string }>(
      `SELECT id FROM public.leads WHERE id = $1 AND organization_id = $2 FOR SHARE`,
      [input.leadId, input.organizationId],
    )
    if (!leadResult.rows[0]) throw Object.assign(new Error('lead_not_found'), { statusCode: 404 })

    const activeResult = await client.query<EnrollmentDatabaseRow>(
      `SELECT id, organization_id, sequence_id, lead_id, status, current_step_index, next_execution_at, manual_note
       FROM public.crm_sequence_enrollments
       WHERE organization_id = $1 AND lead_id = $2 AND sequence_id = $3
         AND status IN ('active', 'paused', 'manual')
       ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
      [input.organizationId, input.leadId, input.sequenceId],
    )
    const existing = activeResult.rows[0]
    if (existing && input.existingEnrollment === 'skip') {
      await client.query('COMMIT')
      return { enrollmentId: existing.id, duplicate: true, status: existing.status, currentStepIndex: existing.current_step_index }
    }

    let row: EnrollmentDatabaseRow
    let duplicate = false
    if (existing) {
      duplicate = true
      const currentStepIndex = input.existingEnrollment === 'restart' ? 0 : existing.current_step_index
      const result = await client.query<EnrollmentDatabaseRow>(
        `UPDATE public.crm_sequence_enrollments
         SET status = 'active', current_step_index = $2, next_execution_at = $3, updated_at = NOW()
         WHERE id = $1
         RETURNING id, organization_id, sequence_id, lead_id, status, current_step_index, next_execution_at, manual_note`,
        [existing.id, currentStepIndex, now.toISOString()],
      )
      row = result.rows[0]
    } else {
      const result = await client.query<EnrollmentDatabaseRow>(
        `INSERT INTO public.crm_sequence_enrollments (
           organization_id, lead_id, sequence_id, status, current_step_index, next_execution_at
         ) VALUES ($1, $2, $3, 'active', 0, $4)
         RETURNING id, organization_id, sequence_id, lead_id, status, current_step_index, next_execution_at, manual_note`,
        [input.organizationId, input.leadId, input.sequenceId, now.toISOString()],
      )
      row = result.rows[0]
    }
    if (!row) throw new Error('sequence_enrollment_not_created')
    await recordSequenceDomainEvent(client, {
      eventType: 'lead.sequence_enrolled',
      organizationId: row.organization_id,
      leadId: row.lead_id,
      enrollmentId: row.id,
      payload: { sequenceId: row.sequence_id, existingEnrollment: input.existingEnrollment, duplicate },
      correlationId: input.correlationId || row.id,
      causationId: input.causationId,
      depth: input.depth,
      automationTrace: input.automationTrace,
    })
    await client.query('COMMIT')
    return { enrollmentId: row.id, duplicate, status: row.status, currentStepIndex: row.current_step_index }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

async function recordSequenceDomainEvent(
  db: Pick<pg.PoolClient, 'query'>,
  input: {
    eventType: string
    organizationId: string
    leadId: string
    enrollmentId: string | null
    payload: Record<string, unknown>
    correlationId: string
    causationId?: string
    depth?: number
    automationTrace?: string[]
  },
) {
  const depth = input.depth ?? 0
  if (depth > 12) throw new Error('domain_event_max_depth_reached')
  const eventId = deterministicUuid(`${input.eventType}:${input.enrollmentId}:${JSON.stringify(input.payload)}`)
  const correlationId = asUuid(input.correlationId, `sequence-correlation:${input.enrollmentId}`)
  const causationId = input.causationId ? asUuid(input.causationId, `sequence-causation:${input.enrollmentId}`) : null
  const trace = (input.automationTrace ?? []).filter((value) => isUuid(value))
  return db.query(
    `INSERT INTO public.domain_events (
       id, event_type, schema_version, organization_id, aggregate_type, aggregate_id,
       lead_id, correlation_id, causation_id, depth, actor, automation_trace, payload, occurred_at
     ) VALUES ($1, $2, 1, $3, 'sequence_enrollment', $4, $5, $6, $7, $8,
               '{"type":"system"}'::jsonb, $9::uuid[], $10::jsonb, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [eventId, input.eventType, input.organizationId, input.enrollmentId, input.leadId, correlationId, causationId, depth, trace, JSON.stringify(input.payload)],
  )
}

function textValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function emailKindValue(value: unknown): 'transactional' | 'operational' | 'marketing' {
  return value === 'marketing' || value === 'transactional' ? value : 'operational'
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character))
}

function deterministicUuid(seed: string) {
  const hex = createHmac('sha256', 'yux-sequence-event').update(seed).digest('hex').slice(0, 32).split('')
  hex[12] = '5'
  hex[16] = ['8', '9', 'a', 'b'][Number.parseInt(hex[16], 16) % 4]
  const value = hex.join('')
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function asUuid(value: string, fallback: string) {
  return isUuid(value) ? value : deterministicUuid(fallback)
}
