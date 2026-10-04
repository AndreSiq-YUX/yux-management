import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { RadarWorkspace } from './RadarWorkspace'

vi.mock('@/stores/platformStore', () => ({ usePlatformContext: () => ({
  mode:'client_workspace', organization:{id:'org',isInternalGrowthWorkspace:true},
  role:{key:'yux_admin',scope:'internal',permissions:[]},
}) }))
vi.mock('@/components/strategy-engine/StrategyContextPanel', () => ({StrategyContextPanel:() => null}))
vi.mock('@/services/radarService', () => ({radarService:{
  getCampaigns:vi.fn(async () => []),getDataSources:vi.fn(async () => []),
}}))

describe('Radar campaign creation entry point', () => {
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
