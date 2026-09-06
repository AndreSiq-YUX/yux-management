import type pg from 'pg'
import { createBullMqJobId } from '../queue.js'
import type { DomainEventEnvelope } from '../../modules/events/types.js'

type DispatchQueue = {
  add(
    name: 'email.send' | 'omnichannel.dispatchOutbound',
    data: Record<string, unknown>,
    options?: { jobId?: string },
  ): Promise<unknown>
}

export async function handleCrmSequenceDeliveryRequested(
  pool: Pick<pg.Pool, 'query'>,
  event: DomainEventEnvelope,
  queue?: DispatchQueue,
) {
  if (event.eventType !== 'crm.sequence.delivery_requested' || event.aggregateType !== 'sequence_execution') {
    throw new Error('crm_sequence_delivery_event_required')
  }
  if (!queue) throw new Error('crm_sequence_delivery_queue_required')
  const executionId = text(event.payload.executionId)
  const channel = text(event.payload.channel)
  if (!executionId || executionId !== event.aggregateId || !['email', 'whatsapp'].includes(channel)) {
    throw new Error('crm_sequence_delivery_context_required')
  }

  const execution = await pool.query<{ id: string; organization_id: string; lead_id: string; status: string }>(
    `SELECT id, organization_id, lead_id, status
       FROM public.automation_executions
      WHERE id = $1 AND organization_id = $2
      LIMIT 1`,
    [executionId, event.organizationId],
  )
  if (!execution.rows[0] || execution.rows[0].status !== 'completed') {
    throw new Error('crm_sequence_execution_not_scheduled')
  }

  return channel === 'email'
    ? dispatchEmailIntent(pool, queue, event, executionId)
    : dispatchWhatsAppIntent(pool, queue, event, executionId)
}

async function dispatchEmailIntent(
  pool: Pick<pg.Pool, 'query'>,
  queue: DispatchQueue,
  event: DomainEventEnvelope,
  executionId: string,
) {
  const requestId = text(event.payload.requestId)
  if (!requestId) throw new Error('crm_sequence_email_request_required')
  const result = await pool.query<{
    id: string
    status: string
    email_kind: string
    recipient_opt_in: boolean
    suppressed: boolean
  }>(
    `SELECT request.id, request.status, request.email_kind, request.recipient_opt_in,
            EXISTS (
              SELECT 1 FROM public.email_suppression_entries suppression
               WHERE suppression.organization_id = request.organization_id
                 AND LOWER(suppression.email) = LOWER(request.recipient_email)
            ) AS suppressed
       FROM public.email_send_requests request
      WHERE request.id = $1 AND request.organization_id = $2
        AND request.source_entity_type = 'crm_sequence_execution'
        AND request.source_entity_id = $3
      LIMIT 1`,
    [requestId, event.organizationId, executionId],
  )
  const request = result.rows[0]
  if (!request) throw new Error('crm_sequence_email_intent_not_found')
  if (['sent', 'delivered', 'sending'].includes(request.status)) return { duplicate: true, status: request.status, requestId }
  if (request.suppressed) return blockEmailIntent(pool, executionId, requestId, 'recipient_suppressed', 'suppressed')
  if (request.email_kind === 'marketing' && !request.recipient_opt_in) {
    return blockEmailIntent(pool, executionId, requestId, 'recipient_not_opted_in', 'rejected')
  }
  if (request.status !== 'queued' && request.status !== 'failed') {
    return { blocked: true, reason: `email_request_${request.status}`, requestId }
  }
  await queue.add(
    'email.send',
    { requestId, organizationId: event.organizationId, executionId },
    { jobId: createBullMqJobId('crm-sequence-email', executionId) },
  )
  await recordQueuedExecution(pool, executionId)
  return { queued: true, channel: 'email', requestId, executionId }
}

