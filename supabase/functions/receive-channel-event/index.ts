import { corsHeaders, getServiceRoleClient, json } from '../_shared/edge.ts'
import {
  hashToken,
  parseInboundEvent,
  sanitizeProtectedError,
  sanitizeWebhookMetadata,
} from '../_shared/omnichannel.ts'
import {
  isWhatsAppCloudPayload,
  normalizeWhatsAppInbound,
  validateWhatsAppSignature,
} from '../_shared/whatsappProvider.ts'
import {
  normalizeInstagramInbound,
  normalizeMessengerInbound,
} from '../_shared/metaChannel.ts'

type AdminClient = ReturnType<typeof getServiceRoleClient>

interface ProcessOptions {
  adapterToken?: string
  simulatorUserId?: string
}

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method === 'GET') return verifyWhatsAppWebhook(req)

    try {
      const rawBody = await req.text()
      const body = rawBody ? JSON.parse(rawBody) : {}
      if (isWhatsAppCloudPayload(body)) {
        const signatureValid = await validateWhatsAppSignature({
          appSecret: Deno.env.get('WHATSAPP_WEBHOOK_APP_SECRET'),
          rawBody,
          signatureHeader: req.headers.get('x-hub-signature-256'),
        })
        if (!signatureValid) return json({ error: 'Invalid WhatsApp webhook signature' }, 401)

        const result = await processWhatsAppProviderEvent(getServiceRoleClient(), body)
        return json({ success: true, provider: 'meta-whatsapp', ...result })
      }

      if (body.object === 'instagram') {
        const result = await processMetaProviderEvent(getServiceRoleClient(), 'instagram', body)
        return json({ success: true, provider: 'meta-instagram', ...result })
      }

      if (body.object === 'page') {
        const result = await processMetaProviderEvent(getServiceRoleClient(), 'messenger', body)
        return json({ success: true, provider: 'meta-messenger', ...result })
      }

      const adapterToken = req.headers.get('x-omnichannel-token') || body.adapterToken
      const result = await processChannelEvent(getServiceRoleClient(), body.event || body, { adapterToken })
      return json({ success: true, ...result })
    } catch (error) {
      const protectedError = sanitizeProtectedError(error)
      return json({ error: protectedError.message }, 400)
    }
  })
}

function verifyWhatsAppWebhook(req: Request) {
  const url = new URL(req.url)
  const mode = url.searchParams.get('hub.mode')
  const token = url.searchParams.get('hub.verify_token')
  const challenge = url.searchParams.get('hub.challenge')
  const expectedToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN')

  if (mode === 'subscribe' && expectedToken && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/plain' } })
  }

  return json({ error: 'Webhook verification failed' }, 403)
}

export async function processWhatsAppProviderEvent(admin: AdminClient, payload: unknown) {
  const preliminaryEvent = normalizeWhatsAppInbound(payload)
  const { data: connection, error } = await admin
    .from('channel_connections')
    .select('id')
    .eq('channel', 'whatsapp')
    .eq('phone_number_id', preliminaryEvent.phoneNumberId)
    .eq('is_active', true)
    .maybeSingle()
  if (error) throw error

  const event = connection?.id
    ? normalizeWhatsAppInbound(payload, { connectionId: connection.id })
    : preliminaryEvent

  return processChannelEvent(admin, event)
}

export async function processMetaProviderEvent(admin: AdminClient, channel: 'instagram' | 'messenger', payload: unknown) {
  const preliminaryEvent = channel === 'instagram'
    ? normalizeInstagramInbound(payload)
    : normalizeMessengerInbound(payload)

  const { data: connection, error } = await admin
    .from('channel_connections')
    .select('id')
    .eq('channel', channel)
    .eq('is_active', true)
    .or(`provider_asset_id.eq.${preliminaryEvent.connectionId},provider_account_id.eq.${preliminaryEvent.connectionId}`)
    .maybeSingle()
  if (error) throw error

  const event = connection?.id
    ? channel === 'instagram'
      ? normalizeInstagramInbound(payload, { connectionId: connection.id })
      : normalizeMessengerInbound(payload, { connectionId: connection.id })
    : preliminaryEvent

  return processChannelEvent(admin, event)
}

