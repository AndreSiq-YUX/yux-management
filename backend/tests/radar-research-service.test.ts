import { expect, it, vi } from 'vitest'
import { runRadarResearchPipeline } from '../src/modules/radar/research-service.js'
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js'
import { validateRadarCompanyProfile } from '../src/modules/radar/company-profile.js'
const identity = { name: 'Empresa Alfa', cnpj: '12345678000190', city:'Curitiba',state:'PR',phone:'4133334444' }
const configuration = resolveRadarSearchConfiguration({ research: { enabled:true, webSearchEnabled:true } })
it('invalidates direct identity when a legacy reader refresh contradicts the old CNPJ',async()=>{
  const url='https://alfa.example/',old={url,text:'Empresa Alfa CNPJ 12.345.678/0001-90',observedAt:'2026-09-01'}
  const result=await runRadarResearchPipeline(identity,configuration,{readerVersion:3,readingComplete:true,discoveryLocked:true,pages:[old],
    discovery:{websiteUrl:url,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{},collect:async()=>[
      {url,text:'Empresa Beta CNPJ 99.999.999/0001-99',observedAt:'2026-10-14'},
      {url:url+'contato/',text:'Empresa Beta vendas@beta.example',observedAt:'2026-10-14'}]})
  expect(result.siteAssociation).toBe('review')
  expect(result.contacts.filter(contact=>contact.association==='confirmed')).toEqual([])
})
it('invalidates model identity when refreshed pages no longer contain its supporting claims',async()=>{
  const url='https://brand.example/',old={url,text:'Marca Beta. Empresa Alfa é nossa razão social.',observedAt:'2026-09-01'}
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{presenceResolutionEnabled:true}}),
    {readerVersion:3,readingComplete:true,discoveryLocked:true,pages:[old],discovery:{websiteUrl:url,association:'review',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{},resolvePresence:async()=>({candidateId:'page-0',scope:'establishment',reason:'A página informa a razão social.',claims:[{evidenceId:'page-0',excerpt:'Empresa Alfa é nossa razão social.'}]}),
      collect:async()=>[{url,text:'Outra marca. vendas@outra.example',observedAt:'2026-10-14'}]})
  expect(result.siteAssociation).toBe('review')
  expect(result.presenceResolution?.websiteUrl).toBeUndefined()
  expect(result.contacts.some(contact=>contact.association==='confirmed')).toBe(false)
})
it('preserves prior text and link-only channels as history when a reader upgrade fails',async()=>{
  const url='https://alfa.example/',old={url,text:'Empresa Alfa CNPJ 12.345.678/0001-90',observedAt:'2026-09-01'}
  const result=await runRadarResearchPipeline(identity,configuration,{readerVersion:3,readingComplete:true,discoveryLocked:true,pages:[old],
    contacts:[{kind:'email',value:'compras@alfa.example',association:'confirmed',sourceUrl:url,observedAt:old.observedAt}],
    discovery:{websiteUrl:url,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{},collect:async()=>[{url,text:'',observedAt:'2026-10-14',limitation:'timeout'}]})
  expect(result.siteAssociation).toBe('review')
  expect(result.contacts.filter(contact=>contact.association==='confirmed')).toEqual([])
  expect(result).toMatchObject({historicalEvidence:{pages:[expect.objectContaining({text:old.text,observedAt:old.observedAt})],
    contacts:[expect.objectContaining({value:'compras@alfa.example',observedAt:old.observedAt})]}})
})
it('deduplicates legacy URLs before reserving official-site reading capacity',async()=>{
  const url='https://alfa.example/',old={url,text:'Empresa Alfa CNPJ 12.345.678/0001-90',observedAt:'2026-09-01'}
  const association={url:'https://association.example/',text:'Associação setorial.',observedAt:'2026-09-01'}
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{maxPagesPerCandidate:4}}),
    {readerVersion:3,readingComplete:true,discoveryLocked:true,pages:[association,association,association,old],
      discovery:{websiteUrl:url,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{},collect:async(_url,policy)=>[old,...(policy.maxPagesPerCandidate>1?
      [{url:url+'fornecedor/',text:'Seja fornecedor. compras@alfa.example',observedAt:'2026-10-14'}]:[])]})
  expect(result.contacts).toContainEqual(expect.objectContaining({value:'compras@alfa.example',association:'confirmed'}))
  expect(result.pages.filter(page=>page.url===association.url)).toHaveLength(1)
})
it('recovers newly supported contact facts on resume of an older text-only reader without repeating searches',async()=>{
  const official={url:'https://alfa.example/',text:'Empresa Alfa CNPJ 12.345.678/0001-90. Fornecedores.',observedAt:'2026-10-14'}
  const result=await runRadarResearchPipeline(identity,configuration,{readerVersion:3,readingComplete:true,discoveryLocked:true,pages:[official],
    discovery:{websiteUrl:official.url,association:'confirmed',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:async()=>{throw Error('completed_search_must_not_repeat')},checkpoint:async()=>{},collect:async()=>[
      {...official,html:'<a href="/fornecedor/">Fornecedores</a>'},
      {url:'https://alfa.example/fornecedor/',text:'Seja nosso fornecedor.',observedAt:'2026-10-14',html:'<form><textarea name="mensagem"></textarea></form>'}]})
  expect(result.contacts).toContainEqual(expect.objectContaining({kind:'contact_form',purpose:'suppliers',association:'confirmed'}))
})
it('does not deepen a name-mentioning association before the identity model selects a domain',async()=>{
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{presenceResolutionEnabled:true,maxPagesPerCandidate:4}}),
    {discoveryLocked:true,discovery:{websiteUrl:'https://association.example/',association:'review',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{},resolvePresence:async()=>({scope:'unresolved',reason:'Associação não é o site da empresa.',claims:[]}),
      collect:async(_url,policy)=>Array.from({length:policy.maxPagesPerCandidate},(_,index)=>({url:`https://association.example/${index||''}`,
        text:'Associação setorial. Empresa Alfa consta como associada.',observedAt:'2026-10-14'}))})
  expect(result.pages).toHaveLength(1)
  expect(result.siteAssociation).toBe('review')
})
it.each([false,true])('isolates association-owned channels after official identity resolves (saved=%s)',async saved=>{
  const association={url:'https://association.example/',text:'Associação setorial. Empresa Alfa está entre as associadas. secretaria@association.example',observedAt:'2026-10-14',
    html:'<a href="https://facebook.com/association">Facebook</a>'}
  const official={url:'https://alfa.example/',text:'Empresa Alfa CNPJ 12.345.678/0001-90. compras@alfa.example',observedAt:'2026-10-14',
    html:'<a href="https://facebook.com/alfa">Facebook</a>'}
  const config=resolveRadarSearchConfiguration({research:{inspectLinkedSocialProfiles:true,maxPagesPerCandidate:6}})
  const result=await runRadarResearchPipeline(identity,config,{readingComplete:true,discoveryLocked:true,
    pages:saved?[{...association,html:undefined},{...official,html:undefined}]:[association,official],
    contacts:saved?[{kind:'email',value:'secretaria@association.example',sourceUrl:association.url,association:'review',observedAt:association.observedAt}]:[],
    discovery:{websiteUrl:official.url,association:'review',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),checkpoint:async()=>{},collectSocial:async input=>{
      expect(input.linkedPages.map(page=>page.url)).toEqual([official.url])
      return[]
    }})
  expect(result.contacts.some(contact=>contact.sourceUrl.includes('association.example'))).toBe(false)
  expect(result.contacts).toContainEqual(expect.objectContaining({value:'compras@alfa.example',association:'confirmed'}))
  expect(result.pages.some(page=>page.url===association.url)).toBe(true)
})
it('retains public channels as pending when site identity still needs configuration',async()=>{
  const page={url:'https://alfa.example/',observedAt:'2026-10-14',text:'Marca Alfa. Contatos corporativos.',html:'<a href="mailto:contato@alfa.example">Contato</a><a href="https://facebook.com/alfa">Facebook</a>'}
  const result=await runRadarResearchPipeline(identity,configuration,{readingComplete:true,discoveryLocked:true,pages:[page],discovery:{association:'review',websiteUrl:page.url,hits:[],suggestions:[],limitations:[],queries:1}},{web:vi.fn(),checkpoint:async()=>{}})
  expect(result.contacts).toContainEqual(expect.objectContaining({kind:'email',value:'contato@alfa.example',association:'review'}))
  expect(result.contacts).toContainEqual(expect.objectContaining({kind:'social',value:'https://facebook.com/alfa',association:'review'}))
})
it('reads only opted-in linked profiles and retains source-linked public contacts',async()=>{
  const page={url:'https://alfa.example/',observedAt:'2026-10-14',text:'Empresa Alfa CNPJ 12.345.678/0001-90',html:'<a href="https://facebook.com/alfa">Facebook</a>'}
  const collectSocial=vi.fn(async()=>[{url:'https://facebook.com/alfa',linkedFromUrl:page.url,text:'Alfa - contato@alfa.example',observedAt:'2026-10-14'}])
  const config=resolveRadarSearchConfiguration({research:{enabled:true,inspectLinkedSocialProfiles:true,maxPagesPerCandidate:6}})
  const result=await runRadarResearchPipeline(identity,config,{readingComplete:true,discoveryLocked:true,pages:[page],discovery:{association:'confirmed',websiteUrl:page.url,hits:[],suggestions:[],limitations:[],queries:1}},{web:vi.fn(),collectSocial,checkpoint:async()=>{}} as never)
  expect(result.contacts).toContainEqual(expect.objectContaining({kind:'email',value:'contato@alfa.example',sourceUrl:'https://facebook.com/alfa',linkedFromUrl:page.url,association:'confirmed'}))
})
it('does not blame model configuration or invoke AI when institutional pages cannot be read',async()=>{
  const config=resolveRadarSearchConfiguration({research:{enabled:true,presenceResolutionEnabled:true,semanticQualificationEnabled:true,profileEnabled:true}})
  const url='https://alfa.example/',failed={url,text:'',observedAt:'2026-10-14',limitation:'robots_tls_expired',diagnostic:{stage:'robots',kind:'tls_expired',code:'CERT_HAS_EXPIRED'}}
  const resolvePresence=vi.fn(),qualify=vi.fn()
  const result=await runRadarResearchPipeline(identity,config,{discoveryLocked:true,pages:[failed] as never,discovery:{association:'review',websiteUrl:url,hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),collect:async()=>[failed] as never,resolvePresence,qualify,checkpoint:async()=>{}})
  expect(resolvePresence).not.toHaveBeenCalled();expect(qualify).not.toHaveBeenCalled()
  expect(result.limitations).toContain('radar_presence_waiting_public_read')
  expect(result.limitations).toContain('radar_qualification_waiting_public_read')
  expect(result.limitations).toContain('radar_profile_waiting_public_read')
  expect(result.limitations.join(' ')).not.toMatch(/configure|rota explícita|modelo autorizado/i)
  expect(result.pages[0].diagnostic).toMatchObject({kind:'tls_expired'})
})
it('distinguishes an actual absent route after readable evidence from pending identity',async()=>{
  const config=resolveRadarSearchConfiguration({research:{enabled:true,presenceResolutionEnabled:true,profileEnabled:true}})
  const page={url:'https://alfa.example/',text:'Marca Alfa. Soluções para empresas e contatos corporativos.',observedAt:'2026-10-14'}
  const result=await runRadarResearchPipeline(identity,config,{readingComplete:true,discoveryLocked:true,pages:[page],discovery:{association:'review',websiteUrl:page.url,hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),resolvePresence:async()=>{throw Error('radar_presence_explicit_route_required')},checkpoint:async()=>{}})
  expect(result.limitations.join(' ')).toContain('radar_presence_explicit_route_required')
  expect(result.limitations).toContain('radar_qualification_waiting_identity')
  expect(result.limitations).toContain('radar_profile_waiting_identity')
})
it('does not let a conflicting homonym consume all reading capacity before the official candidate',async()=>{
  const web=vi.fn(async()=>[
    {url:'https://homonym.example/',title:'Empresa Alfa',snippets:['Empresa Alfa'],observedAt:'2026-10-13'},
    {url:'https://official.example/',title:'Marca Alfa',snippets:['Empresa Alfa'],observedAt:'2026-10-13'}])
  const collect=vi.fn(async(url:string,policy:{maxPagesPerCandidate:number})=>url.includes('homonym')?
    Array.from({length:policy.maxPagesPerCandidate},(_,index)=>({url:`https://homonym.example/${index||''}`,text:'Empresa Alfa CNPJ 99.999.999/0001-99 em Salvador/BA. contato@homonym.example',observedAt:'2026-10-13'})):
    [{url:'https://official.example/',text:'Empresa Alfa CNPJ 12.345.678/0001-90. Curitiba/PR. compras@official.example',observedAt:'2026-10-13'}])
  const result=await runRadarResearchPipeline(identity,configuration,{}, {web,collect,checkpoint:async()=>{}})
  expect(collect.mock.calls.some(([url])=>url.includes('official'))).toBe(true)
  expect(result.discovery.websiteUrl).toBe('https://official.example/')
  expect(result.contacts.every(contact=>contact.sourceUrl.includes('official'))).toBe(true)
})
it('reserves depth for the evidence-selected brand when a name-only homonym appears first',async()=>{
  const web=vi.fn(async()=>[
    {url:'https://homonym.example/',title:'Empresa Alfa',snippets:['Empresa Alfa'],observedAt:'2026-10-13'},
    {url:'https://brand.example/',title:'Marca Beta — Empresa Alfa',snippets:['Marca institucional'],observedAt:'2026-10-13'}])
  const collect=vi.fn(async(url:string,policy:{maxPagesPerCandidate:number})=>url.includes('homonym')?
    Array.from({length:policy.maxPagesPerCandidate},(_,index)=>({url:`https://homonym.example/${index||''}`,text:'Empresa Alfa. Outra empresa de serviços.',observedAt:'2026-10-13'})):
    [{url:'https://brand.example/',text:'Marca Beta. Atendimento corporativo.',observedAt:'2026-10-13'},
      ...(policy.maxPagesPerCandidate>1?[{url:'https://brand.example/contato',text:'Fornecedores compras@brand.example.',observedAt:'2026-10-13'}]:[])])
  const resolvePresence=vi.fn(async(evidence:Array<{id:string;url:string;text:string}>)=>{
    const page=evidence.find(item=>item.url==='https://brand.example/'&&item.id.startsWith('page-'))!
    return{candidateId:page.id,scope:'group',reason:'Marca associada à razão social pelos resultados e página institucional.',claims:[{evidenceId:page.id,excerpt:page.text}]}
  })
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{enabled:true,webSearchEnabled:true,presenceResolutionEnabled:true}}),{},
    {web,collect,resolvePresence,checkpoint:async()=>{}})
  expect(result.contacts).toContainEqual(expect.objectContaining({value:'compras@brand.example',association:'confirmed',scope:'group'}))
  expect(resolvePresence.mock.calls[0][0].some(item=>item.id.startsWith('search-')&&item.text.includes('Empresa Alfa'))).toBe(true)
  expect(result.pages.length).toBeLessThanOrEqual(4)
})
it('can recover navigation after a missing-route result persisted pages without HTML',async()=>{
  const first={url:'https://homonym.example/',text:'Empresa Alfa. Serviços.',observedAt:'2026-09-01'}
  const official={url:'https://brand.example/',text:'Marca Beta. Soluções empresariais.',observedAt:'2026-09-01'}
  const collect=vi.fn(async(_url:string,_policy:unknown,options:{initialPages?:Array<{url:string}>}={})=>{
    expect(options.initialPages?.some(page=>page.url===official.url)).toBe(false)
    return[{...official,observedAt:'2026-10-13',html:'<a href="/contato">Contato</a>'},{url:'https://brand.example/contato',text:'Fornecedores compras@brand.example.',observedAt:'2026-10-13'}]
  })
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{presenceResolutionEnabled:true}}),{
    readingComplete:true,discoveryLocked:true,pages:[first,official],discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:3}},
    {web:vi.fn(),collect:collect as never,resolvePresence:async()=>({candidateId:'page-1',scope:'group',reason:'A marca é associada ao grupo pelas evidências.',claims:[{evidenceId:'page-1',excerpt:official.text}]}),checkpoint:async()=>{}})
  expect(result.contacts).toContainEqual(expect.objectContaining({value:'compras@brand.example',scope:'group'}))
})
it('a stale search snippet cannot restore contacts contradicted by the subsequently read page',async()=>{
  const url='https://alfa.example/',old={url,title:'Empresa Alfa',snippets:['CNPJ 12.345.678/0001-90. Telefone 41 3333-4444'],observedAt:'2026-09-01'}
  const result=await runRadarResearchPipeline(identity,configuration,{analysisOnly:true,readingComplete:true,discoveryLocked:true,
    discovery:{association:'confirmed',websiteUrl:url,hits:[old],suggestions:[],limitations:[],queries:1},
    pages:[{url,text:'Empresa Beta CNPJ 99.999.999/0001-99 em Salvador/BA.',observedAt:'2026-10-13'}]},
    {web:vi.fn(),checkpoint:async()=>{}})
  expect(result.siteAssociation).toBe('review');expect(result.contacts).toEqual([])
})
it('keeps proven sibling-CNPJ group channels as group contacts rather than discarding their association',async()=>{
  const page={url:'https://brand.example/',text:'Grupo Alfa CNPJ 12.345.678/0002-71. Marca Beta. compras@brand.example',observedAt:'2026-10-13'}
  const result=await runRadarResearchPipeline(identity,resolveRadarSearchConfiguration({research:{presenceResolutionEnabled:true}}),{
    readingComplete:true,pages:[page],discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:1}},
    {web:vi.fn(),resolvePresence:async()=>({candidateId:'page-0',scope:'group',reason:'O CNPJ identifica a matriz do mesmo grupo.',claims:[{evidenceId:'page-0',excerpt:'Grupo Alfa CNPJ 12.345.678/0002-71.'}]}),checkpoint:async()=>{}})
  expect(result.contacts[0]).toMatchObject({value:'compras@brand.example',association:'confirmed',scope:'group'})
})
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
