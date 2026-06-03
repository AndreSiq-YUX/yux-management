import {
  callN8nWebhookWithTimeout,
  corsHeaders,
  formatProtectedError,
  getServiceRoleClient,
  getUserClient,
  json,
} from '../_shared/edge.ts'
import { buildOutboundAdapterPayload, buildRetryAttempt, sanitizeWebhookMetadata } from '../_shared/omnichannel.ts'
import { buildWhatsAppTextPayload, sendWhatsAppTextMessage } from '../_shared/whatsappProvider.ts'

type AdminClient = ReturnType<typeof getServiceRoleClient>

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      const authorization = req.headers.get('Authorization')
      if (!authorization) return json({ error: 'Unauthorized' }, 401)
      const { messageId } = await req.json()
      if (!messageId) return json({ error: 'messageId is required' }, 400)

      const { data: visible } = await getUserClient(authorization)
        .from('messages')
        .select('id')
        .eq('id', messageId)
        .single()
      if (!visible) return json({ error: 'Message not found' }, 404)

      return json({ success: true, dispatch: await dispatchOutboundMessage(getServiceRoleClient(), messageId) })
    } catch (error) {
      return json({ error: formatProtectedError(error) }, 500)
    }
  })
}

export async function dispatchOutboundMessage(admin: AdminClient, messageId: string) {
  const { data: message, error: messageError } = await admin
    .from('messages')
    .select('*, conversations(*, omnichannel_contacts(*), channel_connections(*))')
    .eq('id', messageId)
    .single()
  if (messageError || !message) throw messageError || new Error('Message not found')
  if (message.direction !== 'outbound') throw new Error('Only outbound messages can be dispatched')

  const conversation = message.conversations
  const connection = conversation.channel_connections
  const contact = conversation.omnichannel_contacts

  const { data: attempts, error: attemptsError } = await admin
    .from('outbound_message_runs')
    .select('attempt_number')
    .eq('message_id', messageId)
  if (attemptsError) throw attemptsError

  const retry = buildRetryAttempt(attempts || [])
  const { data: run, error: runError } = await admin.from('outbound_message_runs').insert({
    organization_id: conversation.organization_id,
    conversation_id: conversation.id,
    message_id: message.id,
    attempt_number: retry.attemptNumber,
    adapter_key: connection?.adapter_key || 'webchat',
    status: 'processing',
    sanitized_request: {},
  }).select().single()
  if (runError) throw runError

  const payload = buildOutboundAdapterPayload({
    adapterKey: connection?.adapter_key || 'webchat',
    channel: conversation.channel,
    conversationId: conversation.id,
    messageId: message.id,
    recipient: {
      externalId: contact?.external_identities?.[conversation.channel],
      email: contact?.email,
      phone: contact?.phone,
    },
    content: {
      type: message.content_type || 'text',
      body: message.body || undefined,
    },
    metadata: message.metadata || {},
  })

  await admin.from('outbound_message_runs').update({ sanitized_request: payload }).eq('id', run.id)

  if (conversation.channel === 'webchat') {
    await admin.from('messages').update({ delivery_status: 'delivered' }).eq('id', message.id)
    await admin.from('outbound_message_runs').update({
      status: 'delivered',
      sanitized_response: { internal: true },
    }).eq('id', run.id)
    return { runId: run.id, status: 'delivered' }
  }

  if (conversation.channel === 'whatsapp' && connection?.phone_number_id) {
    const recipient = contact?.phone || contact?.external_identities?.whatsapp
    if (!recipient) {
      await admin.from('messages').update({ delivery_status: 'failed' }).eq('id', message.id)
      await admin.from('outbound_message_runs').update({
        status: 'failed',
        protected_error_text: 'WhatsApp recipient phone is required',
      }).eq('id', run.id)
      return { runId: run.id, status: 'failed', provider: 'meta-whatsapp' }
    }

    const tokenState = connection.token_state || 'not_configured'
    const accessToken = resolveWhatsAppAccessToken(connection)
    const providerPayload = buildWhatsAppTextPayload({
      to: recipient,
      body: message.body || '',
    })

    await admin.from('outbound_message_runs').update({
      adapter_key: connection.adapter_key || 'meta-whatsapp',
      sanitized_request: sanitizeWebhookMetadata({
        ...payload,
        provider: 'meta-whatsapp',
        phoneNumberId: connection.phone_number_id,
        providerPayload,
      }),
    }).eq('id', run.id)

    if (tokenState === 'needs_reauth') {
      await admin.from('messages').update({ delivery_status: 'failed' }).eq('id', message.id)
      await admin.from('outbound_message_runs').update({
        status: 'failed',
        protected_error_text: 'WhatsApp provider token needs reauth',
      }).eq('id', run.id)
      return { runId: run.id, status: 'failed', provider: 'meta-whatsapp', tokenState }
    }

    const providerResult = await sendWhatsAppTextMessage({
      phoneNumberId: connection.phone_number_id,
      accessToken,
      to: recipient,
      body: message.body || '',
      graphVersion: Deno.env.get('WHATSAPP_GRAPH_VERSION') || 'v20.0',
    })
    const success = Boolean(providerResult.configured && providerResult.ok)
    const queuedForConfig = !providerResult.configured
    const status = success ? 'sent' : queuedForConfig ? 'queued' : 'failed'

    await admin.from('messages').update({ delivery_status: status }).eq('id', message.id)
    await admin.from('outbound_message_runs').update({
      status,
      sanitized_response: sanitizeWebhookMetadata(providerResult),
      protected_error_text: success || queuedForConfig ? null : formatProtectedError(providerResult.error || `WhatsApp provider returned ${providerResult.status}`),
    }).eq('id', run.id)

    if (providerResult.configured && (providerResult.status === 401 || providerResult.status === 403)) {
      await admin.from('channel_connections').update({ token_state: 'needs_reauth' }).eq('id', connection.id)
    }

    return { runId: run.id, status, provider: 'meta-whatsapp' }
  }

  const webhookResult = await callN8nWebhookWithTimeout(
    Deno.env.get('N8N_OMNICHANNEL_OUTBOUND_WEBHOOK_URL'),
    payload as unknown as Record<string, unknown>,
  )
  const success = Boolean(webhookResult.configured && webhookResult.ok)

  await admin.from('messages').update({ delivery_status: success ? 'sent' : 'failed' }).eq('id', message.id)
  await admin.from('outbound_message_runs').update({
    status: success ? 'sent' : 'failed',
    sanitized_response: sanitizeWebhookMetadata(webhookResult),
    protected_error_text: success ? null : formatProtectedError(webhookResult.error || `Outbound webhook returned ${webhookResult.status}`),
  }).eq('id', run.id)

  return { runId: run.id, status: success ? 'sent' : 'failed' }
}

function resolveWhatsAppAccessToken(connection: Record<string, any>) {
  const references = connection.protected_metadata_references || {}
  const tokenEnv = typeof references.accessTokenEnv === 'string' ? references.accessTokenEnv : undefined
  if (tokenEnv) return Deno.env.get(tokenEnv)
  return Deno.env.get('WHATSAPP_ACCESS_TOKEN')
}
