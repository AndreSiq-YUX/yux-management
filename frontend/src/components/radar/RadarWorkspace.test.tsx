import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RadarResearchAvailability } from '@/types/radarResearch'
import type { PlatformContext } from '@/types/platform'
import type { RadarCampaign, RadarDataSource } from '@/types/radar'
import { radarService } from '@/services/radarService'
import { RadarWorkspace } from './RadarWorkspace'
import toast from 'react-hot-toast'
vi.mock('react-hot-toast',()=>({default:Object.assign(vi.fn(),{success:vi.fn(),error:vi.fn()})}))
vi.mock('./RadarCandidateResearchPanel',()=>({RadarCandidateResearchPanel:()=>null}))

const state = vi.hoisted(() => ({ context: {
  mode:'client_workspace', organization:{id:'org',isInternalGrowthWorkspace:true},
  role:{key:'yux_admin',scope:'internal',permissions:[]},
} as unknown as PlatformContext }))
vi.mock('@/stores/platformStore', () => ({ usePlatformContext: () => state.context }))
vi.mock('@/components/strategy-engine/StrategyContextPanel', () => ({StrategyContextPanel:() => null}))
vi.mock('@/services/radarService', () => ({radarService:{
  getCampaigns:vi.fn(async () => []),getDataSources:vi.fn(async () => []),
  getResearchAvailability:vi.fn(async():Promise<RadarResearchAvailability>=>({allowed:false,reasons:[],estimates:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:3,semanticQualificationEnabled:false})),
  getCrmDestinations:vi.fn(async()=>[]),
  startCandidateResearch:vi.fn(async()=>({runId:'run',status:'queued',reused:false})),
  getResearchHistory:vi.fn(async()=>[{id:'run',candidateId:'candidate',companyName:'Empresa pesquisada',configurationRevision:2,operation:'reanalyze',status:'succeeded',updatedAt:'2026-10-13T12:00:00Z'}]),
  getB2bProspects:vi.fn(async()=>[]),getB2bProgress:vi.fn(async()=>({candidates:0,checked:0,confirmed:0,approved:0,scopes:[]})),runB2bBatch:vi.fn(async()=>({status:'queued'})),
  getOpportunities:vi.fn(async () => []),getMetrics:vi.fn(async () => null),
  getCandidates:vi.fn(async () => []),getDuplicates:vi.fn(async () => []),getRuns:vi.fn(async () => []),
  getOsmReadiness:vi.fn(async () => ({ready:false,reason:'Sem extrato',segmentKey:null,snapshot:null})),
  getOsmReport:vi.fn(async () => null),
  getBraveCandidateAvailability:vi.fn(async()=>({allowed:true,reasons:[]})),
  enrichCandidateWithBrave:vi.fn(async()=>({matched:true,placesCount:1})),
}}))

