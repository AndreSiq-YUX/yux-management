import {expect,it} from 'vitest'
import {projectRadarPublicPresence,radarPublicPresenceFromDossier} from '../src/modules/radar/public-presence.js'
const dossier={discovery:{association:'review' as const,websiteUrl:'https://alfa.example/',hits:[],suggestions:[],limitations:[],queries:1},pages:[{url:'https://alfa.example/',text:'Alfa contato',observedAt:'2026-10-14'}],contacts:[],siteAssociation:'review' as const}
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