async function dispatchWhatsAppIntent(
  pool: Pick<pg.Pool, 'query'>,
  queue: DispatchQueue,
  event: DomainEventEnvelope,
  executionId: string,
) {
  const messageId = text(event.payload.messageId)
  if (!messageId) throw new Error('crm_sequence_whatsapp_message_required')
  const result = await pool.query<{
    id: string
    delivery_status: string
    content_type: string
    metadata: Record<string, unknown>
    phone: string | null
    consent_metadata: Record<string, unknown>
    connection_active: boolean
    token_state: string
    phone_number_id: string | null
    access_token_reference: string | null
    inside_customer_window: boolean
    opted_out: boolean
    permission_revoked: boolean
  }>(
    `SELECT message.id, message.delivery_status, message.content_type, message.metadata,
            contact.phone, contact.consent_metadata,
            connection.is_active AS connection_active, connection.token_state,
            connection.phone_number_id,
            connection.protected_metadata_references->>'accessTokenReference' AS access_token_reference,
            EXISTS (
              SELECT 1 FROM public.messages inbound
               WHERE inbound.conversation_id = conversation.id
                 AND inbound.direction = 'inbound'
                 AND inbound.created_at >= NOW() - INTERVAL '24 hours'
            ) AS inside_customer_window,
            EXISTS (
              SELECT 1 FROM public.prospecting_plans plan
              JOIN public.radar_compliance_logs compliance
                ON compliance.opportunity_id = plan.radar_opportunity_id
               AND compliance.organization_id = plan.organization_id
               AND compliance.opt_out = TRUE
               WHERE plan.id::text = message.metadata->>'prospectingPlanId'
            ) AS opted_out,
            EXISTS (
              SELECT 1 FROM public.lead_channel_permissions permission
               WHERE permission.organization_id = conversation.organization_id
                 AND permission.lead_id = conversation.lead_id
                 AND permission.channel = 'whatsapp'
                 AND permission.status = 'revoked'
            ) AS permission_revoked
       FROM public.messages message
       JOIN public.conversations conversation ON conversation.id = message.conversation_id
       JOIN public.omnichannel_contacts contact ON contact.id = conversation.contact_id
       JOIN public.channel_connections connection ON connection.id = message.connection_id
      WHERE message.id = $1 AND conversation.organization_id = $2
        AND message.metadata->>'executionId' = $3
      LIMIT 1`,
    [messageId, event.organizationId, executionId],
  )
  const message = result.rows[0]
  if (!message) throw new Error('crm_sequence_whatsapp_intent_not_found')
  if (['sent', 'delivered', 'read', 'processing'].includes(message.delivery_status)) {
    return { duplicate: true, status: message.delivery_status, messageId }
  }

  const recipientOptIn = booleanValue(message.metadata.recipientOptIn)
    || booleanValue(message.consent_metadata.whatsappOptIn)
    || booleanValue(message.consent_metadata.whatsapp_opt_in)
  const templateName = text(message.metadata.templateName)
  const blockedReason = !recipientOptIn ? 'whatsapp_consent_required'
    : message.opted_out || message.permission_revoked ? 'recipient_opted_out'
      : !message.connection_active || message.token_state !== 'connected' || !message.phone_number_id || !message.access_token_reference
        ? 'whatsapp_connection_unavailable'
        : message.content_type !== 'template' && !message.inside_customer_window
          ? 'whatsapp_template_required_outside_window'
          : message.content_type === 'template' && !templateName
            ? 'whatsapp_template_name_required'
            : !message.phone
              ? 'whatsapp_recipient_phone_required'
              : null
  if (blockedReason) return blockWhatsAppIntent(pool, executionId, messageId, blockedReason)

  await queue.add(
    'omnichannel.dispatchOutbound',
    { messageId, organizationId: event.organizationId, executionId },
    { jobId: createBullMqJobId('crm-sequence-whatsapp', executionId) },
  )
  await recordQueuedExecution(pool, executionId)
  return { queued: true, channel: 'whatsapp', messageId, executionId }
}

async function blockEmailIntent(
  pool: Pick<pg.Pool, 'query'>,
  executionId: string,
  requestId: string,
  reason: string,
  status: 'rejected' | 'suppressed',
) {
  await pool.query(
    `UPDATE public.email_send_requests SET status = $2, protected_error = $3, updated_at = NOW() WHERE id = $1`,
    [requestId, status, reason],
  )
  await recordBlockedExecution(pool, executionId, reason)
  return { blocked: true, reason, requestId }
}

async function blockWhatsAppIntent(
  pool: Pick<pg.Pool, 'query'>,
  executionId: string,
  messageId: string,
  reason: string,
) {
  await pool.query(
    `UPDATE public.messages
        SET delivery_status = 'failed',
            metadata = metadata || jsonb_build_object('dispatchBlockedReason', $2),
            updated_at = NOW()
      WHERE id = $1`,
    [messageId, reason],
  )
  await recordBlockedExecution(pool, executionId, reason)
  return { blocked: true, reason, messageId }
}

async function recordBlockedExecution(pool: Pick<pg.Pool, 'query'>, executionId: string, reason: string) {
  await pool.query(
    `UPDATE public.automation_executions
        SET last_error = $2,
            payload = payload || jsonb_build_object('deliveryStatus', 'blocked', 'deliveryBlockedReason', $3)
      WHERE id = $1`,
    [executionId, `delivery_blocked:${reason}`, reason],
  )
}

async function recordQueuedExecution(pool: Pick<pg.Pool, 'query'>, executionId: string) {
  await pool.query(
    `UPDATE public.automation_executions
        SET last_error = NULL, payload = payload || jsonb_build_object('deliveryStatus', 'queued')
      WHERE id = $1`,
    [executionId],
  )
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function booleanValue(value: unknown) {
  return value === true || (typeof value === 'string' && value.toLowerCase() === 'true')
}
