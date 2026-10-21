import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalConnectedChannelsPage } from './PortalConnectedChannelsPage'
import { metaChannelService } from '@/services/metaChannelService'
import { usePlatformStore } from '@/stores/platformStore'

const organizationId = '00000000-0000-4000-8000-000000000001'
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => { document.body.innerHTML = ''; delete window.FB; vi.restoreAllMocks() })

describe('PortalConnectedChannelsPage', () => {
  it('allows the internal growth workspace to operate channels without a commercial contract', async () => {
    usePlatformStore.setState({
      mode: 'client_workspace', isLoading: false, error: null, activeContract: null,
      organization: { id: organizationId, name: 'YUX', slug: 'yux', kind: 'yux', isInternalGrowthWorkspace: true, createdAt: '', updatedAt: '' },
      role: { key: 'yux_admin', name: 'YUX Admin', scope: 'internal', permissions: ['platform.manage'] },
      enabledModuleKeys: ['whatsapp_ai'],
      workspaceContext: { schemaVersion: 1, organizationId, kind: 'internal_growth', contractId: null, role: 'yux_admin', moduleKeys: ['whatsapp_ai'], canConfigure: true, missionCreation: { mode: 'conversation', reasonCode: null } },
    })
    const list = vi.spyOn(metaChannelService, 'listConnectedChannels').mockResolvedValue([])
    vi.spyOn(metaChannelService, 'listWhatsAppSettingsOptions').mockResolvedValue({ assistants: [], teams: [], queues: [] })
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<PortalConnectedChannelsPage />); await flush(); await flush() })
    expect(list).toHaveBeenCalledWith(organizationId)
    expect(document.body.textContent).toContain('Conectar WhatsApp')
    expect(document.body.textContent).not.toContain('Nenhum contrato ativo')
    act(() => root.unmount())
  })

  it('prepares a reconnection for the selected WhatsApp connection ID', async () => {
    usePlatformStore.setState({
      mode: 'client_workspace', isLoading: false, error: null, activeContract: null,
      organization: { id: organizationId, name: 'YUX', slug: 'yux', kind: 'yux', isInternalGrowthWorkspace: true, createdAt: '', updatedAt: '' },
      role: { key: 'yux_admin', name: 'YUX Admin', scope: 'internal', permissions: ['platform.manage'] },
      enabledModuleKeys: ['whatsapp_ai'],
      workspaceContext: { schemaVersion: 1, organizationId, kind: 'internal_growth', contractId: null, role: 'yux_admin', moduleKeys: ['whatsapp_ai'], canConfigure: true, missionCreation: { mode: 'conversation', reasonCode: null } },
    })
    vi.spyOn(metaChannelService, 'listConnectedChannels').mockResolvedValue([{
      id: '00000000-0000-4000-8000-000000000002', organizationId, channel: 'whatsapp',
      label: 'WhatsApp Business', name: 'YUX Comercial', displayName: 'YUX Comercial',
      phoneNumberId: 'phone-number-1', displayPhoneNumber: '+55 43 99917-3440',
      state: 'connected', fallbackMode: 'official', tokenReferenceConfigured: true, publicMetadata: {},
    }])
    vi.spyOn(metaChannelService, 'listWhatsAppSettingsOptions').mockResolvedValue({ assistants: [], teams: [], queues: [] })
    const start = vi.spyOn(metaChannelService, 'startConnect').mockResolvedValue({
      channel: 'whatsapp', state: 'state-reconnect', graphVersion: 'v25.0',
      redirectUri: 'https://hub.yux.com.br/oauth/meta/callback',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      authUrl: undefined, missingConfig: ['META_APP_ID'],
    })
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<PortalConnectedChannelsPage />); await flush(); await flush() })
    const reconnect = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Reconectar WhatsApp Business'))
    expect(reconnect).toBeTruthy()
    await act(async () => { reconnect!.focus(); await flush(); await flush() })
    expect(start).toHaveBeenCalledWith({ organizationId, channel: 'whatsapp', connectionId: '00000000-0000-4000-8000-000000000002' })
    act(() => root.unmount())
  })

  it('completes WhatsApp Embedded Signup with the original organization, state, and selected Meta assets', async () => {
    usePlatformStore.setState({
      mode: 'client_workspace', isLoading: false, error: null, activeContract: null,
      organization: { id: organizationId, name: 'YUX', slug: 'yux', kind: 'yux', isInternalGrowthWorkspace: true, createdAt: '', updatedAt: '' },
      role: { key: 'yux_admin', name: 'YUX Admin', scope: 'internal', permissions: ['platform.manage'] },
      enabledModuleKeys: ['whatsapp_ai'],
      workspaceContext: { schemaVersion: 1, organizationId, kind: 'internal_growth', contractId: null, role: 'yux_admin', moduleKeys: ['whatsapp_ai'], canConfigure: true, missionCreation: { mode: 'conversation', reasonCode: null } },
    })
    vi.spyOn(metaChannelService, 'listConnectedChannels').mockResolvedValue([])
    vi.spyOn(metaChannelService, 'listWhatsAppSettingsOptions').mockResolvedValue({ assistants: [], teams: [], queues: [] })
    const start = vi.spyOn(metaChannelService, 'startConnect').mockResolvedValue({
      channel: 'whatsapp',
      state: 'state-original-organization',
      appId: '123456789012345',
      graphVersion: 'v25.0',
      embeddedSignupConfigId: '234567890123456',
      redirectUri: 'https://hub.yux.com.br/oauth/meta/callback',
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      authUrl: undefined,
      missingConfig: [],
    })
    const complete = vi.spyOn(metaChannelService, 'completeConnect').mockResolvedValue({ connections: [] } as never)
    window.FB = {
      init: vi.fn(),
      login: vi.fn(callback => {
        callback({ status: 'connected', authResponse: { code: 'temporary-meta-code' } })
        window.dispatchEvent(new MessageEvent('message', {
          origin: 'https://www.facebook.com',
          data: JSON.stringify({
            type: 'WA_EMBEDDED_SIGNUP',
            event: 'FINISH',
            data: { waba_id: '345678901234567', phone_number_id: '456789012345678' },
          }),
        }))
      }),
    }

    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<PortalConnectedChannelsPage />); await flush(); await flush() })
    const connectButton = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Conectar WhatsApp Business'))
    expect(connectButton).toBeTruthy()
    await act(async () => { connectButton!.focus(); await flush(); await flush() })
    expect(start).toHaveBeenCalledWith({ organizationId, channel: 'whatsapp' })

    await act(async () => { connectButton!.click(); await flush(); await flush() })
    expect(document.body.textContent).toContain('Proteja o número do WhatsApp')
    const form = document.querySelector('[role="dialog"]')
    expect(form).toBeTruthy()
    await act(async () => {
      form!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
      await flush()
    })
    expect(complete).toHaveBeenCalledWith({
      organizationId,
      channel: 'whatsapp',
      code: 'temporary-meta-code',
      state: 'state-original-organization',
      wabaId: '345678901234567',
      phoneNumberIds: ['456789012345678'],
      registrationPin: '',
    })
    act(() => root.unmount())
  })
})
