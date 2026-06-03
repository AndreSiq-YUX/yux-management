import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts'
import {
  buildWhatsAppTextPayload,
  normalizeWhatsAppInbound,
  validateWhatsAppSignature,
} from './whatsappProvider.ts'

Deno.test('normalizes Meta WhatsApp inbound messages into the omnichannel event contract', () => {
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

Deno.test('builds Meta WhatsApp text payloads for Cloud API', () => {
  const payload = buildWhatsAppTextPayload({ to: '+5543999999999', body: 'Ola' })

  assertEquals(payload.messaging_product, 'whatsapp')
  assertEquals(payload.recipient_type, 'individual')
  assertEquals(payload.to, '+5543999999999')
  assertEquals(payload.type, 'text')
  assertEquals(payload.text.body, 'Ola')
})

Deno.test('validates x-hub-signature-256 signatures when app secret is configured', async () => {
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
})
