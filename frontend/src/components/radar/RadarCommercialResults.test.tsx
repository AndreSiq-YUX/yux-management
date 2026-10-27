import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {describe,it,expect,vi} from 'vitest'
const modulePath='./RadarCommercialResults',api=await import(modulePath).catch(()=>({}))
const campaign={id:'campaign',organizationId:'org',name:'Campanha',targetSegment:'Empresas B2B',targetStates:['SP'],targetCnaes:['5620101'],offerType:'Massas',configurationRevision:1,criteria:{includeAnyTerms:['alimentação empresarial'],cities:[]}}
const facts={cnpj:'1128426000198',city:'Poá',state:'SP',websiteUrl:'https://empresa.example/',websiteStatus:'unverified',contacts:[{kind:'email',value:'compras@empresa.example',association:'review',purpose:'suppliers',sourceUrl:'https://empresa.example/contato'}],
 profile:{summary:{value:'Alimentação empresarial',sourceUrl:'https://empresa.example/'},services:[{value:'Refeições coletivas'}],customerSegments:[{value:'Indústrias'}],operatingRegions:[{value:'Sudeste'}]},
 activity:{status:'inconclusive',signals:[],presenceSignals:[{kind:'accessible_site',excerpt:'Site acessível',sourceUrl:'https://empresa.example/'}]},sizeAssessment:{score:70,evidenceCoverage:60,contributions:[{metric:'units',amount:30,points:70,weight:1,sourceUrl:'https://empresa.example/'}]}}
