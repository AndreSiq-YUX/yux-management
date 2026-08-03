import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { normalizeWhatsAppInbound, validateWhatsAppSignature } from '../../lib/edge-compat/whatsappProvider.js'
import { recordEmailDomainEvent, recordEmailSendEvent } from '../email-delivery/service.js'
import { z } from 'zod'

function queryString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export async function registerWebhookRoutes(app: FastifyInstance) {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) => {
    done(null, body)
  })

  app.get('/meta/channel-event', {
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const query = request.query as Record<string, unknown>
    if (!app.config.META_WEBHOOK_VERIFY_TOKEN) return reply.code(503).send({ error: 'webhook_not_configured' })
    if (queryString(query['hub.mode']) !== 'subscribe' || queryString(query['hub.verify_token']) !== app.config.META_WEBHOOK_VERIFY_TOKEN) {
      return reply.code(403).send({ error: 'invalid_webhook_verification' })
    }
    return reply.type('text/plain').send(queryString(query['hub.challenge']))
  })

  app.post('/meta/channel-event', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!app.config.META_APP_SECRET) return reply.code(503).send({ error: 'webhook_not_configured' })
    const body = request.body
    if (!Buffer.isBuffer(body)) return reply.code(400).send({ error: 'invalid_webhook_payload' })
    const rawBody = body.toString('utf8')
    const valid = await validateWhatsAppSignature({
      appSecret: app.config.META_APP_SECRET,
      rawBody,
      signatureHeader: Array.isArray(request.headers['x-hub-signature-256'])
        ? request.headers['x-hub-signature-256'][0]
        : request.headers['x-hub-signature-256'],
    })
    if (!valid) return reply.code(401).send({ error: 'invalid_webhook_signature' })

    let payload: unknown
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return reply.code(400).send({ error: 'invalid_webhook_payload' })
    }

    let normalized: ReturnType<typeof normalizeWhatsAppInbound>
    try {
      const provisional = normalizeWhatsAppInbound(payload)
      const connectionResult = await app.pg.query<{ id: string; organization_id: string }>(
        `SELECT id, organization_id FROM public.channel_connections
         WHERE phone_number_id = $1 AND channel = 'whatsapp' LIMIT 1`,
        [provisional.phoneNumberId],
      )
      const connection = connectionResult.rows[0]
      if (!connection) return reply.code(200).send({ accepted: true, ignored: 'unknown_phone_number' })
      normalized = normalizeWhatsAppInbound(payload, { connectionId: connection.id })
      const inserted = await app.pg.query<{ id: string }>(
        `INSERT INTO public.channel_webhook_events (connection_id, external_event_id, event_type, idempotency_key, sanitized_payload)
         VALUES ($1,$2,$3,$4,$5::jsonb)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING id`,
        [connection.id, normalized.externalEventId, normalized.eventType, normalized.idempotencyKey, JSON.stringify(normalized.sanitizedPayload)],
      )
      const event = inserted.rows[0]
      if (!event) return reply.code(200).send({ accepted: true, duplicate: true })
      await app.jobQueue.add('omnichannel.processMessage', {
        eventId: event.id,
        connectionId: connection.id,
        organizationId: connection.organization_id,
        inbound: normalized,
      })
      return reply.code(200).send({ accepted: true })
    } catch (error) {
      request.log.warn(error, 'meta webhook payload ignored')
      return reply.code(200).send({ accepted: true, ignored: 'unsupported_payload' })
    }
  })

  app.post('/smtp2go', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    if (!app.config.SMTP2GO_WEBHOOK_SECRET) return reply.code(503).send({ error: 'webhook_not_configured' })
    const supplied = request.headers['x-yux-webhook-secret']
    if (typeof supplied !== 'string' || supplied !== app.config.SMTP2GO_WEBHOOK_SECRET) return reply.code(401).send({ error: 'invalid_webhook_secret' })
    const raw = request.body
    if (!Buffer.isBuffer(raw)) return reply.code(400).send({ error: 'invalid_smtp2go_payload' })
    let payload: unknown
    try { payload = JSON.parse(raw.toString('utf8')) } catch { return reply.code(400).send({ error: 'invalid_smtp2go_payload' }) }
    const parsed = z.record(z.string(), z.unknown()).safeParse(payload)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_smtp2go_payload' })
    const input = parsed.data
    const organizationId = firstString(input.organizationId, input.organization_id, input.org_id)
    if (!organizationId || !isUuid(organizationId)) return reply.code(400).send({ error: 'invalid_smtp2go_payload' })

    const eventName = firstString(input.event_type, input.event, input.type, input.status).toLowerCase()
    const normalizedEvent = normalizeSmtp2GoEvent(eventName)
    if (!normalizedEvent) return reply.code(200).send({ accepted: true, ignored: 'event_not_supported' })

    const email = firstString(input.email, input.recipient, input.to).toLowerCase()
    const providerMessageId = firstString(input.message_id, input.provider_message_id, input.smtp2go_message_id)
    const providerEventId = firstString(input.event_id, input.provider_event_id, input.id)
      || deterministicProviderEventId(organizationId, normalizedEvent.eventType, providerMessageId, email, input.timestamp)
    const requestReference = firstString(request.headers['x-yux-send-request-id'], input.request_id, input.send_request_id)
    const emailRequest = providerMessageId || requestReference
      ? await findEmailRequest(app.pg, organizationId, providerMessageId, requestReference)
      : null

    if (normalizedEvent.suppressionReason && email) {
      await app.pg.query(
        `INSERT INTO public.email_suppression_entries (organization_id, email, reason, source)
         VALUES ($1, lower($2), $3, 'smtp2go')
         ON CONFLICT (organization_id, email) DO UPDATE SET reason = EXCLUDED.reason, source = EXCLUDED.source`,
        [organizationId, email, normalizedEvent.suppressionReason],
      )
    }

    if (!emailRequest) {
      if (normalizedEvent.suppressionReason && email) return { accepted: true, suppressed: true }
      return { accepted: true, ignored: 'email_request_not_found' }
    }

    const eventRow = await recordEmailSendEvent(
      app.pg,
      { id: emailRequest.id },
      normalizedEvent.eventType,
      providerEventId,
      sanitizeProviderPayload(input),
      parseProviderDate(input.timestamp),
    )
    if (eventRow.inserted) {
      await updateEmailRequestStatus(app.pg, emailRequest.id, normalizedEvent.eventType)
      await recordEmailDomainEvent(app.pg, {
        eventType: normalizedEvent.domainEventType,
        request: emailRequest,
        payload: {
          requestId: emailRequest.id,
          leadId: emailRequest.leadId,
          providerMessageId: providerMessageId || emailRequest.providerMessageId,
          providerEventId,
          url: firstString(input.url, input.click_url, input.link) || undefined,
        },
        correlationId: correlationFromEmailRequest(emailRequest),
      })
    }
    return { accepted: true, duplicate: !eventRow.inserted, event: normalizedEvent.eventType }
  })
}

