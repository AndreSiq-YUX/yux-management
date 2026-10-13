import {expect,it} from 'vitest'
import {buildRadarCrmLeadFacts} from '../src/modules/radar/crm-delivery.js'

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
