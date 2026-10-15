import {classifyRadarSource,isRadarInstitutionalSource} from './source-identity.js'
import type {RadarContactEvidence} from './contact-evidence.js'
import {isRadarContactSource} from './contact-evidence.js'

// A read/new-delivery projection, not a migration: historical rows and existing leads remain intact.
export function projectRadarCompanyFacts(payload:Record<string,unknown>):Record<string,unknown>{
  const result={...payload}
  const presence=payload.publicPresence&&typeof payload.publicPresence==='object'?payload.publicPresence as Record<string,unknown>:undefined
  const website=presence?.website&&typeof presence.website==='object'?presence.website as Record<string,unknown>:undefined
  const urls=[payload.websiteUrl,payload.siteFinalUrl,website?.url].filter((value):value is string=>typeof value==='string'&&!!value)
  const externalReferences=[...new Map([...(Array.isArray(payload.externalReferences)?payload.externalReferences:[]),
    ...(Array.isArray(presence?.externalReferences)?presence.externalReferences:[]),
    ...urls.filter(url=>!isRadarInstitutionalSource(url)).map(url=>({url,reason:classifyRadarSource(url).reasons[0]}))]
    .filter((item):item is {url:string;reason:string}=>!!item&&typeof item==='object'&&typeof item.url==='string'&&typeof item.reason==='string')
    .map(item=>[item.url,item])).values()]
  result.externalReferences=externalReferences
  const externalUrls=new Set(externalReferences.map(item=>item.url))
  const invalidSite=urls.some(url=>!isRadarInstitutionalSource(url)||externalUrls.has(url))
  const raw=Array.isArray(payload.publicContacts)?payload.publicContacts:undefined
  const contacts=raw?.filter((value):value is RadarContactEvidence=>!!value&&typeof value==='object'
    &&typeof value.sourceUrl==='string'&&!externalUrls.has(value.sourceUrl)&&isRadarContactSource(value,invalidSite?undefined:urls[0]))
  if(contacts)result.publicContacts=contacts
  if(presence){
    const {website:_website,...rest}=presence
    const presenceContacts=(Array.isArray(presence.contacts)?presence.contacts:[]).filter((item):item is RadarContactEvidence=>!!item&&typeof item==='object'
      &&typeof item.sourceUrl==='string'&&!externalUrls.has(item.sourceUrl)&&isRadarContactSource(item,invalidSite?undefined:urls[0]))
    result.publicPresence={...rest,...(!invalidSite&&website?{website}:{}),contacts:presenceContacts,externalReferences}
  }
  if(invalidSite||raw&&contacts?.length!==raw.length){
    result.siteEmails=(contacts??[]).filter(item=>item.kind==='email'&&item.association==='confirmed').map(item=>item.value)
    result.sitePhones=(contacts??[]).filter(item=>item.kind==='phone'&&item.association==='confirmed').map(item=>item.value)
    result.researchAssociationNeedsReview=true
  }
  if(invalidSite){
    result.websiteUrl=undefined;result.siteFinalUrl=undefined;result.websiteStatus='unknown';result.siteCheckedAt=undefined
    result.companyProfile=undefined;result.sizeAssessment=undefined
    result.researchQuality=undefined
  }
  return result
}
