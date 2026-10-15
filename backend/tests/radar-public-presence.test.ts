import {expect,it} from 'vitest'
import {projectRadarPublicPresence,radarPublicPresenceFromDossier} from '../src/modules/radar/public-presence.js'
const dossier={discovery:{association:'review' as const,websiteUrl:'https://alfa.example/',hits:[],suggestions:[],limitations:[],queries:1},pages:[{url:'https://alfa.example/',text:'Alfa contato',observedAt:'2026-10-14'}],contacts:[],siteAssociation:'review' as const}
it('tolerates malformed historical contact values and provenance without breaking the dossier',()=>{
  const contact={kind:'email',value:'compras@alfa.example',sourceUrl:'https://alfa.example/',observedAt:'2026-10-15',association:'confirmed',sources:[null,{sourceUrl:'https://alfa.example/contato',observedAt:'2026-10-15'}]}
  const result=radarPublicPresenceFromDossier({...dossier,siteAssociation:'confirmed',contacts:[contact,{...contact,value:undefined}]},1)
  expect(result?.contacts).toHaveLength(1)
  expect(result?.contacts[0].sources?.every(source=>!!source)).toBe(true)
})
it('does not revive an unknown publisher identity from historical CNPJ-only confirmation',()=>{
  const url='https://publisher.example/pagina',page={url,text:'Empresa Alfa CNPJ 12.345.678/0001-90',observedAt:'2026-10-15'}
  const result=radarPublicPresenceFromDossier({...dossier,siteAssociation:'confirmed',discovery:{...dossier.discovery,websiteUrl:url},pages:[page],contacts:[{kind:'email',value:'editor@publisher.example',sourceUrl:url,association:'confirmed',observedAt:page.observedAt}]},1,{name:'Empresa Alfa',cnpj:'12345678000190'})
  expect(result?.website?.association).toBe('review')
  expect(result?.contacts.every(contact=>contact.association==='review')).toBe(true)
})
it('retains government and directory evidence separately, not as the company website',()=>{
  const url='https://compras.example.gov.br/ata/empresa'
  const result=projectRadarPublicPresence({configurationRevision:6,...dossier,discovery:{...dossier.discovery,websiteUrl:url},siteAssociation:'confirmed',pages:[{url,text:'Alfa CNPJ 12345678000190',observedAt:'2026-10-15'}]})
  expect(result.website).toBeUndefined()
  expect(result).toMatchObject({externalReferences:[{url,reason:expect.any(String)}]})
})
it('shows found readable websites without turning them into a confirmed identity',()=>{
  expect(projectRadarPublicPresence({configurationRevision:5,...dossier})).toMatchObject({version:1,configurationRevision:5,website:{association:'review',scope:'unresolved',readable:true,sourceUrl:'https://alfa.example/'}})
})
it('excludes directory websites even when a historical dossier claims confirmed',()=>{
  const url='https://empresadois.com.br/cnpj/12345678000190'
  expect(projectRadarPublicPresence({configurationRevision:5,...dossier,discovery:{...dossier.discovery,websiteUrl:url},siteAssociation:'confirmed',pages:[{url,text:'Alfa CNPJ 12345678000190',observedAt:'2026-10-14'}]}).website).toBeUndefined()
})
it('preserves group scope and does not confirm a pending contact',()=>{
  const value=projectRadarPublicPresence({configurationRevision:5,...dossier,siteAssociation:'confirmed',presenceResolution:{websiteUrl:'https://alfa.example/',scope:'group',reason:'Grupo com evidência',claims:[]},contacts:[{kind:'email',value:'grupo@alfa.example',sourceUrl:'https://alfa.example/',association:'review',scope:'group',observedAt:'2026-10-14'}]})
  expect(value.website?.scope).toBe('group');expect(value.contacts[0].association).toBe('review')
})
it('handles incomplete legacy dossiers without fabricating links',()=>{
  expect(radarPublicPresenceFromDossier({},5)).toBeUndefined()
  expect(radarPublicPresenceFromDossier({...dossier,contacts:undefined},5)?.contacts).toEqual([])
})
it('a generic search snippet cannot override a page identified as a directory',()=>{
  const url='https://cadastro.example/alfa'
  const result=projectRadarPublicPresence({configurationRevision:5,...dossier,siteAssociation:'confirmed',discovery:{...dossier.discovery,websiteUrl:url,hits:[{url,title:'Alfa CNPJ 12345678000190',snippets:[],observedAt:'2026-10-14'}]},pages:[{url,text:'Dados cadastrais da empresa Alfa. Contato do editor: editor@cadastro.example',observedAt:'2026-10-14'}],contacts:[{kind:'email',value:'editor@cadastro.example',sourceUrl:url,observedAt:'2026-10-14',association:'confirmed'}]})
  expect(result.website).toBeUndefined();expect(result.contacts).toEqual([])
})
