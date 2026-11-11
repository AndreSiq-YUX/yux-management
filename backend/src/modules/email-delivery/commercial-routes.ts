import type { FastifyInstance, FastifyRequest } from 'fastify'
import type pg from 'pg'
import { z } from 'zod'
import {
  addressSchema, getCommercialSender, requireCommercialSender, requireCurrentLeadRecipient,
  reviewCommercialSender, saveCommercialSender, senderInputSchema,
} from '../../email/commercial-sender.js'
import { assertEmailSendAllowed } from '../../email/delivery-policy.js'
import { withDatabaseTransaction } from '../../db/client.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { ApiError, forbidden } from '../../http/errors.js'
import { requireAdminRole, requireMembership } from '../../http/guards.js'
import { createBullMqJobId } from '../../jobs/queue.js'
import type { DomainEventEnvelope } from '../events/types.js'
import { queueEmailRequest, recordEmailDomainEvent, type QueueEmailInput } from './service.js'
import { contactPolicyInputSchema, getContactPolicy, saveContactPolicy } from '../../email/contact-policy.js'

const organizationParams = z.object({ organizationId: z.string().uuid() })
const requestSchema = z.object({ requestKey: z.string().uuid(), revision: z.string().uuid() }).strict()
const reviewSchema = z.discriminatedUnion('approved', [
  z.object({
    approved: z.literal(true), revision: z.string().uuid(),
    managedAddress: addressSchema.optional(), managedReplyTo: addressSchema.optional(), verified: z.literal(true),
  }).strict(),
  z.object({ approved: z.literal(false), revision: z.string().uuid() }).strict(),
])

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError(400, 'commercial_email_invalid_input')
  return result.data
}

async function canManageSender(request: FastifyRequest, organizationId: string) {
  const ctx = requireMembership(request, organizationId)
  if (ctx.role === 'yux_admin') return true
  const result = await request.server.pg.query(
    "SELECT 1 FROM public.memberships WHERE organization_id = $1 AND user_id = $2 AND role_key = 'client_admin'",
    [organizationId, ctx.userId])
  return Boolean(result.rows[0])
}

export async function registerCommercialEmailRoutes(app: FastifyInstance) {
  app.get('/organizations/:organizationId/sender', async (request) => {
    const { organizationId } = parse(organizationParams, request.params)
    const canManage = await canManageSender(request, organizationId)
    return { canManage, sender: await getCommercialSender(app.pg, organizationId) }
  })

  app.put('/organizations/:organizationId/sender', async (request) => {
    const { organizationId } = parse(organizationParams, request.params)
    if (!await canManageSender(request, organizationId)) throw forbidden()
    const input = parse(senderInputSchema, request.body)
    const sender = await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [organizationId], serviceRole: 'api' },
      () => saveCommercialSender(app.pg, organizationId, input))
    return { canManage: true, sender }
  })

  app.post('/organizations/:organizationId/sender/review', async (request) => {
    const { userId } = requireAdminRole(request)
    const { organizationId } = parse(organizationParams, request.params)
    const input = parse(reviewSchema, request.body)
    return { canManage: true, sender: await reviewCommercialSender(app.pg, organizationId, userId, input) }
  })

  app.post('/organizations/:organizationId/sender/test', async (request, reply) => {
    const { organizationId } = parse(organizationParams, request.params)
    if (!await canManageSender(request, organizationId)) throw forbidden()
    const input = parse(requestSchema, request.body)
    const sender = await requireCommercialSender(app.pg, organizationId, input.revision)
    const result = await enqueueCommercialEmail(app.pg, {
      organizationId, leadId: null, recipientEmail: sender.replyTo, recipientOptIn: false,
      emailKind: 'operational', subject: 'Teste de remetente comercial • YUX Hub',
      bodyText: 'O YUX Hub enviou este teste pelo remetente comercial. Confira o endereço de envio e o endereço de resposta.',
      bodyHtml: '', sourceEntityType: 'commercial_sender_test', moduleKey: 'email',
      idempotencyKey: `commercial-test:${organizationId}:${input.requestKey}`,
      metadata: { senderRevision: input.revision },
    })
    return reply.code(202).send(result)
  })

  app.get('/organizations/:organizationId/contact-policy', async (request) => {
    const { organizationId } = parse(organizationParams, request.params)
    requireMembership(request, organizationId)
    const canManage = await canManageSender(request, organizationId)
    const policy = await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [organizationId], serviceRole: 'api' },
      () => getContactPolicy(app.pg, organizationId))
    return { canManage, policy }
  })

  app.put('/organizations/:organizationId/contact-policy', async (request) => {
    const { organizationId } = parse(organizationParams, request.params)
    if (!await canManageSender(request, organizationId)) throw forbidden()
    const input = parse(contactPolicyInputSchema, request.body)
    const policy = await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [organizationId], serviceRole: 'api' },
      () => saveContactPolicy(app.pg, organizationId, request.ctx!.userId, input))
    if (!policy) throw new ApiError(409, 'contact_policy_changed')
    return { canManage: true, policy }
  })
}

