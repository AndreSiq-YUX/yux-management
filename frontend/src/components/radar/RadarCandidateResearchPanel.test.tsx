import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeEach, expect, it, vi } from 'vitest'
import { RadarCandidateResearchPanel } from './RadarCandidateResearchPanel'
import { radarService } from '@/services/radarService'
import type { RadarResearchAvailability, RadarResearchResult } from '@/types/radarResearch'
vi.mock('@/services/radarService',()=>({radarService:{getCandidateResearch:vi.fn(),startCandidateResearch:vi.fn(),authorizeTlsException:vi.fn(),revokeTlsException:vi.fn()}}))
const availability:RadarResearchAvailability={allowed:true,reasons:[],estimates:[],maximumCostPerCandidate:.03,maxQueriesPerCandidate:3,semanticQualificationEnabled:false}
const initial:RadarResearchResult={availability,configurationRevision:2,run:null,history:[]}
it('labels historical dossier confirmations with their revision instead of current corroboration',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,run:{id:'old',status:'succeeded',stage:'review',updated_at:'2026-10-14',configuration_revision:1,output:{siteAssociation:'confirmed',discovery:{websiteUrl:'https://alfa.example/',association:'confirmed',suggestions:[],limitations:[]},contacts:[{kind:'email',value:'old@alfa.example',sourceUrl:'https://alfa.example/',observedAt:'2026-10-14',association:'confirmed'}]}}})
  const view=mount();await view.click('Ver dossiê da empresa')
  expect(view.container.textContent).toContain('Dossiê histórico — revisão 1')
  expect(view.container.textContent).not.toContain('Identidade corroborada')
  expect(view.container.textContent).not.toContain('presença pública: corroborada')
  view.unmount()
})
it('shows an Admin configuration link without hiding public evidence or invoking paid analysis',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,availability:{...availability,presenceResolutionEnabled:true,presence:{routeConfigured:false,maxInputTokens:16000,maxOutputTokens:1600,fallbackCount:0}},run:{id:'run',status:'partial',stage:'review',updated_at:'2026-10-14',configuration_revision:2,output:{pages:[{url:'https://alfa.example/',text:'Alfa institucional',observedAt:'2026-10-14'}],limitations:['radar_presence_explicit_route_required']}}})
  const view=mount();await view.click('Ver dossiê da empresa')
  expect(view.container.querySelector('a[href="/admin/ai"]')).not.toBeNull()
  expect(view.container.textContent).toContain('Alfa institucional')
  expect(radarService.startCandidateResearch).not.toHaveBeenCalled()
  view.unmount()
})
it('requires a single explicit certificate consent, saves without launching paid research, and offers resume',async()=>{
  const diagnostic={diagnosticId:'a'.repeat(64),hostname:'public.example',fingerprint256:'AB',validTo:'2020-01-02T00:00:00Z'}
  const saved={...initial,tlsCanAuthorize:true,tlsDiagnostics:[diagnostic],tlsExceptions:[],run:{id:'run',status:'partial',stage:'review',updated_at:'2026-10-14',configuration_revision:2,output:{}}}
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue(saved)
  vi.mocked(radarService.authorizeTlsException).mockResolvedValue({} as never)
  const view=mount();await view.click('Ver dossiê da empresa')
  const button=()=>Array.from(view.container.querySelectorAll('button')).find(b=>b.textContent==='Autorizar leitura deste site')!
  expect(button().disabled).toBe(true)
  const checkbox=view.container.querySelector('[role="checkbox"],input[type="checkbox"]') as HTMLElement
  await act(async()=>checkbox.click());expect(button().disabled).toBe(false)
  await view.click('Autorizar leitura deste site')
  expect(radarService.authorizeTlsException).toHaveBeenCalledWith('candidate',{organizationId:'org',runId:'run',configurationRevision:2,diagnosticId:diagnostic.diagnosticId,confirmed:true})
  expect(radarService.startCandidateResearch).not.toHaveBeenCalled()
  expect(view.container.textContent).toContain('Retomar pesquisa desta empresa')
  view.unmount()
})
it('shows certificate read provenance to clients but never offers the approval control',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,tlsCanAuthorize:false,tlsDiagnostics:[{diagnosticId:'a',hostname:'public.example',fingerprint256:'AB',validTo:'2020-01-02'}],run:{id:'run',status:'partial',stage:'review',updated_at:'2026-10-14',configuration_revision:2,output:{pages:[{url:'https://public.example/',text:'Dados públicos',observedAt:'2026-10-14',tlsException:{grantId:'grant',hostname:'public.example',fingerprint256:'AB',observedAt:'2026-10-14'}}]}}})
  const view=mount();await view.click('Ver dossiê da empresa')
  expect(view.container.textContent).toContain('certificado vencido')
  expect(view.container.textContent).toContain('Página lida sob autorização excepcional')
  expect(view.container.textContent).not.toContain('Autorizar leitura deste site')
  view.unmount()
})
it('explains legacy research and offers explicit factual reanalysis even without a model',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,methodVersion:2,run:{id:'old',status:'partial',stage:'review',updated_at:'2026-09-01',configuration_revision:2,output:{}}} as RadarResearchResult)
  const view=mount();await view.click('Ver dossiê da empresa')
  expect(view.container.textContent).toContain('método anterior')
  expect(view.container.textContent).toContain('Retomar não refaz as buscas')
  await view.click('Reavaliar com os dados salvos')
  expect(radarService.startCandidateResearch).toHaveBeenCalledWith('candidate',expect.objectContaining({operation:'reanalyze'}))
  view.unmount()
})
it('allows reanalysis with saved evidence despite search restrictions, without enabling new searches',async()=>{
  const restricted={...availability,allowed:false,semanticQualificationEnabled:true,operations:{reanalyze:{allowed:true,reasons:[]}},reasons:[{code:'source_disabled',message:'Busca desativada',resolution:'Admin'}]}
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,availability:restricted,run:{id:'saved',status:'succeeded',stage:'review',updated_at:'2026-10-13',configuration_revision:2,output:{}}})
  const view=mount(restricted);await view.click('Ver dossiê da empresa')
  expect([...view.container.querySelectorAll('button')].find(button=>button.textContent==='Atualizar pesquisa')!.disabled).toBe(true)
  expect([...view.container.querySelectorAll('button')].find(button=>button.textContent==='Reavaliar com os dados salvos')!.disabled).toBe(false)
  await view.click('Reavaliar com os dados salvos')
  expect(radarService.startCandidateResearch).toHaveBeenCalledWith('candidate',expect.objectContaining({operation:'reanalyze'}))
  view.unmount()
})
beforeEach(()=>{vi.clearAllMocks();vi.mocked(radarService.getCandidateResearch).mockResolvedValue(initial);vi.spyOn(window,'confirm').mockReturnValue(true)})
it('shows a recoverable availability failure instead of permanent loading',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockRejectedValue(new Error('HTTP 500'))
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<RadarCandidateResearchPanel candidateId="candidate" organizationId="org" configurationRevision={2} availability={null}/>))
  await act(async()=>Array.from(container.querySelectorAll('button')).find(button=>button.textContent==='Ver dossiê da empresa')!.click())
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
  await view.click('Completar dados desta empresa')
  expect(radarService.startCandidateResearch).toHaveBeenCalledExactlyOnceWith('candidate',expect.objectContaining({organizationId:'org',configurationRevision:2}))
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('0,0300'))
  view.unmount()
})
it('requests an explicit new research generation after confirmation',async()=>{
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,run:{id:'done',status:'succeeded',stage:'review',updated_at:'2026-10-13',configuration_revision:2,output:{}}})
  const view=mount();await view.click('Ver dossiê da empresa')
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
  const view=mount();await view.click('Ver dossiê da empresa')
  expect(view.container.textContent).toContain('Resultado parcial')
  expect(view.container.textContent).toContain('WhatsApp publicado')
  expect(view.container.textContent).toContain('4133334444')
  expect(view.container.querySelector('a')!.href).toBe('https://alfa.example/contato')
  expect(view.container.textContent).toContain('Retomar pesquisa desta empresa')
  view.unmount()
})
it('shows practical profile, contact purpose, missing size and actionable technical failure',async()=>{
  const claim={value:'Soluções corporativas',evidenceId:'page-0',excerpt:'Soluções corporativas',sourceUrl:'https://alfa.example/',observedAt:'2026-10-12',scope:'establishment' as const}
  vi.mocked(radarService.getCandidateResearch).mockResolvedValue({...initial,availability:{...availability,semanticQualificationEnabled:true},run:{
    id:'run',status:'partial',stage:'review',updated_at:'2026-10-12',configuration_revision:2,output:{
      contacts:[{kind:'email',value:'compras@alfa.example',purpose:'suppliers',preferred:true,sourceUrl:claim.sourceUrl,observedAt:claim.observedAt,association:'confirmed'}],
      profile:{summary:claim,services:[claim],customerSegments:[],operatingRegions:[],scaleSignals:[]},
      sizeAssessment:{score:null,evidenceCoverage:0,direction:'larger',contributions:[],limitations:[]},limitations:['robots_transport_failed']}}})
  const view=mount();await view.click('Ver dossiê da empresa')
  expect(view.container.textContent).toContain('Soluções corporativas')
  expect(view.container.textContent).toContain('Trecho, data e escopo da evidência')
  expect(view.container.textContent).toContain('fornecedores/compras')
  expect(view.container.textContent).toContain('Sem evidência suficiente para pontuar')
  expect(view.container.textContent).toContain('Falha de conexão')
  const refresh=view.container.querySelector('input[type="checkbox"]') as HTMLInputElement
  expect(refresh.checked).toBe(false)
  await act(async()=>refresh.click())
  await view.click('Retomar pesquisa desta empresa')
  expect(radarService.startCandidateResearch).toHaveBeenCalledWith('candidate',expect.objectContaining({allowSemanticRefresh:true}))
  view.unmount()
})
