import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import { buildSafeAiFallback } from '../../lib/edge-compat/omnichannel.js'
import { decodeProviderSecretEncryptionKey, loadProviderSecretFromPool } from '../../lib/edge-compat/providerSecrets.js'
import { normalizeWhatsAppInbound, sendWhatsAppTemplateMessage, sendWhatsAppTextMessage, verifyWhatsAppTemplateApproval } from '../../lib/edge-compat/whatsappProvider.js'
import { evaluateBrandGuardrails, resolveOmnichannelAssistantContext } from '../../modules/omnichannel/assistant-context.js'
import { evaluateWhatsAppDispatchPolicy } from '../../modules/omnichannel/whatsapp-dispatch-policy.js'
import { resolveWhatsAppTestRecipient } from '../../modules/omnichannel/whatsapp-recipient.js'

type Row = Record<string, unknown>
const record = (value: unknown): Row => value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {}

export async function handleInboundMessage(
  pool: Pick<pg.Pool, 'query' | 'connect'>,
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
  if (webhookEvent.channel !== 'whatsapp') throw new Error('channel_webhook_connection_unavailable')

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
      const updated = await applyWhatsAppDeliveryReceipt(pool, {
        connectionId,
        externalMessageId: String(message.externalMessageId || ''),
        status: deliveryStatus,
        occurredAt: String(record(message.metadata).providerTimestamp || inbound.occurredAt),
        errors: record(message.metadata).errors,
      })
      await markWebhookEventProcessed(pool, eventId)
      return { receipt: true, matched: Boolean(updated), messageId: updated?.id, deliveryStatus }
    }

    if (!webhookEvent.is_active) {
      await markWebhookEventIgnored(pool, eventId, 'connection_inactive')
      return { ignored: true, reason: 'connection_inactive' }
    }

    const inboundRecord = await persistInboundWhatsAppMessage(pool, {
      organizationId,
      connectionId,
      externalId,
      displayName: String(contact.displayName || externalId || 'Contato'),
      phone: typeof contact.phone === 'string' ? contact.phone : null,
      contentType: String(message.contentType || 'text'),
      body: typeof message.body === 'string' ? message.body : null,
      externalMessageId: typeof message.externalMessageId === 'string' ? message.externalMessageId : null,
      occurredAt: typeof inbound.occurredAt === 'string' && !Number.isNaN(Date.parse(inbound.occurredAt))
        ? inbound.occurredAt
        : new Date().toISOString(),
      metadata: record(message.metadata),
    })
    const { conversationId, responseMode, inboundMessageId } = inboundRecord
    if (inboundRecord.isNewMessage) {
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

    const requiresHumanReview = record(message.metadata).requiresHumanReview === true
    if (requiresHumanReview) {
      await pool.query(`UPDATE public.conversations SET status = 'waiting_human', updated_at = NOW() WHERE id = $1`, [conversationId])
      await pool.query(
        `INSERT INTO public.handoff_events (conversation_id, trigger, outcome)
         SELECT $1,'unsupported_whatsapp_media',$2::jsonb
          WHERE NOT EXISTS (
            SELECT 1 FROM public.handoff_events
             WHERE conversation_id = $1 AND trigger = 'unsupported_whatsapp_media'
               AND outcome->>'inboundMessageId' = $3
          )`,
        [conversationId, JSON.stringify({ inboundMessageId, contentType: message.contentType, originalMessageType: record(message.metadata).originalMessageType }), inboundMessageId],
      )
      await markWebhookEventProcessed(pool, eventId)
      return { conversationId, messageId: inboundMessageId, runtime: { skipped: true, reason: 'unsupported_media_handed_to_human' } }
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

    if (!String(message.body || '').trim() || responseMode === 'manual') {
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
      && responseMode === 'automatic'
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

async function markWebhookEventIgnored(pool: Pick<pg.Pool, 'query'>, eventId: string, reason: string) {
  await pool.query(
    `UPDATE public.channel_webhook_events
        SET status = 'ignored', protected_error_text = $2, processed_at = NULL
      WHERE id = $1`,
    [eventId, reason],
  )
}

async function applyWhatsAppDeliveryReceipt(
  pool: Pick<pg.Pool, 'query'>,
  input: { connectionId: string; externalMessageId: string; status: string; occurredAt: string; errors: unknown },
) {
  if (!input.externalMessageId) return null
  const updated = await pool.query<{ id: string; metadata: Row; delivery_status: string }>(
    `UPDATE public.messages
        SET delivery_status = CASE
              WHEN NULLIF(metadata->>'whatsappReceiptAt', '')::timestamptz > $4::timestamptz THEN delivery_status
              WHEN delivery_status = 'failed' THEN 'failed'
              WHEN $3 = 'failed' THEN 'failed'
              WHEN CASE delivery_status
                WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'sent' THEN 2
                WHEN 'processing' THEN 1 WHEN 'queued' THEN 0 ELSE -1 END
                < CASE $3 WHEN 'read' THEN 4 WHEN 'delivered' THEN 3 WHEN 'sent' THEN 2 ELSE -1 END THEN $3
              ELSE delivery_status END,
            metadata = CASE
              WHEN NULLIF(metadata->>'whatsappReceiptAt', '')::timestamptz > $4::timestamptz THEN metadata
              ELSE metadata || jsonb_build_object('whatsappReceiptAt', $4::text,
                'whatsappReceiptStatus', $3::text,
                'whatsappReceiptErrors', $5::jsonb)
            END || CASE WHEN $3 = 'failed'
              THEN jsonb_build_object('whatsappReceiptFailure', jsonb_build_object('occurredAt', $4::text, 'errors', $5::jsonb))
              ELSE '{}'::jsonb END,
            updated_at = NOW()
      WHERE connection_id = $1 AND external_message_id = $2 AND direction = 'outbound'
      RETURNING id, metadata, delivery_status`,
    [input.connectionId, input.externalMessageId, input.status, input.occurredAt, JSON.stringify(input.errors || [])],
  )
  const executionId = updated.rows[0]?.metadata?.executionId
  if (typeof executionId === 'string') {
    await pool.query(
      `UPDATE public.automation_executions
          SET payload = payload || jsonb_build_object('deliveryStatus', $2::text)
        WHERE id = $1`,
      [executionId, updated.rows[0].delivery_status],
    )
  }
  return updated.rows[0] || null
}

async function persistInboundWhatsAppMessage(
  pool: Pick<pg.Pool, 'connect'>,
  input: {
    organizationId: string
    connectionId: string
    externalId: string
    displayName: string
    phone: string | null
    contentType: string
    body: string | null
    externalMessageId: string | null
    occurredAt: string
    metadata: Row
  },
) {
  if (!input.externalMessageId) throw new Error('inbound_external_message_id_required')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Identity-wide lock also prevents duplicate contacts if two numbers receive the
    // same person's first message concurrently; conversation lookup remains per number.
    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${input.organizationId}:${input.externalId}`],
    )
    const contacts = await client.query<{ id: string }>(
      `SELECT id FROM public.omnichannel_contacts
        WHERE organization_id = $1 AND external_identities->>'providerExternalId' = $2
        LIMIT 1 FOR UPDATE`,
      [input.organizationId, input.externalId],
    )
    const contactId = contacts.rows[0]?.id || (await client.query<{ id: string }>(
      `INSERT INTO public.omnichannel_contacts (
         organization_id, display_name, phone, external_identities
       ) VALUES ($1,$2,$3,$4::jsonb) RETURNING id`,
      [input.organizationId, input.displayName || input.externalId, input.phone, JSON.stringify({ providerExternalId: input.externalId })],
    )).rows[0]?.id
    if (!contactId) throw new Error('contact_creation_failed')

    await client.query(
      `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`${input.organizationId}:${input.connectionId}:${contactId}`],
    )
    const conversations = await client.query<{ id: string; response_mode: string }>(
      `SELECT id, response_mode FROM public.conversations
        WHERE organization_id = $1 AND contact_id = $2 AND connection_id = $3
          AND status NOT IN ('resolved','archived')
        ORDER BY updated_at DESC LIMIT 1 FOR UPDATE`,
      [input.organizationId, contactId, input.connectionId],
    )
    const conversation = conversations.rows[0] || (await client.query<{ id: string; response_mode: string }>(
      `INSERT INTO public.conversations (
         organization_id, contact_id, connection_id, channel, status, response_mode, last_message_at
       ) VALUES ($1,$2,$3,'whatsapp','open','assisted',$4::timestamptz)
       RETURNING id, response_mode`,
      [input.organizationId, contactId, input.connectionId, input.occurredAt],
    )).rows[0]
    if (!conversation?.id) throw new Error('conversation_creation_failed')

    const inserted = await client.query<{ id: string }>(
      `INSERT INTO public.messages (
         conversation_id, connection_id, direction, author_type, content_type, body,
         external_message_id, delivery_status, metadata, created_at
       ) VALUES ($1,$2,'inbound','contact',$3,$4,$5,'delivered',$6::jsonb,$7::timestamptz)
       ON CONFLICT (connection_id, external_message_id) WHERE external_message_id IS NOT NULL
       DO NOTHING RETURNING id`,
      [conversation.id, input.connectionId, input.contentType, input.body, input.externalMessageId, JSON.stringify(input.metadata), input.occurredAt],
    )
    const existing = inserted.rows[0] ? null : await client.query<{ id: string }>(
      `SELECT id FROM public.messages
        WHERE connection_id = $1 AND external_message_id = $2 LIMIT 1`,
      [input.connectionId, input.externalMessageId],
    )
    const inboundMessageId = inserted.rows[0]?.id || existing?.rows[0]?.id
    if (!inboundMessageId) throw new Error('inbound_message_persistence_failed')

    await client.query(
      `UPDATE public.conversations
          SET last_message_at = GREATEST(COALESCE(last_message_at, $2::timestamptz), $2::timestamptz),
              updated_at = NOW()
        WHERE id = $1`,
      [conversation.id, input.occurredAt],
    )
    await client.query('COMMIT')
    return {
      conversationId: conversation.id,
      responseMode: conversation.response_mode,
      inboundMessageId,
      isNewMessage: Boolean(inserted.rows[0]),
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

export async function handleOutboundMessage(
  pool: Pick<pg.Pool, 'query' | 'connect'>,
  data: Row,
  options: { graphVersion?: string; graphBaseUrl?: string; providerSecretEncryptionKey?: string } = {},
) {
  const messageId = String(data.messageId || ''); if (!messageId) throw new Error('messageId is required')
  const previous = await pool.query<{ id: string; status: string; created_at?: string | Date }>(
    `SELECT id, status, created_at FROM public.outbound_message_runs WHERE message_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [messageId],
  )
  if (previous.rows[0]?.status === 'sent' || previous.rows[0]?.status === 'delivered') return { duplicate: true, runId: previous.rows[0].id }
  if (previous.rows[0]?.status === 'ambiguous') return { ambiguous: true, runId: previous.rows[0].id, retryBlocked: true }
  if (previous.rows[0]?.status === 'processing') {
    const startedAt = previous.rows[0].created_at ? new Date(previous.rows[0].created_at).getTime() : Date.now()
    if (Date.now() - startedAt < 5 * 60 * 1_000) return { inProgress: true, runId: previous.rows[0].id }
    await markWhatsAppSendAmbiguous(pool, previous.rows[0].id, messageId, 'worker_interrupted_after_send_may_have_started')
    return { ambiguous: true, runId: previous.rows[0].id, retryBlocked: true }
  }
  const message = await pool.query<{
    id: string; conversation_id: string; organization_id: string; connection_id: string | null
    message_connection_id: string | null; connection_organization_id: string | null; connection_channel: string | null
    connection_connection_id: string | null
    connection_active: boolean; token_state: string | null; waba_id: string | null
    body: string | null; direction: string; author_type: string; content_type: string; metadata: Row
    channel: string; phone: string | null; phone_number_id: string | null; protected_metadata_references: Row
    consent_metadata: Row; inside_customer_window: boolean; opted_out: boolean; permission_revoked: boolean
  }>(
    `SELECT m.id, m.conversation_id, c.organization_id, c.connection_id,
            m.connection_id AS message_connection_id,
            m.body, m.direction, m.author_type, m.content_type, m.metadata,
            c.channel, contact.phone, contact.consent_metadata,
            connection.organization_id AS connection_organization_id,
            connection.channel AS connection_channel,
            connection.id AS connection_connection_id,
            connection.is_active AS connection_active, connection.token_state,
            connection.provider_account_id AS waba_id,
            connection.phone_number_id, connection.protected_metadata_references,
            COALESCE((SELECT MAX(inbound.created_at) >= NOW() - INTERVAL '24 hours'
                        FROM public.messages inbound
                       WHERE inbound.conversation_id = c.id AND inbound.direction = 'inbound'), FALSE) AS inside_customer_window,
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
       LEFT JOIN public.channel_connections connection ON connection.id = c.connection_id
      WHERE m.id = $1 LIMIT 1`, [messageId])
  const row = message.rows[0]; if (!row) throw new Error('outbound_message_not_found')
  if (row.direction !== 'outbound') throw new Error('outbound_message_direction_required')
  if (row.author_type === 'ai' && row.metadata?.approvalStatus !== 'approved') throw new Error('ai_message_approval_required')
  if (row.channel !== 'whatsapp' || !row.connection_id) throw new Error('unsupported_outbound_channel')
  if (row.message_connection_id !== row.connection_id) throw new Error('outbound_message_connection_mismatch')
  if (row.connection_organization_id !== row.organization_id || row.connection_channel !== row.channel) {
    throw new Error('outbound_message_connection_tenant_mismatch')
  }
  if ((row.content_type !== 'template' && !row.body?.trim()) || !row.phone || !row.phone_number_id) {
    throw new Error('outbound_message_provider_context_required')
  }
  const providerRecipient = row.metadata?.source === 'channel_test'
    ? resolveWhatsAppTestRecipient(row.metadata.testRecipient, row.phone)
    : row.phone

  const crmSequenceMessage = row.metadata?.source === 'crm_sequence'
    || typeof row.metadata?.prospectingPlanId === 'string'
    || row.metadata?.messagingPurpose === 'marketing'
  const explicitConsent = row.metadata?.recipientOptIn === true
    || row.consent_metadata?.whatsappOptIn === true
    || row.consent_metadata?.whatsapp_opt_in === true
  const templateName = typeof row.metadata?.templateName === 'string' ? row.metadata.templateName.trim() : ''
  const purpose = row.metadata?.messagingPurpose === 'transactional'
    ? 'transactional'
    : crmSequenceMessage ? 'marketing' : 'service'
  const policyInput = {
    connectionActive: row.connection_active === true && row.token_state === 'connected',
    connectionMatchesConversation: row.connection_id !== null && row.connection_id === row.connection_connection_id,
    connectionMatchesMessage: row.message_connection_id === row.connection_id,
    tenantMatches: row.connection_organization_id === row.organization_id && row.connection_channel === row.channel,
    inCustomerWindow: row.inside_customer_window === true,
    consentGranted: explicitConsent,
    optedOut: row.opted_out === true,
    permissionRevoked: row.permission_revoked === true,
    contentType: row.content_type,
    templateName,
    purpose,
  } as const
  const preliminaryBlock = evaluateWhatsAppDispatchPolicy({
    ...policyInput,
    // Approval is checked remotely after all local safety rules pass.
    templateApproved: row.content_type === 'template' ? true : undefined,
  })
  if (preliminaryBlock) {
    await pool.query(
      `UPDATE public.messages
          SET delivery_status = 'failed', metadata = metadata || jsonb_build_object('dispatchBlockedReason', $2::text), updated_at = NOW()
        WHERE id = $1`,
      [messageId, preliminaryBlock],
    )
    return { sent: false, blocked: true, reason: preliminaryBlock }
  }

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

  let templateApproved: boolean | undefined
  if (row.content_type === 'template' && templateName) {
    const approval = await verifyWhatsAppTemplateApproval({
      wabaId: row.waba_id || '',
      templateName,
      languageCode: typeof row.metadata.languageCode === 'string' ? row.metadata.languageCode : 'pt_BR',
      accessToken: accessToken.value,
      graphVersion: options.graphVersion,
      graphBaseUrl: options.graphBaseUrl,
    })
    templateApproved = approval.approved
  }
  const policyBlock = evaluateWhatsAppDispatchPolicy({ ...policyInput, templateApproved })
  if (policyBlock) {
    await pool.query(
      `UPDATE public.messages
          SET delivery_status = 'failed', metadata = metadata || jsonb_build_object('dispatchBlockedReason', $2::text), updated_at = NOW()
        WHERE id = $1`,
      [messageId, policyBlock],
    )
    return { sent: false, blocked: true, reason: policyBlock }
  }
  const attempt = await acquireWhatsAppOutboundAttempt(pool, row)
  const runId = attempt.id
  if (attempt.status !== 'claimed') {
    if (attempt.status === 'sent' || attempt.status === 'delivered') return { duplicate: true, runId }
    return attempt.status === 'ambiguous'
      ? { ambiguous: true, runId, retryBlocked: true }
      : { inProgress: true, runId }
  }
  let providerMayHaveAccepted = false
  try {
    const connectionNow = await pool.query<{ id: string }>(
      `SELECT id FROM public.channel_connections
        WHERE id = $1 AND organization_id = $2 AND channel = 'whatsapp'
          AND phone_number_id = $3 AND is_active = TRUE AND token_state = 'connected'
        LIMIT 1`,
      [row.connection_id, row.organization_id, row.phone_number_id],
    )
    if (!connectionNow.rows[0]) {
      await pool.query(`UPDATE public.outbound_message_runs SET status = 'failed', protected_error_text = 'whatsapp_connection_unavailable', updated_at = NOW() WHERE id = $1`, [runId])
      await pool.query(`UPDATE public.messages SET delivery_status = 'failed', metadata = metadata || jsonb_build_object('dispatchBlockedReason','whatsapp_connection_unavailable'), updated_at = NOW() WHERE id = $1`, [messageId])
      return { sent: false, blocked: true, reason: 'whatsapp_connection_unavailable', runId }
    }
    const response = row.content_type === 'template'
      ? await sendWhatsAppTemplateMessage({
          to: providerRecipient,
          templateName: String(row.metadata.templateName || ''),
          languageCode: typeof row.metadata.languageCode === 'string' ? row.metadata.languageCode : undefined,
          components: Array.isArray(row.metadata.components) ? row.metadata.components as Row[] : undefined,
          phoneNumberId: row.phone_number_id,
          accessToken: accessToken.value,
          graphVersion: options.graphVersion,
          graphBaseUrl: options.graphBaseUrl,
          intentId: messageId,
        })
      : await sendWhatsAppTextMessage({
          to: providerRecipient,
          body: row.body || '',
          phoneNumberId: row.phone_number_id,
          accessToken: accessToken.value,
          graphVersion: options.graphVersion,
          graphBaseUrl: options.graphBaseUrl,
          intentId: messageId,
        })
    if (response.outcome === 'ambiguous') {
      providerMayHaveAccepted = true
      const reason = response.error || `whatsapp_provider_result_ambiguous_${response.status}`
      await markWhatsAppSendAmbiguous(pool, runId, messageId, reason)
      return { sent: false, ambiguous: true, retryBlocked: true, runId }
    }
    if (!response.ok) {
      const reason = response.error || `whatsapp_provider_http_${response.status}`
      await pool.query(`UPDATE public.outbound_message_runs SET status = 'failed', protected_error_text = $2, updated_at = NOW() WHERE id = $1`, [runId, safeError(reason)])
      await pool.query(`UPDATE public.messages SET delivery_status = 'failed', metadata = metadata || jsonb_build_object('dispatchError', $2::text), updated_at = NOW() WHERE id = $1`, [messageId, safeError(reason)])
      if (typeof row.metadata?.executionId === 'string') {
        await pool.query(`UPDATE public.automation_executions SET last_error = $2, payload = payload || jsonb_build_object('deliveryStatus','failed') WHERE id = $1`, [row.metadata.executionId, safeError(reason)])
      }
      return { sent: false, rejected: true, runId }
    }
    providerMayHaveAccepted = true
    const providerMessageId = extractExternalMessageId(response.data)
    await pool.query(
      `UPDATE public.outbound_message_runs
          SET status = 'sent', sanitized_request = $2::jsonb, sanitized_response = $3::jsonb, updated_at = NOW()
        WHERE id = $1`,
      [runId, JSON.stringify({ provider: 'meta_whatsapp', phoneNumberId: row.phone_number_id, to: '[redacted]' }), JSON.stringify(response.data || {})],
    )
    await pool.query(`UPDATE public.messages SET delivery_status = CASE WHEN delivery_status IN ('delivered','read') THEN delivery_status ELSE 'sent' END, external_message_id = COALESCE($2, external_message_id), updated_at = NOW() WHERE id = $1`, [messageId, providerMessageId])
    if (providerMessageId) {
      const priorReceipt = await pool.query<{ receipt: Row }>(
        `SELECT sanitized_payload->'_yux'->'receipt' AS receipt
           FROM public.channel_webhook_events
          WHERE connection_id = $1
            AND sanitized_payload->'_yux'->>'externalMessageId' = $2
            AND sanitized_payload->'_yux' ? 'receipt'
          ORDER BY (sanitized_payload #>> '{_yux,receipt,timestamp}')::timestamptz DESC
          LIMIT 1`,
        [row.connection_id, providerMessageId],
      )
      const receipt = record(priorReceipt.rows[0]?.receipt)
      if (typeof receipt.status === 'string' && typeof receipt.timestamp === 'string') {
        await applyWhatsAppDeliveryReceipt(pool, {
          connectionId: String(row.connection_id),
          externalMessageId: providerMessageId,
          status: receipt.status,
          occurredAt: receipt.timestamp,
          errors: receipt.errors,
        })
      }
    }
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
    return { runId, sent: true, providerMessageId }
  } catch (error) {
    if (providerMayHaveAccepted) {
      await markWhatsAppSendAmbiguous(pool, runId, messageId, safeError(error)).catch(() => undefined)
      throw error
    }
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

async function acquireWhatsAppOutboundAttempt(pool: Pick<pg.Pool, 'connect'>, message: { id: string; organization_id: string; conversation_id: string }) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    // Lock the message only while acquiring the attempt, never during the
    // provider call. Every competing dispatch/retry rechecks under this lock.
    const locked = await client.query<{ id: string; delivery_status: string }>(
      `SELECT id, delivery_status FROM public.messages WHERE id=$1 FOR UPDATE`, [message.id])
    if (!locked.rows[0]) throw new Error('outbound_message_not_found')
    const latest = await client.query<{ id: string; status: string }>(
      `SELECT id, status FROM public.outbound_message_runs WHERE message_id=$1 ORDER BY attempt_number DESC LIMIT 1`, [message.id])
    const previous = latest.rows[0]
    if (previous && previous.status !== 'failed') {
      await client.query('COMMIT')
      return previous
    }
    if (['sent', 'delivered', 'read'].includes(locked.rows[0].delivery_status)) {
      await client.query('COMMIT')
      return { id: previous?.id || message.id, status: 'sent' }
    }
    const run = await client.query<{ id: string }>(`INSERT INTO public.outbound_message_runs (
      organization_id,conversation_id,message_id,attempt_number,adapter_key,status
    ) VALUES ($1,$2,$3,COALESCE((SELECT MAX(attempt_number)+1 FROM public.outbound_message_runs WHERE message_id=$3),1),'worker','processing') RETURNING id`,
    [message.organization_id, message.conversation_id, message.id])
    const id = run.rows[0]?.id
    if (!id) throw new Error('outbound_attempt_not_acquired')
    await client.query(`UPDATE public.messages SET delivery_status='processing',updated_at=NOW() WHERE id=$1`, [message.id])
    await client.query('COMMIT')
    return { id, status: 'claimed' }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function markWhatsAppSendAmbiguous(pool: Pick<pg.Pool, 'query'>, runId: string, messageId: string, reason: string) {
  const sanitized = safeError(reason)
  await pool.query(
    `UPDATE public.outbound_message_runs
        SET status = 'ambiguous', protected_error_text = $2, updated_at = NOW()
      WHERE id = $1`,
    [runId, sanitized],
  )
  await pool.query(
    `UPDATE public.messages
        SET delivery_status = 'processing',
            metadata = metadata || jsonb_build_object('dispatchOutcome','ambiguous','dispatchError',$2::text),
            updated_at = NOW()
      WHERE id = $1`,
    [messageId, sanitized],
  )
  await pool.query(
    `UPDATE public.automation_executions
        SET last_error = $2,
            payload = payload || jsonb_build_object('deliveryStatus','ambiguous')
      WHERE id::text = (SELECT metadata->>'executionId' FROM public.messages WHERE id = $1)`,
    [messageId, sanitized],
  )
}

function extractExternalMessageId(data: unknown) {
  const messages = record(data).messages
  if (!Array.isArray(messages)) return null
  const id = record(messages[0]).id
  return typeof id === 'string' ? id : null
}

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000).replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
}