const unsubscribeParams = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{20,64}$/) })

/** Public one-click opt-out (RFC 8058). GET confirms, POST applies; link scanners never unsubscribe. */
export async function registerPublicEmailRoutes(app: FastifyInstance) {
  // HTML forms and mail clients (List-Unsubscribe=One-Click) post url-encoded bodies; the body itself is not used.
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_request, _body, done) => done(null, {}))
  app.get('/unsubscribe/:token', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = unsubscribeParams.safeParse(request.params)
    const found = params.success ? await findUnsubscribeTarget(app.pg, params.data.token) : null
    return reply.type('text/html; charset=utf-8').send(page(found
      ? `<p>Confirme para deixar de receber mensagens de <strong>${escapeHtml(found.senderName)}</strong> em ${escapeHtml(found.email)}.</p>
         <form method="post"><button type="submit">Não quero mais receber</button></form>`
      : '<p>Este link não é mais válido.</p>'))
  })

  app.post('/unsubscribe/:token', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const params = unsubscribeParams.safeParse(request.params)
    const found = params.success ? await applyUnsubscribe(app.pg, params.data.token) : null
    return reply.type('text/html; charset=utf-8').send(page(found
      ? `<p>Pronto. ${escapeHtml(found.email)} não receberá novas mensagens de <strong>${escapeHtml(found.senderName)}</strong>.</p>`
      : '<p>Este link não é mais válido.</p>'))
  })
}

type UnsubscribeTarget = { requestId: string; organizationId: string; leadId: string | null; email: string; senderName: string }

async function findUnsubscribeTarget(pool: pg.Pool, token: string): Promise<UnsubscribeTarget | null> {
  return runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [], serviceRole: 'api' }, async () => {
    const result = await pool.query<{ id: string; organization_id: string; lead_id: string | null; recipient_email: string; sender_name: string | null }>(
      `SELECT r.id, r.organization_id, r.lead_id, r.recipient_email,
              COALESCE(s.from_name, o.name) AS sender_name
         FROM public.email_send_requests r
         JOIN public.organizations o ON o.id = r.organization_id
         LEFT JOIN public.commercial_email_senders s ON s.organization_id = r.organization_id
        WHERE r.unsubscribe_token = $1 LIMIT 1`,
      [token],
    )
    const row = result.rows[0]
    return row ? { requestId: row.id, organizationId: row.organization_id, leadId: row.lead_id,
      email: row.recipient_email, senderName: row.sender_name || 'a empresa' } : null
  })
}

