import { expect, it, vi } from 'vitest'

function assertEquals(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected)
}
import {
  buildWhatsAppMessagesUrl,
  buildWhatsAppTemplatePayload,
  buildWhatsAppTextPayload,
  normalizeWhatsAppBatch,
  normalizeWhatsAppInbound,
  sendWhatsAppOperationalNotification,
  sendWhatsAppTextMessage,
  validateWhatsAppSignature,
  verifyWhatsAppTemplateApproval,
} from '../../src/lib/edge-compat/whatsappProvider.js'

it('uses the configured Meta Graph version and the verified app version by default', () => {
  expect(buildWhatsAppMessagesUrl('123456789012345')).toBe('https://graph.facebook.com/v25.0/123456789012345/messages')
  expect(buildWhatsAppMessagesUrl('123456789012345', 'v26.0')).toBe('https://graph.facebook.com/v26.0/123456789012345/messages')
})

it('blocks operational WhatsApp notifications before any provider call without consent', async () => {
  const fetchFn = vi.fn()
  const result = await sendWhatsAppOperationalNotification({
    to: '+5543999999999', body: 'Decisão pendente', consentGranted: false,
    phoneNumberId: 'phone-number-1', accessToken: 'secret', fetchFn,
  })
  expect(result).toMatchObject({ ok: false, error: 'whatsapp_notification_consent_required' })
  expect(fetchFn).not.toHaveBeenCalled()
})

it('normalizes Meta WhatsApp inbound messages into the omnichannel event contract', () => {
  const event = normalizeWhatsAppInbound({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-1',
      changes: [{
        field: 'messages',
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '5543999999999',
            phone_number_id: 'phone-number-1',
          },
          contacts: [{
            profile: { name: 'Ana Cliente' },
            wa_id: '5543999999999',
          }],
          messages: [{
            from: '5543999999999',
            id: 'wamid.test',
            timestamp: '1780507200',
            text: { body: 'Ola' },
            type: 'text',
          }],
        },
      }],
    }],
  }, { connectionId: 'connection-1' })

  assertEquals(event.channel, 'whatsapp')
  assertEquals(event.connectionId, 'connection-1')
  assertEquals(event.externalMessageId, 'wamid.test')
  assertEquals(event.message.externalMessageId, 'wamid.test')
  assertEquals(event.contact.displayName, 'Ana Cliente')
  assertEquals(event.contact.phone, '+5543999999999')
})

it('normalizes every entry, change, message, and receipt in a Meta webhook batch', () => {
  const payload = {
    object: 'whatsapp_business_account',
    entry: [
      { id: 'waba-a', changes: [
        { field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-a' }, messages: [
          { id: 'wamid-a1', from: '5511999990001', timestamp: '1780507200', type: 'text', text: { body: 'a1' } },
          { id: 'wamid-a2', from: '5511999990002', timestamp: '1780507201', type: 'text', text: { body: 'a2' } },
        ] } },
        { field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-a' }, messages: [
          { id: 'wamid-a3', from: '5511999990003', timestamp: '1780507202', type: 'text', text: { body: 'a3' } },
        ] } },
      ] },
      { id: 'waba-b', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-b' }, messages: [
        { id: 'wamid-b1', from: '5511999990004', timestamp: '1780507203', type: 'text', text: { body: 'b1' } },
      ] } }] },
    ],
  }

  const result = normalizeWhatsAppBatch(payload)
  expect(result.rejected).toEqual([])
  expect(result.events.map(event => event.externalMessageId)).toEqual(['wamid-a1', 'wamid-a2', 'wamid-a3', 'wamid-b1'])
  expect(result.events.map(event => event.phoneNumberId)).toEqual(['phone-a', 'phone-a', 'phone-a', 'phone-b'])
})

it('preserves the three confirmations for the same message with separate idempotency keys', () => {
  const payload = { entry: [{ id: 'waba-a', changes: [{ value: {
    messaging_product: 'whatsapp',
    metadata: { phone_number_id: 'number-a' },
    statuses: ['sent', 'delivered', 'read'].map((status, index) => ({
      id: 'wamid.same', recipient_id: '5511999990000',
      timestamp: String(1789910000 + index), status,
    })),
  } }] }] }

  const { events, rejected } = normalizeWhatsAppBatch(payload, { connectionId: 'connection-a' })
  expect(rejected).toEqual([])
  expect(events).toHaveLength(3)
  expect(new Set(events.map(event => event.idempotencyKey)).size).toBe(3)
  expect(events.map(event => event.message.metadata.status)).toEqual(['sent', 'delivered', 'read'])
  expect(events.every(event => event.externalMessageId === 'wamid.same')).toBe(true)
})

