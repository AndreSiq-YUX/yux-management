import {isRadarInstitutionalSource} from './source-identity.js'
import {publicRadarUrl} from './web-search.js'
import type {RadarPresenceDiscovery} from './site-discovery.js'
import type {RadarSiteEvidence} from './site-evidence.js'
import type {RadarContactEvidence} from './contact-evidence.js'
import {isRadarContactSource} from './contact-evidence.js'
import type {RadarPresenceResolution} from './presence-resolution.js'

export type RadarPublicPresence={version:1;configurationRevision:number;website?:{url:string;association:'confirmed'|'review';scope:'establishment'|'group'|'unresolved';readable:boolean;sourceUrl:string;observedAt:string};contacts:RadarContactEvidence[]}
const origin=(url:string)=>{try{return new URL(url).origin}catch{return undefined}}
export function projectRadarPublicPresence(input:{configurationRevision:number;discovery:RadarPresenceDiscovery;pages:RadarSiteEvidence[];contacts:RadarContactEvidence[];siteAssociation:'confirmed'|'review';presenceResolution?:RadarPresenceResolution}):RadarPublicPresence {
  const pages=input.pages.filter(page=>typeof page.url==='string'&&isRadarInstitutionalSource(page.url,{text:page.text}))
  const hits=(input.discovery.hits??[]).filter(hit=>isRadarInstitutionalSource(hit.url,{title:hit.title,text:hit.snippets?.join(' ')}))
  const origins=[...new Set(pages.map(page=>origin(page.url)).filter(Boolean))]
  const selected=input.presenceResolution?.websiteUrl??input.discovery.websiteUrl??(origins.length===1?pages[0]?.url:undefined)
  const page=pages.find(page=>origin(page.url)===origin(selected??'')&&!page.limitation)??pages.find(page=>page.url===selected)
  const hit=hits.find(hit=>origin(hit.url)===origin(selected??''))
  const url=selected&&publicRadarUrl(selected)
  if(!url||!isRadarInstitutionalSource(url)||!page&&!hit)return {version:1,configurationRevision:input.configurationRevision,contacts:[]}
  const association=input.siteAssociation==='confirmed'?'confirmed' as const:'review' as const
  const scope=association==='confirmed'?input.presenceResolution?.scope??'establishment':'unresolved'
  const contacts=input.contacts.filter(contact=>typeof contact.sourceUrl==='string'&&typeof contact.value==='string'
    &&isRadarContactSource(contact,url)&&(origin(contact.sourceUrl)===origin(url)||origin(contact.linkedFromUrl??'')===origin(url)))
    .map(contact=>({...contact,association:association==='confirmed'?contact.association:'review' as const,scope:association==='confirmed'?contact.scope??scope:'unresolved' as const}))
  return {version:1,configurationRevision:input.configurationRevision,website:{url,association,scope,readable:!!page?.text&&!page.limitation,sourceUrl:page?.url??hit!.url,observedAt:page?.observedAt??hit!.observedAt},contacts}
}

/** Stored dossiers are internal data, but old/partial outputs may omit every optional field. */
export function radarPublicPresenceFromDossier(output:unknown,revision:number):RadarPublicPresence|undefined {
  if(!output||typeof output!=='object')return
  const data=output as Partial<{discovery:RadarPresenceDiscovery;pages:RadarSiteEvidence[];contacts:RadarContactEvidence[];siteAssociation:'confirmed'|'review';presenceResolution:RadarPresenceResolution}>
  if(!data.discovery||!Array.isArray(data.pages))return
  return projectRadarPublicPresence({configurationRevision:revision,discovery:data.discovery,pages:data.pages.filter(page=>!!page&&typeof page==='object'),contacts:Array.isArray(data.contacts)?data.contacts.filter(contact=>!!contact&&typeof contact==='object'):[],siteAssociation:data.siteAssociation==='confirmed'?'confirmed':'review',presenceResolution:data.presenceResolution})
}
