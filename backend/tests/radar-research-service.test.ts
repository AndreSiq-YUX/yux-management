import { expect, it, vi } from 'vitest'
import { runRadarResearchPipeline } from '../src/modules/radar/research-service.js'
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js'
import { validateRadarCompanyProfile } from '../src/modules/radar/company-profile.js'
const identity = { name: 'Empresa Alfa', cnpj: '12345678000190', city:'Curitiba',state:'PR',phone:'4133334444' }
const configuration = resolveRadarSearchConfiguration({ research: { enabled:true, webSearchEnabled:true } })
// Synthetic evidence scenarios, not claims that these exact excerpts were scraped live.
it.each([
  ['Empresa Brasileira de Refeições','Emb rare','01128426000198','Poá','SP','https://embrare.com.br/'],
  ['Viva Food','Viva Food','23244434000132','São Paulo','SP','https://vivafood.com.br/'],
  ['Oficina Nordeste Serviços','Marca Nordeste','23456789000190','Recife','PE','https://oficina.example/'],
])('keeps plain-name discovery generic for %s and isolates directory-owned channels',async(name,brand,cnpj,city,state,url)=>{
  const entity={name,cnpj,city,state},text=`${brand}. ${name} é nossa razão social.`
  const web=vi.fn(async()=>[{url:`https://serasaexperian.com.br/consulta-gratis/${cnpj}`,title:name,snippets:[cnpj],observedAt:'2026-10-13'},
    {url,title:brand,snippets:[name],observedAt:'2026-10-13'}])
  const result=await runRadarResearchPipeline(entity,resolveRadarSearchConfiguration({research:{enabled:true,webSearchEnabled:true,presenceResolutionEnabled:true}}),{},
    {web,collect:async()=>[{url,text,observedAt:'2026-10-13',html:`<a href="https://instagram.com/official-fixture">Instagram</a>`}],
      resolvePresence:async()=>({candidateId:'page-0',scope:'group',reason:'A fonte vincula marca e razão social.',claims:[{evidenceId:'page-0',excerpt:`${name} é nossa razão social.`}]}),checkpoint:async()=>{}})
  expect(web).toHaveBeenCalledExactlyOnceWith(name)
  expect(result.discovery.websiteUrl).toBe(url)
  expect(result.contacts).toContainEqual(expect.objectContaining({value:'https://instagram.com/official-fixture',scope:'group',sourceUrl:url}))
})
it('reads the plain-name institutional result before spending complementary searches and explores contact pages',async()=>{
  const web=vi.fn(async()=>[{url:'https://brand.example/',title:'Marca Beta — Empresa Alfa',snippets:['Empresa Alfa é nossa razão social.'],observedAt:'2026-10-13'}])
  const collect=vi.fn(async(_url:string,policy:{maxPagesPerCandidate:number})=>[
    {url:'https://brand.example/',text:'Marca Beta. Empresa Alfa é nossa razão social.',observedAt:'2026-10-13',html:'<a href="/sobre">Sobre</a><a href="/contato">Contato</a>'},
    ...(policy.maxPagesPerCandidate>1?[{url:'https://brand.example/contato',text:'Fornecedores — compras@brand.example',observedAt:'2026-10-13'}]:[])])
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{enabled:true,webSearchEnabled:true,presenceResolutionEnabled:true}}),{},
    {web,collect,resolvePresence:async()=>({candidateId:'page-0',scope:'group',reason:'A página identifica a razão social e a marca.',claims:[{evidenceId:'page-0',excerpt:'Empresa Alfa é nossa razão social.'}]}),checkpoint:async()=>{}})
  expect(web).toHaveBeenCalledTimes(1)
  expect(result.contacts).toContainEqual(expect.objectContaining({value:'compras@brand.example',scope:'group',association:'confirmed'}))
})
it('associates a differently named institutional brand through verified evidence instead of a directory footer',async()=>{
  const config=resolveRadarSearchConfiguration({research:{presenceResolutionEnabled:true}})
  const page={url:'https://brand.example/',text:'Marca Beta. Soluções empresariais em Curitiba. Empresa Alfa é nossa razão social.',observedAt:'2026-10-13',html:'<a href="mailto:compras@brand.example">Fornecedores</a>'}
  const result=await runRadarResearchPipeline(identity,config,{readingComplete:true,pages:[page],discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{},resolvePresence:async()=>({candidateId:'page-0',scope:'establishment',reason:'A página identifica a razão social e a marca.',claims:[{evidenceId:'page-0',excerpt:'Empresa Alfa é nossa razão social.'}]})})
  expect(result.discovery.websiteUrl).toBe('https://brand.example/')
  expect(result.contacts).toContainEqual(expect.objectContaining({value:'compras@brand.example',association:'confirmed'}))
})
it('recovers failed public reads without repeating completed discovery', async () => {
  const web = vi.fn(), collect = vi.fn(async (_url:string) => [{url:'https://alfa.example/',observedAt:'2026-10-12',text:'12.345.678/0001-90 contatos públicos'}])
  const result = await runRadarResearchPipeline(identity, configuration, {readingComplete:true,
    discovery:{association:'review',hits:[],suggestions:[{url:'https://alfa.example/contato',title:'Alfa',snippets:[],observedAt:'2026-10-12'}],limitations:[],queries:2},
    pages:[{url:'https://alfa.example/contato',observedAt:'2026-10-12',text:'',limitation:'robots_unavailable'}]},
  {web,collect,checkpoint:async()=>{}})
  expect(web).not.toHaveBeenCalled(); expect(collect.mock.calls[0][0]).toBe('https://alfa.example/')
  expect(result.siteAssociation).toBe('confirmed'); expect(result.pages.some(page=>page.limitation)).toBe(false)
})
it('retains_contacts_when_target_fit_is_unknown_and_keeps_registry_phone_separate', async () => {
  const local = vi.fn(async () => [])
  const web = vi.fn(async () => [{ url:'https://alfa.example',title:'Alfa',snippets:['12.345.678/0001-90'],observedAt:'2026-10-08' }])
  const pages = [{url:'https://alfa.example',observedAt:'2026-10-08',text:'Empresa Alfa 12.345.678/0001-90',html:'<a href="tel:41999998888">Contato</a>'}]
  const result = await runRadarResearchPipeline(identity, configuration, {}, { local, web, collect:async () => pages, checkpoint:async () => {} })
  expect(result.contacts[0].value).toBe('+5541999998888')
  expect(result.registryPhone).toBe('4133334444')
  expect(result.qualification).toBeUndefined()
})
it('resumes_completed_stages_without_rebilling_and_does_not_send_outreach', async () => {
  const local = vi.fn(), web = vi.fn(), collect = vi.fn()
  const cached = { discovery: { association:'confirmed' as const,websiteUrl:'https://alfa.example',hits:[],suggestions:[],limitations:[],queries:1 },
    readingComplete:true, pages:[{ url:'https://alfa.example',observedAt:'2026-10-08',text:'12.345.678/0001-90' }] }
  await runRadarResearchPipeline(identity, configuration, cached, { local, web, collect, checkpoint:async () => {} })
  expect(local).not.toHaveBeenCalled(); expect(web).not.toHaveBeenCalled(); expect(collect).not.toHaveBeenCalled()
})
it('handles_company_without_website_without_inventing_missing_data', async () => {
  const result = await runRadarResearchPipeline(identity, configuration, {}, { web: async () => [], checkpoint:async () => {} })
  expect(result.contacts).toEqual([])
  expect(result.activity.status).toBe('inconclusive')
  expect(result.discovery.association).toBe('not_found_in_consulted_sources')
})
it('keeps unrelated institutional homonym contacts out of company channels while preserving source pages',async()=>{
  const page={url:'https://homonym.example/',text:'Empresa Alfa de outro estado. CNPJ 99.999.999/0001-99. contato@homonym.example',observedAt:'2026-10-13'}
  const result=await runRadarResearchPipeline(identity,configuration,{readingComplete:true,pages:[page],discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:3}},
    {web:vi.fn(),checkpoint:async()=>{}})
  expect(result.contacts).toEqual([]);expect(result.pages).toContain(page)
})
it('recomputes scope of saved link-only contacts after group association instead of preserving an obsolete establishment claim',async()=>{
  const page={url:'https://brand.example/',text:'Marca Beta. Empresa Alfa é nossa razão social.',observedAt:'2026-09-01'}
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{presenceResolutionEnabled:true}}),{
    analysisOnly:true,readingComplete:true,discoveryLocked:true,pages:[page],contacts:[{kind:'email',value:'compras@brand.example',sourceUrl:page.url,observedAt:page.observedAt,association:'confirmed',scope:'establishment'}],
    discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),resolvePresence:async()=>({candidateId:'page-0',scope:'group',reason:'A página comprova marca e grupo, não a filial.',claims:[{evidenceId:'page-0',excerpt:'Empresa Alfa é nossa razão social.'}]}),checkpoint:async()=>{}})
  expect(result.contacts[0]).toMatchObject({scope:'group',observedAt:'2026-09-01'})
})
it('does_not_confirm_contacts_from_another_branch_on_the_same_domain',async()=>{
  const pages=[{url:'https://alfa.example',observedAt:'2026-10-08',text:'Empresa Alfa 12.345.678/0001-90'},
    {url:'https://alfa.example/contato',observedAt:'2026-10-08',text:'Outra filial 12.345.678/0002-71',html:'<a href="tel:41999998888">Contato da filial</a>'}]
  const result=await runRadarResearchPipeline(identity,configuration,{readingComplete:true,pages,discovery:{association:'confirmed',websiteUrl:'https://alfa.example',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{}})
  expect(result.contacts[0].association).toBe('review')
})
it('consolidates a sourced profile and size score in one LLM stage and reuses matching evidence',async()=>{
  const config=resolveRadarSearchConfiguration({research:{enabled:true,profileEnabled:true,contactPurpose:'suppliers',sizeAssessment:{enabled:true,
    criteria:[{metric:'units',weight:1,maxAgeDays:3650,bands:[{min:0,points:0},{min:10,points:80}]}]}}})
  const page={url:'https://alfa.example/',observedAt:'2026-10-12',text:'CNPJ 12.345.678/0001-90. Fornecemos soluções para empresas. Em 2026 contamos com 12 unidades. FORNECEDORES: compras@alfa.example.'}
  const profile=validateRadarCompanyProfile({summary:{value:'Soluções empresariais',evidenceId:'page-0',excerpt:'Fornecemos soluções para empresas.'},
    scaleSignals:[{value:'12 unidades',evidenceId:'page-0',excerpt:'Em 2026 contamos com 12 unidades.',metric:'units',amount:12,referenceDate:'2026-01-01',scope:'establishment'}]},[page])
  const qualify=vi.fn(async()=>({targetStatus:'review' as const,productFit:'unknown' as const,reasons:[],evidenceIds:[],limitations:[],profile}))
  let saved:Parameters<typeof runRadarResearchPipeline>[2]={readingComplete:true,pages:[page],discovery:{association:'confirmed',websiteUrl:page.url,hits:[],suggestions:[],limitations:[],queries:1}}
  const dependencies={web:vi.fn(),qualify,checkpoint:async(_stage:string,output:typeof saved)=>{saved={...output}}}
  const result=await runRadarResearchPipeline(identity,config,saved,dependencies)
  expect(result.sizeAssessment).toMatchObject({score:80,evidenceCoverage:100})
  expect(result.profile?.summary?.sourceUrl).toBe(page.url)
  expect(result.contacts.find(item=>item.kind==='email')).toMatchObject({purpose:'suppliers',preferred:true})
  await runRadarResearchPipeline(identity,config,saved,dependencies)
  expect(qualify).toHaveBeenCalledTimes(1);expect(dependencies.web).not.toHaveBeenCalled()
})
it('does not persist an unverifiable profile as a valid qualification',async()=>{
  const config=resolveRadarSearchConfiguration({research:{profileEnabled:true}})
  const result=await runRadarResearchPipeline(identity,config,{readingComplete:true,pages:[{url:'https://alfa.example',observedAt:'2026-10-12',text:'12.345.678/0001-90'}],
    discovery:{association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),qualify:async()=>({targetStatus:'confirmed',productFit:'high',limitations:[],reasons:[],evidenceIds:[],profile:{summary:{value:'Fake',evidenceId:'fake',excerpt:'invented text'}}} as never),checkpoint:async()=>{}})
  expect(result.qualification).toBeUndefined();expect(result.profile).toBeUndefined()
  expect(result.limitations.join(' ')).toContain('radar_profile_unverifiable')
})
it('lists financial PDFs as unread sources and never treats their link as a size measurement',async()=>{
  const config=resolveRadarSearchConfiguration({research:{sizeAssessment:{enabled:true,criteria:[{metric:'annualRevenue',weight:1,bands:[{min:0,points:0}]}]}}})
  const result=await runRadarResearchPipeline(identity,config,{readingComplete:true,pages:[{url:'https://alfa.example/',observedAt:'2026-10-12',
    text:'Empresa Alfa CNPJ 12.345.678/0001-90',html:'<a href="/relatorio-financeiro-2025.pdf">Balanço anual</a><a href="https://outra.example/balanco.pdf">Outro</a>'}],
    discovery:{association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{}})
  expect(result.documents).toEqual([{url:'https://alfa.example/relatorio-financeiro-2025.pdf',sourceUrl:'https://alfa.example/',observedAt:'2026-10-12',status:'not_read'}])
  expect(result.sizeAssessment).toMatchObject({score:null,evidenceCoverage:0})
})
it('keeps profile citation IDs aligned when a failed page precedes the useful evidence',async()=>{
  const config=resolveRadarSearchConfiguration({research:{profileEnabled:true}})
  const good={url:'https://alfa.example/empresa',observedAt:'2026-10-12',text:'12.345.678/0001-90. Soluções para empresas.'}
  const result=await runRadarResearchPipeline(identity,config,{readingComplete:true,
    pages:[{url:'https://alfa.example/',observedAt:'2026-10-12',text:'',limitation:'robots_disallow'},good],
    discovery:{association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),qualify:async pages=>({targetStatus:'review',productFit:'unknown',reasons:[],evidenceIds:[],limitations:[],
      profile:{summary:{value:'Soluções para empresas',evidenceId:'page-0',excerpt:pages[0].text}} as never}),checkpoint:async()=>{}})
  expect(result.profile?.summary?.sourceUrl).toBe(good.url)
})
