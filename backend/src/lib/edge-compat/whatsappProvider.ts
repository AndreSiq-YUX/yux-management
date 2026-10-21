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
  graphBaseUrl?: string
  intentId?: string
  fetchFn?: typeof fetch
}

export interface WhatsAppOperationalNotificationInput extends WhatsAppSendInput {
  consentGranted: boolean
}

export interface WhatsAppTemplateInput {
  to: string
  templateName: string
  languageCode?: string
  components?: JsonRecord[]
}

export interface WhatsAppTemplateSendInput extends WhatsAppTemplateInput {
  phoneNumberId?: string | null
  accessToken?: string | null
  graphVersion?: string
  graphBaseUrl?: string
  intentId?: string
  fetchFn?: typeof fetch
}

export interface WhatsAppTemplateApprovalInput {
  wabaId: string
  templateName: string
  languageCode: string
  accessToken: string
  graphVersion?: string
  graphBaseUrl?: string
  fetchFn?: typeof fetch
}

export type NormalizedWhatsAppInboundEvent = NormalizedInboundEvent & {
  externalMessageId: string
  phoneNumberId: string
}

export interface NormalizedWhatsAppBatch {
  events: NormalizedWhatsAppInboundEvent[]
  rejected: Array<{ index: string; reason: string }>
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

function extractBody(message: JsonRecord): string | undefined {
  const type = stringValue(message.type) || 'text'
  if (type === 'text') return stringValue(record(message.text).body)
  if (type === 'button') return stringValue(record(message.button).text)
  if (type === 'interactive') {
    const interactive = record(message.interactive)
    return stringValue(record(interactive.button_reply).title)
      || stringValue(record(interactive.list_reply).title)
      || stringValue(record(interactive.button_reply).id)
      || stringValue(record(interactive.list_reply).id)
  }
  return stringValue(record(message[type]).caption)
}

export function isWhatsAppCloudPayload(payload: unknown) {
  const root = record(payload)
  if (root.object === 'whatsapp_business_account') return true
  return array(root.entry).some(entry => array(entry.changes).some(change => record(record(change).value).messaging_product === 'whatsapp'))
}

function providerTimestamp(value: unknown) {
  const timestamp = stringValue(value)
  if (!timestamp || !/^\d{1,12}$/.test(timestamp)) throw new Error('timestamp_invalid')
  const milliseconds = Number(timestamp) * 1_000
  if (!Number.isSafeInteger(milliseconds) || milliseconds <= 0) throw new Error('timestamp_invalid')
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) throw new Error('timestamp_invalid')
  return { timestamp, occurredAt: date.toISOString() }
}

function contentTypeFor(messageType: string) {
  if (messageType === 'image' || messageType === 'audio' || messageType === 'video') return messageType
  if (messageType === 'document') return 'file'
  if (messageType === 'text' || messageType === 'button' || messageType === 'interactive') return 'text'
  return 'system'
}

