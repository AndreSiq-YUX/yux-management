import { corsHeaders, getUserClient, hashToken, json } from '../_shared/edge.ts'
import {
  buildMarketingProviderOAuthUrl,
  scopesForMarketingProvider,
  type MarketingOAuthProvider,
  type MarketingTargetKind,
} from '../_shared/providerOAuth.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const provider = requireProvider(body.provider)
    const targetKind = requireTargetKind(body.targetKind)
    validateProviderTarget(provider, targetKind)
    const organizationId = requireString(body.organizationId, 'organizationId')
    const clientId = targetKind === 'publishing' ? requireString(body.clientId, 'clientId') : optionalString(body.clientId) || null
    const contractId = targetKind === 'publishing' ? requireString(body.contractId, 'contractId') : optionalString(body.contractId) || null
    const state = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const redirectUri = requireRedirectUri(provider)
    const providerClientId = requireClientId(provider)
    const userClient = getUserClient(authorization)
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const { error } = await userClient.from('provider_oauth_sessions').insert({
      organization_id: organizationId,
      client_id: clientId,
      contract_id: contractId,
      user_id: user.id,
      provider,
      target_kind: targetKind,
      state_hash: await hashToken(state),
      requested_scopes: scopesForMarketingProvider(provider),
      redirect_uri: redirectUri,
      expires_at: expiresAt,
    })
    if (error) throw error

    return json({
      provider,
      targetKind,
      state,
      authUrl: buildMarketingProviderOAuthUrl({
        provider,
        state,
        redirectUri,
        clientId: providerClientId,
        graphVersion: Deno.env.get('META_GRAPH_VERSION') || 'v20.0',
      }),
      expiresAt,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'marketing_provider_connect_start_failed' }, 400)
  }
})

function requireProvider(value: unknown): MarketingOAuthProvider {
  if (value === 'meta_social' || value === 'google_business_profile' || value === 'meta_ads' || value === 'google_ads') return value
  throw new Error('unsupported_marketing_provider')
}

function requireTargetKind(value: unknown): MarketingTargetKind {
  if (value === 'publishing' || value === 'ads') return value
  throw new Error('unsupported_target_kind')
}

function validateProviderTarget(provider: MarketingOAuthProvider, targetKind: MarketingTargetKind) {
  if ((provider === 'meta_social' || provider === 'google_business_profile') && targetKind !== 'publishing') {
    throw new Error('provider_requires_publishing_target')
  }
  if ((provider === 'meta_ads' || provider === 'google_ads') && targetKind !== 'ads') {
    throw new Error('provider_requires_ads_target')
  }
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireClientId(provider: MarketingOAuthProvider) {
  if (provider === 'meta_social' || provider === 'meta_ads') return requireString(Deno.env.get('META_APP_ID'), 'META_APP_ID')
  return requireString(Deno.env.get('GOOGLE_OAUTH_CLIENT_ID'), 'GOOGLE_OAUTH_CLIENT_ID')
}

function requireRedirectUri(provider: MarketingOAuthProvider) {
  if (provider === 'meta_social' || provider === 'meta_ads') {
    return requireString(Deno.env.get('META_MARKETING_OAUTH_REDIRECT_URI'), 'META_MARKETING_OAUTH_REDIRECT_URI')
  }
  return requireString(Deno.env.get('GOOGLE_MARKETING_OAUTH_REDIRECT_URI'), 'GOOGLE_MARKETING_OAUTH_REDIRECT_URI')
}
