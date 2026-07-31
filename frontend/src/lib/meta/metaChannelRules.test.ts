import { describe, expect, it } from 'vitest'
import {
  deriveConnectedChannelState,
  getMetaChannelLabel,
  normalizeMetaScopes,
  sanitizeMetaPublicMetadata,
  shouldUseN8nFallback,
} from './metaChannelRules'

describe('metaChannelRules', () => {
  it('labels official Meta channels for portal cards', () => {
    expect(getMetaChannelLabel('whatsapp')).toBe('WhatsApp')
    expect(getMetaChannelLabel('instagram')).toBe('Instagram Direct')
    expect(getMetaChannelLabel('messenger')).toBe('Facebook Messenger')
    expect(getMetaChannelLabel('webchat')).toBe('Webchat')
  })

  it('derives connected state from verified token and webhook health', () => {
    expect(deriveConnectedChannelState({
      isActive: true,
      providerVerifyState: 'verified',
      tokenState: 'connected',
      healthStatus: 'connected',
    })).toBe('connected')
  })

  it('marks token failures as reauth required', () => {
    expect(deriveConnectedChannelState({
      isActive: true,
      providerVerifyState: 'verified',
      tokenState: 'needs_reauth',
      healthStatus: 'needs_reauth',
    })).toBe('needs_reauth')
  })

  it('sanitizes Meta metadata before portal display', () => {
    expect(sanitizeMetaPublicMetadata({
      pageId: 'page-1',
      accessToken: 'secret',
      appSecret: 'secret',
      username: 'clinica-yux',
    })).toEqual({ pageId: 'page-1', username: 'clinica-yux' })
  })

  it('sorts and deduplicates granted scopes', () => {
    expect(normalizeMetaScopes(['pages_messaging', 'whatsapp_business_messaging', 'pages_messaging'])).toEqual([
      'pages_messaging',
      'whatsapp_business_messaging',
    ])
  })

  it('uses n8n fallback only for explicit intermediary routes', () => {
    expect(shouldUseN8nFallback({ adapterKey: 'meta-whatsapp', fallbackMode: 'official' })).toBe(false)
    expect(shouldUseN8nFallback({ adapterKey: 'meta-whatsapp', fallbackMode: 'n8n' })).toBe(true)
    expect(shouldUseN8nFallback({ adapterKey: 'custom-provider', fallbackMode: 'official' })).toBe(true)
  })
})
