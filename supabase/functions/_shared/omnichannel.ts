export type OmnichannelChannel = 'whatsapp' | 'instagram' | 'email' | 'webchat'
export type InboundEventType = 'message.created' | 'message.updated' | 'message.deleted' | 'conversation.updated'

export interface IdempotencyInput {
  connectionId: string
  externalEventId: string
  eventType: string
}

export interface NormalizedInboundEvent {
  connectionId: string
  channel: OmnichannelChannel
  externalEventId: string
  eventType: string
  idempotencyKey: string
  contact: {
    externalId: string
    displayName?: string
    email?: string
    phone?: string
    metadata: Record<string, unknown>
  }
  message: {
    externalMessageId?: string
    body?: string
    contentType: string
    attachments: Array<{
      externalId?: string
      filename: string
      mimeType: string
      byteSize: number
      url?: string
    }>
    metadata: Record<string, unknown>
  }
  occurredAt: string
  sanitizedPayload: Record<string, unknown>
}

export interface OutboundAdapterPayload {
  adapterKey: string
  channel: OmnichannelChannel
  conversationId: string
  messageId: string
  recipient: {
    externalId?: string
    email?: string
    phone?: string
  }
  content: {
    type: string
    body?: string
    attachments?: Array<Record<string, unknown>>
  }
  metadata: Record<string, unknown>
}

