import { z } from 'zod'
import type { AuthUser } from '../../auth/routes.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { contactAllowedByPolicy, getContactPolicy } from '../../email/contact-policy.js'
import { ensureLeadConversationLink } from '../omnichannel/lead-link.js'
import { whatsAppPhoneCandidates } from '../omnichannel/whatsapp-recipient.js'
import { requireActiveLead } from './lead-actions.js'
import { profileError, type ProfileDb } from './record-profile.js'

export const leadWhatsAppSendSchema = z.object({
  requestId: z.uuid(),
  connectionId: z.uuid().optional(),
  body: z.string().trim().min(1).max(4096).optional(),
  templateName: z.string().trim().regex(/^[a-z0-9_]{1,512}$/).optional(),
  languageCode: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/).default('pt_BR'),
  bodyParameters: z.array(z.string().trim().min(1).max(1024)).max(20).default([]),
}).strict().refine(input => Boolean(input.body) !== Boolean(input.templateName), { message: 'body_or_template' })

type Connection = { id: string; name: string; display_phone_number: string | null }
type ConversationRow = { id: string; connection_id: string | null; inside_window: boolean; last_inbound_at: Date | null }

function leadPhone(lead: any): string | null {
  const value = (lead.whatsapp_phone || lead.phone || '').trim()
  return whatsAppPhoneCandidates(value).length ? value : null
}

async function loadContext(db: ProfileDb, lead: any) {
  const phone = leadPhone(lead)
  return runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [lead.organization_id] }, async () => {
    const [policy, connections, revoked] = await Promise.all([
      getContactPolicy(db, lead.organization_id),
      db.query<Connection>(
        `SELECT id, name, display_phone_number FROM public.channel_connections
          WHERE organization_id = $1 AND channel = 'whatsapp' AND is_active = TRUE AND token_state = 'connected'
          ORDER BY updated_at DESC`,
        [lead.organization_id],
      ),
      db.query(
        `SELECT 1 FROM public.lead_channel_permissions
          WHERE organization_id = $1 AND lead_id = $2 AND channel = 'whatsapp' AND status = 'revoked' LIMIT 1`,
        [lead.organization_id, lead.id],
      ),
    ])
    const conversation = (await db.query<ConversationRow>(
      `SELECT c.id, c.connection_id,
              COALESCE(MAX(m.created_at) >= NOW() - INTERVAL '24 hours', FALSE) AS inside_window,
              MAX(m.created_at) AS last_inbound_at
         FROM public.conversations c
         LEFT JOIN public.messages m ON m.conversation_id = c.id AND m.direction = 'inbound'
        WHERE c.organization_id = $1 AND c.lead_id = $2 AND c.channel = 'whatsapp'
          AND c.status NOT IN ('resolved', 'archived')
        GROUP BY c.id
        ORDER BY MAX(m.created_at) DESC NULLS LAST, c.updated_at DESC
        LIMIT 1`,
      [lead.organization_id, lead.id],
    )).rows[0] ?? null
    return { phone, policy, connections: connections.rows, revoked: revoked.rows.length > 0, conversation }
  })
}

export async function leadWhatsAppCapability(db: ProfileDb, lead: any) {
  const context = await loadContext(db, lead)
  const templates = lead.crm_instance_id
    ? (await db.query<{ name: string; body: string }>(
        `SELECT name, body FROM public.crm_message_templates
          WHERE crm_instance_id = $1 AND channel = 'whatsapp' AND status = 'active' ORDER BY name LIMIT 50`,
        [lead.crm_instance_id],
      )).rows
    : []
  const consent = contactAllowedByPolicy(context.policy.whatsappBasis, lead.whatsapp_opt_in === true)
  const insideWindow = context.conversation?.inside_window === true
  const base = {
    phone: context.phone,
    connections: context.connections.map(c => ({ id: c.id, name: c.name, displayPhoneNumber: c.display_phone_number })),
    conversationId: context.conversation?.id ?? null,
    insideWindow,
    lastInboundAt: context.conversation?.last_inbound_at ?? null,
    templates,
  }
  if (!context.phone) return { ...base, canSend: false, mode: null, message: 'Cadastre o WhatsApp ou telefone celular do lead.' }
  if (!context.connections.length)
    return { ...base, canSend: false, mode: null, message: 'Nenhum número de WhatsApp conectado a esta conta. Conecte em Atendimento → Canais.' }
  if (context.revoked) return { ...base, canSend: false, mode: null, message: 'Este contato pediu para não receber mensagens pelo WhatsApp.' }
  if (insideWindow)
    return { ...base, canSend: true, mode: 'text' as const, message: 'O contato respondeu nas últimas 24 horas: você pode enviar texto livre.' }
  if (!consent)
    return { ...base, canSend: false, mode: null, message: 'A política de contato exige autorização registrada para iniciar conversa pelo WhatsApp.' }
  return {
    ...base,
    canSend: true,
    mode: 'template' as const,
    message: 'Fora da janela de 24 horas o WhatsApp só aceita um modelo aprovado pela Meta. Informe o nome exato do modelo.',
  }
}