function makeWhatsAppEvent(input: {
  entryId: unknown
  field: unknown
  value: JsonRecord
  metadata: JsonRecord
  item: JsonRecord
  itemType: 'messages' | 'statuses'
  contact?: JsonRecord
  options?: WhatsAppNormalizeOptions
}): NormalizedWhatsAppInboundEvent {
  const { entryId, value, metadata, item, itemType, options } = input
  const phoneNumberId = requiredString(metadata.phone_number_id, 'metadata.phone_number_id')
  const externalMessageId = requiredString(item.id, `${itemType}.id`)
  const { timestamp, occurredAt } = providerTimestamp(item.timestamp)
  const contact = record(input.contact)
  const profile = record(contact.profile)
  const messageType = stringValue(item.type) || 'text'
  const providerStatus = itemType === 'statuses' ? requiredString(item.status, 'statuses.status').toLowerCase() : undefined
  if (providerStatus && !['sent', 'delivered', 'read', 'failed'].includes(providerStatus)) {
    throw new Error('status_unsupported')
  }
  const eventType = itemType === 'messages' ? 'message.created' : 'message.updated'
  const connectionId = options?.connectionId || phoneNumberId
  const from = itemType === 'messages'
    ? requiredString(item.from || contact.wa_id, 'messages.from')
    : requiredString(item.recipient_id, 'statuses.recipient_id')
  const receiptIdentity = providerStatus ? `${externalMessageId}:${providerStatus}:${timestamp}` : externalMessageId
  const body = itemType === 'messages' ? extractBody(item) : providerStatus
  const media = record(item[messageType])
  const isUnsupportedMedia = itemType === 'messages'
    && !['text', 'button', 'interactive', 'image', 'audio', 'video', 'document'].includes(messageType)
  const isUninterpretedMedia = itemType === 'messages'
    && ['image', 'audio', 'video', 'document'].includes(messageType)
  const attachment = isUninterpretedMedia
    ? [{
        externalId: stringValue(media.id),
        filename: stringValue(media.filename) || `${messageType}-${externalMessageId}`,
        mimeType: stringValue(media.mime_type) || 'application/octet-stream',
        byteSize: 0,
      }]
    : []
  const originalPayload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: entryId,
      changes: [{
        field: input.field,
        value: {
          ...value,
          metadata,
          contacts: Object.keys(contact).length ? [contact] : [],
          messages: itemType === 'messages' ? [item] : [],
          statuses: itemType === 'statuses' ? [item] : [],
        },
      }],
    }],
  }
  const sanitizedPayload = sanitizeWebhookMetadata({
    ...originalPayload,
    _yux: {
      externalMessageId,
      ...(providerStatus ? { receipt: { status: providerStatus, timestamp: occurredAt, errors: item.errors } } : {}),
    },
  }) as JsonRecord

  return {
    connectionId,
    channel: 'whatsapp',
    externalMessageId,
    phoneNumberId,
    externalEventId: receiptIdentity,
    eventType,
    idempotencyKey: buildIdempotencyKey({ connectionId, externalEventId: receiptIdentity, eventType }),
    contact: {
      externalId: from,
      displayName: stringValue(profile.name),
      phone: phoneWithPlus(from),
      metadata: sanitizeWebhookMetadata({
        provider: 'meta', waId: contact.wa_id || from, wabaId: entryId, phoneNumberId,
        displayPhoneNumber: metadata.display_phone_number,
      }) as JsonRecord,
    },
    message: {
      externalMessageId,
      body,
      contentType: itemType === 'statuses' ? 'system' : contentTypeFor(messageType),
      attachments: attachment,
      metadata: sanitizeWebhookMetadata({
        provider: 'meta',
        phoneNumberId,
        displayPhoneNumber: metadata.display_phone_number,
        providerTimestamp: occurredAt,
        ...(providerStatus ? { status: providerStatus, statusRecipientId: item.recipient_id, errors: item.errors, conversation: item.conversation, pricing: item.pricing } : {}),
        ...(itemType === 'messages' ? {
          originalMessageType: messageType,
          ...(messageType === 'interactive' || messageType === 'button' ? { originalInteractive: item[messageType] } : {}),
          ...(isUnsupportedMedia || isUninterpretedMedia ? { requiresHumanReview: true, unsupportedMedia: messageType } : {}),
          ...(Object.keys(media).length && isUninterpretedMedia ? { mediaProviderId: media.id } : {}),
        } : {}),
      }) as JsonRecord,
    },
    occurredAt,
    sanitizedPayload,
  }
}

export function normalizeWhatsAppBatch(payload: unknown, options: WhatsAppNormalizeOptions = {}): NormalizedWhatsAppBatch {
  const root = record(payload)
  const events: NormalizedWhatsAppInboundEvent[] = []
  const rejected: Array<{ index: string; reason: string }> = []
  const entries = Array.isArray(root.entry) ? root.entry : []

  entries.forEach((rawEntry, entryIndex) => {
    const entry = record(rawEntry)
    const changes = Array.isArray(entry.changes) ? entry.changes : []
    if (!changes.length) {
      rejected.push({ index: `entry[${entryIndex}]`, reason: 'changes_missing' })
      return
    }
    changes.forEach((rawChange, changeIndex) => {
      const change = record(rawChange)
      const value = record(change.value)
      if (value.messaging_product !== 'whatsapp') return
      const metadata = record(value.metadata)
      const contactRows = array(value.contacts)
      for (const itemType of ['messages', 'statuses'] as const) {
        const items = value[itemType]
        if (items === undefined) continue
        if (!Array.isArray(items)) {
          rejected.push({ index: `entry[${entryIndex}].changes[${changeIndex}].${itemType}`, reason: 'items_invalid' })
          continue
        }
        items.forEach((rawItem, itemIndex) => {
          const index = `entry[${entryIndex}].changes[${changeIndex}].${itemType}[${itemIndex}]`
          try {
            const item = record(rawItem)
            const from = stringValue(item.from || item.recipient_id)
            const match = contactRows.find(contact => {
              const waId = stringValue(contact.wa_id)?.replace(/^\+/, '')
              return Boolean(from && waId === from.replace(/^\+/, ''))
            })
            events.push(makeWhatsAppEvent({
              entryId: entry.id,
              field: change.field,
              value,
              metadata,
              item,
              itemType,
              contact: match,
              options,
            }))
          } catch (error) {
            const reason = error instanceof Error ? error.message : 'item_invalid'
            rejected.push({ index, reason: /^[a-z0-9_.-]+$/i.test(reason) ? reason : 'item_invalid' })
          }
        })
      }
    })
  })

  if (!Array.isArray(root.entry)) rejected.push({ index: 'entry', reason: 'entries_invalid' })
  return { events, rejected }
}

