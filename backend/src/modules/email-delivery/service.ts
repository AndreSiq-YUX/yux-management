import { createHash } from 'node:crypto'
import type pg from 'pg'
import { sendConfiguredSmtp2GoEmail } from '../../email/smtp2goConfigured.js'

type Queryable = Pick<pg.Pool, 'query'>

export type EmailDeliveryRequest = {
  id: string
  organizationId: string
  leadId: string | null
  templateId: string | null
  templateVersionId: string | null
  emailKind: 'transactional' | 'operational' | 'marketing'
  recipientEmail: string
  recipientOptIn: boolean
  subject: string
  bodyHtml: string
  bodyText: string
  renderedVariables: Record<string, unknown>
  status: string
  providerMessageId: string | null
  idempotencyKey: string
  metadata: Record<string, unknown>
}

export type QueueEmailInput = {
  organizationId: string
  leadId: string | null
  templateId?: string | null
  templateVersionId?: string | null
  emailKind: 'transactional' | 'operational' | 'marketing'
  recipientEmail: string
  recipientOptIn: boolean
  subject: string
  bodyHtml: string
  bodyText: string
  renderedVariables?: Record<string, unknown>
  idempotencyKey: string
  sourceEntityType?: string
  moduleKey?: string
  sourceEntityId?: string | null
  metadata?: Record<string, unknown>
  correlationId?: string
  causationId?: string | null
  depth?: number
  automationTrace?: string[]
}

export type EmailDeliveryResult =
  | { success: true; requestId: string; providerMessageId?: string; duplicate?: boolean; status: string }
  | { success: false; requestId: string; status: string; reason: string; error?: string }

const EVENT_SCHEMA_VERSION = 1
const MAX_EVENT_DEPTH = 12

export async function queueEmailRequest(db: Queryable, input: QueueEmailInput) {
  const recipientEmail = input.recipientEmail.trim().toLowerCase()
  if (!recipientEmail) throw new Error('recipient_email_required')
  if (input.emailKind === 'marketing' && input.recipientOptIn !== true) throw new Error('recipient_not_opted_in')
  if (!input.subject.trim()) throw new Error('email_subject_required')
  if (!input.bodyHtml.trim() && !input.bodyText.trim()) throw new Error('email_body_required')

  const result = await db.query<EmailDeliveryRequestRow>(
    `INSERT INTO public.email_send_requests (
       organization_id, lead_id, template_id, template_version_id, email_kind,
       module_key, recipient_email, recipient_opt_in, subject, body_html, body_text,
       rendered_variables, sender_scope, source_entity_type, source_entity_id,
       status, idempotency_key, metadata
     )
     VALUES ($1, $2, $3, $4, $5, $16, $6, $7, $8, $9, $10, $11::jsonb,
             'organization', $12, $13, 'queued', $14, $15::jsonb)
     ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
     RETURNING id, organization_id, lead_id, template_id, template_version_id,
               email_kind, recipient_email, recipient_opt_in, subject, body_html,
               body_text, rendered_variables, status, provider_message_id,
               idempotency_key, metadata`,
    [
      input.organizationId,
      input.leadId,
      input.templateId ?? null,
      input.templateVersionId ?? null,
      input.emailKind,
      recipientEmail,
      input.recipientOptIn,
      input.subject.trim(),
      input.bodyHtml.trim() || null,
      input.bodyText.trim() || null,
      JSON.stringify(input.renderedVariables ?? {}),
      input.sourceEntityType ?? 'crm_sequence_execution',
      input.sourceEntityId ?? null,
      input.idempotencyKey,
      JSON.stringify(input.metadata ?? {}),
      input.moduleKey ?? 'crm_sequence',
    ],
  )

  const row = result.rows[0]
  if (!row) throw new Error('email_send_request_not_created')
  const request = mapEmailDeliveryRequest(row)
  await recordEmailDomainEvent(db, {
    eventType: 'email.queued',
    request,
    payload: {
      requestId: request.id,
      leadId: request.leadId,
      templateId: request.templateId,
      templateVersionId: request.templateVersionId,
      emailKind: request.emailKind,
      sourceEntityType: input.sourceEntityType ?? 'crm_sequence_execution',
    },
    correlationId: input.correlationId ?? request.id,
    causationId: input.causationId,
    depth: input.depth,
    automationTrace: input.automationTrace,
  })
  return request
}

export async function getEmailDeliveryRequest(db: Queryable, requestId: string) {
  const result = await db.query<EmailDeliveryRequestRow>(
    `SELECT id, organization_id, lead_id, template_id, template_version_id,
            email_kind, recipient_email, recipient_opt_in, subject, body_html,
            body_text, rendered_variables, status, provider_message_id,
            idempotency_key, metadata
     FROM public.email_send_requests
     WHERE id = $1
     LIMIT 1`,
    [requestId],
  )
  return result.rows[0] ? mapEmailDeliveryRequest(result.rows[0]) : null
}