export async function queueLeadWhatsApp(
  db: ProfileDb,
  user: AuthUser,
  leadId: string,
  input: z.infer<typeof leadWhatsAppSendSchema>,
) {
  const lead = await requireActiveLead(db, user, leadId)
  const prior = (await db.query<{ id: string; delivery_status: string }>(
    `SELECT m.id, m.delivery_status FROM public.messages m
       JOIN public.conversations c ON c.id = m.conversation_id
      WHERE c.organization_id = $1 AND c.lead_id = $2 AND m.metadata->>'requestId' = $3 LIMIT 1`,
    [lead.organization_id, leadId, input.requestId],
  )).rows[0]
  if (prior) return { messageId: prior.id, status: prior.delivery_status, duplicate: true }

  const capability = await leadWhatsAppCapability(db, lead)
  if (!capability.canSend) throw profileError(422, capability.message)
  if (capability.mode === 'template' && !input.templateName)
    throw profileError(422, 'Fora da janela de 24 horas, escolha um modelo aprovado pela Meta.')
  const connection = capability.connections.find(c => !input.connectionId || c.id === input.connectionId)
  if (!connection) throw profileError(422, 'Escolha um número de WhatsApp conectado.')
  const phone = capability.phone!

  return runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [lead.organization_id] }, async () => {
    const identities = whatsAppPhoneCandidates(phone)
    const existingContact = (await db.query<{ id: string }>(
      `SELECT id FROM public.omnichannel_contacts
        WHERE organization_id = $1 AND (lead_id = $2
          OR regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ANY($3::text[])
          OR '55' || regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') = ANY($3::text[])
          OR external_identities->>'providerExternalId' = ANY($3::text[]))
        ORDER BY (lead_id = $2) DESC NULLS LAST, updated_at DESC LIMIT 1 FOR UPDATE`,
      [lead.organization_id, leadId, identities],
    )).rows[0]
    const contactId = existingContact?.id ?? (await db.query<{ id: string }>(
      `INSERT INTO public.omnichannel_contacts (organization_id, display_name, phone, lead_id, external_identities)
       VALUES ($1, $2, $3, $4, jsonb_build_object('source', 'crm_lead')) RETURNING id`,
      [lead.organization_id, lead.name || phone, phone, leadId],
    )).rows[0]!.id
    await db.query(
      'UPDATE public.omnichannel_contacts SET lead_id = $2, updated_at = NOW() WHERE id = $1 AND lead_id IS NULL',
      [contactId, leadId],
    )
    const conversationId = (await db.query<{ id: string }>(
      `SELECT id FROM public.conversations
        WHERE organization_id = $1 AND contact_id = $2 AND connection_id = $3
          AND status NOT IN ('resolved', 'archived')
        ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
      [lead.organization_id, contactId, connection.id],
    )).rows[0]?.id ?? (await db.query<{ id: string }>(
      `INSERT INTO public.conversations (organization_id, contact_id, connection_id, channel, status, response_mode, lead_id, last_message_at)
       VALUES ($1, $2, $3, 'whatsapp', 'open', 'assisted', $4, NOW()) RETURNING id`,
      [lead.organization_id, contactId, connection.id, leadId],
    )).rows[0]!.id
    await db.query('UPDATE public.conversations SET lead_id = $2 WHERE id = $1 AND lead_id IS NULL', [conversationId, leadId])
    await ensureLeadConversationLink(db, { leadId, conversationId, matchMethod: 'manual', contactPhone: phone })

    const template = Boolean(input.templateName)
    const message = (await db.query<{ id: string; delivery_status: string }>(
      `INSERT INTO public.messages (
         conversation_id, connection_id, direction, author_type, author_user_id, content_type, body, delivery_status, metadata
       ) VALUES ($1, $2, 'outbound', 'agent', $3, $4, $5, 'queued', $6::jsonb)
       RETURNING id, delivery_status`,
      [
        conversationId,
        connection.id,
        user.id,
        template ? 'template' : 'text',
        input.body ?? `[modelo] ${input.templateName}`,
        JSON.stringify({
          source: 'crm_lead',
          requestId: input.requestId,
          // The organization's policy (or the lead's own opt-in) satisfies consent.
          recipientOptIn: true,
          contactBasis: lead.whatsapp_opt_in === true ? 'explicit_opt_in' : capability.mode === 'text' ? 'customer_service_window' : 'organization_policy',
          ...(template ? {
            templateName: input.templateName,
            languageCode: input.languageCode,
            components: input.bodyParameters.length
              ? [{ type: 'body', parameters: input.bodyParameters.map(text => ({ type: 'text', text })) }]
              : undefined,
          } : {}),
        }),
      ],
    )).rows[0]!
    await db.query(
      'UPDATE public.leads SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1',
      [leadId],
    )
    return { messageId: message.id, status: message.delivery_status, conversationId, duplicate: false }
  })
}
