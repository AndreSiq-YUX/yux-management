import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import { buildSafeAiFallback } from '../../lib/edge-compat/omnichannel.js'
import { loadProviderSecretFromPool } from '../../lib/edge-compat/providerSecrets.js'
import { sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from '../../lib/edge-compat/whatsappProvider.js'
import { evaluateBrandGuardrails, resolveOmnichannelAssistantContext } from '../../modules/omnichannel/assistant-context.js'

type Row = Record<string, unknown>
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}

export async function handleInboundMessage(
  pool: Pick<pg.Pool, 'query'>,
  env: AppEnv,
  data: Row,
  queue?: { add(name: 'omnichannel.dispatchOutbound', data: Record<string, unknown>): Promise<unknown> },
) {
  const inbound = record(data.inbound)
  const eventId = String(data.eventId || '')
  const organizationId = String(data.organizationId || '')
  const connectionId = String(data.connectionId || inbound.connectionId || '')
  if (!eventId || !organizationId || !connectionId) throw new Error('inbound_message_context_required')
  const claimed = await pool.query<{ id: string }>(`UPDATE public.channel_webhook_events SET status = 'processing' WHERE id = $1 AND status = 'received' RETURNING id`, [eventId])
  if (!claimed.rows[0]) return { duplicate: true }
  const contact = record(inbound.contact); const message = record(inbound.message)
  const externalId = String(contact.externalId || '')
  const contacts = await pool.query<{ id: string }>(`SELECT id FROM public.omnichannel_contacts WHERE organization_id = $1 AND external_identities->>'providerExternalId' = $2 LIMIT 1`, [organizationId, externalId])
  const contactId = contacts.rows[0]?.id || (await pool.query<{ id: string }>(`INSERT INTO public.omnichannel_contacts (organization_id, display_name, phone, external_identities) VALUES ($1,$2,$3,$4::jsonb) RETURNING id`, [organizationId, String(contact.displayName || externalId || 'Contato'), contact.phone || null, JSON.stringify({ providerExternalId: externalId })])).rows[0]?.id
  if (!contactId) throw new Error('contact_creation_failed')
  const conversations = await pool.query<{ id: string; response_mode: string }>(`SELECT id, response_mode FROM public.conversations WHERE organization_id = $1 AND contact_id = $2 AND connection_id = $3 AND status <> 'resolved' ORDER BY updated_at DESC LIMIT 1`, [organizationId, contactId, connectionId])
  const createdConversation = conversations.rows[0] || (await pool.query<{ id: string; response_mode: string }>(`INSERT INTO public.conversations (organization_id, contact_id, connection_id, channel, status, response_mode, last_message_at) VALUES ($1,$2,$3,'whatsapp','open','assisted',NOW()) RETURNING id, response_mode`, [organizationId, contactId, connectionId])).rows[0]
  const conversationId = createdConversation?.id
  const inserted = await pool.query<{ id: string }>(`INSERT INTO public.messages (conversation_id, connection_id, direction, author_type, content_type, body, external_message_id, delivery_status, metadata) VALUES ($1,$2,'inbound','contact',$3,$4,$5,'delivered',$6::jsonb) ON CONFLICT DO NOTHING RETURNING id`, [conversationId, connectionId, String(message.contentType || 'text'), message.body || null, message.externalMessageId || null, JSON.stringify(message.metadata || {})])
  await pool.query(`UPDATE public.channel_webhook_events SET status = 'processed', processed_at = NOW() WHERE id = $1`, [eventId])
  const inboundMessageId = inserted.rows[0]?.id
  if (inboundMessageId) {
    await pool.query(
      `INSERT INTO public.radar_outreach_events (
         organization_id, opportunity_id, lead_id, channel, event_type, notes
       )
       SELECT plan.organization_id, plan.radar_opportunity_id, plan.lead_id, 'whatsapp', 'contact_replied', $2
       FROM public.prospecting_plans plan
       JOIN public.conversations conversation ON conversation.lead_id = plan.lead_id
       WHERE conversation.id = $1 AND plan.status = 'active'`,
      [conversationId, `message:${inboundMessageId}`],
    )
  }
  if (!inboundMessageId || !String(message.body || '').trim() || createdConversation?.response_mode === 'manual') {
    return { conversationId, messageId: inboundMessageId, runtime: { skipped: true } }
  }

  const assistantContext = await resolveOmnichannelAssistantContext(pool, organizationId)
  const runtime: Row = env.YUX_AGENT_RUNTIME_URL
    ? await invokeAgentRuntime<Row>(env, '/workflows/execute', {
        organization_id: organizationId,
        client_id: assistantContext.clientId,
        contract_id: assistantContext.contractId,
        assistant_id: assistantContext.assistantId,
        conversation_id: conversationId,
        message: String(message.body || ''),
        profile_key: assistantContext.profileKey,
        source: 'whatsapp',
        mode: 'conversation_turn',
      })
    : buildSafeAiFallback(new Error('agent_runtime_not_configured')) as unknown as Row
  const synthesis = record(runtime.synthesis)
  const reply = record(synthesis.reply)
  const classification = record(synthesis.classification)
  const policy = record(runtime.policy)
  const replyBody = String(reply.body || '').trim()
  const brandGuardrail = evaluateBrandGuardrails(replyBody, assistantContext.brandRules)
  const automaticSendAllowed = policy.should_send === true
    && createdConversation?.response_mode === 'automatic'
    && !brandGuardrail.blocked
  let aiMessageId: string | undefined

  if (replyBody) {
    const approvalStatus = automaticSendAllowed
      ? 'approved'
      : policy.blocked === true || brandGuardrail.blocked ? 'blocked' : 'waiting_approval'
    const aiMessage = await pool.query<{ id: string }>(
      `INSERT INTO public.messages (
         conversation_id, connection_id, direction, author_type, content_type, body, delivery_status, metadata
       ) VALUES ($1,$2,'outbound','ai','text',$3,'queued',$4::jsonb)
       RETURNING id`,
      [
        conversationId,
        connectionId,
        replyBody,
        JSON.stringify({
          source: 'yux_agent_runtime',
          approvalStatus,
          agentExecutionRunId: record(runtime.run).id || null,
          policy,
          assistantId: assistantContext.assistantId || null,
          strategyProfileKey: assistantContext.profileKey,
          blockedByBrandGuardrail: brandGuardrail.blocked,
          matchedBrandRules: brandGuardrail.matchedRules,
          classification,
          qualification: synthesis.qualification || {},
          inboundMessageId,
        }),
      ],
    )
    aiMessageId = aiMessage.rows[0]?.id
    if (aiMessageId && automaticSendAllowed && queue) {
      await queue.add('omnichannel.dispatchOutbound', { messageId: aiMessageId, source: 'ai_autonomy' })
    }
  }

  const shouldHandoff = policy.should_handoff === true
    || policy.blocked === true
    || brandGuardrail.blocked
    || runtime.fallbackUsed === true
  await pool.query(
    `UPDATE public.conversations
     SET status = CASE WHEN $2::boolean THEN 'waiting_human' ELSE status END,
         classification = COALESCE($3, classification),
         sentiment = CASE WHEN $4 IN ('positive','neutral','negative','mixed') THEN $4 ELSE sentiment END,
         summary = COALESCE($5, summary),
         last_message_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [
      conversationId,
      shouldHandoff,
      typeof classification.intent === 'string' ? classification.intent : null,
      typeof classification.sentiment === 'string' ? classification.sentiment : null,
      typeof synthesis.qualification === 'object' ? `Proxima acao: ${String(record(synthesis.qualification).nextBestAction || '')}` : null,
    ],
  )
  if (shouldHandoff) {
    await pool.query(
      `INSERT INTO public.handoff_events (conversation_id, trigger, outcome)
       VALUES ($1,$2,$3::jsonb)`,
      [
        conversationId,
        runtime.fallbackUsed === true
          ? 'agent_runtime_unavailable'
          : brandGuardrail.blocked ? 'brand_guardrail_blocked' : policy.blocked === true ? 'ai_policy_blocked' : 'ai_policy_handoff',
        JSON.stringify({ policy, brandGuardrail, aiMessageId }),
      ],
    )
  }
  return { conversationId, messageId: inboundMessageId, aiMessageId, runtime }
}

export async function handleOutboundMessage(pool: Pick<pg.Pool, 'query'>, data: Row) {
  const messageId = String(data.messageId || ''); if (!messageId) throw new Error('messageId is required')
  const previous = await pool.query<{ id: string; status: string }>(`SELECT id, status FROM public.outbound_message_runs WHERE message_id = $1 ORDER BY created_at DESC LIMIT 1`, [messageId])
  if (previous.rows[0]?.status === 'sent' || previous.rows[0]?.status === 'delivered') return { duplicate: true, runId: previous.rows[0].id }
  // Never issue a second provider request while the previous attempt has no terminal result.
  // A recovery process can explicitly mark stale attempts failed before re-dispatching them.
  if (previous.rows[0]?.status === 'processing') return { inProgress: true, runId: previous.rows[0].id }
  const message = await pool.query<{ id: string; conversation_id: string; organization_id: string; connection_id: string | null; body: string | null; direction: string; author_type: string; content_type: string; metadata: Row; channel: string; phone: string | null; phone_number_id: string | null; protected_metadata_references: Row }>(
    `SELECT m.id, m.conversation_id, c.organization_id, m.connection_id, m.body, m.direction, m.author_type, m.content_type, m.metadata,
            c.channel, contact.phone, connection.phone_number_id, connection.protected_metadata_references
       FROM public.messages m
       JOIN public.conversations c ON c.id = m.conversation_id
       JOIN public.omnichannel_contacts contact ON contact.id = c.contact_id
       LEFT JOIN public.channel_connections connection ON connection.id = m.connection_id
      WHERE m.id = $1 LIMIT 1`, [messageId])
  const row = message.rows[0]; if (!row) throw new Error('outbound_message_not_found')
  if (row.direction !== 'outbound') throw new Error('outbound_message_direction_required')
  if (row.author_type === 'ai' && row.metadata?.approvalStatus !== 'approved') throw new Error('ai_message_approval_required')
  if (row.channel !== 'whatsapp' || !row.connection_id) throw new Error('unsupported_outbound_channel')
  if (!row.body?.trim() || !row.phone || !row.phone_number_id) throw new Error('outbound_message_provider_context_required')
  const run = await pool.query<{ id: string }>(`INSERT INTO public.outbound_message_runs (organization_id, conversation_id, message_id, attempt_number, adapter_key, status) VALUES ($1,$2,$3,COALESCE((SELECT MAX(attempt_number)+1 FROM public.outbound_message_runs WHERE message_id=$3),1),'worker','processing') RETURNING id`, [row.organization_id, row.conversation_id, row.id])
  await pool.query(`UPDATE public.messages SET delivery_status = 'queued', updated_at = NOW() WHERE id = $1`, [messageId])
  const runId = run.rows[0]?.id
  try {
    const reference = typeof row.protected_metadata_references?.accessTokenReference === 'string'
      ? row.protected_metadata_references.accessTokenReference
      : ''
    if (!reference) throw new Error('whatsapp_access_token_reference_required')
    const accessToken = await loadProviderSecretFromPool(pool, reference)
    if (accessToken.expired) throw new Error('whatsapp_access_token_expired')
    const response = row.content_type === 'template'
      ? await sendWhatsAppTemplateMessage({
          to: row.phone,
          templateName: String(row.metadata.templateName || ''),
          languageCode: typeof row.metadata.languageCode === 'string' ? row.metadata.languageCode : undefined,
          components: Array.isArray(row.metadata.components) ? row.metadata.components as Row[] : undefined,
          phoneNumberId: row.phone_number_id,
          accessToken: accessToken.value,
        })
      : await sendWhatsAppTextMessage({ to: row.phone, body: row.body, phoneNumberId: row.phone_number_id, accessToken: accessToken.value })
    if (!response.ok) throw new Error(response.error || `whatsapp_provider_http_${response.status}`)
    await pool.query(
      `UPDATE public.outbound_message_runs
          SET status = 'sent', sanitized_request = $2::jsonb, sanitized_response = $3::jsonb, updated_at = NOW()
        WHERE id = $1`,
      [runId, JSON.stringify({ provider: 'meta_whatsapp', phoneNumberId: row.phone_number_id, to: '[redacted]' }), JSON.stringify(response.data || {})],
    )
    await pool.query(`UPDATE public.messages SET delivery_status = 'sent', external_message_id = COALESCE($2, external_message_id), updated_at = NOW() WHERE id = $1`, [messageId, extractExternalMessageId(response.data)])
    if (typeof row.metadata?.prospectingPlanId === 'string') {
      await pool.query(
        `INSERT INTO public.radar_outreach_events (
           organization_id, opportunity_id, lead_id, channel, event_type, notes
         )
         SELECT organization_id, radar_opportunity_id, lead_id, 'whatsapp', 'contact_sent', $2
         FROM public.prospecting_plans WHERE id = $1`,
        [row.metadata.prospectingPlanId, `message:${messageId}`],
      )
    }
    return { runId, sent: true }
  } catch (error) {
    await pool.query(`UPDATE public.outbound_message_runs SET status = 'failed', protected_error_text = $2, updated_at = NOW() WHERE id = $1`, [runId, safeError(error)])
    await pool.query(`UPDATE public.messages SET delivery_status = 'failed', updated_at = NOW() WHERE id = $1`, [messageId])
    throw error
  }
}

function extractExternalMessageId(data: unknown) {
  const messages = record(data).messages
  return Array.isArray(messages) && typeof record(messages[0]).id === 'string' ? record(messages[0]).id : null
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000).replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
}