export async function processChannelEvent(admin: AdminClient, input: unknown, options: ProcessOptions = {}) {
  const event = parseInboundEvent(input)
  const adapterTokenHash = options.adapterToken ? await hashToken(options.adapterToken) : undefined

  let connectionQuery = admin
    .from('channel_connections')
    .select('*')
    .eq('id', event.connectionId)
    .eq('channel', event.channel)
    .eq('is_active', true)

  if (adapterTokenHash) connectionQuery = connectionQuery.eq('inbound_token_hash', adapterTokenHash)

  const { data: connection, error: connectionError } = await connectionQuery.maybeSingle()
  if (connectionError) throw connectionError
  if (!connection) throw new Error('Channel connection not found')

  const { data: existingWebhook, error: existingWebhookError } = await admin
    .from('channel_webhook_events')
    .select('id,status')
    .eq('idempotency_key', event.idempotencyKey)
    .maybeSingle()
  if (existingWebhookError) throw existingWebhookError
  if (existingWebhook?.status === 'processed') return { duplicate: true, webhookEventId: existingWebhook.id }

  const { data: webhookEvent, error: webhookError } = await admin
    .from('channel_webhook_events')
    .upsert({
      connection_id: connection.id,
      external_event_id: event.externalEventId,
      event_type: event.eventType,
      idempotency_key: event.idempotencyKey,
      sanitized_payload: event.sanitizedPayload,
      status: 'processing',
      protected_error_text: null,
      received_at: event.occurredAt,
    }, { onConflict: 'idempotency_key' })
    .select()
    .single()
  if (webhookError) throw webhookError

  try {
    const contact = await upsertContact(admin, connection.organization_id, event)
    const conversation = await findOrCreateConversation(admin, connection, contact.id, event)
    const message = await appendInboundMessage(admin, conversation.id, connection.id, event)

    const connectionUpdate: Record<string, unknown> = { last_event_at: event.occurredAt }
    if (event.channel === 'whatsapp' || event.channel === 'instagram' || event.channel === 'messenger') {
      connectionUpdate.last_provider_sync_at = event.occurredAt
    }
    await admin.from('channel_connections').update(connectionUpdate).eq('id', connection.id)
    await admin.from('conversations').update({
      last_message_at: event.occurredAt,
      status: conversation.status === 'resolved' || conversation.status === 'archived' ? 'open' : conversation.status,
      updated_at: new Date().toISOString(),
    }).eq('id', conversation.id)

    const { data: crmSync, error: crmError } = await admin.rpc('sync_omnichannel_crm_service', {
      target_conversation_id: conversation.id,
      sync_metadata: { webhookEventId: webhookEvent.id, simulatorUserId: options.simulatorUserId || null },
    })
    if (crmError) throw crmError

    const handoff = await evaluateSimpleHandoff(admin, connection.organization_id, conversation, event)
    const selectedMode = handoff?.responseMode || conversation.response_mode
    let aiRunId: string | undefined

    if (selectedMode !== 'manual') {
      const { data: aiRun, error: aiError } = await admin.from('ai_message_runs').insert({
        organization_id: connection.organization_id,
        conversation_id: conversation.id,
        inbound_message_id: message.id,
        logical_provider: 'n8n',
        model: 'provider-neutral',
        status: 'queued',
        metadata: { source: 'receive-channel-event' },
      }).select('id').single()
      if (aiError) throw aiError
      aiRunId = aiRun.id
    }

    await admin.from('channel_webhook_events').update({
      status: 'processed',
      processed_at: new Date().toISOString(),
    }).eq('id', webhookEvent.id)

    return {
      duplicate: false,
      webhookEventId: webhookEvent.id,
      contactId: contact.id,
      conversationId: conversation.id,
      messageId: message.id,
      crmSync,
      handoff,
      aiRunId,
    }
  } catch (error) {
    await admin.from('channel_webhook_events').update({
      status: 'failed',
      protected_error_text: sanitizeProtectedError(error).message,
      processed_at: new Date().toISOString(),
    }).eq('id', webhookEvent.id)
    throw error
  }
}

async function upsertContact(admin: AdminClient, organizationId: string, event: ReturnType<typeof parseInboundEvent>) {
  const identity = { [event.channel]: event.contact.externalId }
  let query = admin.from('omnichannel_contacts').select('*').eq('organization_id', organizationId)

  if (event.contact.email) query = query.eq('email', event.contact.email)
  else if (event.contact.phone) query = query.eq('phone', event.contact.phone)
  else query = query.contains('external_identities', identity)

  const { data: existing, error: existingError } = await query.maybeSingle()
  if (existingError) throw existingError
  if (existing) {
    const { data, error } = await admin.from('omnichannel_contacts').update({
      display_name: event.contact.displayName || existing.display_name,
      email: event.contact.email || existing.email,
      phone: event.contact.phone || existing.phone,
      external_identities: { ...(existing.external_identities || {}), ...identity },
      profile_metadata: sanitizeWebhookMetadata({ ...(existing.profile_metadata || {}), ...(event.contact.metadata || {}) }),
    }).eq('id', existing.id).select().single()
    if (error) throw error
    return data
  }

  const { data, error } = await admin.from('omnichannel_contacts').insert({
    organization_id: organizationId,
    display_name: event.contact.displayName || event.contact.email || event.contact.phone || 'Contato omnichannel',
    email: event.contact.email || null,
    phone: event.contact.phone || null,
    external_identities: identity,
    consent_metadata: {},
    profile_metadata: event.contact.metadata || {},
  }).select().single()
  if (error) throw error
  return data
}

