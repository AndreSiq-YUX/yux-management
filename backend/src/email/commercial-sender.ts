import type pg from 'pg'
import { z } from 'zod'
import { ApiError } from '../http/errors.js'

export const managedSenderDomain = 'comercial.yux.com.br'
export const addressSchema = z.string().trim().toLowerCase().email().max(254)
const nameSchema = z.string().trim().min(2).max(120).regex(/^[^<>\r\n]+$/)

export const senderInputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('professional'), fromName: nameSchema, fromEmail: addressSchema, replyTo: addressSchema }).strict(),
  z.object({ mode: z.literal('managed'), fromName: nameSchema, replyTo: addressSchema.optional() }).strict(),
])

type Queryable = Pick<pg.Pool, 'query'>
type SenderRow = {
  revision: string
  mode: 'professional' | 'managed'
  from_email: string | null
  from_name: string
  reply_to: string | null
  approved_at: Date | null
}

function mapSender(row: SenderRow) {
  return { revision: row.revision, mode: row.mode, fromEmail: row.from_email,
    fromName: row.from_name, replyTo: row.reply_to, approvedAt: row.approved_at }
}

export async function getApprovedCommercialSender(db: Queryable, organizationId: string) {
  const sender = await getCommercialSender(db, organizationId)
  return sender?.approvedAt && sender.fromEmail && sender.replyTo
    ? { ...sender, fromEmail: sender.fromEmail, replyTo: sender.replyTo }
    : null
}

export async function getCommercialSender(db: Queryable, organizationId: string) {
  const result = await db.query<SenderRow>(
    'SELECT * FROM public.commercial_email_senders WHERE organization_id = $1', [organizationId])
  return result.rows[0] ? mapSender(result.rows[0]) : null
}

/** `revision: null` accepts the currently approved identity (automated sequences). */
export async function requireCommercialSender(db: Queryable, organizationId: string, revision: string | null) {
  const sender = await getCommercialSender(db, organizationId)
  if (!sender?.approvedAt || !sender.fromEmail || !sender.replyTo || (revision !== null && sender.revision !== revision)) {
    throw new ApiError(409, 'commercial_sender_not_ready')
  }
  return { ...sender, fromEmail: sender.fromEmail, replyTo: sender.replyTo }
}

export async function saveCommercialSender(db: Queryable, organizationId: string, input: z.infer<typeof senderInputSchema>) {
  const from = input.mode === 'professional' ? input.fromEmail : null
  if (from && /@(?:[^@]+\.)?yux\.com\.br$/.test(from)) throw new ApiError(422, 'commercial_sender_use_managed')
  const result = await db.query<SenderRow>(
    `INSERT INTO public.commercial_email_senders (organization_id, mode, from_email, from_name, reply_to)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (organization_id) DO UPDATE SET mode = EXCLUDED.mode, from_email = EXCLUDED.from_email,
       from_name = EXCLUDED.from_name, reply_to = EXCLUDED.reply_to, revision = gen_random_uuid(),
       approved_at = NULL, approved_by = NULL
     RETURNING *`, [organizationId, input.mode, from, input.fromName, input.replyTo ?? null])
  return mapSender(result.rows[0]!)
}

export async function reviewCommercialSender(db: Queryable, organizationId: string, actorId: string, input: {
  revision: string
  approved: boolean
  managedAddress?: string
  managedReplyTo?: string
}) {
  const sender = await getCommercialSender(db, organizationId)
  if (!sender || sender.revision !== input.revision) throw new ApiError(409, 'commercial_sender_changed')
  const from = sender.mode === 'managed' ? (input.managedAddress ?? sender.fromEmail) : sender.fromEmail
  const replyTo = sender.mode === 'managed' ? (input.managedReplyTo ?? sender.replyTo) : sender.replyTo
  if (input.approved && (!from || (sender.mode === 'managed' && !from.endsWith(`@${managedSenderDomain}`)))) {
    throw new ApiError(422, 'commercial_sender_managed_address_required')
  }
  if (input.approved && !replyTo) throw new ApiError(422, 'commercial_sender_reply_required')
  try {
    const result = await db.query<SenderRow>(
      `UPDATE public.commercial_email_senders
       SET from_email = $3, reply_to = $6, approved_at = CASE WHEN $4 THEN NOW() ELSE NULL END,
           approved_by = CASE WHEN $4 THEN $5::uuid ELSE NULL END, revision = gen_random_uuid()
       WHERE organization_id = $1 AND revision = $2 RETURNING *`,
      [organizationId, input.revision, input.approved ? from : sender.fromEmail, input.approved, actorId,
        input.approved ? replyTo : sender.replyTo])
    if (!result.rows[0]) throw new ApiError(409, 'commercial_sender_changed')
    return mapSender(result.rows[0])
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new ApiError(409, 'commercial_sender_address_in_use')
    throw error
  }
}

export async function requireCurrentLeadRecipient(db: Queryable, organizationId: string, leadId: string, recipient: string) {
  const result = await db.query<{ revoked: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM public.lead_channel_permissions p WHERE p.organization_id = l.organization_id
       AND p.channel = 'email' AND lower(p.address) = $3 AND p.status = 'revoked'
     ) AS revoked FROM public.leads l
     WHERE l.organization_id = $1 AND l.id = $2 AND lower(trim(l.email)) = $3`,
    [organizationId, leadId, recipient.toLowerCase()])
  if (!result.rows[0]) throw new ApiError(409, 'commercial_recipient_changed')
  if (result.rows[0].revoked) throw new ApiError(422, 'recipient_suppressed')
}
