import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PortalConnectedChannelsPage } from './PortalConnectedChannelsPage'
import { metaChannelService } from '@/services/metaChannelService'
import { usePlatformStore } from '@/stores/platformStore'

const organizationId = '00000000-0000-4000-8000-000000000001'
const flush = () => new Promise(resolve => setTimeout(resolve, 0))

afterEach(() => { document.body.innerHTML = ''; vi.restoreAllMocks() })

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
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => { root.render(<PortalConnectedChannelsPage />); await flush(); await flush() })
    expect(list).toHaveBeenCalledWith(organizationId)
    expect(document.body.textContent).toContain('Conectar WhatsApp')
    expect(document.body.textContent).not.toContain('Nenhum contrato ativo')
    act(() => root.unmount())
  })
})
