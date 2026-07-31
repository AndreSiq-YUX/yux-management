import { expect, it } from 'vitest'

function assertEquals(actual: unknown, expected: unknown) {
  expect(actual).toEqual(expected)
}
import {
  buildGraphUrl,
  deriveTokenStateFromGraphStatus,
  normalizeInstagramInbound,
  normalizeMessengerInbound,
  sanitizeMetaGraphPayload,
  validateMetaChannel,
} from '../../src/lib/edge-compat/metaChannel.js'

it('buildGraphUrl joins graph version and path', () => {
  assertEquals(
    buildGraphUrl({ graphVersion: 'v20.0', path: '/me/accounts' }),
    'https://graph.facebook.com/v20.0/me/accounts',
  )
})

it('sanitizeMetaGraphPayload strips token-like fields', () => {
  assertEquals(sanitizeMetaGraphPayload({
    id: 'page-1',
    access_token: 'secret',
    app_secret: 'secret',
    name: 'Clinica',
  }), { id: 'page-1', name: 'Clinica' })
})

it('deriveTokenStateFromGraphStatus detects reauth states', () => {
  assertEquals(deriveTokenStateFromGraphStatus(401), 'needs_reauth')
  assertEquals(deriveTokenStateFromGraphStatus(403), 'needs_reauth')
  assertEquals(deriveTokenStateFromGraphStatus(500), 'failed')
  assertEquals(deriveTokenStateFromGraphStatus(200), 'connected')
})

it('validateMetaChannel accepts supported Meta channels', () => {
  assertEquals(validateMetaChannel('whatsapp'), 'whatsapp')
  assertEquals(validateMetaChannel('instagram'), 'instagram')
  assertEquals(validateMetaChannel('messenger'), 'messenger')
})

it('normalizeMessengerInbound maps page messaging event', () => {
  const event = normalizeMessengerInbound({
    object: 'page',
    entry: [{
      id: 'page-1',
      messaging: [{
        sender: { id: 'psid-1' },
        recipient: { id: 'page-1' },
        timestamp: 1710000000000,
        message: { mid: 'mid-1', text: 'Oi' },
      }],
    }],
  })
  assertEquals(event.channel, 'messenger')
  assertEquals(event.externalMessageId, 'mid-1')
  assertEquals(event.contact.externalId, 'psid-1')
})

it('normalizeInstagramInbound maps instagram messaging event', () => {
  const event = normalizeInstagramInbound({
    object: 'instagram',
    entry: [{
      id: 'ig-1',
      messaging: [{
        sender: { id: 'ig-user-1' },
        recipient: { id: 'ig-1' },
        timestamp: 1710000000000,
        message: { mid: 'ig-mid-1', text: 'Ola' },
      }],
    }],
  })
  assertEquals(event.channel, 'instagram')
  assertEquals(event.externalMessageId, 'ig-mid-1')
})
