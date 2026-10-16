import {expect,it} from 'vitest'
import {buildRadarCrmLeadFacts} from '../src/modules/radar/crm-delivery.js'

it('schema-projects every delivered attribution field including malformed legacy scalars',()=>{
 const facts=buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:{websiteUrl:'https://alfa.example/?api_key=private',phoneRaw:{provider:'OpenRouter',costUsd:2},targetStatus:{provider:'Brave'},productFit:{model:'private-model'},researchRevision:{model:'private-model'}}},'Oferta')
 expect(facts.attribution.websiteUrl).toBeUndefined();expect(facts.attribution.registryPhone).toBeUndefined()
 expect(facts.attribution.targetStatus).toBeUndefined();expect(facts.attribution.productFit).toBeUndefined();expect(facts.attribution.collectionRevision).toBeUndefined()
 expect(JSON.stringify(facts)).not.toMatch(/api_key|private-model|OpenRouter|costUsd|provider/)
 const valid=buildRadarCrmLeadFacts({title:'Alfa',normalizedPayload:{websiteUrl:'https://alfa.example/',phoneRaw:'1133334444',targetStatus:'confirmed',productFit:'high',researchRevision:3}},'Oferta')
 expect(valid.attribution).toMatchObject({websiteUrl:'https://alfa.example/',registryPhone:'1133334444',targetStatus:'confirmed',productFit:'high',collectionRevision:3})
})

it('carries commercial fit, reasons and sourced activity into readable CRM notes and attribution',()=>{
  const activity={status:'public_signals',limitation:'Sinais não comprovam atendimento.',signals:[{sourceUrl:'https://alfa.example/',excerpt:'Notícia recente',observedAt:'2026-10-13'}]}
  const facts=buildRadarCrmLeadFacts({title:'Empresa Alfa',normalizedPayload:{targetStatus:'confirmed',productFit:'high',triageReasons:['Atende o público definido'],activityAssessment:activity}},'Soluções empresariais')
  expect(facts.attribution).toMatchObject({targetStatus:'confirmed',productFit:'high',triageReasons:['Atende o público definido'],activity})
  expect(facts.notes).toContain('Atende o público definido');expect(facts.notes).toContain('Boa aderência');expect(facts.notes).toContain('Notícia recente')
})

it('transfers only corroborated contacts and leaves missing email empty rather than inventing one',()=>{
  const facts=buildRadarCrmLeadFacts({title:'Empresa',normalizedPayload:{cnpj:'12345678000190',phoneRaw:'registro antigo',publicContacts:[
    {kind:'email',value:'errado@example.com',association:'review'},
    {kind:'phone',value:'+5541999998888',association:'confirmed',sourceUrl:'https://empresa.example/contato',observedAt:'2026-10-13'},
  ]}},'Oferta da campanha')
  expect(facts.email).toBe('')
  expect(facts.phone).toBe('+5541999998888')
  expect(facts.attribution.recommendedOffer).toBe('Oferta da campanha')
  expect(facts.attribution.contacts).toHaveLength(1)
})

it('keeps certificate authorization diagnostics out of the delivered customer CRM record',()=>{
  const provenance=[{grantId:'grant',hostname:'empresa.example',fingerprint256:'AA',observedAt:'2026-10-14',sourceUrl:'https://empresa.example/'}]
  const facts=buildRadarCrmLeadFacts({title:'Empresa',normalizedPayload:{researchTlsExceptions:provenance}},'Oferta')
  expect(facts.attribution).not.toHaveProperty('tlsExceptions')
  expect(facts.notes).not.toContain('certificado vencido')
})
