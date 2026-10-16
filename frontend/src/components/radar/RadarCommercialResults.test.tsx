import {act} from 'react'
import {createRoot} from 'react-dom/client'
import {describe,it,expect,vi} from 'vitest'
const modulePath='./RadarCommercialResults',api=await import(modulePath).catch(()=>({}))
const campaign={id:'campaign',organizationId:'org',name:'Campanha',targetSegment:'Empresas B2B',targetStates:['SP'],targetCnaes:['5620101'],offerType:'Massas',configurationRevision:1,criteria:{includeAnyTerms:['alimentação empresarial'],cities:[]}}
const facts={cnpj:'1128426000198',city:'Poá',state:'SP',websiteUrl:'https://empresa.example/',websiteStatus:'unverified',contacts:[{kind:'email',value:'compras@empresa.example',association:'review',purpose:'suppliers',sourceUrl:'https://empresa.example/contato'}],
 profile:{summary:{value:'Alimentação empresarial',sourceUrl:'https://empresa.example/'},services:[{value:'Refeições coletivas'}],customerSegments:[{value:'Indústrias'}],operatingRegions:[{value:'Sudeste'}]},
 activity:{status:'inconclusive',signals:[],presenceSignals:[{kind:'accessible_site',excerpt:'Site acessível',sourceUrl:'https://empresa.example/'}]},sizeAssessment:{score:70,evidenceCoverage:60,contributions:[{metric:'units',amount:30,points:70,weight:1,sourceUrl:'https://empresa.example/'}]}}
describe('commercial results without operational tooling',()=>{
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