export function normalizeWhatsAppInbound(payload: unknown, options: WhatsAppNormalizeOptions = {}): NormalizedWhatsAppInboundEvent {
  const { events, rejected } = normalizeWhatsAppBatch(payload, options)
  if (events.length !== 1) {
    throw new Error(rejected[0]?.reason || (events.length ? 'whatsapp_batch_requires_batch_normalizer' : 'whatsapp_event_required'))
  }
  return events[0]!
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

export function buildWhatsAppTemplatePayload(input: WhatsAppTemplateInput) {
  return {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: requiredString(input.to, 'to'),
    type: 'template',
    template: {
      name: requiredString(input.templateName, 'templateName'),
      language: { code: input.languageCode || 'pt_BR' },
      ...(input.components?.length ? { components: input.components } : {}),
    },
  }
}

export function buildWhatsAppMessagesUrl(phoneNumberId: string, graphVersion = 'v25.0', graphBaseUrl = 'https://graph.facebook.com') {
  return `${graphBaseUrl.replace(/\/$/, '')}/${graphVersion}/${requiredString(phoneNumberId, 'phoneNumberId')}/messages`
}

export async function verifyWhatsAppTemplateApproval(input: WhatsAppTemplateApprovalInput) {
  if (!input.wabaId || !input.templateName || !input.accessToken) {
    return { configured: false, approved: false, status: 0, error: 'whatsapp_template_check_context_required' }
  }
  const graphBaseUrl = (input.graphBaseUrl || 'https://graph.facebook.com').replace(/\/$/, '')
  const url = new URL(`${graphBaseUrl}/${input.graphVersion || 'v25.0'}/${encodeURIComponent(input.wabaId)}/message_templates`)
  url.searchParams.set('name', input.templateName)
  url.searchParams.set('fields', 'name,language,status')
  const request = input.fetchFn || fetch
  try {
    const response = await request(url, { headers: { Authorization: `Bearer ${input.accessToken}` }, signal: AbortSignal.timeout(30_000) })
    const data = record(await response.json().catch(() => ({})))
    if (!response.ok) {
      return { configured: true, approved: false, status: response.status, error: `whatsapp_template_check_http_${response.status}` }
    }
    const templates = array(data.data)
    const approved = templates.some(template =>
      template.name === input.templateName
      && template.language === input.languageCode
      && template.status === 'APPROVED',
    )
    return { configured: true, approved, status: response.status }
  } catch (error) {
    return { configured: true, approved: false, status: 0, error: sanitizeProtectedError(error).message }
  }
}

function ambiguousProviderStatus(status: number) {
  return status === 408 || status === 425 || status >= 500
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
  if (!input.appSecret) return false
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
      outcome: 'rejected' as const,
      status: 0,
      error: 'WhatsApp access token or phone number id is not configured',
    }
  }

  const payload = buildWhatsAppTextPayload(input)
  const request = input.fetchFn || fetch
  try {
    const response = await request(buildWhatsAppMessagesUrl(input.phoneNumberId, input.graphVersion, input.graphBaseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        ...(input.intentId ? { 'X-YUX-Intent-ID': input.intentId } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await response.json().catch(() => ({}))
    return {
      configured: true,
      ok: response.ok,
      outcome: response.ok ? 'accepted' as const : ambiguousProviderStatus(response.status) ? 'ambiguous' as const : 'rejected' as const,
      status: response.status,
      data: sanitizeWebhookMetadata(data),
    }
  } catch (error) {
    return {
      configured: true,
      ok: false,
      outcome: 'ambiguous' as const,
      status: 0,
      error: sanitizeProtectedError(error).message,
    }
  }
}

export async function sendWhatsAppOperationalNotification(input: WhatsAppOperationalNotificationInput) {
  if (!input.consentGranted) {
    return { configured: Boolean(input.phoneNumberId && input.accessToken), ok: false, outcome: 'rejected' as const, status: 0, error: 'whatsapp_notification_consent_required' }
  }
  return sendWhatsAppTextMessage(input)
}

export async function sendWhatsAppTemplateMessage(input: WhatsAppTemplateSendInput) {
  if (!input.phoneNumberId || !input.accessToken) {
    return { configured: false, ok: false, outcome: 'rejected' as const, status: 0, error: 'WhatsApp access token or phone number id is not configured' }
  }
  const payload = buildWhatsAppTemplatePayload(input)
  const request = input.fetchFn || fetch
  try {
    const response = await request(buildWhatsAppMessagesUrl(input.phoneNumberId, input.graphVersion, input.graphBaseUrl), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
        ...(input.intentId ? { 'X-YUX-Intent-ID': input.intentId } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    })
    const data = await response.json().catch(() => ({}))
    return {
      configured: true,
      ok: response.ok,
      outcome: response.ok ? 'accepted' as const : ambiguousProviderStatus(response.status) ? 'ambiguous' as const : 'rejected' as const,
      status: response.status,
      data: sanitizeWebhookMetadata(data),
    }
  } catch (error) {
    return { configured: true, ok: false, outcome: 'ambiguous' as const, status: 0, error: sanitizeProtectedError(error).message }
  }
}