it('deduplicates a repeated message identity and rejects only malformed items in a mixed batch', () => {
  const item = { id: 'wamid.duplicate', from: '5511999990000', timestamp: '1780507200', type: 'text', text: { body: 'Olá' } }
  const { events, rejected } = normalizeWhatsAppBatch({ entry: [{ changes: [{ value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-a' },
    messages: [item, item, { from: '5511999990001', timestamp: 'bad', type: 'text' }],
  } }] }] })

  expect(events).toHaveLength(2)
  expect(events[0]?.idempotencyKey).toBe(events[1]?.idempotencyKey)
  expect(rejected).toEqual([{ index: 'entry[0].changes[0].messages[2]', reason: 'item_invalid' }])
})

it('maps interactive replies to text with their original choice and documents to file attachments', () => {
  const { events } = normalizeWhatsAppBatch({ entry: [{ id: 'waba-a', changes: [{ value: {
    messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-a' },
    messages: [
      { id: 'wamid.interactive', from: '5511999990000', timestamp: '1780507200', type: 'interactive', interactive: { button_reply: { id: 'yes', title: 'Sim' } } },
      { id: 'wamid.document', from: '5511999990000', timestamp: '1780507201', type: 'document', document: { id: 'media-1', filename: 'contrato.pdf', mime_type: 'application/pdf', caption: 'Segue' } },
      { id: 'wamid.audio', from: '5511999990000', timestamp: '1780507202', type: 'audio', audio: { id: 'media-2', mime_type: 'audio/ogg' } },
    ],
  } }] }] })

  expect(events[0]).toMatchObject({ message: { body: 'Sim', contentType: 'text', metadata: { originalInteractive: { button_reply: { id: 'yes', title: 'Sim' } } } } })
  expect(events[1]).toMatchObject({ message: { body: 'Segue', contentType: 'file', attachments: [{ externalId: 'media-1', filename: 'contrato.pdf', mimeType: 'application/pdf' }], metadata: { requiresHumanReview: true } } })
  expect(events[2]).toMatchObject({ message: { body: undefined, contentType: 'audio', metadata: { requiresHumanReview: true, unsupportedMedia: 'audio' } } })
})

it('builds Meta WhatsApp text payloads for Cloud API', () => {
  const payload = buildWhatsAppTextPayload({ to: '+5543999999999', body: 'Ola' })

  assertEquals(payload.messaging_product, 'whatsapp')
  assertEquals(payload.recipient_type, 'individual')
  assertEquals(payload.to, '+5543999999999')
  assertEquals(payload.type, 'text')
  assertEquals(payload.text.body, 'Ola')
})

it('validates x-hub-signature-256 signatures when app secret is configured', async () => {
  const rawBody = '{"entry":[]}'
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode('app-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const signatureBytes = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody))
  const signature = Array.from(new Uint8Array(signatureBytes)).map(byte => byte.toString(16).padStart(2, '0')).join('')

  assertEquals(await validateWhatsAppSignature({
    appSecret: 'app-secret',
    rawBody,
    signatureHeader: `sha256=${signature}`,
  }), true)
  assertEquals(await validateWhatsAppSignature({
    appSecret: 'app-secret',
    rawBody,
    signatureHeader: 'sha256=bad',
  }), false)
  assertEquals(await validateWhatsAppSignature({ rawBody, signatureHeader: `sha256=${signature}` }), false)
})

it('builds approved Meta WhatsApp template payloads for first contact', () => {
  const payload = buildWhatsAppTemplatePayload({
    to: '+5543999999999',
    templateName: 'yux_primeiro_contato',
    languageCode: 'pt_BR',
    components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ana' }] }],
  })

  expect(payload).toMatchObject({
    messaging_product: 'whatsapp',
    type: 'template',
    template: {
      name: 'yux_primeiro_contato',
      language: { code: 'pt_BR' },
      components: [{ type: 'body' }],
    },
  })
})

it('confirms template name, language, and APPROVED status against the connected WABA', async () => {
  const fetchFn = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    expect(url.pathname).toBe('/v25.0/waba-1/message_templates')
    expect(url.searchParams.get('name')).toBe('order_update')
    expect(url.searchParams.get('fields')).toBe('name,language,status')
    return new Response(JSON.stringify({ data: [
      { name: 'order_update', language: 'pt_BR', status: 'APPROVED' },
    ] }), { status: 200 })
  })

  await expect(verifyWhatsAppTemplateApproval({
    wabaId: 'waba-1', templateName: 'order_update', languageCode: 'pt_BR', accessToken: 'private', fetchFn,
  })).resolves.toMatchObject({ configured: true, approved: true, status: 200 })
})

it('treats a transport timeout after a WhatsApp POST as ambiguous, not rejected', async () => {
  const result = await sendWhatsAppTextMessage({
    to: '+5511999990000', body: 'Teste', phoneNumberId: 'phone-1', accessToken: 'private',
    fetchFn: vi.fn(async () => { throw new Error('socket timeout') }),
  })

  expect(result).toMatchObject({ configured: true, ok: false, outcome: 'ambiguous', status: 0 })
})
