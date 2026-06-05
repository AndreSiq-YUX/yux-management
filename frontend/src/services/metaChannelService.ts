import { supabase } from '@/lib/supabase'
import {
  deriveConnectedChannelState,
  getMetaChannelLabel,
  sanitizeMetaPublicMetadata,
} from '@/lib/meta/metaChannelRules'
import type {
  ConnectedChannelState,
  MetaChannel,
  MetaChannelFallbackMode,
  OmnichannelChannel,
} from '@/types/omnichannel'

type JsonRecord = Record<string, unknown>

export interface ConnectedChannelView {
  id: string
  organizationId: string
  channel: OmnichannelChannel
  label: string
  name: string
  displayName?: string
  username?: string
  providerAccountId?: string
  providerAssetId?: string
  phoneNumberId?: string
  adapterKey?: string
  state: ConnectedChannelState
  fallbackMode: MetaChannelFallbackMode
  tokenReferenceConfigured: boolean
  lastEventAt?: string
  healthCheckedAt?: string
  publicMetadata: JsonRecord
}

export interface StartMetaChannelConnectResponse {
  channel: MetaChannel
  state: string
  appId?: string | null
  graphVersion?: string | null
  embeddedSignupConfigId?: string | null
  redirectUri?: string | null
  expiresAt: string
}

export interface StartMetaChannelConnectSession extends StartMetaChannelConnectResponse {
  authUrl?: string
  missingConfig: string[]
}

const optional = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

const metaChannelSelect = [
  'id',
  'organization_id',
  'channel',
  'name',
  'is_active',
  'adapter_key',
  'provider_account_id',
  'provider_asset_id',
  'provider_business_id',
  'provider_display_name',
  'provider_username',
  'provider_scopes',
  'phone_number_id',
  'provider_verify_state',
  'token_state',
  'last_event_at',
  'last_provider_sync_at',
  'connected_at',
  'disconnected_at',
  'reauth_required_at',
  'health_checked_at',
  'health_status',
  'health_summary',
  'fallback_mode',
  'created_at',
  'updated_at',
].join(', ')

export function mapMetaChannelConnection(row: any): ConnectedChannelView {
  const publicMetadata = sanitizeMetaPublicMetadata({
    businessId: row.provider_business_id,
    providerAccountId: row.provider_account_id,
    providerAssetId: row.provider_asset_id,
    phoneNumberId: row.phone_number_id,
    displayName: row.provider_display_name,
    username: row.provider_username,
    scopes: row.provider_scopes || [],
  }) as JsonRecord

  return {
    id: row.id,
    organizationId: row.organization_id,
    channel: row.channel,
    label: getMetaChannelLabel(row.channel),
    name: row.name,
    displayName: optional(row.provider_display_name),
    username: optional(row.provider_username),
    providerAccountId: optional(row.provider_account_id),
    providerAssetId: optional(row.provider_asset_id),
    phoneNumberId: optional(row.phone_number_id),
    adapterKey: optional(row.adapter_key),
    state: deriveConnectedChannelState({
      isActive: Boolean(row.is_active),
      providerVerifyState: row.provider_verify_state,
      tokenState: row.token_state,
      healthStatus: row.health_status,
      disconnectedAt: row.disconnected_at,
    }),
    fallbackMode: row.fallback_mode || 'official',
    tokenReferenceConfigured: Boolean(
      row.token_state === 'connected'
        || row.protected_metadata_references && Object.keys(row.protected_metadata_references).length,
    ),
    lastEventAt: optional(row.last_event_at),
    healthCheckedAt: optional(row.health_checked_at),
    publicMetadata,
  }
}

export function buildStartMetaConnectPayload(input: { organizationId: string; channel: MetaChannel }) {
  return { organizationId: input.organizationId, channel: input.channel }
}

const scopesByChannel: Record<MetaChannel, string[]> = {
  whatsapp: ['whatsapp_business_management', 'whatsapp_business_messaging'],
  instagram: ['pages_show_list', 'pages_manage_metadata', 'pages_messaging', 'instagram_basic', 'instagram_manage_messages'],
  messenger: ['pages_show_list', 'pages_manage_metadata', 'pages_messaging'],
}

export function getMissingMetaConnectConfig(response: StartMetaChannelConnectResponse) {
  return [
    !optional(response.appId) ? 'META_APP_ID' : '',
    !optional(response.redirectUri) ? 'META_OAUTH_REDIRECT_URI' : '',
    response.channel === 'whatsapp' && !optional(response.embeddedSignupConfigId)
      ? 'META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID'
      : '',
  ].filter(Boolean)
}

export function buildMetaConnectUrl(response: StartMetaChannelConnectResponse) {
  const appId = optional(response.appId)
  const redirectUri = optional(response.redirectUri)
  if (!appId || !redirectUri) return undefined

  const graphVersion = optional(response.graphVersion) || 'v20.0'
  const url = new URL(`https://www.facebook.com/${graphVersion}/dialog/oauth`)
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', response.state)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', scopesByChannel[response.channel].join(','))

  if (response.channel === 'whatsapp') {
    const configId = optional(response.embeddedSignupConfigId)
    if (!configId) return undefined
    url.searchParams.set('extras', JSON.stringify({
      feature: 'whatsapp_embedded_signup',
      sessionInfoVersion: '3',
      setup: { config_id: configId },
    }))
  }

  return url.toString()
}

async function requireFunctionData<T>(request: PromiseLike<{ data: T | null; error: any }>) {
  const { data, error } = await request
  if (error) throw error
  if (!data) throw new Error('Function returned no data')
  return data
}

export const metaChannelService = {
  async listConnectedChannels(organizationId: string) {
    const { data, error } = await supabase
      .from('channel_connections')
      .select(metaChannelSelect)
      .eq('organization_id', organizationId)
      .in('channel', ['whatsapp', 'instagram', 'messenger', 'webchat'])
      .order('channel')
    if (error) throw error
    return (data || []).map(mapMetaChannelConnection)
  },

  async startConnect(input: { organizationId: string; channel: MetaChannel }) {
    const data = await requireFunctionData<StartMetaChannelConnectResponse>(supabase.functions.invoke('start-meta-channel-connect', {
      body: buildStartMetaConnectPayload(input),
    }))
    return {
      ...data,
      authUrl: buildMetaConnectUrl(data),
      missingConfig: getMissingMetaConnectConfig(data),
    } satisfies StartMetaChannelConnectSession
  },

  async completeConnect(input: {
    organizationId: string
    channel: MetaChannel
    code: string
    state: string
    assets: JsonRecord[]
  }) {
    return requireFunctionData(supabase.functions.invoke('complete-meta-channel-connect', { body: input }))
  },

  async disconnect(connectionId: string) {
    return requireFunctionData(supabase.functions.invoke('disconnect-meta-channel', { body: { connectionId } }))
  },

  async refreshHealth(connectionId: string) {
    return requireFunctionData(supabase.functions.invoke('refresh-meta-channel-health', { body: { connectionId } }))
  },

  async sendTest(connectionId: string) {
    return requireFunctionData(supabase.functions.invoke('send-meta-channel-test', { body: { connectionId } }))
  },
}
