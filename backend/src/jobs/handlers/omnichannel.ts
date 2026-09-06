import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import { buildSafeAiFallback } from '../../lib/edge-compat/omnichannel.js'
import { decodeProviderSecretEncryptionKey, loadProviderSecretFromPool } from '../../lib/edge-compat/providerSecrets.js'
import { normalizeWhatsAppInbound, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage } from '../../lib/edge-compat/whatsappProvider.js'
import { evaluateBrandGuardrails, resolveOmnichannelAssistantContext } from '../../modules/omnichannel/assistant-context.js'

type Row = Record<string, unknown>
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}

export async function handleInboundMessage(
  pool: Pick<pg.Pool, 'query'>,
  env: AppEnv,
  data: Row,
  queue?: { add(name: 'omnichannel.dispatchOutbound', data: Record<string, unknown>): Promise<unknown> },
) {
  const eventId = String(data.eventId || '')
  if (!eventId) throw new Error('inbound_message_event_required')
  const persisted = await pool.query<{
    id: string
    status: string
    sanitized_payload: Row
    connection_id: string
    organization_id: string
    channel: string
    is_active: boolean
  }>(
    `SELECT event.id, event.status, event.sanitized_payload,
            connection.id AS connection_id, connection.organization_id,
            connection.channel, connection.is_active
       FROM public.channel_webhook_events event
       JOIN public.channel_connections connection ON connection.id = event.connection_id
      WHERE event.id = $1
      LIMIT 1`,
    [eventId],
  )
  const legacyInbound = record(data.inbound)
  const webhookEvent = persisted.rows[0] ?? (
    Object.keys(legacyInbound).length > 0 && data.organizationId && data.connectionId
      ? {
          id: eventId,
          status: 'received',
          sanitized_payload: {},
          connection_id: String(data.connectionId),
          organization_id: String(data.organizationId),
          channel: 'whatsapp',
          is_active: true,
        }
      : null
  )
  if (!webhookEvent) throw new Error('channel_webhook_event_not_found')
  if (webhookEvent.status === 'processed') return { duplicate: true }
  if (webhookEvent.channel !== 'whatsapp' || !webhookEvent.is_active) throw new Error('channel_webhook_connection_unavailable')

  const recoverProcessing = data.recoverProcessing === true
  const claimed = await pool.query<{ id: string }>(
    `UPDATE public.channel_webhook_events
        SET status = 'processing', protected_error_text = NULL
      WHERE id = $1
        AND (status IN ('received', 'failed') OR ($2::boolean AND status = 'processing'))
      RETURNING id`,
    [eventId, recoverProcessing],
  )
  if (!claimed.rows[0]) throw new Error('channel_webhook_event_in_progress')

  const organizationId = webhookEvent.organization_id
  const connectionId = webhookEvent.connection_id
  let inbound: ReturnType<typeof normalizeWhatsAppInbound> | Row
  if (Object.keys(legacyInbound).length > 0 && !persisted.rows[0]) {
    inbound = legacyInbound
  } else {
    try {
      inbound = normalizeWhatsAppInbound(webhookEvent.sanitized_payload, { connectionId })
    } catch (error) {
      await pool.query(
        `UPDATE public.channel_webhook_events
            SET status = 'failed', protected_error_text = $2
          WHERE id = $1 AND status = 'processing'`,
        [eventId, safeError(error)],
      ).catch(() => undefined)
      throw error
    }
  }
  const contact = record(inbound.contact)
  const message = record(inbound.message)
  const externalId = String(contact.externalId || '')

  try {
    if (String(inbound.eventType || '') === 'message.updated') {
      const providerStatus = String(record(message.metadata).status || message.body || '').toLowerCase()
      const deliveryStatus = ['sent', 'delivered', 'read', 'failed'].includes(providerStatus)
        ? providerStatus
        : null
      if (!deliveryStatus) throw new Error('whatsapp_delivery_status_unsupported')
      const updated = await pool.query<{ id: string; metadata: Row }>(
        `UPDATE public.messages
            SET delivery_status = $3, updated_at = NOW()
          WHERE connection_id = $1 AND external_message_id = $2 AND direction = 'outbound'
          RETURNING id, metadata`,
        [connectionId, message.externalMessageId || null, deliveryStatus],
      )
      const executionId = updated.rows[0]?.metadata?.executionId
      if (typeof executionId === 'string') {
        await pool.query(
          `UPDATE public.automation_executions
              SET payload = payload || jsonb_build_object('deliveryStatus', $2::text)
            WHERE id = $1`,
          [executionId, deliveryStatus],
        )
      }
      await markWebhookEventProcessed(pool, eventId)
      return { receipt: true, matched: Boolean(updated.rows[0]), messageId: updated.rows[0]?.id, deliveryStatus }
    }

    const contacts = await pool.query<{ id: string }>(`SELECT id FROM public.omnichannel_contacts WHERE organization_id = $1 AND external_identities->>'providerExternalId' = $2 LIMIT 1`, [organizationId, externalId])
    const contactId = contacts.rows[0]?.id || (await pool.query<{ id: string }>(`INSERT INTO public.omnichannel_contacts (organization_id, display_name, phone, external_identities) VALUES ($1,$2,$3,$4::jsonb) RETURNING id`, [organizationId, String(contact.displayName || externalId || 'Contato'), contact.phone || null, JSON.stringify({ providerExternalId: externalId })])).rows[0]?.id
    if (!contactId) throw new Error('contact_creation_failed')
    const conversations = await pool.query<{ id: string; response_mode: string }>(`SELECT id, response_mode FROM public.conversations WHERE organization_id = $1 AND contact_id = $2 AND connection_id = $3 AND status <> 'resolved' ORDER BY updated_at DESC LIMIT 1`, [organizationId, contactId, connectionId])
    const createdConversation = conversations.rows[0] || (await pool.query<{ id: string; response_mode: string }>(`INSERT INTO public.conversations (organization_id, contact_id, connection_id, channel, status, response_mode, last_message_at) VALUES ($1,$2,$3,'whatsapp','open','assisted',NOW()) RETURNING id, response_mode`, [organizationId, contactId, connectionId])).rows[0]
    const conversationId = createdConversation?.id
    if (!conversationId) throw new Error('conversation_creation_failed')
    const inserted = await pool.query<{ id: string }>(`INSERT INTO public.messages (conversation_id, connection_id, direction, author_type, content_type, body, external_message_id, delivery_status, metadata) VALUES ($1,$2,'inbound','contact',$3,$4,$5,'delivered',$6::jsonb) ON CONFLICT DO NOTHING RETURNING id`, [conversationId, connectionId, String(message.contentType || 'text'), message.body || null, message.externalMessageId || null, JSON.stringify(message.metadata || {})])
    const existingMessage = inserted.rows[0] ? null : await pool.query<{ id: string }>(
      `SELECT id FROM public.messages
        WHERE connection_id = $1 AND external_message_id = $2
        LIMIT 1`,
      [connectionId, message.externalMessageId || null],
    )
    const inboundMessageId = inserted.rows[0]?.id || existingMessage?.rows[0]?.id
    if (!inboundMessageId) throw new Error('inbound_message_persistence_failed')
    if (inserted.rows[0]) {
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

    const priorAiMessage = await pool.query<{ id: string; metadata: Row }>(
      `SELECT id, metadata FROM public.messages
        WHERE conversation_id = $1 AND direction = 'outbound' AND author_type = 'ai'
          AND metadata->>'inboundMessageId' = $2
        ORDER BY created_at ASC
        LIMIT 1`,
      [conversationId, inboundMessageId],
    )
    if (priorAiMessage.rows[0]) {
      if (priorAiMessage.rows[0].metadata?.approvalStatus === 'approved' && queue) {
        await queue.add('omnichannel.dispatchOutbound', { messageId: priorAiMessage.rows[0].id, source: 'ai_autonomy' })
      }
      await markWebhookEventProcessed(pool, eventId)
      return { conversationId, messageId: inboundMessageId, aiMessageId: priorAiMessage.rows[0].id, duplicate: true }
    }

    if (!String(message.body || '').trim() || createdConversation?.response_mode === 'manual') {
      await markWebhookEventProcessed(pool, eventId)
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
    await markWebhookEventProcessed(pool, eventId)
    return { conversationId, messageId: inboundMessageId, aiMessageId, runtime }
  } catch (error) {
    await pool.query(
      `UPDATE public.channel_webhook_events
          SET status = 'failed', protected_error_text = $2
        WHERE id = $1 AND status = 'processing'`,
      [eventId, safeError(error)],
    ).catch(() => undefined)
    throw error
  }
}

async function markWebhookEventProcessed(pool: Pick<pg.Pool, 'query'>, eventId: string) {
  await pool.query(
    `UPDATE public.channel_webhook_events
        SET status = 'processed', processed_at = NOW(), protected_error_text = NULL
      WHERE id = $1`,
    [eventId],
  )
}

export async function handleOutboundMessage(
  pool: Pick<pg.Pool, 'query'>,
  data: Row,
  options: { graphBaseUrl?: string; providerSecretEncryptionKey?: string } = {},
) {
  const messageId = String(data.messageId || ''); if (!messageId) throw new Error('messageId is required')
  const previous = await pool.query<{ id: string; status: string }>(`SELECT id, status FROM public.outbound_message_runs WHERE message_id = $1 ORDER BY created_at DESC LIMIT 1`, [messageId])
  if (previous.rows[0]?.status === 'sent' || previous.rows[0]?.status === 'delivered') return { duplicate: true, runId: previous.rows[0].id }
  // Never issue a second provider request while the previous attempt has no terminal result.
  // A recovery process can explicitly mark stale attempts failed before re-dispatching them.
  if (previous.rows[0]?.status === 'processing') return { inProgress: true, runId: previous.rows[0].id }
  const message = await pool.query<{ id: string; conversation_id: string; organization_id: string; connection_id: string | null; body: string | null; direction: string; author_type: string; content_type: string; metadata: Row; channel: string; phone: string | null; phone_number_id: string | null; protected_metadata_references: Row; consent_metadata: Row; inside_customer_window: boolean; opted_out: boolean; permission_revoked: boolean }>(
    `SELECT m.id, m.conversation_id, c.organization_id, m.connection_id, m.body, m.direction, m.author_type, m.content_type, m.metadata,
            c.channel, contact.phone, contact.consent_metadata,
            connection.phone_number_id, connection.protected_metadata_references,
            EXISTS (
              SELECT 1 FROM public.messages inbound
               WHERE inbound.conversation_id = c.id AND inbound.direction = 'inbound'
                 AND inbound.created_at >= NOW() - INTERVAL '24 hours'
            ) AS inside_customer_window,
            EXISTS (
              SELECT 1 FROM public.prospecting_plans plan
              JOIN public.radar_compliance_logs compliance
                ON compliance.opportunity_id = plan.radar_opportunity_id
               AND compliance.organization_id = plan.organization_id
               AND compliance.opt_out = TRUE
               WHERE plan.id::text = m.metadata->>'prospectingPlanId'
            ) AS opted_out,
            EXISTS (
              SELECT 1 FROM public.lead_channel_permissions permission
               WHERE permission.organization_id = c.organization_id
                 AND permission.lead_id = c.lead_id
                 AND permission.channel = 'whatsapp' AND permission.status = 'revoked'
            ) AS permission_revoked
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
  const crmSequenceMessage = row.metadata?.source === 'crm_sequence'
  const explicitConsent = row.metadata?.recipientOptIn === true
    || row.consent_metadata?.whatsappOptIn === true
    || row.consent_metadata?.whatsapp_opt_in === true
  const templateName = typeof row.metadata?.templateName === 'string' ? row.metadata.templateName.trim() : ''
  const policyBlock = crmSequenceMessage && !explicitConsent ? 'whatsapp_consent_required'
    : crmSequenceMessage && (row.opted_out || row.permission_revoked) ? 'recipient_opted_out'
      : crmSequenceMessage && row.content_type !== 'template' && !row.inside_customer_window ? 'whatsapp_template_required_outside_window'
        : crmSequenceMessage && row.content_type === 'template' && !templateName ? 'whatsapp_template_name_required'
          : null
  if (policyBlock) {
    await pool.query(
      `UPDATE public.messages
          SET delivery_status = 'failed', metadata = metadata || jsonb_build_object('dispatchBlockedReason', $2::text), updated_at = NOW()
        WHERE id = $1`,
      [messageId, policyBlock],
    )
    return { sent: false, blocked: true, reason: policyBlock }
  }
  const run = await pool.query<{ id: string }>(`INSERT INTO public.outbound_message_runs (organization_id, conversation_id, message_id, attempt_number, adapter_key, status) VALUES ($1,$2,$3,COALESCE((SELECT MAX(attempt_number)+1 FROM public.outbound_message_runs WHERE message_id=$3),1),'worker','processing') RETURNING id`, [row.organization_id, row.conversation_id, row.id])
  await pool.query(`UPDATE public.messages SET delivery_status = 'processing', updated_at = NOW() WHERE id = $1`, [messageId])
  const runId = run.rows[0]?.id
  try {
    const reference = typeof row.protected_metadata_references?.accessTokenReference === 'string'
      ? row.protected_metadata_references.accessTokenReference
      : ''
    if (!reference) throw new Error('whatsapp_access_token_reference_required')
    const accessToken = await loadProviderSecretFromPool(
      pool,
      reference,
      options.providerSecretEncryptionKey
        ? decodeProviderSecretEncryptionKey(options.providerSecretEncryptionKey)
        : undefined,
    )
    if (accessToken.expired) throw new Error('whatsapp_access_token_expired')
    const response = row.content_type === 'template'
      ? await sendWhatsAppTemplateMessage({
          to: row.phone,
          templateName: String(row.metadata.templateName || ''),
          languageCode: typeof row.metadata.languageCode === 'string' ? row.metadata.languageCode : undefined,
          components: Array.isArray(row.metadata.components) ? row.metadata.components as Row[] : undefined,
          phoneNumberId: row.phone_number_id,
          accessToken: accessToken.value,
          graphBaseUrl: options.graphBaseUrl,
          intentId: messageId,
        })
      : await sendWhatsAppTextMessage({
          to: row.phone,
          body: row.body,
          phoneNumberId: row.phone_number_id,
          accessToken: accessToken.value,
          graphBaseUrl: options.graphBaseUrl,
          intentId: messageId,
        })
    if (!response.ok) throw new Error(response.error || `whatsapp_provider_http_${response.status}`)
    await pool.query(
      `UPDATE public.outbound_message_runs
          SET status = 'sent', sanitized_request = $2::jsonb, sanitized_response = $3::jsonb, updated_at = NOW()
        WHERE id = $1`,
      [runId, JSON.stringify({ provider: 'meta_whatsapp', phoneNumberId: row.phone_number_id, to: '[redacted]' }), JSON.stringify(response.data || {})],
    )
    await pool.query(`UPDATE public.messages SET delivery_status = 'sent', external_message_id = COALESCE($2, external_message_id), updated_at = NOW() WHERE id = $1`, [messageId, extractExternalMessageId(response.data)])
    if (typeof row.metadata?.executionId === 'string') {
      await pool.query(
        `UPDATE public.automation_executions
            SET payload = payload || jsonb_build_object(
              'deliveryStatus', 'provider_accepted', 'providerMessageId', $2::text
            )
          WHERE id = $1`,
        [row.metadata.executionId, extractExternalMessageId(response.data)],
      )
    }
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
    if (typeof row.metadata?.executionId === 'string') {
      await pool.query(
        `UPDATE public.automation_executions
            SET last_error = $2,
                payload = payload || jsonb_build_object('deliveryStatus', 'failed')
          WHERE id = $1`,
        [row.metadata.executionId, safeError(error)],
      )
    }
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
