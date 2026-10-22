import {expect,it} from 'vitest'
import {consolidateRadarContacts,isUsefulRadarContact} from '../src/modules/radar/contact-consolidation.js'
import type {RadarContactEvidence} from '../src/modules/radar/contact-evidence.js'
const contact=(patch:Partial<RadarContactEvidence>={}):RadarContactEvidence=>({kind:'phone',value:'+551133334444',sourceUrl:'https://alfa.example/',observedAt:'2026-10-15',association:'confirmed',scope:'establishment',purpose:'general',...patch})
it('merges repeated channels while retaining their independent sources and immutable history',()=>{
  const old=[contact(),contact({sourceUrl:'https://alfa.example/contato/'}),contact({sourceUrl:'https://alfa.example/compras/'})]
  const value=consolidateRadarContacts(old,'suppliers')
  expect(value).toHaveLength(1)
  expect(value[0].sources?.map(item=>item.sourceUrl)).toEqual(['https://alfa.example/','https://alfa.example/contato/','https://alfa.example/compras/'])
  expect(old[0]).not.toHaveProperty('sources')
})
it('does not merge establishment, group or unresolved ownership',()=>{
  expect(consolidateRadarContacts([contact(),contact({scope:'group'}),contact({association:'review',scope:'unresolved'})],'general')).toHaveLength(3)
})
it('prioritizes a supplier form over recruitment, privacy and generic contact channels',()=>{
  const value=consolidateRadarContacts([contact({kind:'email',value:'dpo@alfa.example'}),contact({kind:'email',value:'vagas@alfa.example',purpose:'recruitment'}),contact(),contact({kind:'contact_form',value:'https://alfa.example/fornecedor/',purpose:'suppliers'})],'suppliers')
  expect(value[0]).toMatchObject({kind:'contact_form',preferred:true})
  expect(value.filter(item=>item.kind==='email').some(item=>item.preferred)).toBe(false)
  expect(isUsefulRadarContact(value.find(item=>item.value==='dpo@alfa.example')!,'suppliers')).toBe(false)
})
it('does not invent whatsapp availability from a telephone',()=>{
  expect(consolidateRadarContacts([contact()],'general').map(item=>item.kind)).toEqual(['phone'])
})
it('removes historical social posts from the channel list while retaining a published profile',()=>{
 const value=consolidateRadarContacts([contact({kind:'social',value:'https://instagram.com/p/ABC123/'}),contact({kind:'social',value:'https://instagram.com/alfa/'})],'general');
 expect(value.map(item=>item.value)).toEqual(['https://instagram.com/alfa/']);
});
