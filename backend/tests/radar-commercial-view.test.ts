import {describe,it,expect} from 'vitest'
import {buildRadarCrmLeadFacts} from '../src/modules/radar/crm-delivery.js'
const api=await import('../src/modules/radar/commercial-view.js').catch(()=>({})) as Record<string,Function>
const project=(surface:string,value:unknown)=>api.projectRadarCommercialResponse?.(surface,value)
const internal={provider:'OpenRouter',model:'secret-model',sourceType:'brave_web_search',costUsd:2,futureInternalField:'private'}
describe('Radar commercial data boundary',()=>{
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
 })
 it('does not transfer provider/model/TLS diagnostics in new CRM customer-visible data',()=>{
  const facts=buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:{cnpj:'1128426000198',targetStatus:'confirmed',productFit:'high',
   triageReasons:['radar_brave_error','Atende o público definido'],companyProfile:{summary:{value:'Alimentação B2B',sourceUrl:'https://alfa.example',...internal},services:[]},
   researchTlsExceptions:[{grantId:'private-grant',fingerprint256:'private-fingerprint',provider:'Brave'}]}},'Massas')
  expect(JSON.stringify(facts)).not.toMatch(/OpenRouter|Brave|brave_|private-grant|private-fingerprint|costUsd|futureInternalField/)
  expect(facts.notes).toContain('Alimentação B2B');expect(facts.notes).toContain('Atende o público definido')
 })
})
