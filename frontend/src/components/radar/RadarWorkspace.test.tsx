import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformContext } from '@/types/platform'
import { radarService } from '@/services/radarService'
import { RadarWorkspace } from './RadarWorkspace'

const state = vi.hoisted(() => ({ context: {
  mode:'client_workspace', organization:{id:'org',isInternalGrowthWorkspace:true},
  role:{key:'yux_admin',scope:'internal',permissions:[]},
} as unknown as PlatformContext }))
vi.mock('@/stores/platformStore', () => ({ usePlatformContext: () => state.context }))
vi.mock('@/components/strategy-engine/StrategyContextPanel', () => ({StrategyContextPanel:() => null}))
vi.mock('@/services/radarService', () => ({radarService:{
  getCampaigns:vi.fn(async () => []),getDataSources:vi.fn(async () => []),
}}))

describe('Radar campaign creation entry point', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.context = { mode:'client_workspace', organization:{id:'org',isInternalGrowthWorkspace:true},
      role:{key:'yux_admin',scope:'internal',permissions:[]} } as unknown as PlatformContext
  })

  it('shows a contracted client the Radar consultation page without creation controls', async () => {
    state.context = { mode: 'portal', organization: { id: 'client-org', kind: 'client' },
      role: { key: 'client_admin', scope: 'client', permissions: ['radar.read'] },
      enabledModuleKeys: ['radar'] } as unknown as PlatformContext
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<RadarWorkspace />))
    expect(container.textContent).toContain('Acesso de consulta')
    expect(container.textContent).not.toContain('Radar Comercial indisponivel')
    expect(container.querySelector('form')).toBeNull()
    expect(radarService.getCampaigns).toHaveBeenCalledWith('client-org')
    act(() => root.unmount())
  })

  it('blocks direct page access and does not request data when Radar is not contracted', async () => {
    state.context = { mode: 'portal', organization: { id: 'client-org', kind: 'client' },
      role: { key: 'client_admin', scope: 'client', permissions: ['radar.read'] },
      enabledModuleKeys: ['crm'] } as unknown as PlatformContext
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<RadarWorkspace />))
    expect(container.textContent).toContain('Radar Comercial indisponivel')
    expect(radarService.getCampaigns).not.toHaveBeenCalled()
    expect(radarService.getDataSources).not.toHaveBeenCalled()
    act(() => root.unmount())
  })
  it('opens configurable geography by default and preserves local/recently opened creation', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<RadarWorkspace />))
    expect(container.querySelector('form[aria-label="Configuração da pesquisa"]')).not.toBeNull()
    expect(container.querySelector('form[aria-label="Criação rápida local"]')).toBeNull()
    expect(container.querySelector('textarea[required]')).toBeNull()
    const mode = container.querySelector('select')!
    act(() => { mode.value = 'local'; mode.dispatchEvent(new Event('change',{bubbles:true})) })
    const local = container.querySelector('form[aria-label="Criação rápida local"]')!
    expect(local).not.toBeNull()
    expect(local.querySelector('input[placeholder="Cidade"][required]')).not.toBeNull()
    expect(local.querySelector('option[value="recently_opened"]')).not.toBeNull()
    act(() => { mode.value = 'regional'; mode.dispatchEvent(new Event('change',{bubbles:true})) })
    expect(container.querySelector('form[aria-label="Configuração da pesquisa"]')).not.toBeNull()
    act(() => root.unmount())
  })
})
