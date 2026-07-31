import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'
import type { AppEnv } from '../config/env.js'
import { exchangeMarketingOAuthCode, listMarketingProviderAssets, type MarketingProviderAsset } from './edge-compat/providerOAuth.js'
import { loadProviderSecretFromPool, storeProviderSecretToPool } from './edge-compat/providerSecrets.js'

type MetaChannel = 'whatsapp' | 'instagram' | 'messenger'
type Pool = Pick<pg.Pool, 'query'>

const stateTtlMs = 10 * 60 * 1000

function required(value: string | undefined, name: string) {
  if (!value?.trim()) throw new Error(`${name}_not_configured`)
  return value.trim()
}

function hashState(state: string) {
  return createHash('sha256').update(state).digest('hex')
}

function allowedRedirect(env: AppEnv) {
  const redirectUri = required(env.META_MARKETING_OAUTH_REDIRECT_URI, 'META_MARKETING_OAUTH_REDIRECT_URI')
  const allowlist = (env.OAUTH_ALLOWED_REDIRECT_URIS || '').split(',').map(value => value.trim()).filter(Boolean)
  if (!allowlist.includes(redirectUri)) throw new Error('oauth_redirect_uri_not_allowed')
  return redirectUri
}

function channelFrom(value: unknown): MetaChannel {
  if (value === 'whatsapp' || value === 'instagram' || value === 'messenger') return value
  throw new Error('unsupported_meta_channel')
}

function scopesForChannel(channel: MetaChannel) {
  if (channel === 'whatsapp') return ['whatsapp_business_management', 'whatsapp_business_messaging']
  if (channel === 'instagram') return ['pages_show_list', 'pages_manage_metadata', 'pages_messaging', 'instagram_basic', 'instagram_manage_messages']
  return ['pages_show_list', 'pages_manage_metadata', 'pages_messaging']
}

export async function startMetaChannelOAuth(pool: Pool, env: AppEnv, input: { organizationId: string; userId: string; channel: unknown }) {
  const channel = channelFrom(input.channel)
  const appId = required(env.META_APP_ID, 'META_APP_ID')
  const redirectUri = allowedRedirect(env)
  required(env.META_APP_SECRET, 'META_APP_SECRET')
  if (channel === 'whatsapp') required(env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID, 'META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID')

  const state = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + stateTtlMs).toISOString()
  await pool.query(
    `INSERT INTO public.provider_oauth_sessions (
       organization_id, user_id, provider, target_kind, state_hash, status, requested_scopes, redirect_uri, expires_at
     ) VALUES ($1,$2,'meta_social','publishing',$3,'started',$4,$5,$6)`,
    [input.organizationId, input.userId, hashState(state), scopesForChannel(channel), redirectUri, expiresAt],
  )
  return {
    channel,
    state,
    appId,
    graphVersion: 'v20.0',
    embeddedSignupConfigId: channel === 'whatsapp' ? env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID || null : null,
    redirectUri,
    expiresAt,
  }
}

export async function completeMetaChannelOAuth(pool: Pool, env: AppEnv, input: {
  organizationId: string
  userId: string
  channel: unknown
  state: unknown
  code: unknown
  assets: unknown
}) {
  const channel = channelFrom(input.channel)
  const state = required(typeof input.state === 'string' ? input.state : undefined, 'oauth_state')
  const code = required(typeof input.code === 'string' ? input.code : undefined, 'oauth_code')
  const redirectUri = allowedRedirect(env)
  const appId = required(env.META_APP_ID, 'META_APP_ID')
  const appSecret = required(env.META_APP_SECRET, 'META_APP_SECRET')
  const session = await pool.query<{ id: string }>(
    `SELECT id FROM public.provider_oauth_sessions
      WHERE organization_id = $1 AND user_id = $2 AND provider = 'meta_social' AND target_kind = 'publishing'
        AND state_hash = $3 AND status = 'started' AND expires_at > NOW()
      LIMIT 1`,
    [input.organizationId, input.userId, hashState(state)],
  )
  if (!session.rows[0]) throw new Error('oauth_state_invalid_or_expired')

  try {
    if (channel === 'whatsapp') throw new Error('whatsapp_embedded_signup_completion_requires_signed_embedded_payload')
    const token = await exchangeMarketingOAuthCode({ provider: 'meta_social', code, redirectUri, clientId: appId, clientSecret: appSecret })
    const assets = await listMarketingProviderAssets({ provider: 'meta_social', accessToken: token.accessToken, includeAccessTokens: true })
    const requestedIds = Array.isArray(input.assets)
      ? new Set(input.assets.map(value => value && typeof value === 'object' ? String((value as Record<string, unknown>).externalId || '') : '').filter(Boolean))
      : new Set<string>()
    const supported = assets.filter(asset => assetMatchesChannel(asset, channel) && (requestedIds.size === 0 || requestedIds.has(asset.externalId)))
    if (supported.length === 0) throw new Error('no_authorized_meta_assets_selected')
    const connections = []
    for (const asset of supported) connections.push(await upsertMetaConnection(pool, input.organizationId, input.userId, channel, asset, token))
    await pool.query(
      `UPDATE public.provider_oauth_sessions SET status = 'completed', completed_at = NOW(), sanitized_result = $2::jsonb, updated_at = NOW() WHERE id = $1`,
      [session.rows[0].id, JSON.stringify({ channel, connectionIds: connections.map(connection => connection.id), assetCount: connections.length })],
    )
    return { channel, connections }
  } catch (error) {
    await pool.query(
      `UPDATE public.provider_oauth_sessions SET status = 'failed', protected_error = $2, updated_at = NOW() WHERE id = $1`,
      [session.rows[0].id, error instanceof Error ? error.message.slice(0, 1_000) : 'oauth_completion_failed'],
    )
    throw error
  }
}

