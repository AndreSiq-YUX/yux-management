import { corsHeaders, getServiceRoleClient, json } from '../_shared/edge.ts'
import { hashToken, sanitizeProtectedError, sanitizeWebhookMetadata, validateWebchatEvent } from '../_shared/omnichannel.ts'

type AdminClient = ReturnType<typeof getServiceRoleClient>

const sessionTtlMs = 1000 * 60 * 60 * 8

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
      const body = await req.json()
      const origin = body.origin || req.headers.get('origin') || ''
      const result = await handleWebchatEvent(getServiceRoleClient(), { ...body, origin })
      return json(result)
    } catch (error) {
      return json({ notFound: true, error: sanitizeProtectedError(error).message }, 400)
    }
  })
}

export async function handleWebchatEvent(admin: AdminClient, input: Record<string, unknown>) {
  const validation = validateWebchatEvent(input)
  if (!validation.valid) throw new Error(validation.reason)

  const action = String(input.action)
  const origin = String(input.origin)

  if (action === 'bootstrap_widget') return bootstrapWidget(admin, String(input.publicToken), origin)

  const session = await requireSession(admin, String(input.sessionToken), origin)

  if (action === 'load_session') return loadSession(admin, session)
  if (action === 'start_conversation' || action === 'resume_conversation') return ensureConversation(admin, session, input)
  if (action === 'send_message') return sendMessage(admin, session, input)
  if (action === 'request_attachment_upload') return requestAttachmentUpload(admin, session)
  if (action === 'request_human') return requestHuman(admin, session)
  if (action === 'poll_messages') return pollMessages(admin, session)

  throw new Error(`Unsupported webchat action: ${action}`)
}

async function bootstrapWidget(admin: AdminClient, publicToken: string, origin: string) {
  const publicTokenHash = await hashToken(publicToken)
  const { data: widget, error: widgetError } = await admin
    .rpc('resolve_webchat_widget_service', {
      candidate_token_hash: publicTokenHash,
      request_origin: origin,
    })
    .maybeSingle()
  if (widgetError) throw widgetError
  if (!widget) return { notFound: true }

  const sessionToken = crypto.randomUUID()
  const sessionTokenHash = await hashToken(sessionToken)
  const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString()

  const { data: session, error: sessionError } = await admin.from('webchat_sessions').insert({
    widget_id: widget.id,
    session_token_hash: sessionTokenHash,
    validated_origin: origin,
    expires_at: expiresAt,
    last_seen_at: new Date().toISOString(),
  }).select('id').single()
  if (sessionError) throw sessionError

  return {
    sessionId: session.id,
    sessionToken,
    expiresAt,
    iframeUrl: `/webchat/session/${sessionToken}`,
  }
}

async function requireSession(admin: AdminClient, sessionToken: string, origin: string) {
  const sessionTokenHash = await hashToken(sessionToken)
  const { data: session, error } = await admin
    .from('webchat_sessions')
    .select('*, webchat_widgets(*)')
    .eq('session_token_hash', sessionTokenHash)
    .eq('validated_origin', origin)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()
  if (error) throw error
  if (!session?.webchat_widgets?.is_active) throw new Error('Webchat session not found')

  await admin.from('webchat_sessions').update({ last_seen_at: new Date().toISOString() }).eq('id', session.id)
  return session
}

async function loadSession(admin: AdminClient, session: any) {
  const messages = session.conversation_id ? await getConversationMessages(admin, session.conversation_id) : []
  return {
    widget: sanitizeWidget(session.webchat_widgets),
    conversation: session.conversation_id ? { id: session.conversation_id } : null,
    messages,
  }
}

async function ensureConversation(admin: AdminClient, session: any, input: Record<string, unknown>) {
  if (session.conversation_id) return { conversation: { id: session.conversation_id } }
  const contact = await ensureContact(admin, session.webchat_widgets.organization_id, input.contact as Record<string, unknown> | undefined)
  const { data: conversation, error } = await admin.from('conversations').insert({
    organization_id: session.webchat_widgets.organization_id,
    contact_id: contact.id,
    channel: 'webchat',
    status: 'open',
    response_mode: 'assisted',
    subject: 'Webchat',
    last_message_at: new Date().toISOString(),
  }).select('id').single()
  if (error) throw error
  await admin.from('webchat_sessions').update({ contact_id: contact.id, conversation_id: conversation.id }).eq('id', session.id)
  return { conversation }
}

async function sendMessage(admin: AdminClient, session: any, input: Record<string, unknown>) {
  const ensured = await ensureConversation(admin, session, input)
  const body = String(input.body || '').trim()
  if (!body) throw new Error('Message body is required')

  const { data: message, error } = await admin.from('messages').insert({
    conversation_id: ensured.conversation.id,
    direction: 'inbound',
    author_type: 'contact',
    content_type: 'text',
    body,
    delivery_status: 'delivered',
    metadata: sanitizeWebhookMetadata({ source: 'webchat', consentAccepted: input.consentAccepted === true }),
  }).select('id, author_type, body, created_at').single()
  if (error) throw error
  await admin.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', ensured.conversation.id)
  return { conversation: ensured.conversation, message: mapMessage(message) }
}

async function requestAttachmentUpload(admin: AdminClient, session: any) {
  const path = `${session.webchat_widgets.organization_id}/${session.id}/${crypto.randomUUID()}`
  const { data, error } = await admin.storage.from('omnichannel-attachments').createSignedUploadUrl(path)
  if (error) throw error
  return { path, uploadUrl: data.signedUrl, token: data.token }
}

async function requestHuman(admin: AdminClient, session: any) {
  const ensured = await ensureConversation(admin, session, {})
  const { error } = await admin.from('conversations').update({ status: 'waiting_human', response_mode: 'manual' }).eq('id', ensured.conversation.id)
  if (error) throw error
  return { status: 'waiting_human', conversation: ensured.conversation }
}

async function pollMessages(admin: AdminClient, session: any) {
  if (!session.conversation_id) return { messages: [] }
  return { messages: await getConversationMessages(admin, session.conversation_id) }
}

async function ensureContact(admin: AdminClient, organizationId: string, contactInput: Record<string, unknown> = {}) {
  const email = typeof contactInput.email === 'string' ? contactInput.email.trim() : ''
  const displayName = typeof contactInput.name === 'string' ? contactInput.name.trim() : ''
  if (email) {
    const { data: existing, error: existingError } = await admin
      .from('omnichannel_contacts')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('email', email)
      .maybeSingle()
    if (existingError) throw existingError
    if (existing) return existing
  }
  const { data, error } = await admin.from('omnichannel_contacts').insert({
    organization_id: organizationId,
    display_name: displayName || email || 'Visitante webchat',
    email: email || null,
    external_identities: { webchat: crypto.randomUUID() },
    consent_metadata: sanitizeWebhookMetadata(contactInput),
    profile_metadata: {},
  }).select('id').single()
  if (error) throw error
  return data
}

async function getConversationMessages(admin: AdminClient, conversationId: string) {
  const { data, error } = await admin
    .from('messages')
    .select('id, author_type, body, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data || []).map(mapMessage)
}

function mapMessage(message: any) {
  return {
    id: message.id,
    authorType: message.author_type,
    body: message.body || '',
    createdAt: message.created_at,
  }
}

function sanitizeWidget(widget: any) {
  return {
    name: widget.name,
    branding: widget.branding || {},
    consentText: widget.consent_text || '',
    initialForm: Array.isArray(widget.initial_form) ? widget.initial_form : widget.initial_form?.fields || [],
  }
}