async function findOrCreateConversation(admin: AdminClient, connection: any, contactId: string, event: ReturnType<typeof parseInboundEvent>) {
  const { data: existing, error: existingError } = await admin
    .from('conversations')
    .select('*')
    .eq('organization_id', connection.organization_id)
    .eq('contact_id', contactId)
    .eq('connection_id', connection.id)
    .not('status', 'in', '("resolved","archived")')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return existing

  const { data: settings } = await admin
    .from('omnichannel_settings')
    .select('default_response_mode')
    .eq('organization_id', connection.organization_id)
    .maybeSingle()

  const { data, error } = await admin.from('conversations').insert({
    organization_id: connection.organization_id,
    contact_id: contactId,
    connection_id: connection.id,
    channel: event.channel,
    status: 'open',
    response_mode: settings?.default_response_mode || 'assisted',
    subject: event.message.body?.slice(0, 120) || `Nova conversa ${event.channel}`,
    last_message_at: event.occurredAt,
  }).select().single()
  if (error) throw error
  return data
}

async function appendInboundMessage(admin: AdminClient, conversationId: string, connectionId: string, event: ReturnType<typeof parseInboundEvent>) {
  const { data: existing, error: existingError } = await admin
    .from('messages')
    .select('id')
    .eq('connection_id', connectionId)
    .eq('external_message_id', event.message.externalMessageId || event.externalEventId)
    .maybeSingle()
  if (existingError) throw existingError
  if (existing) return existing

  const { data: message, error } = await admin.from('messages').insert({
    conversation_id: conversationId,
    connection_id: connectionId,
    direction: 'inbound',
    author_type: 'contact',
    content_type: event.message.contentType,
    body: event.message.body || null,
    external_message_id: event.message.externalMessageId || event.externalEventId,
    delivery_status: 'delivered',
    metadata: event.message.metadata || {},
    created_at: event.occurredAt,
  }).select().single()
  if (error) throw error

  if (event.message.attachments.length) {
    const { error: attachmentError } = await admin.from('message_attachments').insert(event.message.attachments.map((attachment, index) => ({
      message_id: message.id,
      storage_path: `${event.connectionId}/${conversationId}/${message.id}/${index}-${attachment.filename}`,
      filename: attachment.filename,
      mime_type: attachment.mimeType,
      byte_size: attachment.byteSize,
    })))
    if (attachmentError) throw attachmentError
  }

  return message
}

async function evaluateSimpleHandoff(admin: AdminClient, organizationId: string, conversation: any, event: ReturnType<typeof parseInboundEvent>) {
  const lowerBody = (event.message.body || '').toLowerCase()
  const humanRequested = lowerBody.includes('humano') || lowerBody.includes('atendente') || lowerBody.includes('cancelar')
  if (!humanRequested) return null

  const { data: rules, error } = await admin
    .from('handoff_rules')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('is_enabled', true)
    .order('priority')
  if (error) throw error

  const matchedRule = (rules || [])[0]
  const outcome = matchedRule?.outcome || { type: 'manual' }

  const { data: eventRow, error: eventError } = await admin.from('handoff_events').insert({
    conversation_id: conversation.id,
    rule_id: matchedRule?.id || null,
    trigger: matchedRule ? 'matched_rule' : 'human_request',
    matched_conditions: matchedRule?.conditions || [{ type: 'human_request' }],
    previous_assignment: {
      queueId: conversation.queue_id,
      teamId: conversation.team_id,
      assignedUserId: conversation.assigned_user_id,
    },
    next_assignment: outcome,
    outcome,
  }).select().single()
  if (eventError) throw eventError

  await admin.from('conversations').update({
    status: 'waiting_human',
    response_mode: 'manual',
    queue_id: outcome.queueId || conversation.queue_id,
    team_id: outcome.teamId || conversation.team_id,
    assigned_user_id: outcome.fixedUserId || conversation.assigned_user_id,
  }).eq('id', conversation.id)

  return { eventId: eventRow.id, responseMode: 'manual', outcome }
}