describe('commercial results without operational tooling',()=>{
 it('counts only compatible companies toward the progress of a new qualified lot',async()=>{
  const host=document.createElement('div'),root=createRoot(host)
  try{await act(async()=>root.render(<api.RadarCommercialResults campaign={campaign} candidates={[]} operation={{status:'discovering',countingMode:'qualified',counts:{requested:10,admitted:10,qualified:3,confirmedFit:3,completed:3,completedWithGaps:0,outsideProfile:7,technicalFailures:0}}} screen="results" onNavigate={vi.fn()} onOpenDetails={vi.fn()}/>));expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('30')}finally{act(()=>root.unmount())}
 })
 it('identifies pending companies in the row and filters them without confusing gaps with blockers',async()=>{
  const host=document.createElement('div'),root=createRoot(host)
  const feedback={schemaVersion:1,status:'waiting',updatedFields:[],unresolvedFields:[],lastAttemptAt:null,nextAction:'wait',attention:{stage:'website_identity',reason:'identity_analysis_incomplete',nextAction:'review_company',canResume:false}}
  try{
   await act(async()=>root.render(<api.RadarCommercialResults campaign={campaign} candidates={[{id:'a',title:'Empresa pendente',facts,feedback},{id:'b',title:'Empresa pesquisada',facts}]} operation={null} screen="results" onNavigate={vi.fn()} onOpenDetails={vi.fn()}/>))
   expect(host.textContent).toContain('Identificação do site não concluída')
   const select=host.querySelector('select[aria-label="Filtrar por situação"]') as HTMLSelectElement
   expect(select).not.toBeNull()
   await act(async()=>{select.value='waiting';select.dispatchEvent(new Event('change',{bubbles:true}))})
   expect(host.textContent).toContain('Empresa pendente');expect(host.textContent).not.toContain('Empresa pesquisada')
  }finally{act(()=>root.unmount())}
 })
 it('shows the dated last useful site and contact when a new attempt remains incomplete',async()=>{
  const host=document.createElement('div'),root=createRoot(host)
  try{
   await act(async()=>root.render(<api.RadarCommercialCompanyDetails facts={{refreshIncomplete:true,previousResearch:{websiteUrl:'https://anterior.example/',observedAt:'2026-10-18T12:00:00Z',contacts:[{kind:'email',value:'compras@anterior.example',sourceUrl:'https://anterior.example/',observedAt:'2026-10-18T12:00:00Z'}]}}}/>))
   expect(host.textContent).toContain('Dados anteriores preservados')
   expect(host.textContent).toContain('18/10/2026');expect(host.textContent).toContain('compras@anterior.example')
   expect(host.querySelector('a[href="https://anterior.example/"]')).not.toBeNull()
   expect(host.textContent).not.toContain('Site não encontrado')
  }finally{act(()=>root.unmount())}
 })
 it('never shows a finished bar for one complete, eight insufficient and eleven blocked companies',async()=>{
  const host=document.createElement('div'),root=createRoot(host)
  try{
   await act(async()=>root.render(<api.RadarCommercialResults campaign={campaign} candidates={[]} operation={{status:'blocked',counts:{requested:20,admitted:20,researching:0,completed:1,insufficient:8,blocked:11}}} screen="results" opportunities={[]} onNavigate={vi.fn()} onOpenDetails={vi.fn()}/>))
   expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('5')
  }finally{act(()=>root.unmount())}
 })
 it('keeps a calendar reference date on its published day in Brazil',async()=>{
  vi.stubEnv('TZ','America/Sao_Paulo')
  const container=document.createElement('div'),root=createRoot(container)
  try{
   await act(async()=>root.render(<api.RadarCommercialCompanyDetails facts={{sizeAssessment:{score:75,contributions:[{metric:'units',amount:20,referenceDate:'2026-10-15'}]}}}/>))
   expect(container.textContent).toContain('referência 15/10/2026')
  }finally{act(()=>root.unmount());vi.unstubAllEnvs()}
 })
 it('does not offer opportunity conversion without the existing CRM permission',async()=>{
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<api.RadarCommercialResults campaign={campaign} candidates={[]} operation={null} screen="results" opportunities={[{id:'offer',status:'approved',canConvertToLead:true,company:{tradeName:'Alfa'}}]} onOpportunityAction={vi.fn()} onNavigate={vi.fn()} onOpenDetails={vi.fn()}/>))
  const button=[...container.querySelectorAll('button')].find(item=>item.textContent==='Enviar ao CRM')
  expect(button?.disabled).toBe(true)
  act(()=>root.unmount())
 })
 it('preserves authorized commercial opportunity review actions without technical labels',async()=>{
  const onOpportunityAction=vi.fn(),container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<api.RadarCommercialResults campaign={campaign} candidates={[]} operation={null} screen="results" opportunities={[{id:'offer',status:'review_pending',company:{tradeName:'Alfa'}}]} onOpportunityAction={onOpportunityAction} onNavigate={vi.fn()} onOpenDetails={vi.fn()}/>))
  const approve=[...container.querySelectorAll('button')].find(button=>button.textContent==='Aprovar')
  expect(approve).toBeDefined();await act(async()=>approve!.click());expect(onOpportunityAction).toHaveBeenCalledWith('offer','approve')
  act(()=>root.unmount())
 })
 it('shows sourced company details inline without mistaking pending ownership for confirmed contact',async()=>{
  expect(api.RadarCommercialResults).toBeTypeOf('function')
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<api.RadarCommercialResults campaign={campaign} candidates={[{id:'c',title:'Brave Transportes',facts}]} operation={null} screen="results" onNavigate={vi.fn()} onOpenDetails={vi.fn()}/>))
  expect(container.textContent).toContain('1128426000198');expect(container.textContent).toContain('Brave Transportes')
  await act(async()=>[...container.querySelectorAll('button')].find(button=>button.textContent==='Ver detalhes')!.click())
  expect(container.textContent).toContain('compras@empresa.example');expect(container.textContent).toContain('Associação pendente')
  expect(container.textContent).toContain('Alimentação empresarial');expect(container.textContent).toContain('Refeições coletivas');expect(container.textContent).toContain('Indústrias');expect(container.textContent).toContain('Sudeste')
  expect(container.textContent).toContain('70/100');expect(container.textContent).not.toMatch(/Serper|CNPJá|OpenRouter|consumo|R\$/)
  act(()=>root.unmount())
 })
 it.each(['configuration','history'])('keeps %s commercial without operational configuration controls',async screen=>{
  expect(api.RadarCommercialResults).toBeTypeOf('function')
  const container=document.createElement('div'),root=createRoot(container)
  await act(async()=>root.render(<api.RadarCommercialResults campaign={campaign} candidates={[]} operation={null} screen={screen} history={[{id:'h',companyName:'Empresa Alfa',status:'partial',updatedAt:'2026-10-15T12:00:00Z'}]} onNavigate={vi.fn()} onOpenDetails={vi.fn()}/>))
  expect(container.textContent).toContain(screen==='history'?'Empresa Alfa':'alimentação empresarial')
  expect(container.textContent).not.toMatch(/sources|model|Serper|CNPJá|OpenRouter|consumo|R\$/)
  expect(container.querySelector('input[type="number"]')).toBeNull()
  act(()=>root.unmount())
 })
})
