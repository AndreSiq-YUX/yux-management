import type { FastifyInstance } from 'fastify'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'

const sessionTtlMs = 1000 * 60 * 60 * 8

const eventSchema = z.object({
  action: z.string().min(1),
  origin: z.string().url(),
  publicToken: z.string().optional(),
  sessionToken: z.string().optional(),
  body: z.string().optional(),
  contact: z.record(z.string(), z.unknown()).optional(),
  consentAccepted: z.boolean().optional(),
})

type WidgetRow = {
  id: string
  organization_id: string
  name: string
  branding: Record<string, unknown> | null
  consent_text: string | null
  initial_form: Record<string, unknown> | unknown[] | null
}

type SessionRow = {
  id: string
  widget_id: string
  contact_id: string | null
  conversation_id: string | null
  organization_id: string
  name: string
  branding: Record<string, unknown> | null
  consent_text: string | null
  initial_form: Record<string, unknown> | unknown[] | null
}

export async function registerPublicWebchatRoutes(app: FastifyInstance) {
  app.post('/events', async (request, reply) => {
    const parsed = eventSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ notFound: true, error: 'invalid_webchat_event' })

    try {
      return await handleWebchatEvent(app, parsed.data)
    } catch (error) {
      return reply.code(400).send({ notFound: true, error: sanitizeError(error) })
    }
  })
}

async function handleWebchatEvent(app: FastifyInstance, input: z.infer<typeof eventSchema>) {
  if (input.action === 'bootstrap_widget') {
    if (!input.publicToken) throw new Error('missing_public_token')
    return bootstrapWidget(app, input.publicToken, input.origin)
  }

  if (!input.sessionToken) throw new Error('missing_session_token')
  const session = await requireSession(app, input.sessionToken, input.origin)
  if (input.action === 'load_session') return loadSession(app, session)
  if (input.action === 'start_conversation' || input.action === 'resume_conversation') return ensureConversation(app, session, input)
  if (input.action === 'send_message') return sendMessage(app, session, input)
  if (input.action === 'request_human') return requestHuman(app, session)
  if (input.action === 'poll_messages') return pollMessages(app, session)
  if (input.action === 'request_attachment_upload') {
    return {
      unsupported: true,
      attachmentEndpoint: '/api/omnichannel/attachments',
      reason: 'webchat_attachment_upload_requires_authenticated_backend_route',
    }
  }

  throw new Error(`unsupported_webchat_action:${input.action}`)
}

async function bootstrapWidget(app: FastifyInstance, publicToken: string, origin: string) {
  const widgetResult = await app.pg.query<WidgetRow>(
    `SELECT w.id, w.organization_id, w.name, w.branding, w.consent_text, w.initial_form
     FROM private.webchat_widget_tokens wt
     JOIN public.webchat_widgets w ON w.id = wt.widget_id
     WHERE wt.public_token_hash = $1
       AND w.is_active = TRUE
       AND EXISTS (
         SELECT 1
         FROM unnest(w.allowed_origins) allowed_origin(value)
         WHERE allowed_origin.value = '*'
            OR LOWER(allowed_origin.value) = LOWER($2)
       )
     LIMIT 1`,
    [hashToken(publicToken), origin],
  )
  const widget = widgetResult.rows[0]
  if (!widget) return { notFound: true }

  const sessionToken = randomUUID()
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString()
  const sessionResult = await app.pg.query<{ id: string }>(
    `INSERT INTO public.webchat_sessions (
       widget_id, session_token_hash, validated_origin, expires_at, last_seen_at
     )
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id`,
    [widget.id, hashToken(sessionToken), origin, expiresAt],
  )

  return {
    sessionId: sessionResult.rows[0].id,
    sessionToken,
    expiresAt,
    iframeUrl: `/webchat/session/${sessionToken}`,
  }
}

async function requireSession(app: FastifyInstance, sessionToken: string, origin: string) {
  const result = await app.pg.query<SessionRow>(
    `SELECT s.id, s.widget_id, s.contact_id, s.conversation_id,
            w.organization_id, w.name, w.branding, w.consent_text, w.initial_form
     FROM public.webchat_sessions s
     JOIN public.webchat_widgets w ON w.id = s.widget_id
     WHERE s.session_token_hash = $1
       AND s.validated_origin = $2
       AND s.revoked_at IS NULL
       AND s.expires_at > NOW()
       AND w.is_active = TRUE
     LIMIT 1`,
    [hashToken(sessionToken), origin],
  )
  const session = result.rows[0]
  if (!session) throw new Error('webchat_session_not_found')
  await app.pg.query('UPDATE public.webchat_sessions SET last_seen_at = NOW(), updated_at = NOW() WHERE id = $1', [session.id])
  return session
}

async function loadSession(app: FastifyInstance, session: SessionRow) {
  return {
    widget: sanitizeWidget(session),
    conversation: session.conversation_id ? { id: session.conversation_id } : null,
    messages: session.conversation_id ? await getConversationMessages(app, session.conversation_id) : [],
  }
}