function assetMatchesChannel(asset: MarketingProviderAsset, channel: MetaChannel) {
  return (channel === 'instagram' && asset.assetKind === 'instagram_business')
    || (channel === 'messenger' && asset.assetKind === 'facebook_page')
}

async function upsertMetaConnection(pool: Pool, organizationId: string, userId: string, channel: MetaChannel, asset: MarketingProviderAsset, token: { accessToken: string; expiresAt?: string | null; scopes: string[] }) {
  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM public.channel_connections WHERE organization_id = $1 AND channel = $2 AND provider_asset_id = $3 LIMIT 1`,
    [organizationId, channel, asset.externalId],
  )
  const connection = existing.rows[0] || (await pool.query<{ id: string }>(
    `INSERT INTO public.channel_connections (
       organization_id, channel, name, is_active, adapter_key, inbound_token_hash,
       provider_account_id, provider_asset_id, provider_business_id, provider_display_name,
       provider_username, provider_scopes, provider_verify_state, token_state, health_status,
       connected_by_user_id, connected_at
     ) VALUES ($1,$2,$3,TRUE,$4,$5,$6,$7,$8,$9,$10,$11,'verified','connected','connected',$12,NOW()) RETURNING id`,
    [organizationId, channel, asset.name, `meta_${channel}`, createHash('sha256').update(randomBytes(32)).digest('hex'), asset.parentExternalId || null, asset.externalId, asset.parentExternalId || null, asset.name, asset.assetKind === 'instagram_business' ? asset.name : null, token.scopes, userId],
  )).rows[0]
  const accessToken = asset.accessToken || token.accessToken
  const secret = await storeProviderSecretToPool(pool, {
    organizationId, provider: 'meta_social', targetKind: 'publishing', connectionTable: 'channel_connections',
    connectionId: connection.id, secretKind: 'access_token', value: accessToken, expiresAt: token.expiresAt || null,
    metadata: { assetId: asset.externalId, channel },
  })
  await pool.query(
    `UPDATE public.channel_connections
        SET is_active = TRUE, token_state = 'connected', provider_verify_state = 'verified', health_status = 'connected',
            provider_scopes = $2, protected_metadata_references = jsonb_build_object('accessTokenReference', $3),
            connected_by_user_id = $4, connected_at = COALESCE(connected_at, NOW()), disconnected_at = NULL, updated_at = NOW()
      WHERE id = $1`,
    [connection.id, token.scopes, secret.reference, userId],
  )
  return { id: connection.id, channel, assetId: asset.externalId, name: asset.name }
}

export async function disconnectMetaChannel(pool: Pool, organizationId: string, connectionId: string) {
  const result = await pool.query<{ id: string }>(
    `UPDATE public.channel_connections
        SET is_active = FALSE, token_state = 'not_configured', health_status = 'disconnected',
            protected_metadata_references = '{}'::jsonb, disconnected_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $2
      RETURNING id`,
    [connectionId, organizationId],
  )
  if (!result.rows[0]) throw new Error('meta_channel_connection_not_found')
  return { id: result.rows[0].id, disconnected: true }
}

export async function refreshMetaChannelHealth(pool: Pool, organizationId: string, connectionId: string) {
  const connection = await pool.query<{ id: string; protected_metadata_references: Record<string, unknown> | null }>(
    `SELECT id, protected_metadata_references FROM public.channel_connections WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [connectionId, organizationId],
  )
  const row = connection.rows[0]
  if (!row) throw new Error('meta_channel_connection_not_found')
  const reference = typeof row.protected_metadata_references?.accessTokenReference === 'string' ? row.protected_metadata_references.accessTokenReference : ''
  let status = 'connected'
  let summary = 'Credencial configurada e valida.'
  try {
    if (!reference) throw new Error('access_token_not_configured')
    const token = await loadProviderSecretFromPool(pool, reference)
    if (token.expired) throw new Error('access_token_expired')
  } catch (error) {
    status = 'needs_reauth'
    summary = error instanceof Error ? error.message : 'credential_check_failed'
  }
  await pool.query(
    `UPDATE public.channel_connections
        SET token_state = $2, health_status = $2, health_summary = $3, health_checked_at = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [row.id, status, summary],
  )
  return { id: row.id, healthStatus: status, summary }
}

export async function testMetaChannel(pool: Pool, organizationId: string, connectionId: string) {
  const health = await refreshMetaChannelHealth(pool, organizationId, connectionId)
  // No contact is supplied on this endpoint, so it must not emit a provider message.
  // A real outbound test is created through the regular outbound-message flow.
  return { ...health, test: 'configuration_checked', providerMessageSent: false }
}
