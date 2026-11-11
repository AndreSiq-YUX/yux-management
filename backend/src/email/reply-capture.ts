import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type pg from 'pg'
import { z } from 'zod'
import { recordDomainEvent } from '../modules/events/repository.js'
import { stopSequencesOnReply } from '../modules/crm/sequence-exit.js'
import { getApprovedCommercialSender } from './commercial-sender.js'
import { queueEmailRequest } from '../modules/email-delivery/service.js'

type Queryable = Pick<pg.Pool, 'query'>

const TOKEN = /^[A-Za-z0-9_-]{20,64}$/

/** Local part prefix; Cloudflare Email Routing matches r+<token>@domain with the rule for r@domain. */
export const REPLY_LOCAL_PART = 'r'

export function replyDomain() {
  const value = (process.env.EMAIL_REPLY_DOMAIN || '').trim().toLowerCase()
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value) ? value : null
}

export function replyAddress(token: string, domain: string) {
  return `${REPLY_LOCAL_PART}+${token}@${domain}`
}

export function parseReplyToken(recipient: string, domain: string) {
  const match = /^([^@+]+)\+([^@]+)@(.+)$/.exec(recipient.trim())
  if (!match) return null
  const [, local, token, host] = match
  if (local!.toLowerCase() !== REPLY_LOCAL_PART || host!.toLowerCase() !== domain || !TOKEN.test(token!)) return null
  return token!
}

/** Routed Reply-To for a commercial message, or undefined when reply capture is not configured. */
export async function ensureReplyAddress(db: Queryable, requestId: string) {
  const domain = replyDomain()
  if (!domain) return undefined
  const result = await db.query<{ reply_token: string }>(
    `UPDATE public.email_send_requests SET reply_token = COALESCE(reply_token, $2)
      WHERE id = $1 RETURNING reply_token`,
    [requestId, randomBytes(18).toString('base64url')],
  )
  const token = result.rows[0]?.reply_token
  return token ? replyAddress(token, domain) : undefined
}

