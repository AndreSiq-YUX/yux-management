import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'
import { hashToken, sanitizeWebhookMetadata } from '../_shared/omnichannel.ts'
import { buildGraphUrl, sanitizeMetaGraphPayload, validateMetaChannel } from '../_shared/metaChannel.ts'

type JsonRecord = Record<string, unknown>

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const organizationId = requireString(body.organizationId, 'organizationId')
    const channel = validateMetaChannel(body.channel)
    const code = requireString(body.code, 'code')
    const state = requireString(body.state, 'state')
    const assets = parseAssets(body.assets)

    const userClient = getUserClient(authorization)
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const stateHash = await hashToken(state)
    const { data: session, error: sessionError } = await userClient
      .from('meta_oauth_sessions')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('requested_channel', channel)
      .eq('state_hash', stateHash)
      .eq('status', 'started')
      .gt('expires_at', new Date().toISOString())
      .maybeSingle()
    if (sessionError) throw sessionError
    if (!session) return json({ error: 'Invalid or expired state' }, 400)

    const graphVersion = Deno.env.get('META_GRAPH_VERSION') || 'v20.0'
    const tokenResponse = await fetch(buildGraphUrl({ graphVersion, path: '/oauth/access_token' }), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: Deno.env.get('META_APP_ID'),
        client_secret: Deno.env.get('META_APP_SECRET'),
        redirect_uri: Deno.env.get('META_OAUTH_REDIRECT_URI'),
        code,
      }),
    })
    const tokenPayload = await tokenResponse.json().catch(() => ({}))
    if (!tokenResponse.ok) throw new Error(`Meta token exchange failed with ${tokenResponse.status}`)

    const admin = getServiceRoleClient()
    const tokenReference = `META_CHANNEL_TOKEN_${String(session.id).replaceAll('-', '_')}`
    const connectionRows = await Promise.all(assets.map(async asset => buildConnectionRow({
      asset,
      channel,
      organizationId,
      state,
      tokenReference,
      userId: user.id,
    })))

    const { data: connections, error: upsertError } = await admin
      .from('channel_connections')
      .upsert(connectionRows, { onConflict: 'organization_id,channel,name' })
      .select()
    if (upsertError) throw upsertError

    await admin.from('meta_oauth_sessions').update({
      status: 'completed',
      sanitized_result: sanitizeMetaGraphPayload({ token: tokenPayload, assets }),
      completed_at: new Date().toISOString(),
    }).eq('id', session.id)

    if (connections?.length) {
      await admin.from('channel_connection_audit_events').insert(connections.map((connection: JsonRecord) => ({
        organization_id: organizationId,
        connection_id: connection.id,
        actor_user_id: user.id,
        event_type: 'connected',
        source: 'portal',
        safe_after: sanitizeWebhookMetadata(connection),
      })))
    }

    return json({ success: true, connections: connections || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to complete Meta connection' }, 400)
  }
})

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function parseAssets(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('assets is required')
  return value.map(record).filter(asset => Object.keys(asset).length)
}

function adapterKeyFor(channel: 'whatsapp' | 'instagram' | 'messenger') {
  if (channel === 'whatsapp') return 'meta-whatsapp'
  if (channel === 'instagram') return 'meta-instagram'
  return 'meta-messenger'
}

function assetReference(channel: 'whatsapp' | 'instagram' | 'messenger', asset: JsonRecord) {
  return optionalString(asset.providerAssetId)
    || optionalString(asset.phoneNumberId)
    || optionalString(asset.pageId)
    || optionalString(asset.instagramAccountId)
    || optionalString(asset.id)
    || channel
}

function providerAccountId(asset: JsonRecord) {
  return optionalString(asset.providerAccountId)
    || optionalString(asset.wabaId)
    || optionalString(asset.pageId)
    || optionalString(asset.instagramAccountId)
    || optionalString(asset.id)
    || ''
}

async function buildConnectionRow(input: {
  asset: JsonRecord
  channel: 'whatsapp' | 'instagram' | 'messenger'
  organizationId: string
  state: string
  tokenReference: string
  userId: string
}) {
  const assetId = assetReference(input.channel, input.asset)
  const displayName = optionalString(input.asset.displayName) || optionalString(input.asset.name) || input.channel

  return {
    organization_id: input.organizationId,
    channel: input.channel,
    name: displayName,
    is_active: true,
    adapter_key: adapterKeyFor(input.channel),
    inbound_token_hash: await hashToken(`${input.state}:${input.channel}:${assetId}`),
    provider_account_id: providerAccountId(input.asset),
    provider_asset_id: assetId,
    provider_business_id: optionalString(input.asset.businessId) || null,
    provider_display_name: displayName,
    provider_username: optionalString(input.asset.username) || null,
    phone_number_id: input.channel === 'whatsapp' ? optionalString(input.asset.phoneNumberId) || null : null,
    provider_verify_state: 'pending',
    token_state: 'connected',
    health_status: 'pending',
    connected_by_user_id: input.userId,
    connected_at: new Date().toISOString(),
    disconnected_at: null,
    fallback_mode: 'official',
    protected_metadata_references: { accessTokenEnv: input.tokenReference },
    n8n_routing_metadata: {},
  }
}
