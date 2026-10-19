import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RadarResearchAvailability } from '@/types/radarResearch'
import type { PlatformContext } from '@/types/platform'
import type { RadarCampaign, RadarDataSource } from '@/types/radar'
import { radarService } from '@/services/radarService'
import {ApiClientError} from '@/lib/apiClient'
import { RadarWorkspace } from './RadarWorkspace'
import toast from 'react-hot-toast'
import {radarPolicyFixture} from '@/test/fixtures/radarOperationalPolicy'
import {defaultRadarSearchConfiguration} from '@/lib/radar/radarSearchConfiguration'
const campaignDefaults={targetCity:'',targetState:'',automationLevel:'human_review_required' as const,strategyProfileKey:''}
vi.mock('react-hot-toast',()=>({default:Object.assign(vi.fn(),{success:vi.fn(),error:vi.fn()})}))
vi.mock('./RadarCandidateResearchPanel',()=>({RadarCandidateResearchPanel:()=>null}))

const state = vi.hoisted(() => ({ context: {
  mode:'client_workspace', organization:{id:'org',isInternalGrowthWorkspace:true},
  role:{key:'yux_admin',scope:'internal',permissions:[]},
} as unknown as PlatformContext,authRole:'admin' as 'admin'|'manager'|'client' }))
vi.mock('@/stores/authStore',()=>({useAuthStore:(selector:(value:{user:{id:string;role:'admin'|'manager'|'client'}})=>unknown)=>selector({user:{id:'fixture-user',role:state.authRole}})}))
vi.mock('@/stores/platformStore', () => ({ usePlatformContext: () => state.context }))
vi.mock('@/components/strategy-engine/StrategyContextPanel', () => ({StrategyContextPanel:() => null}))
vi.mock('@/services/radarService', () => ({radarService:{
  getCampaigns:vi.fn(async () => []),getDataSources:vi.fn(async () => []),updateCampaign:vi.fn(),
  getOperationalPolicy:vi.fn(async()=>radarPolicyFixture),
  getCommercialCampaigns:vi.fn(async()=>[]),getCommercialCandidates:vi.fn(async()=>[]),getCommercialCapture:vi.fn(async()=>({operation:null})),getCommercialResearch:vi.fn(async()=>null),getCommercialHistory:vi.fn(async()=>[]),getCommercialResearchMetrics:vi.fn(async()=>({companies:0,identified:0,withUsefulContact:0,readyForReview:0})),getCommercialOpportunities:vi.fn(async()=>[]),getCommercialFeedback:vi.fn(async()=>[]),
  commercialOpportunityAction:vi.fn(async()=>{}),commercialCandidateAction:vi.fn(async()=>{}),
  getResearchMetrics:vi.fn(async()=>({companies:0,identified:0,withUsefulContact:0,readyForReview:0,searchEstimatedBrl:0,searchQueries:0,searchCostPerCompanyBrl:null,searchCostPerIdentityBrl:null,searchCostPerUsefulContactBrl:null,searchCostPerReadyForReviewBrl:null,aiReportedUsd:null,aiCostUnknown:0,aiAnalyses:0,aiCostKnown:0,period:{from:'2026-10-15',to:'2026-10-15',timeZone:'UTC'},currencyNote:'Estimativas, IA separada',sources:[]})),
  getResearchAvailability:vi.fn(async():Promise<RadarResearchAvailability>=>({allowed:false,reasons:[],estimates:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:3,semanticQualificationEnabled:false})),
  getCrmDestinations:vi.fn(async()=>[]),
  getLatestCaptureOperation:vi.fn(async()=>({operation:null})),getCaptureOperation:vi.fn(),startCaptureOperation:vi.fn(),resumeCaptureOperation:vi.fn(),
  capturePreflight:vi.fn(async()=>({stateId:'a'.repeat(64),allowed:true,requiresLimitsApproval:false,remaining:20,limits:{pageSize:10,maxPagesPerScope:5,maxQueriesPerBatch:5},attemptedQueries:0,successfulPagesByScope:{},optimisticAdditionalCapacity:20,minimumAdditionalQueries:2,blockers:[],checks:[]})),
  startCandidateResearch:vi.fn(async()=>({runId:'run',status:'queued',reused:false})),queueResearchRequest:vi.fn(async(_campaignId:string,input:{candidateIds:string[]})=>({requestId:'request',state:'accepted',items:input.candidateIds.map(candidateId=>({candidateId,state:'accepted',message:'Pesquisa solicitada.'}))})),
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
  it('carries the confirmed analysis authorization to every company selected for completion',async()=>{
    const config=defaultRadarSearchConfiguration();config.research!.enabled=true
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:100,createdAt:'',updatedAt:'',configurationRevision:2,searchConfiguration:config} as RadarCampaign])
    vi.mocked(radarService.getCandidates).mockResolvedValue(Array.from({length:4},(_,index)=>({id:`selected-${index}`,campaignId:'campaign',organizationId:'org',title:`Empresa ${index}`,status:'pending_review',sourceType:'cnpja_advanced_search',normalizedPayload:{},rawPayload:{},createdAt:'',updatedAt:''})) as never)
    vi.mocked(radarService.getResearchAvailability).mockResolvedValue({allowed:true,reasons:[],estimates:[],maximumCostPerCandidate:.1,maxQueriesPerCandidate:3,semanticQualificationEnabled:true})
    const confirm=vi.spyOn(window,'confirm').mockReturnValue(true),container=document.body.appendChild(document.createElement('div')),root=createRoot(container)
    try{
      await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
      const select=container.querySelector<HTMLInputElement>('[aria-label="Selecionar empresas desta página"]')
      expect(select).not.toBeNull()
      await act(async()=>select!.click())
      const complete=[...container.querySelectorAll('button')].find(button=>button.textContent==='Completar dados')!
      await act(async()=>complete.click())
      const calls=vi.mocked(radarService.queueResearchRequest).mock.calls
      expect(calls).toHaveLength(1)
      expect(calls[0]).toEqual(['campaign',expect.objectContaining({candidateIds:['selected-0','selected-1','selected-2','selected-3'],allowSemanticRefresh:true,criteriaRevision:2,requestId:expect.any(String)})])
      expect(radarService.startCandidateResearch).not.toHaveBeenCalled()
      expect(container.textContent).not.toContain('execução existente reaproveitada')
    }finally{act(()=>root.unmount());container.remove();confirm.mockRestore();vi.mocked(radarService.getCandidates).mockResolvedValue([]);vi.mocked(radarService.getResearchAvailability).mockResolvedValue({allowed:false,reasons:[],estimates:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:3,semanticQualificationEnabled:false})}
  })
  it.each(['continuation','capacity'])('confirms new-lot %s warnings once and preserves consent on retry',async mode=>{
    const config=defaultRadarSearchConfiguration();config.research!.enabled=true
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',configurationRevision:2,dailyLimit:100,createdAt:'',updatedAt:'',searchConfiguration:config} as RadarCampaign])
    vi.mocked(radarService.getDataSources).mockResolvedValueOnce([{id:'source',sourceType:'cnpja_advanced_search',sourceKey:'cnpja_advanced_search',displayName:'Cadastro',enabled:true,isPaid:true,requiresSecret:false,defaultCostPerUnit:.025,rateLimitPerDay:100,createdAt:'',updatedAt:''}])
    vi.mocked(radarService.getResearchAvailability).mockResolvedValue({allowed:true,reasons:[],estimates:[],maximumCostPerCandidate:1,maxQueriesPerCandidate:3,semanticQualificationEnabled:false})
    const continuation={scopeKey:'v2:PR:all',scopeLabel:'Paraná',stateId:'c'.repeat(64),generation:1,reason:'idle',requiresRestartConfirmation:true,replayEstimate:3}
    vi.mocked(radarService.capturePreflight).mockResolvedValueOnce({stateId:'d'.repeat(64),policy:radarPolicyFixture,continuations:mode==='continuation'?[continuation]:[],warnings:mode==='capacity'?[{code:'radar_capture_enrichment_capacity_low',message:'Capacidade de aprofundamento menor que o lote.'}]:[],researchCapacity:{remainingQueries:2,plannedMaximumQueries:60,estimatedMaximumCostBrl:.6},allowed:true,requiresLimitsApproval:false,remaining:20,limits:config.batch,attemptedQueries:0,successfulPagesByScope:{},optimisticAdditionalCapacity:20,minimumAdditionalQueries:2,blockers:[],checks:[]})
    vi.mocked(radarService.startCaptureOperation).mockRejectedValueOnce(Error('lost_response')).mockResolvedValueOnce({operationId:'new-op',status:'queued',reused:true})
    vi.mocked(radarService.getCaptureOperation).mockResolvedValueOnce({id:'new-op',campaignId:'campaign',configurationRevision:2,status:'queued',counts:{requested:20,admitted:0,researching:0,completed:0,insufficient:0,blocked:0},blockers:[],items:[],queries:0,discoveryStopped:false})
    const container=document.body.appendChild(document.createElement('div')),root=createRoot(container)
    try{
     await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
     const input=container.querySelector<HTMLInputElement>('form[aria-label="Pesquisar novas empresas"] input')!
     await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'20');input.dispatchEvent(new Event('input',{bubbles:true}))})
     await act(async()=>container.querySelector('form[aria-label="Pesquisar novas empresas"]')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
     expect(document.querySelector('[role="dialog"]')?.textContent).toContain(mode==='continuation'?'3 páginas':'Capacidade de aprofundamento menor que o lote.');expect(radarService.startCaptureOperation).not.toHaveBeenCalled()
     const confirm=()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent==='Confirmar e iniciar')!
     await act(async()=>confirm().click());expect(document.querySelector('[role="dialog"]')).not.toBeNull()
     await act(async()=>confirm().click())
     const calls=vi.mocked(radarService.startCaptureOperation).mock.calls
     expect(calls).toHaveLength(2);expect(calls[1]).toEqual(calls[0]);expect(calls[0][1]).toMatchObject({requestedCount:20,continuationAuthorizations:mode==='continuation'?[{scopeKey:continuation.scopeKey,expectedStateId:continuation.stateId}]:[]})
     expect(document.querySelector('[role="dialog"]')).toBeNull()
    }finally{act(()=>root.unmount());container.remove();vi.mocked(radarService.getResearchAvailability).mockResolvedValue({allowed:false,reasons:[],estimates:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:3,semanticQualificationEnabled:false})}
  })
  it('confirms exact limits and expiry together for the same legacy partial lot; cancel does not resume',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',configurationRevision:2,dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign])
    const operation={id:'op-limit',campaignId:'campaign',configurationRevision:2,status:'partial' as const,canContinue:true,discoveryStopped:true,discoveryReason:'page_cap',queries:1,blockers:[],counts:{requested:20,admitted:0,researching:0,completed:0,insufficient:0,blocked:0},items:[]}
    vi.mocked(radarService.getLatestCaptureOperation).mockResolvedValue({operation})
    const p={stateId:'b'.repeat(64),policy:radarPolicyFixture,allowed:true,requiresLimitsApproval:true,remaining:20,limits:{pageSize:10,maxPagesPerScope:1,maxQueriesPerBatch:5},attemptedQueries:1,successfulPagesByScope:{},optimisticAdditionalCapacity:10,minimumAdditionalQueries:2,blockers:[],checks:[],expiredContinuation:{receiptId:'receipt',scopeLabel:'Paraná'}}
    vi.mocked(radarService.capturePreflight).mockResolvedValueOnce(p).mockResolvedValueOnce(p)
    vi.mocked(radarService.resumeCaptureOperation).mockResolvedValueOnce({...operation,status:'queued',canContinue:false})
    const container=document.createElement('div'),root=createRoot(container);document.body.append(container)
    try{
      await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
      const resume=()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Retomar pesquisa')!
      await act(async()=>resume().click());expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1)
      expect(radarService.resumeCaptureOperation).not.toHaveBeenCalled()
      await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent==='Cancelar')!.click())
      expect(radarService.resumeCaptureOperation).not.toHaveBeenCalled()
      await act(async()=>resume().click())
      const input=document.querySelectorAll<HTMLInputElement>('[role="dialog"] input')[1]
      await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'4');input.dispatchEvent(new Event('input',{bubbles:true}))})
      await act(async()=>[...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(b=>b.textContent==='Confirmar e retomar')!.click())
      expect(radarService.resumeCaptureOperation).toHaveBeenCalledExactlyOnceWith('op-limit',{organizationId:'org',configurationRevision:2,requestId:expect.any(String),limitsAuthorization:{expectedStateId:p.stateId,limits:{...p.limits,maxPagesPerScope:4}},restartExpiredContinuation:true,continuationReceiptId:'receipt'})
      expect(radarService.startCaptureOperation).not.toHaveBeenCalled()
    }finally{act(()=>root.unmount());container.remove();vi.mocked(radarService.getLatestCaptureOperation).mockResolvedValue({operation:null})}
  })
  it('opens continuation consent from the server and forwards explicit approval with the same requestId',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',configurationRevision:2,dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign])
    const operation={id:'op',campaignId:'campaign',configurationRevision:2,status:'blocked' as const,discoveryStopped:false,queries:1,blockers:['radar_capture_discovery_request_rejected'],counts:{requested:20,admitted:0,researching:0,completed:0,insufficient:0,blocked:0},items:[]}
    vi.mocked(radarService.getLatestCaptureOperation).mockResolvedValue({operation})
    const continuationReceiptId='00000000-0000-4000-8000-000000000001'
    vi.mocked(radarService.resumeCaptureOperation).mockRejectedValueOnce(new ApiClientError(new Response(null,{status:409}),{error:'radar_capture_continuation_confirmation_required',continuationReceiptId})).mockRejectedValueOnce(Error('radar_capture_continuation_confirmation_stale'))
    const container=document.createElement('div'),root=createRoot(container);document.body.append(container)
    try{
      await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
      await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Retomar pesquisa')!.click())
      const dialog=document.querySelector('[role="dialog"]');expect(dialog).not.toBeNull()
      await act(async()=>[...dialog!.querySelectorAll('button')].find(button=>button.textContent==='Confirmar e retomar')!.click())
      const calls=vi.mocked(radarService.resumeCaptureOperation).mock.calls
      expect(calls).toHaveLength(2);expect(calls[1]).toEqual(['op',{...calls[0][1],restartExpiredContinuation:true,continuationReceiptId}])
      expect(container.textContent).toContain('Atualize');expect(container.textContent).not.toContain('radar_capture_continuation_confirmation_stale')
      expect(radarService.startCaptureOperation).not.toHaveBeenCalled()
    }finally{act(()=>root.unmount());container.remove();vi.mocked(radarService.getLatestCaptureOperation).mockResolvedValue({operation:null})}
  })
  it('follows a pending commercial analysis to review without an active capture',async()=>{
    vi.useFakeTimers();state.authRole='manager';state.context={mode:'client_workspace',organization:{id:'org',isInternalGrowthWorkspace:true},role:{key:'yux_operator',scope:'internal',permissions:[]}} as unknown as PlatformContext
    vi.mocked(radarService.getCommercialCampaigns).mockResolvedValue([{id:'campaign',organizationId:'org',name:'Local',campaignType:'local_niche',criteria:{}}])
    vi.mocked(radarService.getCommercialCapture).mockResolvedValue({operation:null});vi.mocked(radarService.getCommercialCandidates).mockResolvedValue([])
    vi.mocked(radarService.getCommercialOpportunities).mockResolvedValueOnce([{id:'offer',status:'raw',company:{tradeName:'Alfa'}}]).mockResolvedValueOnce([{id:'offer',status:'diagnosing',company:{tradeName:'Alfa'}}]).mockResolvedValue([{id:'offer',status:'review_pending',company:{tradeName:'Alfa'}}])
    const container=document.createElement('div'),root=createRoot(container)
    try{await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>));await act(async()=>[...container.querySelectorAll('button')].find(item=>item.textContent==='Analisar oportunidade')!.click());expect(container.textContent).toContain('Analisando')
      await act(async()=>vi.advanceTimersByTimeAsync(4_001));const approve=[...container.querySelectorAll('button')].find(item=>item.textContent==='Aprovar');expect(approve?.disabled).toBe(false);expect(radarService.getRuns).not.toHaveBeenCalled();expect(radarService.getResearchAvailability).not.toHaveBeenCalled()
    }finally{act(()=>root.unmount());vi.useRealTimers()}
  })
  it.each(['import','discard'] as const)('preserves authorized commercial candidate %s and refreshes results',async action=>{
    state.authRole='client';state.context={mode:'portal',organization:{id:'org',kind:'client'},role:{key:'client_admin',scope:'client',permissions:['radar.read','radar:manage']},enabledModuleKeys:['radar']} as unknown as PlatformContext
    vi.mocked(radarService.getCommercialCampaigns).mockResolvedValue([{id:'campaign',organizationId:'org',name:'Local',campaignType:'local_niche',criteria:{}}]);vi.mocked(radarService.getCommercialCapture).mockResolvedValue({operation:null})
    vi.mocked(radarService.getCommercialCandidates).mockResolvedValueOnce([{id:'candidate',title:'Empresa Alfa',status:'pending_review',facts:{}}]).mockResolvedValue([{id:'candidate',title:'Empresa Alfa',status:action==='import'?'imported':'discarded',facts:{}}])
    vi.mocked(radarService.getCommercialOpportunities).mockResolvedValueOnce([]).mockResolvedValue(action==='import'?[{id:'offer',status:'raw',company:{tradeName:'Empresa Alfa'}}]:[])
    const container=document.createElement('div'),root=createRoot(container)
    try{await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>));const label=action==='import'?'Importar':'Descartar';const button=[...container.querySelectorAll('button')].find(item=>item.textContent===label);expect(button).toBeDefined();await act(async()=>button!.click());expect(radarService.commercialCandidateAction).toHaveBeenCalledWith('candidate',action,{analyzeAfterImport:false})
      expect([...container.querySelectorAll('button')].find(item=>item.textContent===label)?.disabled).toBe(true);if(action==='import')expect(container.textContent).toContain('Oportunidades')
    }finally{act(()=>root.unmount())}
  })
  it('never mounts internal tooling for a globally authenticated client even with stale system-admin context',async()=>{
    state.authRole='client'
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace/>))
    expect(radarService.getDataSources).not.toHaveBeenCalled();expect(radarService.getResearchAvailability).not.toHaveBeenCalled();expect(container.textContent).not.toContain('Nova campanha')
    act(()=>root.unmount())
  })
  it('keeps customer results and the progress visible while refreshing an active research lot',async()=>{
    vi.useFakeTimers()
    state.context={mode:'client_workspace',organization:{id:'org',kind:'client'},role:{key:'client_admin',scope:'client',permissions:['radar.read']},enabledModuleKeys:['radar']} as unknown as PlatformContext
    const campaign={id:'campaign',organizationId:'org',name:'Campanha',targetStates:['SP'],configurationRevision:1,criteria:{}}
    vi.mocked(radarService.getCommercialCampaigns).mockResolvedValue([campaign])
    vi.mocked(radarService.getCommercialCandidates).mockResolvedValueOnce([{id:'c',title:'Empresa Alfa',facts:{cnpj:'1128426000198'}}]).mockReturnValueOnce(new Promise(()=>{}))
    vi.mocked(radarService.getCommercialCapture).mockResolvedValue({operation:{id:'op',status:'researching',counts:{requested:7,admitted:7,researching:7}}})
    const container=document.createElement('div'),root=createRoot(container)
    try{await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>));expect(container.textContent).toContain('1128426000198')
      await act(async()=>vi.advanceTimersByTimeAsync(4_001));expect(container.textContent).toContain('1128426000198');expect(container.textContent).toContain('Solicitadas')
    }finally{act(()=>root.unmount());vi.useRealTimers()}
  })
  it.each(['client_admin','client_member','yux_operator'])('does not request or render internals for %s with broad management permissions',async role=>{
    state.context={mode:'client_workspace',organization:{id:'org',kind:'client'},role:{key:role,scope:role==='yux_operator'?'internal':'client',permissions:['radar.read','platform.manage']},enabledModuleKeys:['radar']} as unknown as PlatformContext
    vi.mocked(radarService.getCommercialCampaigns).mockResolvedValueOnce([{id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',configurationRevision:1,targetStates:['SP'],targetSegment:'Empresas',offerType:'Massas',criteria:{}}])
    vi.mocked(radarService.getCommercialCandidates).mockResolvedValueOnce([{id:'c',campaignId:'campaign',title:'Empresa Alfa',facts:{cnpj:'1128426000198'}}])
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    expect(radarService.getDataSources).not.toHaveBeenCalled();expect(radarService.getResearchAvailability).not.toHaveBeenCalled();expect(radarService.getRuns).not.toHaveBeenCalled()
    expect(container.textContent).toContain('1128426000198');expect(container.textContent).not.toMatch(/Serper|CNPJá|OpenRouter|consumo|R\$/)
    act(()=>root.unmount())
  })
  it('keeps the new-company quantity visible and places legacy controls only in one technical area',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',configurationRevision:2,dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign])
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    const controls=container.querySelector('form[aria-label="Pesquisar novas empresas"]')
    expect(controls).not.toBeNull();expect(controls!.querySelector('input[type="number"]')).not.toBeNull()
    expect([...container.querySelectorAll('button')].filter(button=>button.textContent==='Retomar pesquisa')).toHaveLength(0)
    const areas=[...container.querySelectorAll('details')].filter(item=>item.querySelector('summary')?.textContent==='Operação técnica — Admin YUX')
    expect(areas).toHaveLength(1);expect(areas[0].open).toBe(false)
    const regional=[...container.querySelectorAll('summary')].find(item=>item.textContent==='Acompanhar ou avançar a busca por região')
    expect(areas[0].contains(regional??null)).toBe(true)
    act(()=>root.unmount())
  })
  it('uses a new resume request after an acknowledged resume encounters a second blocker',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',configurationRevision:2,dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign])
    const operation={id:'op',campaignId:'campaign',configurationRevision:2,status:'blocked' as const,discoveryStopped:true,queries:1,blockers:['radar_ai_credits_insufficient'],counts:{requested:7,admitted:7,researching:0,completed:6,insufficient:0,blocked:1},items:[]}
    vi.mocked(radarService.getLatestCaptureOperation).mockResolvedValueOnce({operation})
    vi.mocked(radarService.resumeCaptureOperation).mockResolvedValue({...operation,status:'queued'})
    const container=document.createElement('div'),root=createRoot(container)
    document.body.append(container) // Native submit activation requires a connected form.
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    const resume=()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Retomar pesquisa')!
    await act(async()=>resume().click())
    vi.mocked(radarService.getLatestCaptureOperation).mockResolvedValueOnce({operation})
    await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Atualizar acompanhamento')!.click())
    await act(async()=>resume().click())
    const calls=vi.mocked(radarService.resumeCaptureOperation).mock.calls
    expect(calls).toHaveLength(2);expect(calls[1][1].requestId).not.toBe(calls[0][1].requestId)
    act(()=>root.unmount());container.remove()
  })
  it('recovers an active capture operation on reload and prevents a competing batch',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',configurationRevision:2,dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign])
    vi.mocked(radarService.getLatestCaptureOperation).mockResolvedValueOnce({operation:{id:'operation',campaignId:'campaign',configurationRevision:2,status:'researching',discoveryStopped:true,queries:1,blockers:[],counts:{requested:7,admitted:7,researching:7,completed:0,insufficient:0,blocked:0},items:[]}})
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    const button=[...container.querySelectorAll('button')].find(b=>b.textContent==='Pesquisando empresas…')
    expect(button).toBeDefined();expect(button!.disabled).toBe(true)
    expect(container.textContent).toContain('Solicitadas')
    expect(radarService.runB2bBatch).not.toHaveBeenCalled()
    act(()=>root.unmount())
  })
  it('keeps the persisted progress visible while a manual refresh is pending',async()=>{
    const campaign={...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',configurationRevision:2,dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([campaign])
    const operation={id:'op',campaignId:'campaign',configurationRevision:2,status:'partial' as const,discoveryStopped:true,queries:1,blockers:[],counts:{requested:7,admitted:7,researching:0,completed:0,insufficient:7,blocked:0},items:[]}
    vi.mocked(radarService.getLatestCaptureOperation).mockResolvedValueOnce({operation})
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    let resolve!:(value:{operation:typeof operation})=>void
    vi.mocked(radarService.getLatestCaptureOperation).mockReturnValueOnce(new Promise(done=>{resolve=done}))
    await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Atualizar acompanhamento')!.click())
    expect(container.textContent).toContain('Solicitadas')
    await act(async()=>resolve({operation}));act(()=>root.unmount())
  })
  it('ignores the paid-action refresh after navigating to a different campaign',async()=>{
    const campaigns=['a','b'].map(id=>({...campaignDefaults,id,organizationId:'org',name:`Campanha ${id}`,campaignType:id==='a'?'regional_b2b':'local_niche',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign))
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce(campaigns)
    vi.mocked(radarService.getDataSources).mockResolvedValueOnce([{id:'brave',sourceKey:'brave_place_search',sourceType:'brave_place_search',enabled:true,defaultCostPerUnit:.01} as RadarDataSource])
    vi.mocked(radarService.getCandidates).mockImplementation(async id=>[{id,organizationId:'org',campaignId:id,title:`Empresa ${id}`,sourceType:'cnpja_advanced_search',status:'pending_review',normalizedPayload:{},dedupeKey:id,createdAt:'',updatedAt:''}])
    let resolveAction!:(value:{matched:boolean;placesCount:number})=>void
    vi.mocked(radarService.enrichCandidateWithBrave).mockReturnValueOnce(new Promise(resolve=>{resolveAction=resolve}))
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace/>))
    await act(async()=>[...container.querySelectorAll('button')].filter(b=>b.textContent==='Abrir')[0].click())
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Ver detalhes')!.click())
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Ver detalhes completos')!.click())
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Completar presença pública')!.click())
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Voltar às campanhas')!.click())
    await act(async()=>[...container.querySelectorAll('button')].filter(b=>b.textContent==='Abrir')[1].click())
    await act(async()=>resolveAction({matched:false,placesCount:0}))
    expect(container.querySelector('tbody')?.textContent).toContain('Empresa b')
    expect(container.querySelector('tbody')?.textContent).not.toContain('Empresa a')
    act(()=>root.unmount());vi.mocked(radarService.getCandidates).mockResolvedValue([])
  })
  it('ignores a late company response after switching to another campaign',async()=>{
    const campaigns=['a','b'].map(id=>({...campaignDefaults,id,organizationId:'org',name:`Campanha ${id}`,campaignType:'local_niche',targetSegment:'Empresas',targetStates:[],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign))
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce(campaigns)
    let resolveA!:(value:Awaited<ReturnType<typeof radarService.getCandidates>>)=>void
    const a=new Promise<Awaited<ReturnType<typeof radarService.getCandidates>>>(resolve=>{resolveA=resolve})
    const company=(id:string)=>({id,organizationId:'org',campaignId:id,title:`Empresa ${id}`,sourceType:'manual',status:'pending_review' as const,normalizedPayload:{},dedupeKey:id,createdAt:'',updatedAt:''})
    vi.mocked(radarService.getCandidates).mockImplementation(id=>id==='a'?a:Promise.resolve([company('b')]))
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace/>))
    await act(async()=>[...container.querySelectorAll('button')].filter(b=>b.textContent==='Abrir')[0].click())
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Voltar às campanhas')!.click())
    await act(async()=>[...container.querySelectorAll('button')].filter(b=>b.textContent==='Abrir')[1].click())
    await act(async()=>resolveA([company('a')]))
    expect(container.querySelector('tbody')?.textContent).toContain('Empresa b')
    expect(container.querySelector('tbody')?.textContent).not.toContain('Empresa a')
    act(()=>root.unmount());vi.mocked(radarService.getCandidates).mockResolvedValue([])
  })
  it('focuses complete details only on explicit request and restores focus on close',async()=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign])
    vi.mocked(radarService.getCandidates).mockResolvedValue([{id:'candidate',organizationId:'org',campaignId:'campaign',title:'Empresa',sourceType:'cnpja_advanced_search',status:'pending_review',normalizedPayload:{},dedupeKey:'key',createdAt:'',updatedAt:''}])
    const container=document.createElement('div');document.body.append(container)
    const root=createRoot(container),scroll=vi.fn();HTMLElement.prototype.scrollIntoView=scroll
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Ver detalhes')!.click())
    expect(scroll).not.toHaveBeenCalled()
    const full=[...container.querySelectorAll('button')].find(b=>b.textContent==='Ver detalhes completos')!
    full.focus();await act(async()=>full.click())
    expect(document.activeElement?.textContent).toBe('Detalhes da empresa')
    expect(scroll).toHaveBeenCalledTimes(1)
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Fechar detalhes')!.click())
    expect(document.activeElement).toBe(full)
    act(()=>root.unmount());container.remove();vi.mocked(radarService.getCandidates).mockResolvedValue([])
  })
  it.each(['radar_candidate_requires_current_discovery','radar_brave_retention_license_required','source_limit_exceeded'])('reports the real complement failure %s',async(code)=>{
    vi.mocked(radarService.getCampaigns).mockResolvedValueOnce([{...campaignDefaults,id:'campaign',organizationId:'org',name:'Campanha',campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:['PR'],productFocus:[],targetKeywords:[],targetCnaes:[],offerType:'Serviço',status:'draft',dailyLimit:10,createdAt:'',updatedAt:''} as RadarCampaign])
    vi.mocked(radarService.getDataSources).mockResolvedValueOnce([{id:'brave',sourceKey:'brave_place_search',sourceType:'brave_place_search',enabled:true,defaultCostPerUnit:.01} as RadarDataSource])
    vi.mocked(radarService.getCandidates).mockResolvedValue([{id:'candidate',organizationId:'org',campaignId:'campaign',title:'Empresa',sourceType:'cnpja_advanced_search',status:'pending_review',normalizedPayload:{},dedupeKey:'key',createdAt:'',updatedAt:''}])
    vi.mocked(radarService.enrichCandidateWithBrave).mockRejectedValueOnce(new Error(code))
    const container=document.createElement('div'),root=createRoot(container)
    await act(async()=>root.render(<RadarWorkspace screen="results" campaignId="campaign"/>))
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Ver detalhes')!.click())
    await act(async()=>[...container.querySelectorAll('button')].find(b=>b.textContent==='Ver detalhes completos')!.click())
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
    expect(radarService.queueResearchRequest).toHaveBeenCalledWith('campaign',expect.objectContaining({intent:'reanalyze',candidateIds:['candidate']}))
    act(()=>root.unmount())
    vi.mocked(radarService.getCandidates).mockResolvedValue([])
    vi.mocked(radarService.getResearchAvailability).mockResolvedValue({allowed:false,reasons:[],estimates:[],maximumCostPerCandidate:0,maxQueriesPerCandidate:3,semanticQualificationEnabled:false})
  })
  beforeEach(() => {
    vi.clearAllMocks()
    state.authRole='admin'
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
    expect(radarService.getCommercialCampaigns).toHaveBeenCalledWith('client-org')
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
    vi.mocked(radarService.getCommercialCampaigns).mockResolvedValueOnce([{id:'campaign',organizationId:'org',name:'Campanha',campaignType:'local_niche',targetSegment:'Empresas',targetCity:'Cidade',targetState:'PR',targetStates:[],offerType:'Serviço',criteria:{}}])
    vi.mocked(radarService.getCommercialHistory).mockResolvedValueOnce([{id:'run',companyName:'Empresa pesquisada',status:'succeeded',actionLabel:'Reavaliação dos dados salvos',updatedAt:'2026-10-15'}])
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
    await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Somente descobrir empresas — sem aprofundamento')!.click())
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
