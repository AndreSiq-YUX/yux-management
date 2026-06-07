import { corsHeaders, formatProtectedError, getAdminClient, getUserClient, json } from '../_shared/edge.ts'
import {
  listMarketingProviderAssets,
  sanitizeOAuthPayload,
  type MarketingOAuthProvider,
} from '../_shared/providerOAuth.ts'
import { getProviderSecretReference, loadProviderSecret, type SecretConnectionTable } from '../_shared/providerSecrets.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const connectionTable = requireConnectionTable(body.connectionTable)
    const connectionId = requireString(body.connectionId, 'connectionId')
    const userClient = getUserClient(authorization)
    const connection = await loadAuthorizedConnection(userClient, connectionTable, connectionId)
    const provider = providerForConnection(connectionTable, connection.provider)
    const targetKind = connectionTable === 'publishing_connections' ? 'publishing' : 'ads'
    const tokenReference = connection.token_reference || getProviderSecretReference({
      provider,
      targetKind,
      connectionTable,
      connectionId,
      secretKind: 'access_token',
    })
    const secret = await loadProviderSecret(getAdminClient(), tokenReference)
    if (secret.expired) throw new Error('provider_access_token_expired')

    const assets = await listMarketingProviderAssets({
      provider,
      accessToken: secret.value,
      graphVersion: Deno.env.get('META_GRAPH_VERSION') || 'v20.0',
      googleAdsDeveloperToken: Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') || undefined,
      googleAdsLoginCustomerId: Deno.env.get('GOOGLE_ADS_LOGIN_CUSTOMER_ID') || undefined,
      googleAdsApiVersion: Deno.env.get('GOOGLE_ADS_API_VERSION') || 'v22',
    })

    return json({ assets: assets.map(asset => ({
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
    })) })
  } catch (error) {
    return json({ error: formatProtectedError(error) }, 400)
  }
})

async function loadAuthorizedConnection(userClient: any, connectionTable: SecretConnectionTable, connectionId: string) {
  const columns = connectionTable === 'publishing_connections'
    ? 'id, organization_id, provider, token_reference, provider_asset_id, status'
    : 'id, organization_id, provider, token_reference, provider_account_id, status'
  const { data, error } = await userClient
    .from(connectionTable)
    .select(columns)
    .eq('id', connectionId)
    .single()
  if (error) throw error
  return data
}

function providerForConnection(connectionTable: SecretConnectionTable, provider: string): MarketingOAuthProvider {
  if (connectionTable === 'publishing_connections') {
    if (provider === 'meta_facebook' || provider === 'meta_instagram') return 'meta_social'
    if (provider === 'google_business_profile') return 'google_business_profile'
  }
  if (connectionTable === 'ad_provider_connections') {
    if (provider === 'meta') return 'meta_ads'
    if (provider === 'google') return 'google_ads'
  }
  throw new Error('unsupported_connection_provider')
}

function requireConnectionTable(value: unknown): SecretConnectionTable {
  if (value === 'publishing_connections' || value === 'ad_provider_connections') return value
  throw new Error('unsupported_connection_table')
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}
