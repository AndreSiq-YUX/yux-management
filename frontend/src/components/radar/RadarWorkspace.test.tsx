import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlatformContext } from '@/types/platform'
import type { RadarCampaign, RadarDataSource } from '@/types/radar'
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
  getResearchAvailability:vi.fn(async()=>({allowed:false,reasons:[],estimates:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:3,semanticQualificationEnabled:false})),
  getOpportunities:vi.fn(async () => []),getMetrics:vi.fn(async () => null),
  getCandidates:vi.fn(async () => []),getDuplicates:vi.fn(async () => []),getRuns:vi.fn(async () => []),
  getOsmReadiness:vi.fn(async () => ({ready:false,reason:'Sem extrato',segmentKey:null,snapshot:null})),
  getOsmReport:vi.fn(async () => null),
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

  it('links source configuration to the central Admin and refreshes availability without querying providers', async () => {
    const campaign: RadarCampaign = { id:'campaign',organizationId:'org',name:'Pesquisa',campaignType:'local_niche',
      targetSegment:'Empresas',targetCity:'Cidade',targetState:'PR',targetStates:[],productFocus:[],targetKeywords:[],
      targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,automationLevel:'human_review_required',
      strategyProfileKey:'crm_controller',createdAt:'',updatedAt:'' }
    const source: RadarDataSource = { id:'cnpja',sourceKey:'cnpja_advanced_search',sourceType:'cnpja_advanced_search',
      displayName:'CNPJá pesquisa',enabled:false,isPaid:true,requiresSecret:true,defaultCostPerUnit:0.025,
      rateLimitPerDay:50,createdAt:'',updatedAt:'' }
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([campaign])
    vi.mocked(radarService.getDataSources).mockResolvedValueOnce([source]).mockResolvedValueOnce([{...source,enabled:true}])
    const container = document.createElement('div')
    const root = createRoot(container)
    await act(async () => root.render(<RadarWorkspace />))
    await act(async () => [...container.querySelectorAll('button')].find(button => button.textContent === 'Abrir')!.click())
    expect(container.querySelector('a[href="/admin/integrations#radar-sources"]')?.textContent).toContain('Configurar fontes no Admin')
    expect(container.textContent).not.toContain('Configure as credenciais antes')
    expect(container.textContent).not.toContain('Salvar limites e custo')
    expect(container.textContent).not.toContain('Ativar piloto OSM')
    const refresh = [...container.querySelectorAll('button')].find(button => button.textContent === 'Atualizar estado das fontes')!
    await act(async () => refresh.click())
    expect(radarService.getDataSources).toHaveBeenCalledTimes(2)
    const cnpjaTitle = [...container.querySelectorAll('p')].find(element => element.textContent === 'CNPJá pesquisa')!
    expect(cnpjaTitle.parentElement?.parentElement?.textContent).toContain('Disponivel para esta campanha.')
    act(() => root.unmount())
  })
})
