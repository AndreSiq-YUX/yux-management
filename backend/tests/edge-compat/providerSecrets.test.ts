import { it } from 'vitest'
import {
  decodeProviderSecretEncryptionKey,
  decryptProviderSecretValue,
  encryptProviderSecretValue,
  getProviderSecretReference,
  loadProviderSecret,
  storeProviderSecret,
} from '../../src/lib/edge-compat/providerSecrets.js'

function assert(condition: unknown, message = 'Assertion failed') {
  if (!condition) throw new Error(message)
}

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function assertThrows(fn: () => unknown, expectedMessage: string) {
  try {
    fn()
  } catch (error) {
    assert(String(error).includes(expectedMessage), `Expected error to include ${expectedMessage}, received ${String(error)}`)
    return
  }
  throw new Error('Expected function to throw')
}

function randomKey() {
  return crypto.getRandomValues(new Uint8Array(32))
}

function base64(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

it('encrypts and decrypts provider secret values without leaking plaintext', async () => {
  const key = randomKey()
  const encrypted = await encryptProviderSecretValue('provider-token-123', key)

  assert(encrypted.ciphertext !== 'provider-token-123')
  assert(encrypted.ciphertext.length > 0)
  assert(encrypted.nonce.length > 0)
  assertEquals(await decryptProviderSecretValue(encrypted, key), 'provider-token-123')
})

it('validates provider secret encryption key length', () => {
  const valid = base64(randomKey())
  assertEquals(decodeProviderSecretEncryptionKey(valid).byteLength, 32)
  assertThrows(() => decodeProviderSecretEncryptionKey(base64(new Uint8Array(16))), '32 bytes')
})

it('builds deterministic provider secret references by connection table', () => {
  assertEquals(getProviderSecretReference({
    provider: 'meta_social',
    targetKind: 'publishing',
    connectionTable: 'publishing_connections',
    connectionId: 'connection-1',
    secretKind: 'access_token',
  }), 'meta_social:publishing:publishing_connections:connection-1:access_token')
})

it('stores and loads provider secrets through the admin client contract', async () => {
  const key = randomKey()
  const writes: Array<Record<string, unknown>> = []
  const admin = {
    from(table: string) {
      assertEquals(table, 'provider_integration_secrets')
      return {
        upsert(row: Record<string, unknown>, options: Record<string, unknown>) {
          assertEquals(options, { onConflict: 'reference' })
          writes.push(row)
          return {
            select() {
              return {
                single() {
                  return Promise.resolve({
                    data: { reference: row.reference, expires_at: row.expires_at, metadata: row.metadata },
                    error: null,
                  })
                },
              }
            },
          }
        },
        select() {
          return {
            eq(column: string, value: string) {
              assertEquals(column, 'reference')
              return {
                single() {
                  const row = writes.find(entry => entry.reference === value)
                  return Promise.resolve({
                    data: row
                      ? {
                        reference: row.reference,
                        ciphertext: row.ciphertext,
                        nonce: row.nonce,
                        expires_at: row.expires_at,
                        metadata: row.metadata,
                      }
                      : null,
                    error: row ? null : new Error('not found'),
                  })
                },
              }
            },
          }
        },
      }
    },
  }

  const stored = await storeProviderSecret(admin, {
    organizationId: 'organization-1',
    clientId: 'client-1',
    provider: 'google_ads',
    targetKind: 'ads',
    connectionTable: 'ad_provider_connections',
    connectionId: 'connection-2',
    secretKind: 'refresh_token',
    value: 'refresh-token-secret',
    expiresAt: '2030-01-01T00:00:00.000Z',
    metadata: { customerId: '123' },
  }, key)
  const loaded = await loadProviderSecret(admin, stored.reference, key)

  assertEquals(stored.reference, 'google_ads:ads:ad_provider_connections:connection-2:refresh_token')
  assertEquals(loaded.value, 'refresh-token-secret')
  assertEquals(loaded.expired, false)
  assertEquals(loaded.metadata, { customerId: '123' })
  assert(!JSON.stringify(writes).includes('refresh-token-secret'), 'stored row leaked raw secret value')
})
