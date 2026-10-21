import { createHash, randomBytes } from 'node:crypto'
import type pg from 'pg'
import type { AppEnv } from '../config/env.js'
import { upsertVerifiedWhatsAppConnection } from '../modules/omnichannel/whatsapp-connections.js'
import { exchangeMarketingOAuthCode, listMarketingProviderAssets, type MarketingProviderAsset } from './edge-compat/providerOAuth.js'
import {
  decryptProviderSecretValue,
  decodeProviderSecretEncryptionKey,
  encryptProviderSecretValue,
  loadProviderSecretFromPool,
  storeProviderSecretToPool,
} from './edge-compat/providerSecrets.js'
import {
  ensureWhatsAppPhoneRegistered,
  ensureWhatsAppWabaSubscribed,
  exchangeWhatsAppSignupCode,
  verifyWhatsAppSignupAssets,
  inspectWhatsAppConnection,
  type WhatsAppHealthReport,
} from './whatsapp-graph.js'

type MetaChannel = 'whatsapp' | 'instagram' | 'messenger'
type Pool = pg.Pool

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

export async function startMetaChannelOAuth(pool: Pool, env: AppEnv, input: {
  organizationId: string
  userId: string
  channel: unknown
  connectionId?: string
}) {
  const channel = channelFrom(input.channel)
  const appId = required(env.META_APP_ID, 'META_APP_ID')
  const redirectUri = allowedRedirect(env)
  required(env.META_APP_SECRET, 'META_APP_SECRET')
  if (channel === 'whatsapp') required(env.META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID, 'META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID')

  const protectedPayload: Record<string, unknown> = {}
  if (input.connectionId) {
    if (channel !== 'whatsapp') throw Object.assign(new Error('meta_channel_reconnect_target_unsupported'), { statusCode: 400 })
    const target = await pool.query<{ phone_number_id: string | null }>(
      `SELECT phone_number_id FROM public.channel_connections
        WHERE id = $1 AND organization_id = $2 AND channel = 'whatsapp' LIMIT 1`,
      [input.connectionId, input.organizationId],
    )
    if (!target.rows[0]?.phone_number_id) throw Object.assign(new Error('whatsapp_connection_not_found'), { statusCode: 404 })
    protectedPayload.targetConnectionId = input.connectionId
  }

  const state = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + stateTtlMs).toISOString()
  await pool.query(
    `INSERT INTO public.provider_oauth_sessions (
      organization_id, user_id, provider, target_kind, state_hash, status, requested_scopes, redirect_uri, expires_at,
      protected_payload
     ) VALUES ($1,$2,'meta_social','publishing',$3,'started',$4,$5,$6,$7::jsonb)`,
    [input.organizationId, input.userId, hashState(state), scopesForChannel(channel), redirectUri, expiresAt, JSON.stringify(protectedPayload)],
  )
  return {
    channel,
    state,
    appId,
    graphVersion: channel === 'whatsapp' ? env.META_GRAPH_VERSION || 'v25.0' : 'v20.0',
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
  assets?: unknown
  wabaId?: unknown
  phoneNumberIds?: unknown
  registrationPin?: unknown
}) {
  const channel = channelFrom(input.channel)
  const state = required(typeof input.state === 'string' ? input.state : undefined, 'oauth_state')
  if (channel === 'whatsapp') {
    return completeWhatsAppEmbeddedSignup(pool, env, {
      organizationId: input.organizationId,
      userId: input.userId,
      state,
      code: typeof input.code === 'string' ? input.code.trim() : '',
      wabaId: input.wabaId,
      phoneNumberIds: input.phoneNumberIds,
      registrationPin: input.registrationPin,
    })
  }
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

type WhatsAppOAuthStage = {
  version: 1
  accessToken: { ciphertext: string; nonce: string }
  expiresAt: string | null
  targetConnectionId?: string
}

function readWhatsAppOAuthStage(value: unknown): WhatsAppOAuthStage | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const token = record.accessToken
  if (record.version !== 1 || !token || typeof token !== 'object' || Array.isArray(token)) return null
  const encrypted = token as Record<string, unknown>
  if (typeof encrypted.ciphertext !== 'string' || typeof encrypted.nonce !== 'string') return null
  return {
    version: 1,
    accessToken: { ciphertext: encrypted.ciphertext, nonce: encrypted.nonce },
    expiresAt: typeof record.expiresAt === 'string' ? record.expiresAt : null,
    targetConnectionId: typeof record.targetConnectionId === 'string' ? record.targetConnectionId : undefined,
  }
}

function readTargetConnectionId(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const targetConnectionId = (value as Record<string, unknown>).targetConnectionId
  return typeof targetConnectionId === 'string' ? targetConnectionId : undefined
}

function sanitizeFailureCode(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  return /^[a-z0-9:_-]{1,160}$/i.test(message) ? message : 'whatsapp_onboarding_failed'
}

function invalidWhatsAppOAuthState() {
  return Object.assign(new Error('oauth_state_invalid_or_expired'), { statusCode: 400 })
}

