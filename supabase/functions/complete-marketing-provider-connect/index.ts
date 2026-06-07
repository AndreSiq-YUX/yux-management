import { corsHeaders, formatProtectedError, getAdminClient, getUserClient, hashToken, json } from '../_shared/edge.ts'
import {
  exchangeMarketingOAuthCode,
  listMarketingProviderAssets,
  sanitizeOAuthPayload,
  type MarketingOAuthProvider,
  type MarketingProviderAsset,
  type MarketingTargetKind,
} from '../_shared/providerOAuth.ts'
import { storeProviderSecret } from '../_shared/providerSecrets.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Unauthorized' }, 401)

  let sessionId: string | undefined
  try {
    const body = await req.json()
    const provider = requireProvider(body.provider)
    const targetKind = requireTargetKind(body.targetKind)
    const organizationId = requireString(body.organizationId, 'organizationId')
    const code = requireString(body.code, 'code')
    const state = requireString(body.state, 'state')
    const selectedAssetIds = parseStringSet(body.assetIds || body.selectedAssetIds)
    const userClient = getUserClient(authorization)
    const { data: { user }, error: userError } = await userClient.auth.getUser()
    if (userError || !user) return json({ error: 'Unauthorized' }, 401)

    const stateHash = await hashToken(state)
    const { data: session, error: sessionError } = await userClient
      .from('provider_oauth_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('provider', provider)
      .eq('target_kind', targetKind)
      .eq('state_hash', stateHash)
      .eq('status', 'started')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (sessionError) throw sessionError
    if (!session) return json({ error: 'invalid_or_expired_oauth_state' }, 400)
    sessionId = session.id

    const token = await exchangeMarketingOAuthCode({
      provider,
      code,
      redirectUri: requireRedirectUri(provider),
      clientId: requireClientId(provider),
      clientSecret: requireClientSecret(provider),
      graphVersion: Deno.env.get('META_GRAPH_VERSION') || 'v20.0',
    })
    const allAssets = await listMarketingProviderAssets({
      provider,
      accessToken: token.accessToken,
      graphVersion: Deno.env.get('META_GRAPH_VERSION') || 'v20.0',
      googleAdsDeveloperToken: Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') || undefined,
      googleAdsLoginCustomerId: Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') || undefined,
      googleAdsApiVersion: Deno.env.get('GOOGLE_ADS_API_VERSION') || 'v22',
      includeAccessTokens: provider === 'meta_social',
    })
    const selectedAssets = selectedAssetIds.size
      ? allAssets.filter(asset => selectedAssetIds.has(asset.externalId) || selectedAssetIds.has(`${asset.assetKind}:${asset.externalId}`))
      : allAssets
    if (!selectedAssets.length) throw new Error('no_provider_assets_selected')

    const admin = getAdminClient()
    const connections = targetKind === 'publishing'
      ? await upsertPublishingConnections(admin, session, provider, token, selectedAssets, user.id)
      : await upsertAdsConnections(admin, session, provider, token, selectedAssets)

    await admin.from('provider_oauth_sessions').update({
      status: 'completed',
      sanitized_result: sanitizeOAuthPayload({
        provider,
        targetKind,
        token: token.sanitizedPayload,
        assetCount: allAssets.length,
        connectedAssetCount: selectedAssets.length,
        selectedAssetIds: selectedAssets.map(asset => asset.externalId),
      }),
      protected_error: null,
      completed_at: new Date().toISOString(),
    }).eq('id', session.id)

    return json({
      success: true,
      provider,
      targetKind,
      assets: allAssets.map(publicAsset),
      connections,
    })
  } catch (error) {
    const protectedError = formatProtectedError(error)
    if (sessionId) {
      try {
        await getAdminClient().from('provider_oauth_sessions').update({
          status: 'failed',
          protected_error: protectedError,
        }).eq('id', sessionId)
      } catch {
        // Preserve original error response.
      }
    }
    return json({ error: protectedError }, 400)
  }
})

