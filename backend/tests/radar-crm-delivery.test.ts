import {expect,it} from 'vitest'
import {buildRadarCrmLeadFacts} from '../src/modules/radar/crm-delivery.js'

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