export async function sendEmailRequest(
  pool: Pick<pg.Pool, 'query'>,
  requestId: string,
  keyMaterial: string,
  send = sendConfiguredSmtp2GoEmail,
): Promise<EmailDeliveryResult> {
  const claim = await pool.query<EmailDeliveryRequestRow>(
    `UPDATE public.email_send_requests
     SET status = 'sending', protected_error = NULL, updated_at = NOW()
     WHERE id = $1 AND status IN ('queued', 'failed')
     RETURNING id, organization_id, lead_id, template_id, template_version_id,
               email_kind, recipient_email, recipient_opt_in, subject, body_html,
               body_text, rendered_variables, status, provider_message_id,
               idempotency_key, metadata`,
    [requestId],
  )

  if (!claim.rows[0]) {
    const existing = await getEmailDeliveryRequest(pool, requestId)
    if (!existing) throw new Error('email_send_request_not_found')
    if (existing.status === 'sent' || existing.status === 'delivered') {
      return { success: true, requestId, status: existing.status, duplicate: true, providerMessageId: existing.providerMessageId ?? undefined }
    }
    if (existing.status === 'sending') return { success: true, requestId, status: existing.status, duplicate: true }
    return { success: false, requestId, status: existing.status, reason: 'email_request_not_sendable' }
  }

  const request = mapEmailDeliveryRequest(claim.rows[0])
  const providerInput: Parameters<typeof sendConfiguredSmtp2GoEmail>[2] = {
    organizationId: request.organizationId,
    to: request.recipientEmail,
    subject: request.subject,
    textBody: request.bodyText || stripHtml(request.bodyHtml),
    htmlBody: request.bodyHtml || `<p>${escapeHtml(request.bodyText)}</p>`,
    emailCategory: request.emailKind,
    recipientOptIn: request.recipientOptIn,
    customHeaders: [{ header: 'X-YUX-Send-Request-ID', value: request.id }],
  }

  let providerResult: Awaited<ReturnType<typeof sendConfiguredSmtp2GoEmail>>
  try {
    providerResult = await send(pool as pg.Pool, keyMaterial, providerInput)
  } catch (error) {
    providerResult = {
      sent: false,
      reason: 'smtp2go_request_failed',
      error: error instanceof Error ? error.message : 'smtp2go_request_failed',
    }
  }

  if (providerResult.sent) {
    await pool.query(
      `UPDATE public.email_send_requests
       SET status = 'sent', provider_message_id = COALESCE($2, provider_message_id),
           protected_error = NULL, updated_at = NOW()
       WHERE id = $1`,
      [request.id, providerResult.providerMessageId ?? null],
    )
    await recordEmailSendEvent(pool, request, 'sent', providerResult.providerMessageId ?? null, { status: 'sent' })
    await recordEmailDomainEvent(pool, {
      eventType: 'email.sent',
      request,
      payload: {
        requestId: request.id,
        leadId: request.leadId,
        providerMessageId: providerResult.providerMessageId ?? null,
      },
      correlationId: correlationFromRequest(request),
    })
    if (typeof request.metadata.prospectingPlanId === 'string') {
      await pool.query(
        `INSERT INTO public.radar_outreach_events (
           organization_id, opportunity_id, lead_id, channel, event_type, notes
         )
         SELECT organization_id, radar_opportunity_id, lead_id, 'email', 'contact_sent', $2
         FROM public.prospecting_plans WHERE id = $1`,
        [request.metadata.prospectingPlanId, `email_request:${request.id}`],
      )
    }
    return { success: true, requestId: request.id, status: 'sent', providerMessageId: providerResult.providerMessageId }
  }

  const errorMessage = providerResult.error || providerResult.reason
  await pool.query(
    `UPDATE public.email_send_requests
     SET status = 'failed', protected_error = $2, updated_at = NOW()
     WHERE id = $1`,
    [request.id, errorMessage],
  )
  await recordEmailSendEvent(pool, request, 'failed', null, { reason: providerResult.reason })
  await recordEmailDomainEvent(pool, {
    eventType: 'email.failed',
    request,
    payload: { requestId: request.id, leadId: request.leadId, reason: providerResult.reason },
    correlationId: correlationFromRequest(request),
  })
  return { success: false, requestId: request.id, status: 'failed', reason: providerResult.reason, error: errorMessage }
}

