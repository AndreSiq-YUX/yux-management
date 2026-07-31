import type { FastifyInstance } from 'fastify'
import { normalizeWhatsAppInbound, validateWhatsAppSignature } from '../../lib/edge-compat/whatsappProvider.js'
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
    const parsed = z.object({
      organizationId: z.string().uuid(),
      event: z.string().optional(), event_type: z.string().optional(),
      email: z.string().email().optional(), recipient: z.string().email().optional(),
    }).safeParse(payload)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_smtp2go_payload' })
    const event = (parsed.data.event_type || parsed.data.event || '').toLowerCase()
    const reason = event.includes('unsubscribe') ? 'unsubscribe' : event.includes('complaint') || event.includes('spam') ? 'spam' : event.includes('bounce') ? 'bounce' : null
    const email = parsed.data.email || parsed.data.recipient
    if (!reason || !email) return reply.code(200).send({ accepted: true, ignored: 'event_not_suppressible' })
    await app.pg.query(
      `INSERT INTO public.email_suppression_entries (organization_id, email, reason, source)
       VALUES ($1, lower($2), $3, 'smtp2go')
       ON CONFLICT (organization_id, email) DO UPDATE SET reason = EXCLUDED.reason, source = EXCLUDED.source`,
      [parsed.data.organizationId, email, reason],
    )
    return { accepted: true, suppressed: true }
  })
}
