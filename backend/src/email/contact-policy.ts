import { randomBytes } from 'node:crypto'
import type pg from 'pg'
import { z } from 'zod'

type Queryable = Pick<pg.Pool, 'query'>

export const contactBasisSchema = z.enum(['published_business_contact', 'explicit_opt_in'])
export type ContactBasis = z.infer<typeof contactBasisSchema>

export const contactPolicyInputSchema = z.object({
  emailBasis: contactBasisSchema,
  whatsappBasis: contactBasisSchema,
  revision: z.string().uuid().nullable(),
}).strict()

export type ContactPolicy = {
  emailBasis: ContactBasis
  whatsappBasis: ContactBasis
  revision: string | null
  updatedAt: string | null
}

/**
 * Platform defaults when an organization never configured its policy:
 * e-mail to the business contact a company publishes for suppliers is allowed
 * (B2B legitimate interest, with opt-out on every message); WhatsApp keeps the
 * explicit opt-in required by Meta's Business Messaging Policy.
 */
export const DEFAULT_CONTACT_POLICY: ContactPolicy = {
  emailBasis: 'published_business_contact',
  whatsappBasis: 'explicit_opt_in',
  revision: null,
  updatedAt: null,
}

/** Sources whose e-mails are commercial prospecting/relationship messages. */
export const COMMERCIAL_EMAIL_SOURCES = new Set(['crm_manual_email', 'crm_sequence_execution'])

export async function getContactPolicy(db: Queryable, organizationId: string): Promise<ContactPolicy> {
  const result = await db.query<{ email_basis: ContactBasis; whatsapp_basis: ContactBasis; revision: string; updated_at: Date }>(
    `SELECT email_basis, whatsapp_basis, revision, updated_at
       FROM public.organization_contact_policies WHERE organization_id = $1`,
    [organizationId],
  )
  const row = result.rows[0]
  if (!row) return { ...DEFAULT_CONTACT_POLICY }
  return {
    emailBasis: row.email_basis,
    whatsappBasis: row.whatsapp_basis,
    revision: row.revision,
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : null,
  }
}

export async function saveContactPolicy(
  db: Queryable,
  organizationId: string,
  actorId: string,
  input: z.infer<typeof contactPolicyInputSchema>,
): Promise<ContactPolicy | null> {
  const result = await db.query<{ email_basis: ContactBasis; whatsapp_basis: ContactBasis; revision: string; updated_at: Date }>(
    `INSERT INTO public.organization_contact_policies (organization_id, email_basis, whatsapp_basis, updated_by)
     SELECT $1, $2, $3, $4
      WHERE $5::uuid IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.organization_contact_policies WHERE organization_id = $1)
     ON CONFLICT (organization_id) DO NOTHING
     RETURNING email_basis, whatsapp_basis, revision, updated_at`,
    [organizationId, input.emailBasis, input.whatsappBasis, actorId, input.revision],
  )
  const row = result.rows[0] ?? (input.revision ? (await db.query<{ email_basis: ContactBasis; whatsapp_basis: ContactBasis; revision: string; updated_at: Date }>(
    `UPDATE public.organization_contact_policies
        SET email_basis = $2, whatsapp_basis = $3, updated_by = $4, updated_at = NOW(), revision = gen_random_uuid()
      WHERE organization_id = $1 AND revision = $5
      RETURNING email_basis, whatsapp_basis, revision, updated_at`,
    [organizationId, input.emailBasis, input.whatsappBasis, actorId, input.revision],
  )).rows[0] : undefined)
  if (!row) return null
  return {
    emailBasis: row.email_basis,
    whatsappBasis: row.whatsapp_basis,
    revision: row.revision,
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

/** Whether the configured basis lets the organization contact this lead by the channel. */
export function contactAllowedByPolicy(basis: ContactBasis, explicitOptIn: boolean) {
  return basis === 'published_business_contact' || explicitOptIn
}

export function newUnsubscribeToken() {
  return randomBytes(24).toString('base64url')
}

export function unsubscribeUrl(token: string, baseUrl = process.env.PUBLIC_APP_URL || 'https://hub.yux.com.br') {
  return `${baseUrl.replace(/\/$/, '')}/api/public/email/unsubscribe/${encodeURIComponent(token)}`
}

export function appendOptOutFooter(
  body: { text: string; html: string },
  senderName: string,
  url: string,
) {
  const name = senderName.replace(/[<>\r\n]/g, '').trim() || 'nossa empresa'
  const text = `${body.text.trimEnd()}\n\n—\nVocê recebeu esta mensagem porque este é o contato divulgado pela sua empresa. Se preferir não receber novas mensagens de ${name}, acesse: ${url}`
  const html = `${body.html}<hr style="border:none;border-top:1px solid #ddd;margin:24px 0 12px"><p style="font-size:12px;color:#666">Você recebeu esta mensagem porque este é o contato divulgado pela sua empresa. Se preferir não receber novas mensagens de ${escapeHtml(name)}, <a href="${escapeHtml(url)}">clique aqui</a>.</p>`
  return { text, html }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}