/** HMAC over `${timestamp}.${rawBody}`; rejects stale or replayed deliveries older than 5 minutes. */
export function verifyInboundSignature(input: { secret: string; timestamp: unknown; signature: unknown; rawBody: Buffer; now?: number }) {
  if (typeof input.timestamp !== 'string' || typeof input.signature !== 'string') return false
  const seconds = Number(input.timestamp)
  if (!Number.isFinite(seconds) || Math.abs((input.now ?? Date.now()) / 1000 - seconds) > 300) return false
  const expected = createHmac('sha256', input.secret).update(`${input.timestamp}.`).update(input.rawBody).digest('hex')
  const supplied = Buffer.from(input.signature.replace(/^sha256=/, ''), 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  return supplied.length === wanted.length && timingSafeEqual(supplied, wanted)
}

export const inboundReplySchema = z.object({
  to: z.string().trim().max(320),
  from: z.string().trim().toLowerCase().email().max(320),
  fromName: z.string().trim().max(200).optional().nullable(),
  subject: z.string().max(998).optional().nullable(),
  text: z.string().max(200_000).optional().nullable(),
  messageId: z.string().trim().min(1).max(998),
  inReplyTo: z.string().trim().max(998).optional().nullable(),
  receivedAt: z.string().datetime({ offset: true }).optional(),
  autoSubmitted: z.boolean().default(false),
  attachments: z.array(z.object({
    filename: z.string().max(255).optional().nullable(),
    mimeType: z.string().max(255).optional().nullable(),
    size: z.number().int().nonnegative().optional(),
  })).max(50).default([]),
}).passthrough()
export type InboundReply = z.infer<typeof inboundReplySchema>

type MatchedRequest = { id: string; organization_id: string; lead_id: string | null; subject: string; recipient_email: string; crm_instance_id: string | null; lead_name: string | null }

export type InboundReplyResult =
  | { matched: false; reason: 'unknown_recipient' }
  | { matched: true; duplicate: boolean; inboundId: string; organizationId: string; leadId: string | null; forwardRequestId: string | null; stoppedSequences: number }

/** Keeps the readable reply and drops the quoted history below common markers. */
export function stripQuotedReply(text: string) {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const cut = lines.findIndex((line, index) =>
    /^\s*>/.test(line)
    || /^\s*(Em|On) .{4,200}(escreveu|wrote):\s*$/i.test(line)
    || /^-{2,}\s*(Mensagem original|Original Message)\s*-{2,}/i.test(line)
    || (/^\s*(De|From):\s.+/i.test(line)
      && lines.slice(index + 1, index + 4).some(next => /^\s*(Enviad[ao]|Sent|Para|To|Assunto|Subject):/i.test(next))))
  const kept = (cut > 0 ? lines.slice(0, cut) : lines).join('\n').trim()
  return kept || text.trim()
}

export async function recordInboundReply(db: Queryable, reply: InboundReply, domain: string): Promise<InboundReplyResult> {
  const token = parseReplyToken(reply.to, domain)
  if (!token) return { matched: false, reason: 'unknown_recipient' }
  const request = (await db.query<MatchedRequest>(
    `SELECT r.id, r.organization_id, r.lead_id, r.subject, r.recipient_email, l.crm_instance_id, l.name AS lead_name
       FROM public.email_send_requests r
       LEFT JOIN public.leads l ON l.id = r.lead_id AND l.deleted_at IS NULL
      WHERE r.reply_token = $1 LIMIT 1`,
    [token],
  )).rows[0]
  if (!request) return { matched: false, reason: 'unknown_recipient' }

  const text = (reply.text ?? '').slice(0, 100_000)
  const inserted = (await db.query<{ id: string }>(
    `INSERT INTO public.email_inbound_messages (
       organization_id, lead_id, request_id, provider_message_id, from_email, from_name, subject, text_body,
       in_reply_to, is_auto_reply, attachments, received_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
     ON CONFLICT (organization_id, provider_message_id) DO NOTHING
     RETURNING id`,
    [
      request.organization_id, request.lead_id, request.id, reply.messageId, reply.from, reply.fromName ?? null,
      reply.subject ?? null, text, reply.inReplyTo ?? null, reply.autoSubmitted,
      JSON.stringify(reply.attachments), reply.receivedAt ?? new Date().toISOString(),
    ],
  )).rows[0]
  if (!inserted) {
    const existing = (await db.query<{ id: string; forward_request_id: string | null }>(
      'SELECT id, forward_request_id FROM public.email_inbound_messages WHERE organization_id = $1 AND provider_message_id = $2',
      [request.organization_id, reply.messageId],
    )).rows[0]!
    return { matched: true, duplicate: true, inboundId: existing.id, organizationId: request.organization_id, leadId: request.lead_id, forwardRequestId: null, stoppedSequences: 0 }
  }

  let stoppedSequences = 0
  if (request.lead_id) {
    const preview = stripQuotedReply(text).slice(0, 500)
    await db.query(
      `INSERT INTO public.interactions (organization_id, lead_id, type, title, description, date)
       VALUES ($1, $2, 'email', $3, $4, $5)`,
      [request.organization_id, request.lead_id,
        reply.autoSubmitted ? 'Resposta automática recebida' : `E-mail recebido: ${reply.subject || request.subject}`.slice(0, 300),
        preview, reply.receivedAt ?? new Date().toISOString()],
    )
    await db.query('UPDATE public.leads SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1', [request.lead_id])
    // Out-of-office and other automatic answers are recorded but do not count as a reply.
    if (!reply.autoSubmitted) {
      stoppedSequences = await stopSequencesOnReply(db, { leadId: request.lead_id, channel: 'email' })
      if (request.crm_instance_id) {
        await recordDomainEvent(db as pg.Pool, {
          eventId: inserted.id,
          eventType: 'lead.response_received',
          organizationId: request.organization_id,
          crmInstanceId: request.crm_instance_id,
          leadId: request.lead_id,
          aggregateType: 'email',
          aggregateId: inserted.id,
          actor: { type: 'lead', id: request.lead_id },
          payload: { channel: 'email', inboundId: inserted.id, requestId: request.id, text: stripQuotedReply(text).slice(0, 10_000) },
        })
      }
    }
  }

  const forwardRequestId = await queueReplyCopy(db, request, reply, inserted.id, text)
  return { matched: true, duplicate: false, inboundId: inserted.id, organizationId: request.organization_id, leadId: request.lead_id, forwardRequestId, stoppedSequences }
}

/** Sends a copy to the company's commercial mailbox, answerable straight to the lead. */
async function queueReplyCopy(db: Queryable, request: MatchedRequest, reply: InboundReply, inboundId: string, text: string) {
  const sender = await getApprovedCommercialSender(db, request.organization_id)
  if (!sender) return null
  const base = (process.env.PUBLIC_APP_URL || 'https://hub.yux.com.br').replace(/\/$/, '')
  const who = reply.fromName ? `${reply.fromName} <${reply.from}>` : reply.from
  const body = [
    `${who} respondeu ao e-mail "${request.subject}"${request.lead_name ? ` (lead: ${request.lead_name})` : ''}.`,
    reply.autoSubmitted ? 'Esta parece ser uma resposta automática.' : '',
    '',
    stripQuotedReply(text).slice(0, 20_000) || '(mensagem sem texto)',
    '',
    '—',
    request.lead_id ? `A resposta já está registrada no CRM: ${base}/portal/crm?lead=${request.lead_id}` : 'A resposta está registrada no YUX Hub.',
    'Responder a este e-mail envia a resposta diretamente para o contato, mas ela não fica registrada no CRM. Para manter o histórico, responda pela ficha do lead.',
  ].filter((line, index, all) => line !== '' || all[index - 1] !== '').join('\n')
  const row = await queueEmailRequest(db, {
    organizationId: request.organization_id,
    leadId: null,
    emailKind: 'operational',
    recipientEmail: sender.replyTo,
    recipientOptIn: false,
    subject: `Resposta de ${reply.fromName || reply.from}: ${reply.subject || request.subject}`.slice(0, 300),
    bodyText: body,
    bodyHtml: '',
    idempotencyKey: `reply-forward:${inboundId}`,
    sourceEntityType: 'commercial_reply_forward',
    sourceEntityId: inboundId,
    moduleKey: 'crm',
    metadata: { forwardReplyTo: reply.from, leadId: request.lead_id, inboundId },
  })
  if (row) await db.query('UPDATE public.email_inbound_messages SET forward_request_id = $2 WHERE id = $1', [inboundId, row.id])
  return row?.id ?? null
}