async function ensureConversation(app: FastifyInstance, session: SessionRow, input: Partial<z.infer<typeof eventSchema>>) {
  if (session.conversation_id) return { conversation: { id: session.conversation_id } }
  const contact = await ensureContact(app, session.organization_id, input.contact)
  const result = await app.pg.query<{ id: string }>(
    `INSERT INTO public.conversations (
       organization_id, contact_id, channel, status, response_mode, subject, last_message_at
     )
     VALUES ($1, $2, 'webchat', 'open', 'assisted', 'Webchat', NOW())
     RETURNING id`,
    [session.organization_id, contact.id],
  )
  const conversation = result.rows[0]
  await app.pg.query(
    'UPDATE public.webchat_sessions SET contact_id = $2, conversation_id = $3, updated_at = NOW() WHERE id = $1',
    [session.id, contact.id, conversation.id],
  )
  session.contact_id = contact.id
  session.conversation_id = conversation.id
  return { conversation }
}

async function sendMessage(app: FastifyInstance, session: SessionRow, input: z.infer<typeof eventSchema>) {
  const body = input.body?.trim()
  if (!body) throw new Error('message_body_required')
  const ensured = await ensureConversation(app, session, input)
  const result = await app.pg.query<{ id: string; author_type: string; body: string | null; created_at: string }>(
    `INSERT INTO public.messages (
       conversation_id, direction, author_type, content_type, body, delivery_status, metadata
     )
     VALUES ($1, 'inbound', 'contact', 'text', $2, 'delivered', $3)
     RETURNING id, author_type, body, created_at`,
    [ensured.conversation.id, body, { source: 'webchat', consentAccepted: input.consentAccepted === true }],
  )
  await app.pg.query('UPDATE public.conversations SET last_message_at = NOW(), updated_at = NOW() WHERE id = $1', [ensured.conversation.id])
  return { conversation: ensured.conversation, message: mapMessage(result.rows[0]) }
}

async function requestHuman(app: FastifyInstance, session: SessionRow) {
  const ensured = await ensureConversation(app, session, {})
  await app.pg.query(
    `UPDATE public.conversations
     SET status = 'waiting_human', response_mode = 'manual', updated_at = NOW()
     WHERE id = $1`,
    [ensured.conversation.id],
  )
  return { status: 'waiting_human', conversation: ensured.conversation }
}

async function pollMessages(app: FastifyInstance, session: SessionRow) {
  if (!session.conversation_id) return { messages: [] }
  return { messages: await getConversationMessages(app, session.conversation_id) }
}

async function ensureContact(app: FastifyInstance, organizationId: string, contactInput: Record<string, unknown> = {}) {
  const email = typeof contactInput.email === 'string' ? contactInput.email.trim() : ''
  const displayName = typeof contactInput.name === 'string' ? contactInput.name.trim() : ''
  if (email) {
    const existing = await app.pg.query<{ id: string }>(
      'SELECT id FROM public.omnichannel_contacts WHERE organization_id = $1 AND email = $2 LIMIT 1',
      [organizationId, email],
    )
    if (existing.rows[0]) return existing.rows[0]
  }
  const result = await app.pg.query<{ id: string }>(
    `INSERT INTO public.omnichannel_contacts (
       organization_id, display_name, email, external_identities, consent_metadata, profile_metadata
     )
     VALUES ($1, $2, $3, $4, $5, '{}')
     RETURNING id`,
    [
      organizationId,
      displayName || email || 'Visitante webchat',
      email || null,
      { webchat: randomUUID() },
      sanitizeMetadata(contactInput),
    ],
  )
  return result.rows[0]
}

async function getConversationMessages(app: FastifyInstance, conversationId: string) {
  const result = await app.pg.query<{ id: string; author_type: string; body: string | null; created_at: string }>(
    `SELECT id, author_type, body, created_at
     FROM public.messages
     WHERE conversation_id = $1
     ORDER BY created_at ASC`,
    [conversationId],
  )
  return result.rows.map(mapMessage)
}

function mapMessage(message: { id: string; author_type: string; body: string | null; created_at: string }) {
  return {
    id: message.id,
    authorType: message.author_type,
    body: message.body || '',
    createdAt: message.created_at,
  }
}

function sanitizeWidget(widget: Pick<SessionRow | WidgetRow, 'name' | 'branding' | 'consent_text' | 'initial_form'>) {
  const initialForm = widget.initial_form
  return {
    name: widget.name,
    branding: widget.branding || {},
    consentText: widget.consent_text || '',
    initialForm: Array.isArray(initialForm) ? initialForm : (initialForm as { fields?: unknown[] } | null)?.fields || [],
  }
}

function hashToken(token: string) {
  return createHash('sha256').update(token.trim()).digest('hex')
}

function sanitizeMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeMetadata)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => {
    const normalized = key.toLowerCase()
    const redacted = normalized.includes('token') || normalized.includes('authorization') || normalized.includes('password') || normalized.includes('secret')
    return [key, redacted ? '[redacted]' : sanitizeMetadata(entry)]
  }))
}

function sanitizeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error || 'unknown_webchat_error'))
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\b(token|secret|password|credential)\s+[^,\s]+/gi, '$1 [redacted]')
}
