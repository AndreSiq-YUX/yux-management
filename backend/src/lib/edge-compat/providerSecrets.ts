export type SecretProvider = 'meta_social' | 'google_business_profile' | 'meta_ads' | 'google_ads' | 'wordpress'
export type SecretTargetKind = 'publishing' | 'ads'
export type SecretConnectionTable = 'publishing_connections' | 'ad_provider_connections' | 'channel_connections'
export type SecretKind = 'access_token' | 'refresh_token' | 'client_secret' | 'application_password'

export interface EncryptedProviderSecret {
  ciphertext: string
  nonce: string
}

export interface ProviderSecretReferenceInput {
  provider: SecretProvider
  targetKind: SecretTargetKind
  connectionTable: SecretConnectionTable
  connectionId: string
  secretKind: SecretKind
}

export interface StoreProviderSecretInput extends ProviderSecretReferenceInput {
  organizationId: string
  clientId?: string | null
  contractId?: string | null
  value: string
  expiresAt?: string | null
  metadata?: Record<string, unknown>
}

export interface LoadedProviderSecret {
  reference: string
  value: string
  expiresAt: string | null
  expired: boolean
  metadata: Record<string, unknown>
}

const secretProviders = new Set<SecretProvider>(['meta_social', 'google_business_profile', 'meta_ads', 'google_ads', 'wordpress'])
const targetKinds = new Set<SecretTargetKind>(['publishing', 'ads'])
const connectionTables = new Set<SecretConnectionTable>(['publishing_connections', 'ad_provider_connections', 'channel_connections'])
const secretKinds = new Set<SecretKind>(['access_token', 'refresh_token', 'client_secret', 'application_password'])
const providerSecretKeyBytes = 32
const aesGcmNonceBytes = 12
const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder()

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function safeMetadata(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function assertInSet<T extends string>(value: unknown, allowed: Set<T>, label: string): T {
  const normalized = requireString(value, label)
  if (!allowed.has(normalized as T)) throw new Error(`Unsupported ${label}: ${normalized}`)
  return normalized as T
}

function toBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

function fromBase64(value: string, label: string) {
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index)
    }
    return bytes
  } catch {
    throw new Error(`${label} must be valid base64`)
  }
}

export function decodeProviderSecretEncryptionKey(value = process.env.PROVIDER_SECRET_ENCRYPTION_KEY_B64 || '') {
  const encoded = requireString(value, 'PROVIDER_SECRET_ENCRYPTION_KEY_B64')
  const bytes = fromBase64(encoded, 'PROVIDER_SECRET_ENCRYPTION_KEY_B64')
  if (bytes.byteLength !== providerSecretKeyBytes) {
    throw new Error(`PROVIDER_SECRET_ENCRYPTION_KEY_B64 must decode to ${providerSecretKeyBytes} bytes`)
  }
  return bytes
}

async function importAesGcmKey(rawKey: Uint8Array, usages: KeyUsage[]) {
  if (rawKey.byteLength !== providerSecretKeyBytes) {
    throw new Error(`Provider secret encryption key must be ${providerSecretKeyBytes} bytes`)
  }
  const keyBytes = new Uint8Array(rawKey)
  return crypto.subtle.importKey('raw', keyBytes.buffer as ArrayBuffer, 'AES-GCM', false, usages)
}

export async function encryptProviderSecretValue(value: string, rawKey = decodeProviderSecretEncryptionKey()): Promise<EncryptedProviderSecret> {
  const secretValue = requireString(value, 'provider secret value')
  const nonce = crypto.getRandomValues(new Uint8Array(aesGcmNonceBytes))
  const key = await importAesGcmKey(rawKey, ['encrypt'])
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    key,
    textEncoder.encode(secretValue),
  ))

  return {
    ciphertext: toBase64(ciphertext),
    nonce: toBase64(nonce),
  }
}

export async function decryptProviderSecretValue(secret: EncryptedProviderSecret, rawKey = decodeProviderSecretEncryptionKey()) {
  const ciphertext = fromBase64(requireString(secret.ciphertext, 'ciphertext'), 'ciphertext')
  const nonce = fromBase64(requireString(secret.nonce, 'nonce'), 'nonce')
  const key = await importAesGcmKey(rawKey, ['decrypt'])

  try {
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, key, ciphertext)
    return textDecoder.decode(plaintext)
  } catch {
    throw new Error('Unable to decrypt provider secret')
  }
}

export function getProviderSecretReference(input: ProviderSecretReferenceInput) {
  const provider = assertInSet(input.provider, secretProviders, 'provider')
  const targetKind = assertInSet(input.targetKind, targetKinds, 'targetKind')
  const connectionTable = assertInSet(input.connectionTable, connectionTables, 'connectionTable')
  const connectionId = requireString(input.connectionId, 'connectionId')
  const secretKind = assertInSet(input.secretKind, secretKinds, 'secretKind')

  return `${provider}:${targetKind}:${connectionTable}:${connectionId}:${secretKind}`
}

export function isProviderSecretExpired(expiresAt?: string | null, now = new Date()) {
  if (!expiresAt) return false
  const expiresAtTime = Date.parse(expiresAt)
  if (Number.isNaN(expiresAtTime)) return true
  return expiresAtTime <= now.getTime()
}

export async function storeProviderSecret(admin: any, input: StoreProviderSecretInput, rawKey = decodeProviderSecretEncryptionKey()) {
  const reference = getProviderSecretReference(input)
  const encrypted = await encryptProviderSecretValue(input.value, rawKey)

  const { data, error } = await admin.from('provider_integration_secrets').upsert({
    organization_id: requireString(input.organizationId, 'organizationId'),
    client_id: input.clientId || null,
    contract_id: input.contractId || null,
    provider: input.provider,
    target_kind: input.targetKind,
    connection_table: input.connectionTable,
    connection_id: requireString(input.connectionId, 'connectionId'),
    secret_kind: input.secretKind,
    reference,
    ciphertext: encrypted.ciphertext,
    nonce: encrypted.nonce,
    expires_at: input.expiresAt || null,
    metadata: safeMetadata(input.metadata),
  }, { onConflict: 'reference' }).select('reference, expires_at, metadata').single()

  if (error) throw error
  return {
    reference: data?.reference || reference,
    expiresAt: data?.expires_at || input.expiresAt || null,
    metadata: safeMetadata(data?.metadata || input.metadata),
  }
}

export async function loadProviderSecret(admin: any, reference: string, rawKey = decodeProviderSecretEncryptionKey()): Promise<LoadedProviderSecret> {
  const secretReference = requireString(reference, 'reference')
  const { data, error } = await admin
    .from('provider_integration_secrets')
    .select('reference, ciphertext, nonce, expires_at, metadata')
    .eq('reference', secretReference)
    .single()

  if (error) throw error

  return {
    reference: data.reference,
    value: await decryptProviderSecretValue({ ciphertext: data.ciphertext, nonce: data.nonce }, rawKey),
    expiresAt: data.expires_at || null,
    expired: isProviderSecretExpired(data.expires_at),
    metadata: safeMetadata(data.metadata),
  }
}
