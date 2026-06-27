import type { NormalizedInboundEvent } from './omnichannel.js'
import { buildIdempotencyKey, sanitizeProtectedError, sanitizeWebhookMetadata } from './omnichannel.js'

type JsonRecord = Record<string, unknown>

export interface WhatsAppNormalizeOptions {
  connectionId?: string
}

export interface WhatsAppTextInput {
  to: string
  body: string
  previewUrl?: boolean
}

export interface WhatsAppSendInput extends WhatsAppTextInput {
  phoneNumberId?: string | null
  accessToken?: string | null
  graphVersion?: string
  fetchFn?: typeof fetch
}

export type NormalizedWhatsAppInboundEvent = NormalizedInboundEvent & {
  externalMessageId: string
  phoneNumberId: string
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function array(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(record) : []
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requiredString(value: unknown, label: string) {
  const output = stringValue(value)
  if (!output) throw new Error(`${label} is required`)
  return output
}

function phoneWithPlus(value: unknown) {
  const phone = stringValue(value)
  if (!phone) return undefined
  return phone.startsWith('+') ? phone : `+${phone}`
}

function firstWhatsAppChange(payload: unknown) {
  const root = record(payload)
  const entry = array(root.entry)[0]
  const change = array(entry?.changes)[0]
  return {
    root,
    entry,
    change,
    value: record(change?.value),
  }
}

function extractBody(message: JsonRecord) {
  const type = stringValue(message.type) || 'text'
  if (type === 'text') return stringValue(record(message.text).body)
  if (type === 'button') return stringValue(record(message.button).text)
  if (type === 'interactive') {
    const interactive = record(message.interactive)
    return stringValue(record(interactive.button_reply).title)
      || stringValue(record(interactive.list_reply).title)
  }
  return stringValue(record(message[type]).caption) || `[${type}]`
}

export function isWhatsAppCloudPayload(payload: unknown) {
  const root = record(payload)
  if (root.object === 'whatsapp_business_account') return true
  const { value } = firstWhatsAppChange(payload)
  return value.messaging_product === 'whatsapp'
}

export function normalizeWhatsAppInbound(payload: unknown, options: WhatsAppNormalizeOptions = {}): NormalizedWhatsAppInboundEvent {
  const { entry, value } = firstWhatsAppChange(payload)
  const metadata = record(value.metadata)
  const contact = array(value.contacts)[0] || {}
  const profile = record(contact.profile)
  const message = array(value.messages)[0] || {}
  const status = array(value.statuses)[0] || {}

  const phoneNumberId = requiredString(metadata.phone_number_id, 'metadata.phone_number_id')
  const selectedMessage = Object.keys(message).length ? message : status
  const externalMessageId = requiredString(selectedMessage.id, 'message.id')
  const from = stringValue(message.from) || stringValue(status.recipient_id) || stringValue(contact.wa_id)
  const timestamp = stringValue(selectedMessage.timestamp)
  const eventType = Object.keys(message).length ? 'message.created' : 'message.updated'
  const connectionId = options.connectionId || phoneNumberId
  const externalEventId = externalMessageId
  const occurredAt = timestamp ? new Date(Number(timestamp) * 1000).toISOString() : new Date().toISOString()

  return {
    connectionId,
    channel: 'whatsapp',
    externalMessageId,
    phoneNumberId,
    externalEventId,
    eventType,
    idempotencyKey: buildIdempotencyKey({ connectionId, externalEventId, eventType }),
    contact: {
      externalId: requiredString(from || contact.wa_id, 'contact.wa_id'),
      displayName: stringValue(profile.name),
      phone: phoneWithPlus(from || contact.wa_id),
      metadata: sanitizeWebhookMetadata({
        provider: 'meta',
        waId: contact.wa_id,
        wabaId: entry?.id,
        phoneNumberId,
        displayPhoneNumber: metadata.display_phone_number,
      }) as JsonRecord,
    },
    message: {
      externalMessageId,
      body: Object.keys(message).length ? extractBody(message) : stringValue(status.status),
      contentType: stringValue(message.type) || 'status',
      attachments: [],
      metadata: sanitizeWebhookMetadata({
        provider: 'meta',
        phoneNumberId,
        displayPhoneNumber: metadata.display_phone_number,
        status: status.status,
        statusRecipientId: status.recipient_id,
        conversation: status.conversation,
        pricing: status.pricing,
      }) as JsonRecord,
    },
    occurredAt,
    sanitizedPayload: sanitizeWebhookMetadata(payload) as JsonRecord,
  }
}

export function buildWhatsAppTextPayload(input: WhatsAppTextInput) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: requiredString(input.to, 'to'),
    type: 'text',
    text: {
      preview_url: input.previewUrl ?? false,
      body: requiredString(input.body, 'body'),
    },
  }
}

export function buildWhatsAppMessagesUrl(phoneNumberId: string, graphVersion = 'v20.0') {
  return `https://graph.facebook.com/${graphVersion}/${requiredString(phoneNumberId, 'phoneNumberId')}/messages`
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false
  let result = 0
  for (let index = 0; index < a.length; index += 1) {
    result |= a.charCodeAt(index) ^ b.charCodeAt(index)
  }
  return result === 0
}

export async function validateWhatsAppSignature(input: {
  appSecret?: string | null
  rawBody: string
  signatureHeader?: string | null
}) {
  if (!input.appSecret) return true
  const signature = stringValue(input.signatureHeader)?.replace(/^sha256=/, '')
  if (!signature) return false

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(input.appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(input.rawBody))
  const expected = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
  return timingSafeEqual(expected, signature)
}

export async function sendWhatsAppTextMessage(input: WhatsAppSendInput) {
  if (!input.phoneNumberId || !input.accessToken) {
    return {
      configured: false,
      ok: false,
      status: 0,
      error: 'WhatsApp access token or phone number id is not configured',
    }
  }

  const payload = buildWhatsAppTextPayload(input)
  const request = input.fetchFn || fetch
  try {
    const response = await request(buildWhatsAppMessagesUrl(input.phoneNumberId, input.graphVersion), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
    const data = await response.json().catch(() => ({}))
    return {
      configured: true,
      ok: response.ok,
      status: response.status,
      data: sanitizeWebhookMetadata(data),
    }
  } catch (error) {
    return {
      configured: true,
      ok: false,
      status: 0,
      error: sanitizeProtectedError(error).message,
    }
  }
}
