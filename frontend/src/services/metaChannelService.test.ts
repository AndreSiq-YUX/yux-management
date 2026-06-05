import { describe, expect, it } from 'vitest'
import { buildStartMetaConnectPayload, mapMetaChannelConnection } from './metaChannelService'

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
})