async function completeWhatsAppEmbeddedSignup(pool: Pool, env: AppEnv, input: {
  organizationId: string
  userId: string
  state: string
  code: string
  wabaId: unknown
  phoneNumberIds: unknown
  registrationPin: unknown
}) {
  const wabaId = required(typeof input.wabaId === 'string' ? input.wabaId : undefined, 'waba_id')
  const phoneNumberIds = Array.isArray(input.phoneNumberIds)
    ? input.phoneNumberIds.filter((id): id is string => typeof id === 'string').map(id => id.trim()).filter(Boolean)
    : []
  if (phoneNumberIds.length === 0 || phoneNumberIds.length > 20 || phoneNumberIds.length !== (Array.isArray(input.phoneNumberIds) ? input.phoneNumberIds.length : 0)) {
    throw new Error('whatsapp_phone_number_ids_invalid')
  }
  const registrationPin = typeof input.registrationPin === 'string' ? input.registrationPin.trim() : ''

  const appId = required(env.META_APP_ID, 'META_APP_ID')
  const appSecret = required(env.META_APP_SECRET, 'META_APP_SECRET')
  const redirectUri = allowedRedirect(env)
  const claim = await pool.query<{
    id: string
    processing_stage: string | null
    protected_payload: Record<string, unknown> | null
  }>(
    `UPDATE public.provider_oauth_sessions
        SET status = 'processing', updated_at = NOW()
      WHERE organization_id = $1 AND user_id = $2
        AND provider = 'meta_social' AND target_kind = 'publishing'
        AND state_hash = $3
        AND requested_scopes @> ARRAY['whatsapp_business_management','whatsapp_business_messaging']::text[]
        AND redirect_uri = $4
        AND expires_at > NOW()
        AND status = 'started'
      RETURNING id, processing_stage, protected_payload`,
    [input.organizationId, input.userId, hashState(input.state), redirectUri],
  )
  const session = claim.rows[0]
  if (!session) {
    await pool.query(
      `UPDATE public.provider_oauth_sessions
          SET status = 'expired', processing_stage = NULL, protected_payload = '{}'::jsonb, updated_at = NOW()
        WHERE organization_id = $1 AND user_id = $2
          AND provider = 'meta_social' AND target_kind = 'publishing'
          AND state_hash = $3 AND expires_at <= NOW() AND status IN ('started','processing')`,
      [input.organizationId, input.userId, hashState(input.state)],
    )
    throw invalidWhatsAppOAuthState()
  }
  if (session.processing_stage && !readWhatsAppOAuthStage(session.protected_payload)) {
    await pool.query(
      `UPDATE public.provider_oauth_sessions
          SET status = 'failed', processing_stage = NULL, protected_payload = '{}'::jsonb,
              protected_error = 'whatsapp_onboarding_stage_corrupt', updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [session.id],
    )
    throw new Error('whatsapp_onboarding_stage_corrupt')
  }

  let staged = readWhatsAppOAuthStage(session.protected_payload)
  const targetConnectionId = staged?.targetConnectionId || readTargetConnectionId(session.protected_payload)
  let targetPhoneNumberId: string | null = null
  try {
    if (targetConnectionId) {
      const target = await pool.query<{ phone_number_id: string | null }>(
        `SELECT phone_number_id FROM public.channel_connections
          WHERE id = $1 AND organization_id = $2 AND channel = 'whatsapp' LIMIT 1`,
        [targetConnectionId, input.organizationId],
      )
      targetPhoneNumberId = target.rows[0]?.phone_number_id || null
      if (!targetPhoneNumberId) throw Object.assign(new Error('whatsapp_connection_not_found'), { statusCode: 404 })
    }

    let accessToken: string
    let expiresAt: string | null
    if (staged) {
      accessToken = await decryptProviderSecretValue(staged.accessToken)
      expiresAt = staged.expiresAt
    } else {
      const code = required(input.code, 'oauth_code')
      const token = await exchangeWhatsAppSignupCode({
        env,
        code,
        redirectUri,
        appId,
        appSecret,
      })
      accessToken = token.accessToken
      expiresAt = token.expiresAt
      const encrypted = await encryptProviderSecretValue(accessToken)
      const nextStage: WhatsAppOAuthStage = {
        version: 1,
        accessToken: encrypted,
        expiresAt,
        ...(targetConnectionId ? { targetConnectionId } : {}),
      }
      await pool.query(
        `UPDATE public.provider_oauth_sessions
            SET processing_stage = 'token_exchanged', protected_payload = $2::jsonb, updated_at = NOW()
          WHERE id = $1 AND status = 'processing'`,
        [session.id, JSON.stringify(nextStage)],
      )
      staged = nextStage
    }

    const verifiedPhones = await verifyWhatsAppSignupAssets({
      env,
      accessToken,
      wabaId,
      phoneNumberIds,
    })
    if (targetPhoneNumberId && (phoneNumberIds.length !== 1 || verifiedPhones.length !== 1 || verifiedPhones[0]?.id !== targetPhoneNumberId)) {
      throw Object.assign(new Error('whatsapp_reconnect_asset_mismatch'), { statusCode: 400 })
    }
    await pool.query(
      `UPDATE public.provider_oauth_sessions SET processing_stage = 'assets_verified', updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [session.id],
    )

    for (const phone of verifiedPhones) {
      await ensureWhatsAppPhoneRegistered({
        env,
        accessToken,
        phoneNumberId: phone.id,
        registrationPin,
      })
    }
    await pool.query(
      `UPDATE public.provider_oauth_sessions SET processing_stage = 'phone_numbers_registered', updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [session.id],
    )

    await ensureWhatsAppWabaSubscribed({ env, accessToken, wabaId, appId })
    await pool.query(
      `UPDATE public.provider_oauth_sessions SET processing_stage = 'waba_subscribed', updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [session.id],
    )

    const connections = []
    for (const phone of verifiedPhones) {
      connections.push(await upsertVerifiedWhatsAppConnection(pool, {
        organizationId: input.organizationId,
        userId: input.userId,
        wabaId,
        phoneNumberId: phone.id,
        displayPhoneNumber: phone.displayPhoneNumber,
        verifiedName: phone.verifiedName,
        accessToken,
        expiresAt,
        ...(targetConnectionId ? { expectedConnectionId: targetConnectionId } : {}),
      }))
    }
    await pool.query(
      `UPDATE public.provider_oauth_sessions
          SET status = 'completed', processing_stage = NULL, protected_payload = '{}'::jsonb,
              completed_at = NOW(), protected_error = NULL,
              sanitized_result = $2::jsonb, updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [session.id, JSON.stringify({ channel: 'whatsapp', connectionIds: connections.map(item => item.id), assetCount: connections.length })],
    )
    return { channel: 'whatsapp', connections }
  } catch (error) {
    await pool.query(
      `UPDATE public.provider_oauth_sessions
          SET status = $2, protected_error = $3, updated_at = NOW()
        WHERE id = $1 AND status = 'processing'`,
      [session.id, staged ? 'started' : 'failed', sanitizeFailureCode(error)],
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

export async function refreshMetaChannelHealth(pool: Pool, organizationId: string, connectionId: string, env?: AppEnv) {
  const connection = await pool.query<{
    id: string; channel: string; is_active: boolean; phone_number_id: string | null; provider_account_id: string | null
    protected_metadata_references: Record<string, unknown> | null
  }>(
    `SELECT id, channel, is_active, phone_number_id, provider_account_id, protected_metadata_references
      FROM public.channel_connections WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [connectionId, organizationId],
  )
  const row = connection.rows[0]
  if (!row) throw Object.assign(new Error('meta_channel_connection_not_found'), { statusCode: 404 })
  if (!row.is_active) return { id: row.id, healthStatus: 'disconnected', summary: 'Esta conexão está desativada.' }
  const reference = typeof row.protected_metadata_references?.accessTokenReference === 'string' ? row.protected_metadata_references.accessTokenReference : ''
  let status = 'connected'
  let summary = 'Credencial armazenada e dentro da validade local; acesso remoto ainda não verificado.'
  let checks: WhatsAppHealthReport['checks'] | undefined
  let tokenState = 'connected'
  try {
    if (!reference) throw new Error('access_token_not_configured')
    const token = await loadProviderSecretFromPool(pool, reference, env?.PROVIDER_SECRET_ENCRYPTION_KEY_B64
      ? decodeProviderSecretEncryptionKey(env.PROVIDER_SECRET_ENCRYPTION_KEY_B64) : undefined)
    if (token.expired) throw new Error('access_token_expired')
    if (row.channel === 'whatsapp') {
      if (!env) throw new Error('meta_configuration_required')
      const report = await inspectWhatsAppConnection({ env, accessToken: token.value, wabaId: row.provider_account_id || '', phoneNumberId: row.phone_number_id || '' })
      status = report.healthStatus
      summary = report.summary
      checks = report.checks
      if (status === 'needs_reauth') tokenState = 'needs_reauth'
    }
  } catch (error) {
    status = 'needs_reauth'
    tokenState = 'needs_reauth'
    summary = error instanceof Error && error.message === 'access_token_expired'
      ? 'A credencial expirou. Reconecte o número.' : 'Não foi possível carregar a credencial desta conexão.'
  }
  const updated = await pool.query(
    `UPDATE public.channel_connections
        SET token_state = $2, health_status = $3, health_summary = $4, health_checked_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND organization_id = $5 AND is_active = TRUE`,
    [row.id, tokenState, status, summary, organizationId],
  )
  if (updated.rowCount === 0) return { id: row.id, healthStatus: 'disconnected', summary: 'Esta conexão foi desativada durante a verificação.' }
  return { id: row.id, healthStatus: status, summary, ...(checks ? { checks } : {}) }
}
