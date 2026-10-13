import {isRadarInstitutionalSource} from './source-identity.js'
import type {RadarContactEvidence} from './contact-evidence.js'

// A read/new-delivery projection, not a migration: historical rows and existing leads remain intact.
export function projectRadarCompanyFacts(payload:Record<string,unknown>):Record<string,unknown>{
  const result={...payload}
  const urls=[payload.websiteUrl,payload.siteFinalUrl].filter((value):value is string=>typeof value==='string'&&!!value)
  const invalidSite=urls.some(url=>!isRadarInstitutionalSource(url))
  const raw=Array.isArray(payload.publicContacts)?payload.publicContacts:undefined
  const contacts=raw?.filter((value):value is RadarContactEvidence=>!!value&&typeof value==='object'
    &&typeof value.sourceUrl==='string'&&isRadarInstitutionalSource(value.sourceUrl))
  if(contacts)result.publicContacts=contacts
  if(invalidSite||raw&&contacts?.length!==raw.length){
    result.siteEmails=(contacts??[]).filter(item=>item.kind==='email'&&item.association==='confirmed').map(item=>item.value)
    result.sitePhones=(contacts??[]).filter(item=>item.kind==='phone'&&item.association==='confirmed').map(item=>item.value)
    result.researchAssociationNeedsReview=true
  }
  if(invalidSite){
    result.websiteUrl=undefined;result.siteFinalUrl=undefined;result.websiteStatus='unknown';result.siteCheckedAt=undefined
    result.companyProfile=undefined;result.sizeAssessment=undefined
  }
  return result
}