describe('Radar campaign creation entry point', () => {
  it.each(['radar_candidate_requires_current_discovery','radar_brave_retention_license_required','source_limit_exceeded'])('reports the real complement failure %s',async(code)=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign])
    vi.mocked(radarService.getDataSources).mockResolvedValueOnce([{id:'brave',sourceKey:'brave_place_search',sourceType:'brave_place_search',enabled:true,defaultCostPerUnit:.01} as RadarDataSource])
    vi.mocked(radarService.getCandidates).mockResolvedValue([{id:'candidate',organizationId:'org',campaignId:'campaign',title:'Empresa',sourceType:'cnpja_advanced_search',status:'pending_review',normalizedPayload:{},dedupeKey:'key',createdAt:'',updatedAt:''}])
    vi.mocked(radarService.enrichCandidateWithBrave).mockRejectedValueOnce(new Error(code))
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Ver detalhes')!.click())
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Completar presença pública')!.click())
    const message=vi.mocked(toast.error).mock.calls.at(-1)?.[0]
    expect(message).toEqual(expect.stringMatching(code==='source_limit_exceeded'?/limite/i:code.includes('license')?/licença/i:/configuração atual/i))
    expect(message).not.toContain('indisponível ou licença')
    act(()=>root.unmount());vi.mocked(radarService.getCandidates).mockResolvedValue([])
  })
  it('enables selected-company reanalysis independently of disabled web searches',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetCity:'',targetState:'',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,automationLevel:'human_review_required',strategyProfileKey:'',createdAt:'',updatedAt:''}])
    vi.mocked(radarService.getCandidates).mockResolvedValue([{id:'candidate',organizationId:'org',campaignId:'campaign',title:'Empresa',sourceType:'manual',status:'pending_review',normalizedPayload:{},dedupeKey:'key',createdAt:'',updatedAt:''}])
    vi.mocked(radarService.getResearchAvailability).mockResolvedValue({allowed:false,reasons:[],estimates:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:3,semanticQualificationEnabled:false,operations:{reanalyze:{allowed:true,reasons:[]}}})
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    await act(async()=>(container.querySelector('tbody input') as HTMLInputElement).click())
    const button=[...container.querySelectorAll('button')].find(button=>button.textContent==='Reavaliar dados salvos')!
    expect(button.disabled).toBe(false)
    expect([...container.querySelectorAll('button')].find(button=>button.textContent==='Atualizar pesquisa')!.disabled).toBe(true)
    vi.spyOn(window,'confirm').mockReturnValue(true)
    await act(async()=>button.click())
    expect(radarService.startCandidateResearch).toHaveBeenCalledWith('candidate',expect.objectContaining({operation:'reanalyze'}))
    act(()=>root.unmount())
    vi.mocked(radarService.getCandidates).mockResolvedValue([])
    vi.mocked(radarService.getResearchAvailability).mockResolvedValue({allowed:false,reasons:[],estimates:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:3,semanticQualificationEnabled:false})
  })
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
    expect(container.querySelector('form')).toBeNull()
    await act(async () => [...container.querySelectorAll('button')].find(button=>button.textContent==='Nova campanha')!.click())
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

  it('opens a campaign through dedicated navigation instead of expanding below the list',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{id:'campaign',organizationId:'org',name:'Pesquisa dedicada',campaignType:'local_niche',targetSegment:'Empresas',targetCity:'Cidade',targetState:'PR',targetStates:[],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,automationLevel:'human_review_required',strategyProfileKey:'crm_controller',createdAt:'',updatedAt:''}])
    const container=document.createElement('div'),root=createRoot(container),navigate=vi.fn()
    await act(async()=>root.render(<RadarWorkspace onNavigate={navigate}/>))
    expect(container.textContent).not.toContain('Fontes da campanha')
    await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Abrir')!.click())
    expect(navigate).toHaveBeenCalledWith('campaign')
    act(()=>root.unmount())
  })
  it('shows commercial research history to a client without exposing providers or configuration forms',async()=>{
    state.context={mode:'portal',organization:{id:'org',kind:'client'},role:{key:'client_admin',scope:'client',permissions:['radar.read']},enabledModuleKeys:['radar']} as unknown as PlatformContext
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{id:'campaign',organizationId:'org',name:'Campanha',campaignType:'local_niche',targetSegment:'Empresas',targetCity:'Cidade',targetState:'PR',targetStates:[],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,automationLevel:'human_review_required',strategyProfileKey:'',createdAt:'',updatedAt:''}])
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="history" campaignId="campaign"/>))
    expect(container.textContent).toContain('Empresa pesquisada')
    expect(container.textContent).toContain('Reavaliação dos dados salvos')
    expect(container.textContent).not.toContain('Metricas por fonte')
    expect(container.querySelector('form')).toBeNull()
    act(()=>root.unmount())
  })
  it('refreshes results automatically when discovery was queued rather than leaving the empty list stale',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetCity:'',targetState:'',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,automationLevel:'human_review_required',strategyProfileKey:'',createdAt:'',updatedAt:''}])
    vi.mocked(radarService.getDataSources).mockResolvedValueOnce([{id:'source',sourceType:'cnpja_advanced_search',sourceKey:'cnpja_advanced_search',displayName:'Cadastro empresarial',enabled:true,isPaid:true,requiresSecret:false,defaultCostPerUnit:.01,rateLimitPerDay:100,createdAt:'',updatedAt:''}])
    vi.spyOn(window,'confirm').mockReturnValue(true)
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    vi.mocked(radarService.getCandidates).mockResolvedValue([{id:'new',organizationId:'org',campaignId:'campaign',title:'Nova empresa encontrada',sourceType:'cnpja_advanced_search',status:'pending_review',normalizedPayload:{city:'Cidade',state:'PR'},dedupeKey:'new',createdAt:'',updatedAt:''}])
    await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Buscar mais empresas')!.click())
    expect(container.querySelector('tbody')?.textContent).toContain('Nova empresa encontrada')
    act(()=>root.unmount())
    vi.mocked(radarService.getCandidates).mockResolvedValue([])
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
