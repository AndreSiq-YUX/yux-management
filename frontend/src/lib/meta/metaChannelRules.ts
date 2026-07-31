import type {
  ConnectedChannelState,
  OmnichannelChannel,
  ProviderTokenState,
  ProviderVerifyState,
} from '@/types/omnichannel'

type MetaMetadata = Record<string, unknown>

const secretKeys = new Set([
  'accessToken',
  'access_token',
  'appSecret',
  'app_secret',
  'clientSecret',
  'client_secret',
  'token',
])

export function getMetaChannelLabel(channel: OmnichannelChannel) {
  if (channel === 'whatsapp') return 'WhatsApp'
  if (channel === 'instagram') return 'Instagram Direct'
  if (channel === 'messenger') return 'Facebook Messenger'
  if (channel === 'webchat') return 'Webchat'
  if (channel === 'email') return 'Email'
  return channel
}

export function normalizeMetaScopes(scopes: string[] = []) {
  return Array.from(new Set(scopes.map(scope => scope.trim()).filter(Boolean))).sort()
}

export function sanitizeMetaPublicMetadata(metadata: MetaMetadata) {
  return Object.fromEntries(
    Object.entries(metadata).filter(([key]) => !secretKeys.has(key)),
  )
}

export function deriveConnectedChannelState(input: {
  isActive: boolean
  providerVerifyState?: ProviderVerifyState
  tokenState?: ProviderTokenState
  healthStatus?: ConnectedChannelState
  disconnectedAt?: string | null
}): ConnectedChannelState {
  if (input.disconnectedAt) return 'disconnected'
  if (!input.isActive) return 'disabled'
  if (input.tokenState === 'needs_reauth' || input.healthStatus === 'needs_reauth') return 'needs_reauth'
  if (input.tokenState === 'failed' || input.providerVerifyState === 'failed' || input.healthStatus === 'failed') return 'failed'
  if (input.tokenState === 'stale' || input.healthStatus === 'stale') return 'stale'
  if (input.providerVerifyState === 'verified' && input.tokenState === 'connected') return 'connected'
  if (input.providerVerifyState === 'pending' || input.healthStatus === 'pending') return 'pending'
  return 'not_configured'
}

export function shouldUseN8nFallback(input: { adapterKey?: string | null; fallbackMode?: string | null }) {
  if (input.fallbackMode === 'n8n') return true
  return Boolean(input.adapterKey && !input.adapterKey.startsWith('meta-') && input.adapterKey !== 'webchat')
}