async function applyUnsubscribe(pool: pg.Pool, token: string) {
  const target = await findUnsubscribeTarget(pool, token)
  if (!target) return null
  await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [target.organizationId], serviceRole: 'api' },
    () => withDatabaseTransaction(pool, async db => {
      await db.query(
        `INSERT INTO public.email_suppression_entries (organization_id, email, reason, source)
         VALUES ($1, lower($2), 'unsubscribe', 'one_click')
         ON CONFLICT (organization_id, email) DO UPDATE SET reason = EXCLUDED.reason, source = EXCLUDED.source`,
        [target.organizationId, target.email],
      )
      await db.query(
        `INSERT INTO public.lead_channel_permissions (organization_id, lead_id, channel, address, status, source, revoked_at, evidence)
         VALUES ($1, $2, 'email', lower($3), 'revoked', 'one_click_unsubscribe', NOW(), jsonb_build_object('requestId', $4::text))
         ON CONFLICT (organization_id, channel, address) DO UPDATE
           SET status = 'revoked', revoked_at = NOW(), source = EXCLUDED.source, evidence = EXCLUDED.evidence, updated_at = NOW()`,
        [target.organizationId, target.leadId, target.email, target.requestId],
      )
      if (target.leadId) {
        await db.query(
          `UPDATE public.crm_sequence_enrollments SET status = 'paused', next_execution_at = NULL, updated_at = NOW()
            WHERE lead_id = $1 AND status = 'active'`,
          [target.leadId],
        )
        await db.query(
          `INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
           VALUES ($1, $2, 'email', 'Contato pediu para não receber e-mails', $3, NOW())`,
          [target.organizationId, target.leadId, target.email],
        )
      }
    }))
  return target
}

function page(content: string) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Preferências de e-mail</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#222}button{padding:10px 16px;border-radius:6px;border:1px solid #222;background:#222;color:#fff;cursor:pointer}</style></head><body><h1 style="font-size:20px">Preferências de e-mail</h1>${content}</body></html>`
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

async function enqueueCommercialEmail(pool: pg.Pool, input: QueueEmailInput) {
  return runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [input.organizationId], serviceRole: 'api' },
    () => withDatabaseTransaction(pool, async db => {
      await requireCommercialSender(db, input.organizationId, String(input.metadata?.senderRevision))
      if (input.leadId) await requireCurrentLeadRecipient(db, input.organizationId, input.leadId, input.recipientEmail)
      await assertEmailSendAllowed(db, { organizationId: input.organizationId, recipient: input.recipientEmail, category: 'operational' })
      const message = await queueEmailRequest(db, input)
      if (message.recipientEmail !== input.recipientEmail || message.subject !== input.subject
        || message.bodyText !== input.bodyText || message.metadata.senderRevision !== input.metadata?.senderRevision) {
        throw new ApiError(409, 'commercial_email_request_conflict')
      }
      await recordEmailDomainEvent(db, {
        eventType: 'email.commercial.requested', request: message,
        payload: { requestId: message.id }, correlationId: message.id,
      })
      return { id: message.id, status: message.status }
    }))
}

export async function dispatchCommercialEmail(
  db: Pick<pg.Pool, 'query'>,
  event: DomainEventEnvelope,
  queue?: { add(name: 'email.send', data: Record<string, unknown>, options: { jobId: string }): Promise<unknown> },
) {
  if (!queue || event.aggregateType !== 'email' || event.payload.requestId !== event.aggregateId) {
    throw new Error('commercial_email_dispatch_invalid')
  }
  const result = await db.query(`SELECT id FROM public.email_send_requests WHERE id = $1 AND organization_id = $2
    AND source_entity_type IN ('crm_manual_email', 'commercial_sender_test') AND status = 'queued'`,
    [event.aggregateId, event.organizationId])
  if (!result.rows[0]) return { queued: false }
  await queue.add('email.send', { requestId: event.aggregateId, organizationId: event.organizationId },
    { jobId: createBullMqJobId('commercial-email', event.aggregateId) })
  return { queued: true }
}