const channels = new Set<OmnichannelChannel>(['whatsapp', 'instagram', 'email', 'webchat'])
const redactedValue = '[redacted]'

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`)
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

function sanitizeKey(key: string) {
  const normalized = key.toLowerCase()
  return normalized.includes('token')
    || normalized.includes('authorization')
    || normalized.includes('password')
    || normalized.includes('secret')
    || normalized.includes('credential')
}

export function buildIdempotencyKey(input: IdempotencyInput) {
  return `${stringValue(input.connectionId, 'connectionId')}:${stringValue(input.eventType, 'eventType')}:${stringValue(input.externalEventId, 'externalEventId')}`
}

export function sanitizeWebhookMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeWebhookMetadata)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    sanitizeKey(key) ? redactedValue : sanitizeWebhookMetadata(entry),
  ]))
}

export function sanitizeProtectedError(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : String(error || 'Unknown error')
  return {
    message: rawMessage
      .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
      .replace(/\b(token|secret|password|credential)\s+[^,\s]+/gi, '$1 [redacted]'),
  }
}

export function parseInboundEvent(input: unknown): NormalizedInboundEvent {
  const payload = assertRecord(input, 'event')
  const channel = stringValue(payload.channel, 'channel') as OmnichannelChannel
  if (!channels.has(channel)) throw new Error(`Unsupported channel: ${channel}`)

  const contact = assertRecord(payload.contact, 'contact')
  const message = assertRecord(payload.message, 'message')
  const connectionId = stringValue(payload.connectionId, 'connectionId')
  const externalEventId = stringValue(payload.externalEventId, 'externalEventId')
  const eventType = stringValue(payload.eventType, 'eventType') as InboundEventType
  const occurredAt = optionalString(payload.occurredAt) || new Date().toISOString()

  return {
    connectionId,
    channel,
    externalEventId,
    eventType,
    idempotencyKey: buildIdempotencyKey({ connectionId, externalEventId, eventType }),
    contact: {
      externalId: optionalString(contact.externalId) || optionalString(contact.email) || optionalString(contact.phone) || externalEventId,
      displayName: optionalString(contact.displayName),
      email: optionalString(contact.email),
      phone: optionalString(contact.phone),
      metadata: sanitizeWebhookMetadata(contact.metadata || {}) as Record<string, unknown>,
    },
    message: {
      externalMessageId: optionalString(message.externalMessageId),
      body: optionalString(message.body),
      contentType: optionalString(message.contentType) || 'text',
      attachments: Array.isArray(message.attachments)
        ? message.attachments.map((attachment) => {
          const record = assertRecord(attachment, 'attachment')
          return {
            externalId: optionalString(record.externalId),
            filename: stringValue(record.filename, 'attachment.filename'),
            mimeType: stringValue(record.mimeType, 'attachment.mimeType'),
            byteSize: numberValue(record.byteSize),
            url: optionalString(record.url),
          }
        })
        : [],
      metadata: sanitizeWebhookMetadata(message.metadata || {}) as Record<string, unknown>,
    },
    occurredAt,
    sanitizedPayload: sanitizeWebhookMetadata(payload) as Record<string, unknown>,
  }
}

export function buildOutboundAdapterPayload(input: OutboundAdapterPayload): OutboundAdapterPayload {
  return {
    adapterKey: stringValue(input.adapterKey, 'adapterKey'),
    channel: input.channel,
    conversationId: stringValue(input.conversationId, 'conversationId'),
    messageId: stringValue(input.messageId, 'messageId'),
    recipient: {
      externalId: optionalString(input.recipient.externalId),
      email: optionalString(input.recipient.email),
      phone: optionalString(input.recipient.phone),
    },
    content: {
      type: optionalString(input.content.type) || 'text',
      body: optionalString(input.content.body),
      attachments: input.content.attachments,
    },
    metadata: sanitizeWebhookMetadata(input.metadata || {}) as Record<string, unknown>,
  }
}

export async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(stringValue(token, 'token'))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function validateWebchatEvent(input: unknown) {
  try {
    const event = assertRecord(input, 'webchat event')
    const action = stringValue(event.action, 'action')
    const origin = stringValue(event.origin, 'origin')
    new URL(origin)

    if (action !== 'bootstrap_widget' && !optionalString(event.sessionToken)) {
      return { valid: false, reason: 'missing_session_token' }
    }

    if (action === 'bootstrap_widget' && !optionalString(event.publicToken)) {
      return { valid: false, reason: 'missing_public_token' }
    }

    return { valid: true as const }
  } catch (error) {
    return { valid: false as const, reason: sanitizeProtectedError(error).message }
  }
}

export function calculateAiRunCost(input: {
  inputTokens: number | string
  outputTokens: number | string
  inputTokenPricePerMillion: number | string
  outputTokenPricePerMillion: number | string
}) {
  const inputTokens = numberValue(input.inputTokens)
  const outputTokens = numberValue(input.outputTokens)
  const inputCost = inputTokens / 1_000_000 * numberValue(input.inputTokenPricePerMillion)
  const outputCost = outputTokens / 1_000_000 * numberValue(input.outputTokenPricePerMillion)

  return {
    inputTokens,
    outputTokens,
    estimatedCost: Number((inputCost + outputCost).toFixed(6)),
  }
}

export function buildCrmSyncPayload(input: {
  organizationId: string
  conversationId: string
  contact: {
    displayName?: string
    email?: string
    phone?: string
  }
  summary?: string
  tags?: string[]
  metadata?: Record<string, unknown>
}) {
  return {
    organizationId: stringValue(input.organizationId, 'organizationId'),
    conversationId: stringValue(input.conversationId, 'conversationId'),
    contact: {
      displayName: optionalString(input.contact.displayName),
      email: optionalString(input.contact.email),
      phone: optionalString(input.contact.phone),
    },
    summary: optionalString(input.summary),
    tags: input.tags || [],
    metadata: sanitizeWebhookMetadata(input.metadata || {}) as Record<string, unknown>,
  }
}

function stringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value.map(entry => optionalString(entry)).filter((entry): entry is string => Boolean(entry))
}

function boundedConfidence(value: unknown) {
  const parsed = Number(value || 0)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(1, parsed))
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T) {
  const parsed = optionalString(value) as T | undefined
  return parsed && allowed.includes(parsed) ? parsed : fallback
}

export function buildCrmAiInsightPayload(input: {
  organizationId: string
  crmInstanceId: string
  leadId: string
  conversationId: string
  aiRunId: string
  outputText: string
  metadata?: Record<string, unknown>
}) {
  const sanitizedMetadata = sanitizeWebhookMetadata(input.metadata || {}) as Record<string, unknown>
  const provider = assertRecord(sanitizedMetadata.provider || {}, 'crm insight provider')
  const outputText = stringValue(input.outputText, 'outputText')
  const summary = optionalString(provider.summary) || outputText.slice(0, 500)
  const sentiment = enumValue(provider.sentiment, ['positive', 'neutral', 'negative', 'unknown'] as const, 'unknown')
  const urgency = enumValue(provider.urgency, ['high', 'medium', 'low', 'none'] as const, 'none')

  return {
    organization_id: stringValue(input.organizationId, 'organizationId'),
    crm_instance_id: stringValue(input.crmInstanceId, 'crmInstanceId'),
    lead_id: stringValue(input.leadId, 'leadId'),
    conversation_id: stringValue(input.conversationId, 'conversationId'),
    ai_run_id: stringValue(input.aiRunId, 'aiRunId'),
    summary,
    intent: optionalString(provider.intent) || optionalString(provider.classification) || null,
    sentiment,
    urgency,
    objections: stringArray(provider.objections),
    risks: stringArray(provider.risks),
    next_best_action: optionalString(provider.nextBestAction) || optionalString(provider.next_best_action) || null,
    confidence: boundedConfidence(provider.confidence),
    metadata: sanitizedMetadata,
  }
}

export function buildN8nWebhookPayload<T extends Record<string, unknown>>(payload: T) {
  return sanitizeWebhookMetadata(payload) as T
}

export function planAiResponse(input: { responseMode: 'automatic' | 'assisted' | 'manual'; inboundMessageId?: string }) {
  return {
    shouldGenerate: input.responseMode !== 'manual',
    shouldDispatch: input.responseMode === 'automatic',
    suggestionOnly: input.responseMode === 'assisted',
    inboundMessageId: input.inboundMessageId,
  }
}

export function selectPublishedKnowledge(entries: Array<Record<string, unknown>>) {
  return entries
    .filter(entry => entry.status === 'published')
    .map(entry => optionalString(entry.body_snapshot) || optionalString(entry.bodySnapshot))
    .filter((body): body is string => Boolean(body))
}

export function buildSafeAiFallback(error: unknown) {
  return {
    fallbackUsed: true,
    text: 'Nao consegui gerar uma resposta confiavel agora. Um atendente humano vai assumir a conversa.',
    protectedErrorText: sanitizeProtectedError(error).message,
  }
}

export function buildRetryAttempt(attempts: Array<Record<string, unknown>>) {
  const attemptNumber = attempts.reduce((max, attempt) => {
    const value = numberValue(attempt.attempt_number || attempt.attemptNumber)
    return Math.max(max, value)
  }, 0) + 1

  return {
    attemptNumber,
    shouldCreateMessage: false,
  }
}

export function buildPendingSchedulingRequest(input: {
  conversationId: string
  contactId: string
  requestedSlot: Record<string, unknown>
}) {
  return {
    conversationId: input.conversationId,
    contactId: input.contactId,
    requestedSlot: input.requestedSlot,
    status: 'pending',
    n8nMetadata: { configured: false },
  }
}