async function upsertPublishingConnections(
  admin: any,
  session: any,
  provider: MarketingOAuthProvider,
  token: { accessToken: string, refreshToken?: string, expiresAt?: string | null, scopes: string[] },
  assets: MarketingProviderAsset[],
  userId: string,
) {
  const rows = assets.map(asset => ({
    organization_id: session.organization_id,
    client_id: requireString(session.client_id, 'client_id'),
    contract_id: requireString(session.contract_id, 'contract_id'),
    provider: publishingProviderForAsset(asset),
    name: stableConnectionName(asset),
    status: 'connected',
    site_url: null,
    username: asset.assetKind === 'instagram_business' ? asset.name : null,
    auth_type: 'token_reference',
    token_reference: null,
    provider_account_id: asset.externalId,
    provider_asset_id: asset.externalId,
    provider_asset_name: asset.name,
    provider_parent_asset_id: asset.parentExternalId || null,
    provider_scopes: token.scopes,
    token_expires_at: token.expiresAt || null,
    reauth_required_at: null,
    last_health_check_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString(),
    protected_error: null,
    public_config: publicAsset(asset),
    metadata: sanitizeOAuthPayload({ assetKind: asset.assetKind, asset: asset.metadata }),
    created_by: userId,
  }))

  const { data, error } = await admin
    .from('publishing_connections')
    .upsert(rows, { onConflict: 'contract_id,provider,name' })
    .select('*')
  if (error) throw error

  const byExternalId = new Map(assets.map(asset => [asset.externalId, asset]))
  const updated = []
  for (const connection of data || []) {
    const asset = byExternalId.get(connection.provider_asset_id)
    if (!asset) continue
    const accessSecret = await storeProviderSecret(admin, {
      organizationId: session.organization_id,
      clientId: session.client_id,
      contractId: session.contract_id,
      provider,
      targetKind: 'publishing',
      connectionTable: 'publishing_connections',
      connectionId: connection.id,
      secretKind: 'access_token',
      value: asset.accessToken || token.accessToken,
      expiresAt: token.expiresAt || null,
      metadata: { assetKind: asset.assetKind, externalId: asset.externalId },
    })
    if (token.refreshToken) {
      await storeProviderSecret(admin, {
        organizationId: session.organization_id,
        clientId: session.client_id,
        contractId: session.contract_id,
        provider,
        targetKind: 'publishing',
        connectionTable: 'publishing_connections',
        connectionId: connection.id,
        secretKind: 'refresh_token',
        value: token.refreshToken,
        metadata: { assetKind: asset.assetKind, externalId: asset.externalId },
      })
    }
    const { data: patched, error: patchError } = await admin
      .from('publishing_connections')
      .update({ token_reference: accessSecret.reference })
      .eq('id', connection.id)
      .select('*')
      .single()
    if (patchError) throw patchError
    updated.push(patched)
  }
  return updated.map(publicConnection)
}

async function upsertAdsConnections(
  admin: any,
  session: any,
  provider: MarketingOAuthProvider,
  token: { accessToken: string, refreshToken?: string, expiresAt?: string | null, scopes: string[] },
  assets: MarketingProviderAsset[],
) {
  const providerKey = provider === 'meta_ads' ? 'meta' : 'google'
  const rows = assets.map(asset => ({
    organization_id: session.organization_id,
    client_id: session.client_id || null,
    contract_id: session.contract_id || null,
    provider: providerKey,
    name: stableConnectionName(asset),
    status: 'connected',
    token_reference: null,
    provider_account_id: asset.externalId,
    provider_scopes: token.scopes,
    token_expires_at: token.expiresAt || null,
    reauth_required_at: null,
    last_health_check_at: new Date().toISOString(),
    last_sync_at: new Date().toISOString(),
    protected_error: null,
    metadata: sanitizeOAuthPayload({ assetKind: asset.assetKind, asset: asset.metadata }),
  }))

  const { data, error } = await admin
    .from('ad_provider_connections')
    .upsert(rows, { onConflict: 'organization_id,provider,name' })
    .select('*')
  if (error) throw error

  const byExternalId = new Map(assets.map(asset => [asset.externalId, asset]))
  const updated = []
  for (const connection of data || []) {
    const asset = byExternalId.get(connection.provider_account_id)
    if (!asset) continue
    const accessSecret = await storeProviderSecret(admin, {
      organizationId: session.organization_id,
      clientId: session.client_id,
      contractId: session.contract_id,
      provider,
      targetKind: 'ads',
      connectionTable: 'ad_provider_connections',
      connectionId: connection.id,
      secretKind: 'access_token',
      value: token.accessToken,
      expiresAt: token.expiresAt || null,
      metadata: { assetKind: asset.assetKind, externalId: asset.externalId },
    })
    if (token.refreshToken) {
      await storeProviderSecret(admin, {
        organizationId: session.organization_id,
        clientId: session.client_id,
        contractId: session.contract_id,
        provider,
        targetKind: 'ads',
        connectionTable: 'ad_provider_connections',
        connectionId: connection.id,
        secretKind: 'refresh_token',
        value: token.refreshToken,
        metadata: { assetKind: asset.assetKind, externalId: asset.externalId },
      })
    }
    await upsertAdAccount(admin, connection.id, providerKey, asset)
    const { data: patched, error: patchError } = await admin
      .from('ad_provider_connections')
      .update({ token_reference: accessSecret.reference })
      .eq('id', connection.id)
      .select('*')
      .single()
    if (patchError) throw patchError
    updated.push(patched)
  }
  return updated.map(publicConnection)
}

