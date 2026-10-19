import {classifyRadarSource,isRadarInstitutionalSource} from './source-identity.js'
import type {RadarContactEvidence} from './contact-evidence.js'
import {isRadarContactSource} from './contact-evidence.js'
import {createHash} from 'node:crypto'
import {radarResearchDependencyVersions} from './evidence-version.js'

const object=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
export function radarPayloadIdentityHash(payload:Record<string,unknown>,title?:string):string{
 return radarResearchDependencyVersions({identity:{name:String(payload.tradeName||title||payload.researchIdentityName||payload.legalName||''),legalName:typeof payload.legalName==='string'?payload.legalName:undefined,
  cnpj:String(payload.cnpj??''),city:String(payload.city??''),state:String(payload.state??''),address:String(payload.address??'')},criteria:{},evidence:[]}).identityHash
}
// Publication concurrency, unlike analysis reuse, includes dates and exact strings.
export function radarCompanyProjectionVersion(payload:Record<string,unknown>):string{
 const sort=(value:unknown):unknown=>Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,sort(item)])):value
 return createHash('sha256').update(JSON.stringify(sort(payload))).digest('hex')
}

export function mergeRadarCompanyResearch(previous:Record<string,unknown>,incoming:Record<string,unknown>,options:{identityHash:string;configurationRevision:number;freshnessDays:number;now?:number;identityConflict?:boolean;identityCnpj?:string}):Record<string,unknown>{
 const result={...previous,...incoming},prior=projectRadarCompanyFacts(previous)
 const sameIdentity=!options.identityConflict&&object(previous.researchDependencyVersions).identityHash===options.identityHash
 const now=options.now??Date.now(),fresh=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=now&&now-Date.parse(value)<=options.freshnessDays*86400000
 const priorPresence=object(prior.publicPresence),priorWebsite=object(priorPresence.website)
 const incomplete=incoming.researchComplete!==true||object(incoming.researchQuality).readyForReview!==true
 const snapshot={runId:previous.researchRunId,configurationRevision:previous.researchRevision,belongsToCurrentIdentity:sameIdentity,
  websiteUrl:prior.websiteUrl,siteCheckedAt:prior.siteCheckedAt,publicPresence:prior.publicPresence,publicContacts:prior.publicContacts,companyProfile:prior.companyProfile,activityAssessment:prior.activityAssessment}
 // Keep the last genuinely useful snapshot across any number of empty refreshes.
 const historical=object(previous.previousResearch)
 result.previousResearch=previous.researchRefreshIncomplete===true&&Object.keys(historical).length?{...historical,belongsToCurrentIdentity:sameIdentity&&historical.belongsToCurrentIdentity===true}
  :previous.researchRunId&&(prior.websiteUrl||Array.isArray(prior.publicContacts)&&prior.publicContacts.length)?snapshot:Object.keys(historical).length?{...historical,belongsToCurrentIdentity:sameIdentity&&historical.belongsToCurrentIdentity===true}:snapshot
 result.researchRefreshIncomplete=incomplete
 if(incomplete&&!incoming.websiteUrl&&prior.websiteUrl&&previous.braveMatchStatus==='manual_matched'&&!options.identityConflict
   &&(!options.identityCnpj||String(previous.cnpj??'').replace(/\D/g,'')===options.identityCnpj.replace(/\D/g,''))&&fresh(previous.braveObservedAt)){
  result.websiteUrl=prior.websiteUrl;result.websiteStatus='unverified';result.researchAssociationNeedsReview=true
 }
 if(!incomplete||!sameIdentity)return result
 const currentPresence=object(incoming.publicPresence),currentWebsite=object(currentPresence.website)
 const externalUrls=new Set([...(Array.isArray(incoming.externalReferences)?incoming.externalReferences:[]),...(Array.isArray(currentPresence.externalReferences)?currentPresence.externalReferences:[])].map(item=>object(item).url))
 const failedReadOfSameSite=currentWebsite.readable===false&&currentWebsite.url===prior.websiteUrl
 if(!incoming.websiteUrl&&prior.websiteUrl&&priorWebsite.association==='confirmed'&&prior.websiteStatus==='verified_present'&&fresh(prior.siteCheckedAt)&&!externalUrls.has(prior.websiteUrl)&&(currentWebsite.association!=='review'||failedReadOfSameSite)){
  result.websiteUrl=prior.websiteUrl;result.siteFinalUrl=prior.siteFinalUrl;result.siteCheckedAt=prior.siteCheckedAt;result.websiteStatus=prior.websiteStatus
  result.publicPresence={...currentPresence,website:priorWebsite}
 }
 const current=Array.isArray(incoming.publicContacts)?incoming.publicContacts:[]
 const old=(Array.isArray(prior.publicContacts)?prior.publicContacts:[]).filter(item=>{const contact=object(item);return contact.association==='confirmed'&&fresh(contact.observedAt)&&!externalUrls.has(contact.sourceUrl)})
 const seen=new Set<string>()
 const contacts=[...current,...old].filter(item=>{const contact=object(item),key=`${contact.kind}:${contact.value}:${contact.sourceUrl}`;if(seen.has(key))return false;seen.add(key);return true})
 result.publicContacts=contacts
 result.publicPresence={...object(result.publicPresence),contacts}
 result.siteEmails=contacts.filter(item=>object(item).kind==='email'&&object(item).association==='confirmed').map(item=>object(item).value)
 result.sitePhones=contacts.filter(item=>object(item).kind==='phone'&&object(item).association==='confirmed').map(item=>object(item).value)
 // Activity, offer fit and review readiness come only from this attempt; never
 // turn a dated site/contact into proof of operation, response or consent.
 return result
}

