import { apiRequest } from '@/lib/apiClient'
import { aiAssistantDataClient } from '@/lib/aiAssistantDataClient'
import { invokeBackendFunction } from '@/lib/backendFunctions'
import { omnichannelService } from '@/services/omnichannelService'
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
  ProviderTokenState,
  ProviderVerifyState,
} from '@/types/omnichannel'

type JsonRecord = Record<string, unknown>
type MetaChannelConnectionRow = {
  id: string
  organization_id: string
  channel: OmnichannelChannel
  name: string
  is_active?: boolean
  provider_business_id?: string | null
  provider_account_id?: string | null
  provider_asset_id?: string | null
  phone_number_id?: string | null
  display_phone_number?: string | null
  provider_display_name?: string | null
  provider_username?: string | null
  provider_scopes?: string[] | null
  adapter_key?: string | null
  assistant_id?: string | null
  team_id?: string | null
  queue_id?: string | null
  response_mode_override?: 'automatic' | 'assisted' | 'manual' | null
  provider_verify_state?: ProviderVerifyState
  token_state?: ProviderTokenState
  health_status?: ConnectedChannelState
  disconnected_at?: string | null
  fallback_mode?: MetaChannelFallbackMode
  last_event_at?: string | null
  health_checked_at?: string | null
  health_summary?: string | null
  protected_metadata_references?: Record<string, unknown> | null
}

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
  displayPhoneNumber?: string
  adapterKey?: string
  assistantId?: string
  teamId?: string
  queueId?: string
  responseModeOverride?: 'automatic' | 'assisted' | 'manual' | null
  state: ConnectedChannelState
  fallbackMode: MetaChannelFallbackMode
  tokenReferenceConfigured: boolean
  lastEventAt?: string
  healthCheckedAt?: string
  healthSummary?: string
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

export interface WhatsAppConnectionSettings {
  assistantId: string | null
  teamId: string | null
  queueId: string | null
  responseModeOverride: 'automatic' | 'assisted' | 'manual' | null
}

export interface WhatsAppTestSendResult {
  messageId: string
  conversationId: string
  deliveryStatus: string
  duplicate?: boolean
}

export interface MetaChannelHealthResult {
  id: string
  healthStatus: string
  summary: string
  checks?: Record<string, 'passed' | 'failed' | 'not_checked'>
}

const optional = (value: unknown) => typeof value === 'string' && value.trim() ? value.trim() : undefined

export function mapMetaChannelConnection(row: MetaChannelConnectionRow): ConnectedChannelView {
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
    displayPhoneNumber: optional(row.display_phone_number),
    adapterKey: optional(row.adapter_key),
    assistantId: optional(row.assistant_id),
    teamId: optional(row.team_id),
    queueId: optional(row.queue_id),
    responseModeOverride: row.response_mode_override === 'automatic' || row.response_mode_override === 'assisted' || row.response_mode_override === 'manual'
      ? row.response_mode_override
      : null,
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
    healthSummary: optional(row.health_summary),
    publicMetadata,
  }
}

export function buildStartMetaConnectPayload(input: { organizationId: string; channel: MetaChannel; connectionId?: string }) {
  return {
    organizationId: input.organizationId,
    channel: input.channel,
    ...(input.connectionId ? { connectionId: input.connectionId } : {}),
  }
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
    response.channel === 'whatsapp' && !optional(response.graphVersion)
      ? 'META_GRAPH_VERSION'
      : '',
  ].filter(Boolean)
}

export function buildMetaConnectUrl(response: StartMetaChannelConnectResponse) {
  if (response.channel === 'whatsapp') return undefined
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

  return url.toString()
}

async function requireFunctionData<T>(request: PromiseLike<T | null>) {
  const data = await request
  if (!data) throw new Error('Function returned no data')
  return data
}

export const metaChannelService = {
  async listConnectedChannels(organizationId: string) {
    const params = new URLSearchParams({
      organizationId,
      channels: ['whatsapp', 'instagram', 'messenger', 'webchat'].join(','),
    })
    const data = await apiRequest<MetaChannelConnectionRow[]>(`/omnichannel/channel-connections?${params.toString()}`)
    return (data || []).map(mapMetaChannelConnection)
  },

  async listWhatsAppSettingsOptions(organizationId: string) {
    const [assistantResult, teams, queues] = await Promise.all([
      aiAssistantDataClient.from('ai_assistants').select('id,name,status')
        .eq('organization_id', organizationId).eq('status', 'active').order('name').limit(100),
      omnichannelService.getTeams(organizationId),
      omnichannelService.getQueues(organizationId),
    ])
    if (assistantResult.error) throw assistantResult.error
    const mapOptions = (rows: Array<Record<string, unknown>> = []) => rows
      .filter(row => row.is_active !== false)
      .map(row => ({ id: String(row.id || ''), name: String(row.name || '') }))
      .filter(option => option.id && option.name)
    return {
      assistants: mapOptions(assistantResult.data || []),
      teams: mapOptions(teams || []),
      queues: mapOptions(queues || []),
    }
  },

  async startConnect(input: { organizationId: string; channel: MetaChannel; connectionId?: string }) {
    const data = await requireFunctionData<StartMetaChannelConnectResponse>(
      invokeBackendFunction('start-meta-channel-connect', buildStartMetaConnectPayload(input)),
    )
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
    assets?: JsonRecord[]
    wabaId?: string
    phoneNumberIds?: string[]
    registrationPin?: string
  }) {
    return requireFunctionData(invokeBackendFunction('complete-meta-channel-connect', input))
  },

  async disconnect(connectionId: string) {
    return requireFunctionData(invokeBackendFunction('disconnect-meta-channel', { connectionId }))
  },

  async refreshHealth(connectionId: string) {
    return requireFunctionData<MetaChannelHealthResult>(invokeBackendFunction('refresh-meta-channel-health', { connectionId }))
  },

  async sendTest(connectionId: string, input: { requestId: string; recipient: string; message: string; confirmed: true }) {
    return requireFunctionData<WhatsAppTestSendResult>(invokeBackendFunction('send-meta-channel-test', { connectionId, ...input }))
  },

  async provisionTestNumber(input: { organizationId: string; phoneNumberId: string; wabaId: string; accessToken: string }) {
    return requireFunctionData(invokeBackendFunction('provision-whatsapp-test-number', input))
  },

  async updateWhatsAppSettings(organizationId: string, connectionId: string, settings: WhatsAppConnectionSettings) {
    return apiRequest(`/omnichannel/channel-connections/${connectionId}/settings`, {
      method: 'PATCH',
      body: { organizationId, ...settings },
    })
  },
}
