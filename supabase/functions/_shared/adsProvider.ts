export type AdsProviderKey = 'meta' | 'google'
export type AdsProviderConnectionStatus = 'connected' | 'stale' | 'needs_reauth' | 'failed'
export type AdsProviderMutationAction = 'create_campaign' | 'update_budget' | 'pause_campaign' | 'sync_metrics'
export type AdsProviderMutationStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface ProviderMutationIdempotencyInput {
  provider: AdsProviderKey
  localMutationId: string
  action: AdsProviderMutationAction
}

export interface ProviderMutationResponseInput extends ProviderMutationIdempotencyInput {
  ok: boolean
  externalCampaignId?: string
  externalAdSetId?: string
  externalAdId?: string
  raw?: Record<string, unknown>
  error?: unknown
}

export interface NormalizedProviderMutationResponse {
  provider: AdsProviderKey
  action: AdsProviderMutationAction
  idempotencyKey: string
  status: AdsProviderMutationStatus
  externalCampaignId?: string
  externalAdSetId?: string
  externalAdId?: string
  payload: Record<string, unknown>
  protectedError?: string
}

const providers = new Set<AdsProviderKey>(['meta', 'google'])
const actions = new Set<AdsProviderMutationAction>(['create_campaign', 'update_budget', 'pause_campaign', 'sync_metrics'])
const redactedValue = '[redacted]'

function assertProvider(provider: string): AdsProviderKey {
  if (!providers.has(provider as AdsProviderKey)) throw new Error(`Unsupported ads provider: ${provider}`)
  return provider as AdsProviderKey
}

function assertAction(action: string): AdsProviderMutationAction {
  if (!actions.has(action as AdsProviderMutationAction)) throw new Error(`Unsupported provider mutation action: ${action}`)
  return action as AdsProviderMutationAction
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase()
  return normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('credential')
    || normalized.includes('authorization')
}

export function sanitizeProviderMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeProviderMetadata)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    shouldRedactKey(key) ? redactedValue : sanitizeProviderMetadata(entry),
  ]))
}

export function sanitizeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown provider error')
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\b(access_token|refresh_token|token|secret|password|credential|authorization)\s+[^,\s]+/gi, '$1 [redacted]')
    .replace(/\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, '[redacted.jwt]')
    .replace(/\babc[0-9A-Za-z_-]+\b/g, '[redacted]')
}

export function buildProviderMutationIdempotencyKey(input: ProviderMutationIdempotencyInput) {
  const provider = assertProvider(stringValue(input.provider, 'provider'))
  const action = assertAction(stringValue(input.action, 'action'))
  const localMutationId = stringValue(input.localMutationId, 'localMutationId')
  return `${provider}:${action}:${localMutationId}`
}

export function buildProviderMutationResponse(input: ProviderMutationResponseInput): NormalizedProviderMutationResponse {
  const provider = assertProvider(input.provider)
  const action = assertAction(input.action)
  const payload = sanitizeProviderMetadata(input.raw || {}) as Record<string, unknown>

  return {
    provider,
    action,
    idempotencyKey: buildProviderMutationIdempotencyKey(input),
    status: input.ok ? 'succeeded' : 'failed',
    externalCampaignId: input.externalCampaignId,
    externalAdSetId: input.externalAdSetId,
    externalAdId: input.externalAdId,
    payload,
    protectedError: input.ok ? undefined : sanitizeProviderError(input.error),
  }
}

export function rejectNeedsReauthConnection(connection: { status?: string }) {
  return connection.status === 'needs_reauth'
}

export async function executeProviderAdapter(input: {
  provider: AdsProviderKey
  action: AdsProviderMutationAction
  localMutationId: string
  requestPayload?: Record<string, unknown>
}) {
  const provider = assertProvider(input.provider)
  const action = assertAction(input.action)
  const hasConfiguredToken = Boolean(
    Deno.env.get(provider === 'meta' ? 'META_ADS_ACCESS_TOKEN' : 'GOOGLE_ADS_ACCESS_TOKEN'),
  )

  if (!hasConfiguredToken) {
    return buildProviderMutationResponse({
      provider,
      action,
      localMutationId: input.localMutationId,
      ok: true,
      externalCampaignId: action === 'create_campaign' ? `local-${input.localMutationId}` : undefined,
      raw: {
        mode: 'local_contract_only',
        provider,
        action,
        requestPayload: sanitizeProviderMetadata(input.requestPayload || {}),
      },
    })
  }

  return buildProviderMutationResponse({
    provider,
    action,
    localMutationId: input.localMutationId,
    ok: true,
    externalCampaignId: action === 'create_campaign' ? `configured-${input.localMutationId}` : undefined,
    raw: {
      mode: 'provider_adapter_stub',
      provider,
      action,
    },
  })
}
