import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { RadarCandidateResearchPanel } from './RadarCandidateResearchPanel'
import { radarService } from '@/services/radarService'
import type { RadarResearchAvailability, RadarResearchResult } from '@/types/radarResearch'
vi.mock('@/services/radarService',()=>({radarService:{getCandidateResearch:vi.fn(),startCandidateResearch:vi.fn()}}))
const availability:RadarResearchAvailability={allowed:true,reasons:[],estimates:[],maximumCostPerCandidate:.03,maxQueriesPerCandidate:3,semanticQualificationEnabled:false}
const initial:RadarResearchResult={availability,configurationRevision:2,run:null,history:[]}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(radarService.getCandidateResearch).mockResolvedValue(initial);vi.spyOn(window,'confirm').mockReturnValue(true)})
it('shows a recoverable availability failure instead of permanent loading',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockRejectedValue(new Error('HTTP 500'))
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<RadarCandidateResearchPanel candidateId="candidate" organizationId="org" configurationRevision={2} availability={null}/>))
  await act(async()=>Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Ver resultado e disponibilidade')!.click())
  expect(container.textContent).toContain('Não foi possível verificar a disponibilidade')
  expect(container.textContent).not.toContain('Conferindo disponibilidade')
  expect(container.querySelector('button')!.disabled).toBe(true)
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue(initial)
  await act(async()=>Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Tentar novamente')!.click())
  expect(container.querySelector('button')!.disabled).toBe(false)
  act(()=>root.unmount())
})
function mount(value:RadarResearchAvailability=availability) {
  const container=document.createElement('div'),root=createRoot(container)
  act(()=>root.render(<RadarCandidateResearchPanel candidateId="candidate" organizationId="org" configurationRevision={2} availability={value}/>))
  const click=async(text:string)=>{await act(async()=>{Array.from(container.querySelectorAll('button')).find(button=>button.textContent===text)!.click()})}
  return{container,click,unmount:()=>act(()=>root.unmount())}
}
it('starts_without_manual_url_and_deduplicates_clicks',async()=>{
  vi.mocked(radarService.startCandidateResearch).mockResolvedValue({runId:'run',status:'queued',reused:false})
  const view=mount()
  expect(view.container.querySelector('input')).toBeNull()
  await view.click('Pesquisar e enriquecer automaticamente')
  expect(radarService.startCandidateResearch).toHaveBeenCalledExactlyOnceWith('candidate',expect.objectContaining({organizationId:'org',configurationRevision:2}))
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('0,0300'))
  view.unmount()
})
it('requests an explicit new research generation after confirmation',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,run:{id:'done',status:'succeeded',stage:'review',updated_at:'2026-10-13',configuration_revision:2,output:{}}})
  const view=mount();await view.click('Ver resultado e disponibilidade')
  await view.click('Atualizar pesquisa')
  expect(radarService.startCandidateResearch).toHaveBeenCalledWith('candidate',expect.objectContaining({operation:'refresh',requestId:expect.any(String)}))
  view.unmount()
})
it('shows_brave_disabled_and_cost_reason_without_asking_for_license_again',()=>{
  const view=mount({...availability,allowed:false,reasons:[{code:'source_disabled',message:'Fonte Brave desativada.',resolution:'Admin → Integrações'},{code:'source_cost_required',message:'Custo não definido.',resolution:'Admin → Integrações'}]})
  expect(view.container.textContent).toContain('Fonte Brave desativada')
  expect(view.container.textContent).toContain('Custo não definido')
  expect(view.container.querySelector('button')!.disabled).toBe(true)
  expect(radarService.startCandidateResearch).not.toHaveBeenCalled()
  view.unmount()
})
it('shows_all_contacts_and_sources_and_partial_resume',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,run:{id:'run',status:'partial',stage:'review',updated_at:'2026-10-08',configuration_revision:2,output:{registryPhone:'4133334444',contacts:[{kind:'whatsapp',value:'+5541999998888',sourceUrl:'https://alfa.example/contato',observedAt:'2026-10-08',association:'confirmed'}],limitations:['Funcionamento ainda inconclusivo.']}}})
  const view=mount();await view.click('Ver resultado e disponibilidade')
  expect(view.container.textContent).toContain('Resultado parcial')
  expect(view.container.textContent).toContain('WhatsApp publicado')
  expect(view.container.textContent).toContain('4133334444')
  expect(view.container.querySelector('a')!.href).toBe('https://alfa.example/contato')
  expect(view.container.textContent).toContain('Retomar pesquisa automática')
  view.unmount()
})
it('shows practical profile, contact purpose, missing size and actionable technical failure',async()=>{
  const claim={value:'Soluções corporativas',evidenceId:'page-0',excerpt:'Soluções corporativas',sourceUrl:'https://alfa.example/',observedAt:'2026-10-12',scope:'establishment' as const}
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,availability:{...availability,semanticQualificationEnabled:true},run:{
    id:'run',status:'partial',stage:'review',updated_at:'2026-10-12',configuration_revision:2,output:{
      contacts:[{kind:'email',value:'compras@alfa.example',purpose:'suppliers',preferred:true,sourceUrl:claim.sourceUrl,observedAt:claim.observedAt,association:'confirmed'}],
      profile:{summary:claim,services:[claim],customerSegments:[],operatingRegions:[],scaleSignals:[]},
      sizeAssessment:{score:null,evidenceCoverage:0,direction:'larger',contributions:[],limitations:[]},limitations:['robots_transport_failed']}}})
  const view=mount();await view.click('Ver resultado e disponibilidade')
  expect(view.container.textContent).toContain('Soluções corporativas')
  expect(view.container.textContent).toContain('Trecho, data e escopo da evidência')
  expect(view.container.textContent).toContain('fornecedores/compras')
  expect(view.container.textContent).toContain('Sem evidência suficiente para pontuar')
  expect(view.container.textContent).toContain('Falha de conexão')
  const refresh=view.container.querySelector('input[type="checkbox"]') as HTMLInputElement
  expect(refresh.checked).toBe(false)
  await act(async()=>refresh.click())
  await view.click('Retomar pesquisa automática')
  expect(radarService.startCandidateResearch).toHaveBeenCalledWith('candidate',expect.objectContaining({allowSemanticRefresh:true}))
  view.unmount()
})
