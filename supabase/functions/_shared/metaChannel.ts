import { buildIdempotencyKey, sanitizeWebhookMetadata } from './omnichannel.ts'

type JsonRecord = Record<string, unknown>
type MetaChannel = 'whatsapp' | 'instagram' | 'messenger'

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function buildGraphUrl(input: { graphVersion?: string | null; path: string }) {
  const version = input.graphVersion || 'v20.0'
  const path = input.path.startsWith('/') ? input.path : `/${input.path}`
  return `https://graph.facebook.com/${version}${path}`
}

export function validateMetaChannel(value: unknown): MetaChannel {
  if (value === 'whatsapp' || value === 'instagram' || value === 'messenger') return value
  throw new Error('Unsupported Meta channel')
}

export function sanitizeMetaGraphPayload(payload: unknown): JsonRecord {
  const stripped = sanitizeWebhookMetadata(payload) as JsonRecord
  for (const key of ['access_token', 'accessToken', 'app_secret', 'appSecret', 'client_secret', 'clientSecret', 'token']) {
    delete stripped[key]
  }
  return stripped
}

export function deriveTokenStateFromGraphStatus(status: number) {
  if (status === 401 || status === 403) return 'needs_reauth'
  if (status >= 400) return 'failed'
  return 'connected'
}

export function normalizeMessengerInbound(payload: unknown, options: { connectionId?: string } = {}) {
  const root = record(payload)
  const entry = array(root.entry)[0]
  const messaging = array(entry?.messaging)[0]
  const message = record(messaging?.message)
  const sender = record(messaging?.sender)
  const recipient = record(messaging?.recipient)
  const externalMessageId = stringValue(message.mid) || `${Date.now()}`
  const connectionId = options.connectionId || stringValue(recipient.id) || stringValue(entry?.id) || 'messenger'

  return {
    connectionId,
    channel: 'messenger' as const,
    externalMessageId,
    externalEventId: externalMessageId,
    eventType: 'message.created' as const,
    idempotencyKey: buildIdempotencyKey({ connectionId, externalEventId: externalMessageId, eventType: 'message.created' }),
    contact: {
      externalId: stringValue(sender.id) || 'unknown',
      displayName: undefined,
      metadata: sanitizeWebhookMetadata({ provider: 'meta', pageId: recipient.id }) as JsonRecord,
    },
    message: {
      externalMessageId,
      body: stringValue(message.text) || '[messenger]',
      contentType: 'text',
      attachments: [],
      metadata: sanitizeWebhookMetadata({ provider: 'meta', pageId: recipient.id }) as JsonRecord,
    },
    occurredAt: new Date(Number(messaging?.timestamp || Date.now())).toISOString(),
    sanitizedPayload: sanitizeWebhookMetadata(payload) as JsonRecord,
  }
}

export function normalizeInstagramInbound(payload: unknown, options: { connectionId?: string } = {}) {
  const root = record(payload)
  const entry = array(root.entry)[0]
  const messaging = array(entry?.messaging)[0]
  const message = record(messaging?.message)
  const sender = record(messaging?.sender)
  const recipient = record(messaging?.recipient)
  const externalMessageId = stringValue(message.mid) || `${Date.now()}`
  const connectionId = options.connectionId || stringValue(recipient.id) || stringValue(entry?.id) || 'instagram'

  return {
    connectionId,
    channel: 'instagram' as const,
    externalMessageId,
    externalEventId: externalMessageId,
    eventType: 'message.created' as const,
    idempotencyKey: buildIdempotencyKey({ connectionId, externalEventId: externalMessageId, eventType: 'message.created' }),
    contact: {
      externalId: stringValue(sender.id) || 'unknown',
      displayName: undefined,
      metadata: sanitizeWebhookMetadata({ provider: 'meta', instagramAccountId: recipient.id }) as JsonRecord,
    },
    message: {
      externalMessageId,
      body: stringValue(message.text) || '[instagram]',
      contentType: 'text',
      attachments: [],
      metadata: sanitizeWebhookMetadata({ provider: 'meta', instagramAccountId: recipient.id }) as JsonRecord,
    },
    occurredAt: new Date(Number(messaging?.timestamp || Date.now())).toISOString(),
    sanitizedPayload: sanitizeWebhookMetadata(payload) as JsonRecord,
  }
}
