import {describe,it,expect} from 'vitest'
import {buildRadarCrmLeadFacts} from '../src/modules/radar/crm-delivery.js'
const api=await import('../src/modules/radar/commercial-view.js').catch(()=>({})) as Record<string,Function>
const project=(surface:string,value:unknown)=>api.projectRadarCommercialResponse?.(surface,value)
const internal={provider:'OpenRouter',model:'secret-model',sourceType:'brave_web_search',costUsd:2,futureInternalField:'private'}
it('does not hide a business solely from a legacy negative label without a canonical exclusion',()=>{
 expect(project('candidates',[{normalizedPayload:{targetStatus:'not_target',researchRevision:7}}])[0].facts.outsideProfile).toBe(false)
})
it('does not deliver unassociated publisher contacts as prospect channels when no company website is identified',()=>{
 const result=project('research',{run:{status:'partial',output:{discovery:{},siteAssociation:'review',contacts:[{kind:'email',value:'support@publisher.example',sourceUrl:'https://publisher.example/',association:'review',scope:'unresolved'}]}}});
 expect(result.facts.contacts).toEqual([]);
});
describe('Radar commercial data boundary',()=>{
 it('returns editable business targets and filters without nested gate, provider or budget metadata',()=>{
  const criteria={targets:[{key:'target',label:'Perfil comercial',definition:'Produção para empresas',priority:'primary',cnaes:['5620101'],...internal}],outOfScopeExamples:['Varejo'],registry:{mainActivityRule:'any',blockedMainCnaes:['20'],blockedNameTerms:[],...internal}};
  expect(project('campaigns',[{searchConfiguration:{qualification:criteria,research:{contactPurpose:'suppliers',...internal},batch:{minPassRatio:.75,...internal},funnel:internal}}])).toMatchObject([{criteria:{targets:[{key:'target',priority:'primary'}],contactPurpose:'suppliers',minPassRatio:.75}}]);
  expect(JSON.stringify(project('campaigns',[{searchConfiguration:{qualification:criteria}}]))).not.toMatch(/secret-model|provider|costUsd|futureInternalField/);
 })
 it('allows only commercial terminal counters and strips nested funnel implementation details',()=>{
  const counts={requested:3,admitted:3,completed:1,completedWithGaps:1,outsideProfile:1,technicalFailures:0,model:'internal',costUsd:2,gate:'g5'}
  expect(project('capture',{counts,funnelEvents:[internal],items:[internal]})).toEqual({counts:{requested:3,admitted:3,completed:1,completedWithGaps:1,outsideProfile:1,technicalFailures:0}})
 })
 it('retains the commercial criteria revision required to submit an entitled research request',()=>{
  expect(project('campaigns',[{configurationRevision:7,commercialCriteriaRevision:3,searchConfiguration:{}}])).toMatchObject([{configurationRevision:7,commercialCriteriaRevision:3}])
 })
 it('carries a strict commercial research outcome but rejects nested technical additions',()=>{
  const feedback={schemaVersion:1,status:'incomplete',updatedFields:['email'],unresolvedFields:[{field:'website',reason:'identity_unresolved'}],lastAttemptAt:'2026-10-19T10:00:00Z',nextAction:'continue'}
  expect(project('research',{run:{status:'partial',output:{}},commercialStatus:feedback})).toMatchObject({feedback})
  expect(project('research',{run:{status:'partial',output:{}},commercialStatus:{...feedback,provider:'Brave',costUsd:5}}).feedback).toBeUndefined()
 })
 it('exposes dated known facts through allowlists without technical metadata or foreign identity history',()=>{
  const previousResearch={belongsToCurrentIdentity:true,runId:'internal-run',configurationRevision:1,websiteUrl:'https://alfa.example/',siteCheckedAt:'2026-10-18',publicContacts:[{kind:'email',value:'compras@alfa.example',sourceUrl:'https://alfa.example/',observedAt:'2026-10-18',association:'confirmed',scope:'group',...internal}],...internal}
  const result=project('candidates',[{normalizedPayload:{previousResearch,researchRefreshIncomplete:true,...internal}}])
  expect(result).toMatchObject([{facts:{refreshIncomplete:true,previousResearch:{websiteUrl:'https://alfa.example/',observedAt:'2026-10-18',contacts:[{value:'compras@alfa.example',scope:'group'}]}}}])
  expect(JSON.stringify(result)).not.toMatch(/internal-run|OpenRouter|costUsd|secret-model|futureInternalField/)
  expect(project('candidates',[{normalizedPayload:{previousResearch:{...previousResearch,belongsToCurrentIdentity:false}}}])[0].facts.previousResearch).toBeUndefined()
 })
 it('preserves sourced company claims rather than treating its name or domain as a tool',()=>{
  expect(project('candidates',[{title:'Brave Transportes',normalizedPayload:{tradeName:'Brave Transportes',websiteUrl:'https://brave.com.br/',publicContacts:[{kind:'email',value:'compras@brave.com.br',sourceUrl:'https://brave.com.br/',association:'confirmed'}],companyProfile:{summary:{value:'Brave Transportes atende fabricantes',sourceUrl:'https://brave.com.br/'},services:[{value:'Transporte de cargas',sourceUrl:'https://brave.com.br/'}]}}}])).toMatchObject([{facts:{contacts:[{value:'compras@brave.com.br'}],profile:{summary:{value:'Brave Transportes atende fabricantes',sourceUrl:'https://brave.com.br/'}}}}])
 })
 it('preserves company-specific claims in full research using the authorized identity context',()=>{
  expect(project('research',{companyIdentity:{tradeName:'Brave Transportes'},configurationRevision:1,run:{status:'succeeded',output:{profile:{summary:{value:'Brave Transportes atende fabricantes',sourceUrl:'https://brave.com.br/'}}}}})).toMatchObject({facts:{profile:{summary:{value:'Brave Transportes atende fabricantes'}}}})
 })
 it('does not replace a saved site status when no research website exists',()=>{
  expect(project('research',{configurationRevision:1,run:null})).toMatchObject({facts:{websiteStatus:undefined}})
 })
 it('does not expose provider source codes inside legacy narratives',()=>{
  expect(project('candidates',[{normalizedPayload:{triageReasons:['brave_web_search indisponível','serper_search aguardando','cnpja_advanced_search pendente','Atende indústrias']}}])).toMatchObject([{facts:{reasons:['Atende indústrias']}}])
 })
 it('hides new research mechanisms while preserving legitimate identity and reversible exclusions',()=>{
  expect(project('candidates',[{normalizedPayload:{triageReasons:['Perplexity indisponível','Atende indústrias'],targetStatus:'not_target',researchRevision:7,decisionExclusion:{active:true,revision:7}}}])).toMatchObject([{facts:{reasons:['Atende indústrias'],outsideProfile:true,outsideProfileRevision:7}}])
  expect(api.radarCommercialUrl?.('https://api.perplexity.ai/search')).toBeUndefined()
  expect(project('candidates',[{title:'Perplexity Comércio',normalizedPayload:{tradeName:'Perplexity Comércio',companyProfile:{summary:{value:'Perplexity Comércio atende indústrias',sourceUrl:'https://comercio.example/'}}}}])).toMatchObject([{facts:{profile:{summary:{value:'Perplexity Comércio atende indústrias'}}}}])
 })
 it.each([['yux_admin',true],['yux_operator',false],['client_admin',false],['client_member',false]])('only system admin sees internals: %s',(role,want)=>{
  expect(api.canViewRadarInternals?.({role})).toBe(want)
 })
 it('commercial metrics contain no internal consumption',()=>{
  expect(project('researchMetrics',{companies:7,identified:6,withUsefulContact:5,readyForReview:4,searchEstimatedBrl:1.25,sources:[internal],...internal})).toEqual({companies:7,identified:6,withUsefulContact:5,readyForReview:4})
 })
 it('projects commercial campaign criteria without the technical configuration',()=>{
  const result=project('campaigns',[{id:'campaign',name:'Campanha',targetStates:['SP'],targetCnaes:['5620101'],budgetLimit:100,dailyLimit:150,
   searchConfiguration:{cities:[{city:'São Paulo',state:'SP'}],qualification:{includeAnyTerms:['cozinhas'],productTerms:['massas']},sources:internal,research:internal,batch:{maxQueriesPerBatch:100}},...internal}])
  expect(result).toMatchObject([{id:'campaign',name:'Campanha',criteria:{cities:[{city:'São Paulo',state:'SP'}],includeAnyTerms:['cozinhas'],productTerms:['massas']}}])
  expect(JSON.stringify(result)).not.toMatch(/OpenRouter|brave_web|costUsd|budgetLimit|dailyLimit|sources|batch|secret-model/)
 })
 it('keeps company identity while dropping arbitrary metadata recursively',()=>{
  const result=project('candidates',[{id:'c',title:'Brave Transportes',status:'pending_review',sourceType:'cnpja_advanced_search',rawPayload:internal,
   normalizedPayload:{cnpj:'1128426000198',legalName:'Brave Transportes LTDA',city:'Poá',state:'SP',websiteUrl:'https://empresa.example/',websiteStatus:'unverified',
    publicContacts:[{kind:'email',value:'compras@empresa.example',sourceUrl:'https://empresa.example/contato',association:'review',observedAt:'2026-10-15',...internal}],...internal}}])
  expect(result).toMatchObject([{id:'c',title:'Brave Transportes',facts:{cnpj:'1128426000198',city:'Poá',contacts:[{value:'compras@empresa.example',association:'review'}]}}])
  expect(JSON.stringify(result)).not.toMatch(/OpenRouter|cnpja_|brave_web|rawPayload|normalizedPayload|costUsd|futureInternalField/)
 })
 it('uses business facts rather than raw errors, pages or model diagnostics in research',()=>{
  const result=project('research',{configurationRevision:1,availability:internal,tlsDiagnostics:[internal],run:{id:'r',status:'blocked',error_code:'brave_provider_error',output:{
   discovery:{websiteUrl:'https://empresa.example/',hits:[internal]},siteAssociation:'review',pages:[{text:'OpenRouter technical detail',...internal}],contacts:[],limitations:['Brave indisponível'],
   qualification:{targetStatus:'confirmed',productFit:'high',reasons:['Atende indústrias'],model:'secret-model'},profile:{summary:{value:'Alimentação empresarial',sourceUrl:'https://empresa.example',...internal},services:[],customerSegments:[],operatingRegions:[]}}}})
  expect(result).toMatchObject({status:'blocked',pendingMessage:'Pesquisa aguardando a equipe responsável',facts:{websiteUrl:'https://empresa.example/'},assessment:{targetStatus:'confirmed',productFit:'high'}})
  expect(JSON.stringify(result)).not.toMatch(/OpenRouter|Brave|brave_|model|pages|availability|tls|error_code/)
 })
 it('keeps capture counts but hides receipts, raw blockers and discovery internals',()=>{
  expect(project('capture',{operation:{id:'op',campaignId:'campaign',status:'blocked',configurationRevision:1,counts:{requested:7,admitted:7,completed:5,insufficient:1,blocked:1,researching:0},queries:12,blockers:['brave_provider_inactive'],items:[internal],configurationSnapshot:internal}})).toEqual({operation:{id:'op',campaignId:'campaign',status:'blocked',configurationRevision:1,counts:{requested:7,admitted:7,completed:5,insufficient:1,blocked:1,researching:0},pendingMessage:'Pesquisa aguardando a equipe responsável'}})
 })
 it('normalizes commercial feedback dates and revision without exposing its author or request receipt',()=>{
  expect(project('feedback',[{id:'feedback',kind:'identity_confirmed',configuration_revision:2,created_at:'2026-10-15',created_by:'private-user',request_id:'private-receipt',note:'Empresa conferida'}])).toEqual([{id:'feedback',kind:'identity_confirmed',configurationRevision:2,createdAt:'2026-10-15',note:'Empresa conferida'}])
 })
 it('translates a history operation to a business activity without returning its internal value',()=>{
  expect(project('researchHistory',[{id:'r',operation:'reanalyze',provider:'OpenRouter',status:'partial'}])).toEqual([{id:'r',status:'partial',actionLabel:'Reavaliação dos dados salvos'}])
 })
 it('carries authorized commercial CRM action without leaking the internal policy object',()=>{
  const result=project('opportunities',[{id:'offer',status:'approved',latestMessageSuggestion:{status:'approved',body:'Proposta',policyDecision:{canSendAutomatically:false,canConvertToLead:true,provider:'OpenRouter'}}}])
  expect(result).toMatchObject([{id:'offer',canConvertToLead:true}]);expect(JSON.stringify(result)).not.toMatch(/policyDecision|OpenRouter|canSendAutomatically/)
 })
 it('preserves commercial registry phone and public document evidence in the company dossier',()=>{
  const result=project('research',{run:{status:'partial',output:{registryPhone:'1146347070',discovery:{},contacts:[],documents:[{url:'https://empresa.example/balanco.pdf',sourceUrl:'https://empresa.example/relatorios',model:'OpenRouter'}]}}})
  expect(result).toMatchObject({facts:{registryPhone:'1146347070',documents:[{url:'https://empresa.example/balanco.pdf',sourceUrl:'https://empresa.example/relatorios'}]}})
  expect(JSON.stringify(result)).not.toContain('OpenRouter')
 })
 it.each(['research','capture'])('supports empty %s without fabricating facts',surface=>{
  expect(project(surface,null)).toBeNull()
 })
 it('omits legacy operational notes from profile and activity without losing sourced commercial text',()=>{
  const result=project('candidates',[{title:'Alfa',normalizedPayload:{companyProfile:{summary:{value:'Alimentação B2B',sourceUrl:'https://alfa.example',model:'OpenRouter'},limitations:['Serper'],services:[]},
   activityAssessment:{status:'public_signals',limitation:'Brave failed',signals:[{excerpt:'Notícia recente',sourceUrl:'https://alfa.example',provider:'Brave'}]},triageReasons:['radar_serper_error','Atende o público definido']}}])
  expect(JSON.stringify(result)).toContain('Alimentação B2B');expect(JSON.stringify(result)).toContain('Notícia recente')
  expect(JSON.stringify(result)).not.toMatch(/OpenRouter|Serper|Brave|radar_serper|limitations|provider|model/)
 })
 it('denies unknown and diagnostic routes but gives known business routes explicit schemas',()=>{
  expect(api.radarCommercialSurface?.('GET','/api/radar/data-sources')).toBeNull()
  expect(api.radarCommercialSurface?.('GET','/api/radar/campaigns/:id/research-availability')).toBeNull()
  expect(api.radarCommercialSurface?.('GET','/api/radar/future-internal-route')).toBeNull()
  expect(api.radarCommercialSurface?.('GET','/api/radar/campaigns/:id/candidates')).toBe('candidates')
  expect(api.radarCommercialSurface?.('GET','/api/radar/candidates/:id/research')).toBe('research')
  expect(api.radarCommercialSurface?.('POST','/api/radar/opportunities/:id/run-analysis')).toBe('import')
 })
 it('does not transfer provider/model/TLS diagnostics in new CRM customer-visible data',()=>{
  const facts=buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:{cnpj:'1128426000198',targetStatus:'confirmed',productFit:'high',
   triageReasons:['radar_brave_error','Atende o público definido'],companyProfile:{summary:{value:'Alimentação B2B',sourceUrl:'https://alfa.example',...internal},services:[]},
   researchTlsExceptions:[{grantId:'private-grant',fingerprint256:'private-fingerprint',provider:'Brave'}]}},'Massas')
  expect(JSON.stringify(facts)).not.toMatch(/OpenRouter|Brave|brave_|private-grant|private-fingerprint|costUsd|futureInternalField/)
  expect(facts.notes).toContain('Alimentação B2B');expect(facts.notes).toContain('Atende o público definido')
 })
})
