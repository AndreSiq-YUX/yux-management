import { describe, expect, it } from 'vitest'
import {
  buildMetaConnectUrl,
  buildStartMetaConnectPayload,
  getMissingMetaConnectConfig,
  mapMetaChannelConnection,
} from './metaChannelService'

describe('metaChannelService', () => {
  it('maps channel connection rows to connected channel view', () => {
    expect(mapMetaChannelConnection({
      id: 'conn-1',
      organization_id: 'org-1',
      channel: 'whatsapp',
      name: 'Comercial',
      is_active: true,
      adapter_key: 'meta-whatsapp',
      provider_account_id: 'waba-1',
      provider_asset_id: 'phone-1',
      provider_display_name: 'Comercial YUX',
      provider_username: null,
      phone_number_id: 'phone-1',
      provider_verify_state: 'verified',
      token_state: 'connected',
      health_status: 'connected',
      fallback_mode: 'official',
      last_event_at: '2026-06-05T12:00:00Z',
      health_checked_at: '2026-06-05T12:01:00Z',
      protected_metadata_references: { accessTokenEnv: 'META_CHANNEL_TOKEN_1' },
    })).toEqual(expect.objectContaining({
      id: 'conn-1',
      channel: 'whatsapp',
      label: 'WhatsApp',
      state: 'connected',
      displayName: 'Comercial YUX',
      tokenReferenceConfigured: true,
    }))
  })

  it('builds start connect payload', () => {
    expect(buildStartMetaConnectPayload({ organizationId: 'org-1', channel: 'instagram' })).toEqual({
      organizationId: 'org-1',
      channel: 'instagram',
    })
  })

  it('builds a WhatsApp Embedded Signup OAuth URL', () => {
    const url = buildMetaConnectUrl({
      channel: 'whatsapp',
      state: 'state-1',
      appId: 'app-1',
      graphVersion: 'v20.0',
      embeddedSignupConfigId: 'config-1',
      redirectUri: 'https://hub.yux.com.br/meta/callback',
      expiresAt: '2026-06-05T12:15:00Z',
    })

    expect(url).toContain('https://www.facebook.com/v20.0/dialog/oauth')
    expect(url).toContain('client_id=app-1')
    expect(decodeURIComponent(url || '')).toContain('whatsapp_embedded_signup')
    expect(decodeURIComponent(url || '')).toContain('whatsapp_business_messaging')
  })

  it('reports missing Meta configuration before redirecting', () => {
    expect(getMissingMetaConnectConfig({
      channel: 'whatsapp',
      state: 'state-1',
      graphVersion: 'v20.0',
      expiresAt: '2026-06-05T12:15:00Z',
    })).toEqual([
      'META_APP_ID',
      'META_OAUTH_REDIRECT_URI',
      'META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID',
    ])
  })
})