// A read/new-delivery projection, not a migration: historical rows and existing leads remain intact.
export function projectRadarCompanyFacts(payload:Record<string,unknown>,title?:string):Record<string,unknown>{
  const result={...payload}
  const versions=object(payload.researchDependencyVersions)
  const identityMismatch=versions.version===1&&typeof versions.identityHash==='string'&&versions.identityHash!==radarPayloadIdentityHash(payload,title)
  if(identityMismatch&&payload.previousResearch)result.previousResearch={...object(payload.previousResearch),belongsToCurrentIdentity:false}
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
  const invalidSite=identityMismatch||urls.some(url=>!isRadarInstitutionalSource(url)||externalUrls.has(url))
  const pendingOwnership=website?.association==='review'
  const raw=Array.isArray(payload.publicContacts)?payload.publicContacts:undefined
  const contacts=raw?.filter((value):value is RadarContactEvidence=>!!value&&typeof value==='object'
    &&typeof value.sourceUrl==='string'&&!externalUrls.has(value.sourceUrl)&&isRadarContactSource(value,invalidSite?undefined:urls[0]))
    .map(contact=>invalidSite||pendingOwnership?{...contact,association:'review' as const,scope:'unresolved' as const,preferred:false}:contact)
  if(contacts)result.publicContacts=contacts
  if(presence){
    const {website:_website,...rest}=presence
    const presenceContacts=(Array.isArray(presence.contacts)?presence.contacts:[]).filter((item):item is RadarContactEvidence=>!!item&&typeof item==='object'
      &&typeof item.sourceUrl==='string'&&!externalUrls.has(item.sourceUrl)&&isRadarContactSource(item,invalidSite?undefined:urls[0]))
    result.publicPresence={...rest,...(!invalidSite&&website?{website}:{}),contacts:presenceContacts.map(contact=>invalidSite?{...contact,association:'review' as const,scope:'unresolved' as const,preferred:false}:contact),externalReferences}
  }
  if(invalidSite||pendingOwnership||raw&&contacts?.length!==raw.length){
    result.siteEmails=(contacts??[]).filter(item=>item.kind==='email'&&item.association==='confirmed').map(item=>item.value)
    result.sitePhones=(contacts??[]).filter(item=>item.kind==='phone'&&item.association==='confirmed').map(item=>item.value)
    result.researchAssociationNeedsReview=true
  }
  if(pendingOwnership){result.websiteStatus='unverified';result.researchQuality=undefined;result.targetStatus='review';result.productFit='unknown'}
  if(invalidSite){
    result.websiteUrl=undefined;result.siteFinalUrl=undefined;result.websiteStatus='unknown';result.siteCheckedAt=undefined
    result.companyProfile=undefined;result.sizeAssessment=undefined
    result.researchQuality=undefined
    result.targetStatus='review';result.productFit='unknown'
  }
  return result
}