type EmailRequestReference = { id: string; organizationId: string; leadId: string | null; providerMessageId: string | null; metadata: Record<string, unknown> }

async function findEmailRequest(pool: { query: (...args: any[]) => Promise<any> }, organizationId: string, providerMessageId: string, requestReference: string): Promise<EmailRequestReference | null> {
  const result = await pool.query(
    `SELECT id, organization_id, lead_id, provider_message_id, metadata
     FROM public.email_send_requests
     WHERE organization_id = $1
       AND ($2 = '' OR provider_message_id = $2 OR id::text = $3)
     ORDER BY created_at DESC LIMIT 1`,
    [organizationId, providerMessageId, requestReference],
  )
  const row = result.rows[0]
  return row ? { id: row.id, organizationId: row.organization_id, leadId: row.lead_id ?? null, providerMessageId: row.provider_message_id ?? null, metadata: row.metadata ?? {} } : null
}

async function updateEmailRequestStatus(pool: { query: (...args: any[]) => Promise<any> }, requestId: string, eventType: string) {
  const status = eventType === 'delivered' ? 'delivered' : eventType === 'bounced' || eventType === 'complained' ? 'failed' : null
  if (!status) return
  await pool.query(`UPDATE public.email_send_requests SET status = $2, updated_at = NOW() WHERE id = $1`, [requestId, status])
}

function normalizeSmtp2GoEvent(value: string) {
  if (value.includes('deliver')) return { eventType: 'delivered', domainEventType: 'email.delivered' as const, suppressionReason: null }
  if (value === 'open' || value.includes('open')) return { eventType: 'opened', domainEventType: 'email.opened' as const, suppressionReason: null }
  if (value === 'click' || value.includes('click')) return { eventType: 'clicked', domainEventType: 'email.clicked' as const, suppressionReason: null }
  if (value.includes('bounce') || value.includes('reject')) return { eventType: 'bounced', domainEventType: 'email.bounced' as const, suppressionReason: 'bounce' as const }
  if (value.includes('complaint') || value.includes('spam')) return { eventType: 'complained', domainEventType: 'email.complained' as const, suppressionReason: 'spam' as const }
  if (value.includes('unsubscribe')) return { eventType: 'unsubscribed', domainEventType: 'email.unsubscribed' as const, suppressionReason: 'unsubscribe' as const }
  return null
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (Array.isArray(value)) {
      const nested: string = firstString(value[0])
      if (nested) return nested
    } else if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) }
function deterministicProviderEventId(organizationId: string, eventType: string, messageId: string, email: string, timestamp: unknown) {
  return `smtp2go:${createHash('sha256').update([organizationId, eventType, messageId, email, String(timestamp ?? '')].join('|')).digest('hex')}`
}
function parseProviderDate(value: unknown) { const date = typeof value === 'string' || typeof value === 'number' ? new Date(value) : new Date(); return Number.isNaN(date.getTime()) ? new Date() : date }
function sanitizeProviderPayload(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([key]) => !/body|html|token|secret|password|authorization/i.test(key)).map(([key, value]) => [key, typeof value === 'string' ? value.slice(0, 2_000) : value]))
}
function correlationFromEmailRequest(request: EmailRequestReference) {
  const candidate = request.metadata.correlationId
  return typeof candidate === 'string' && isUuid(candidate) ? candidate : request.id
}