async function upsertAdAccount(admin: any, providerConnectionId: string, providerKey: string, asset: MarketingProviderAsset) {
  const { error } = await admin.from('ad_accounts').upsert({
    provider_connection_id: providerConnectionId,
    provider: providerKey,
    external_account_id: asset.externalId,
    provider_customer_id: providerKey === 'google' ? asset.externalId : null,
    parent_external_account_id: asset.parentExternalId || null,
    name: asset.name,
    currency: asset.currency || 'BRL',
    status: asset.canManage === false ? 'disabled' : 'active',
    time_zone: asset.timeZone || null,
    can_manage_campaigns: asset.canManage !== false,
    metadata: sanitizeOAuthPayload({ assetKind: asset.assetKind, asset: asset.metadata }),
  }, { onConflict: 'provider,external_account_id' })
  if (error) throw error
}

function publishingProviderForAsset(asset: MarketingProviderAsset) {
  if (asset.assetKind === 'facebook_page') return 'meta_facebook'
  if (asset.assetKind === 'instagram_business') return 'meta_instagram'
  if (asset.assetKind === 'google_business_location') return 'google_business_profile'
  throw new Error(`unsupported_publishing_asset:${asset.assetKind}`)
}

function publicAsset(asset: MarketingProviderAsset) {
  return {
    provider: asset.provider,
    targetKind: asset.targetKind,
    assetKind: asset.assetKind,
    externalId: asset.externalId,
    name: asset.name,
    parentExternalId: asset.parentExternalId || null,
    status: asset.status || null,
    currency: asset.currency || null,
    timeZone: asset.timeZone || null,
    canManage: asset.canManage !== false,
    metadata: sanitizeOAuthPayload(asset.metadata),
  }
}

function publicConnection(connection: any) {
  return {
    id: connection.id,
    organizationId: connection.organization_id,
    clientId: connection.client_id || null,
    contractId: connection.contract_id || null,
    provider: connection.provider,
    name: connection.name,
    status: connection.status,
    providerAccountId: connection.provider_account_id || null,
    providerAssetId: connection.provider_asset_id || null,
    providerAssetName: connection.provider_asset_name || null,
    providerParentAssetId: connection.provider_parent_asset_id || null,
    providerScopes: connection.provider_scopes || [],
    tokenReferenceConfigured: Boolean(connection.token_reference),
    tokenExpiresAt: connection.token_expires_at || null,
    metadata: sanitizeOAuthPayload(connection.metadata || {}),
  }
}

function stableConnectionName(asset: MarketingProviderAsset) {
  return `${asset.name} (${asset.externalId})`
}

function parseStringSet(value: unknown) {
  if (!Array.isArray(value)) return new Set<string>()
  return new Set(value.filter(entry => typeof entry === 'string' && entry.trim()).map(entry => entry.trim()))
}

function requireProvider(value: unknown): MarketingOAuthProvider {
  if (value === 'meta_social' || value === 'google_business_profile' || value === 'meta_ads' || value === 'google_ads') return value
  throw new Error('unsupported_marketing_provider')
}

function requireTargetKind(value: unknown): MarketingTargetKind {
  if (value === 'publishing' || value === 'ads') return value
  throw new Error('unsupported_target_kind')
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function requireClientId(provider: MarketingOAuthProvider) {
  if (provider === 'meta_social' || provider === 'meta_ads') return requireString(Deno.env.get('META_APP_ID'), 'META_APP_ID')
  return requireString(Deno.env.get('GOOGLE_OAUTH_CLIENT_ID'), 'GOOGLE_OAUTH_CLIENT_ID')
}

function requireClientSecret(provider: MarketingOAuthProvider) {
  if (provider === 'meta_social' || provider === 'meta_ads') return requireString(Deno.env.get('META_APP_SECRET'), 'META_APP_SECRET')
  return requireString(Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET'), 'GOOGLE_OAUTH_CLIENT_SECRET')
}

function requireRedirectUri(provider: MarketingOAuthProvider) {
  if (provider === 'meta_social' || provider === 'meta_ads') {
    return requireString(Deno.env.get('META_MARKETING_OAUTH_REDIRECT_URI'), 'META_MARKETING_OAUTH_REDIRECT_URI')
  }
  return requireString(Deno.env.get('GOOGLE_MARKETING_OAUTH_REDIRECT_URI'), 'GOOGLE_MARKETING_OAUTH_REDIRECT_URI')
}