export async function recordEmailSendEvent(
  db: Queryable,
  request: Pick<EmailDeliveryRequest, 'id'>,
  eventType: string,
  providerEventId: string | null,
  providerPayload: Record<string, unknown>,
  occurredAt = new Date(),
) {
  const identity = providerEventId ?? `yux:${request.id}:${eventType}`
  const result = await db.query<{ id: string }>(
    `INSERT INTO public.email_send_events (
       request_id, event_type, provider_event_id, provider_payload, occurred_at
     ) VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (provider_event_id) DO NOTHING
     RETURNING id`,
    [request.id, eventType, identity, JSON.stringify(providerPayload), occurredAt.toISOString()],
  )
  return { inserted: Boolean(result.rows[0]), id: result.rows[0]?.id ?? null, providerEventId: identity }
}

export async function recordEmailDomainEvent(
  db: Queryable,
  input: {
    eventType: string
    request: Pick<EmailDeliveryRequest, 'id' | 'organizationId' | 'leadId'>
    payload: Record<string, unknown>
    correlationId: string
    causationId?: string | null
    depth?: number
    automationTrace?: string[]
    occurredAt?: Date
  },
) {
  const depth = input.depth ?? 0
  if (depth > MAX_EVENT_DEPTH) throw new Error('domain_event_max_depth_reached')
  const eventId = deterministicUuid(`${input.eventType}:${input.request.id}:${stablePayload(input.payload)}`)
  const correlationId = asUuid(input.correlationId, `correlation:${input.request.id}`)
  const causationId = input.causationId ? asUuid(input.causationId, `causation:${input.request.id}`) : null
  const automationTrace = (input.automationTrace ?? []).filter((value) => isUuid(value))
  const result = await db.query<{ id: string }>(
    `INSERT INTO public.domain_events (
       id, event_type, schema_version, organization_id, aggregate_type, aggregate_id,
       lead_id, correlation_id, causation_id, depth, actor, automation_trace,
       payload, occurred_at
     ) VALUES ($1, $2, $3, $4, 'email', $5, $6, $7, $8, $9, $10::jsonb, $11::uuid[], $12::jsonb, $13)
     ON CONFLICT (id) DO NOTHING
     RETURNING id`,
    [
      eventId,
      input.eventType,
      EVENT_SCHEMA_VERSION,
      input.request.organizationId,
      input.request.id,
      input.request.leadId,
      correlationId,
      causationId,
      depth,
      JSON.stringify({ type: ['email.delivered', 'email.opened', 'email.clicked', 'email.bounced', 'email.complained', 'email.unsubscribed'].includes(input.eventType) ? 'provider' : 'system' }),
      automationTrace,
      JSON.stringify(sanitizeEventPayload(input.payload)),
      (input.occurredAt ?? new Date()).toISOString(),
    ],
  )
  return { eventId, inserted: Boolean(result.rows[0]) }
}

type EmailDeliveryRequestRow = {
  id: string
  organization_id: string
  lead_id: string | null
  template_id: string | null
  template_version_id: string | null
  email_kind: 'transactional' | 'operational' | 'marketing'
  recipient_email: string
  recipient_opt_in: boolean
  subject: string
  body_html: string | null
  body_text: string | null
  rendered_variables: Record<string, unknown> | null
  status: string
  provider_message_id: string | null
  idempotency_key: string
  metadata: Record<string, unknown> | null
}

function mapEmailDeliveryRequest(row: EmailDeliveryRequestRow): EmailDeliveryRequest {
  return {
    id: row.id,
    organizationId: row.organization_id,
    leadId: row.lead_id,
    templateId: row.template_id,
    templateVersionId: row.template_version_id,
    emailKind: row.email_kind,
    recipientEmail: row.recipient_email,
    recipientOptIn: Boolean(row.recipient_opt_in),
    subject: row.subject,
    bodyHtml: row.body_html ?? '',
    bodyText: row.body_text ?? '',
    renderedVariables: row.rendered_variables ?? {},
    status: row.status,
    providerMessageId: row.provider_message_id,
    idempotencyKey: row.idempotency_key,
    metadata: row.metadata ?? {},
  }
}

function correlationFromRequest(request: EmailDeliveryRequest) {
  const candidate = typeof request.metadata.correlationId === 'string' ? request.metadata.correlationId : request.id
  return candidate
}

function sanitizeEventPayload(payload: Record<string, unknown>) {
  const output: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(payload)) {
    if (/token|secret|password|body|html/i.test(key)) continue
    if (typeof value === 'string') output[key] = value.slice(0, 2_000)
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) output[key] = value
  }
  return output
}

function stablePayload(payload: Record<string, unknown>) {
  return JSON.stringify(Object.entries(payload).sort(([left], [right]) => left.localeCompare(right)))
}

function deterministicUuid(seed: string) {
  const hex = createHash('sha256').update(seed).digest('hex').slice(0, 32).split('')
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

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character] ?? character))
}
