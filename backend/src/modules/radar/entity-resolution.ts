import type {BusinessMentionV1} from '../../contracts/generated/radarResearch.js'
import {normalizeRadarText} from './search-configuration.js'
import {publicRadarDiscoveryUrl} from './discovery-extraction.js'
import {isRadarInstitutionalSource} from './source-identity.js'
import {normalizeValidRadarCnpj} from './cnpj-identifier.js'
export {normalizeRadarCnpjIdentifier,normalizeValidRadarCnpj} from './cnpj-identifier.js'
type Location={city?:string;state?:string;address?:string}
export type RadarExternalIdentity={namespace:string;value:string}
export type RadarSavedBusinessIdentity={candidateId:string;organizationId:string;names:string[];taxId?:string;taxIdVerified?:boolean;location?:Location;
 scope:'company'|'group'|'establishment';officialDomain?:string;domainScope?:'company'|'group'|'establishment';externalKeys?:RadarExternalIdentity[]}
/** Internal verified evidence, never a client-supplied assertion of ownership. */
export type RadarBusinessVerification={taxId?:{value:string;subjectName:string;subjectScope:'company'|'group'|'establishment';sourceRole:'registry'|'institutional';evidenceId:string;location?:Location};
 website?:{url:string;association:'confirmed';scope:'company'|'group'|'establishment';evidenceId:string}}
export type RadarRegistryPolicy={triage:'compatible'|'investigate'|'outside_profile'|'unknown';requiredFields:string[];missingFields:string[];sourceAllowed:boolean;budgetApproved:boolean}
export type RadarEntityResolution={status:'matched'|'new_provisional'|'ambiguous';candidateId?:string;taxId?:string;scope:'company'|'group'|'establishment';signals:string[];newCandidateCount:0|1;
 nextAction:'none'|'registry_lookup'|'registry_name_locality_search'|'awaiting_registry_authorization'}
export function radarEntityNameKey(value:string){return normalizeRadarText(value).replace(/(?:\b(?:ltda|limitada|epp|me|sa|s a)\b\s*)+$/g,'').trim()}
const named=(name:string,names:string[])=>{const key=radarEntityNameKey(name);return key.length>=4&&names.some(value=>radarEntityNameKey(value)===key)}
const norm=(value:string|undefined)=>value?normalizeRadarText(value).replace(/[^a-z0-9]+/g,' ').trim():''
const sameCity=(left?:Location,right?:Location)=>!!(norm(left?.city)&&norm(left?.state)&&norm(left?.city)===norm(right?.city)&&norm(left?.state)===norm(right?.state))
const cityConflict=(left?:Location,right?:Location)=>!!(left?.city&&right?.city&&norm(left.city)!==norm(right.city)||left?.state&&right?.state&&norm(left.state)!==norm(right.state))
const addressConflict=(left?:Location,right?:Location)=>!!(left?.address&&right?.address&&norm(left.address)!==norm(right.address))
export function radarEntityDomain(value:string|undefined){try{return value&&publicRadarDiscoveryUrl(value)&&isRadarInstitutionalSource(value)?new URL(value).hostname.toLowerCase().replace(/^www\./,'').replace(/\.$/,''):undefined}catch{return}}
function nextRegistryAction(policy:RadarRegistryPolicy,mention:BusinessMentionV1,taxId?:string):RadarEntityResolution['nextAction']{
 if(policy.triage==='outside_profile'||policy.triage==='unknown'||!policy.missingFields.some(field=>policy.requiredFields.includes(field)))return'none'
 if(!taxId&&!(mention.location?.city&&mention.location.state))return'none'
 if(!policy.sourceAllowed||!policy.budgetApproved)return'awaiting_registry_authorization'
 return taxId?'registry_lookup':'registry_name_locality_search'
}
/** Pure, conservative resolution. No transport, credit use or publication. */
export function resolveRadarBusinessEntity(input:{organizationId:string;mention:BusinessMentionV1;existingCandidates:RadarSavedBusinessIdentity[];verification?:RadarBusinessVerification;externalKey?:RadarExternalIdentity;registryPolicy:RadarRegistryPolicy}):RadarEntityResolution{
 const {mention,verification,registryPolicy}=input,scope=mention.subjectScope
 const result=(status:RadarEntityResolution['status'],signals:string[],candidate?:RadarSavedBusinessIdentity,taxId?:string):RadarEntityResolution=>({status,scope,signals,...(candidate?{candidateId:candidate.candidateId}:{}),...(taxId?{taxId}:{}),newCandidateCount:status==='new_provisional'?1:0,
  nextAction:status==='ambiguous'?'none':nextRegistryAction({...registryPolicy,missingFields:registryPolicy.missingFields.filter(field=>!candidate||!['taxId','name','city','state','address'].includes(field)||!({taxId:candidate.taxId,name:candidate.names[0],...candidate.location} as Record<string,unknown>)[field])},mention,taxId)})
 const existing=input.existingCandidates.filter(candidate=>candidate.organizationId===input.organizationId)
 const claimed=normalizeValidRadarCnpj(mention.claimedTaxId),proof=verification?.taxId
 if(mention.claimedTaxId&&!claimed)return result('ambiguous',['invalid_claimed_tax_id'])
 const verifiedTaxId=proof&&proof.evidenceId&&named(mention.name,[proof.subjectName])&&!cityConflict(mention.location,proof.location)&&proof.subjectScope===scope?normalizeValidRadarCnpj(proof.value):undefined
 if(proof&&!verifiedTaxId||claimed&&verifiedTaxId&&claimed!==verifiedTaxId)return result('ambiguous',['tax_id_subject_conflict'])
 const taxId=verifiedTaxId??claimed
 const matches=(predicate:(candidate:RadarSavedBusinessIdentity)=>boolean)=>existing.filter(predicate)
 const decide=(candidates:RadarSavedBusinessIdentity[],signal:string):RadarEntityResolution|undefined=>{
  if(candidates.length>1)return result('ambiguous',['multiple_identity_matches',signal])
  const candidate=candidates[0]
  if(!candidate)return
  if(cityConflict(mention.location,candidate.location)||scope!==candidate.scope||taxId&&candidate.taxId&&normalizeValidRadarCnpj(candidate.taxId)!==taxId)return result('ambiguous',['identity_conflict',signal])
  return result('matched',[signal],candidate,taxId??(candidate.taxIdVerified?normalizeValidRadarCnpj(candidate.taxId):undefined))
 }
 if(taxId){
  const candidates=matches(candidate=>candidate.taxIdVerified===true&&normalizeValidRadarCnpj(candidate.taxId)===taxId)
  if(candidates.length&&(!verifiedTaxId&&candidates.some(candidate=>!named(mention.name,candidate.names)||!sameCity(mention.location,candidate.location))))return result('ambiguous',['claimed_tax_id_not_corroborated'])
  const resolved=decide(candidates,'full_tax_id');if(resolved)return resolved
 }
 if(input.externalKey){
  const key=input.externalKey
  const resolved=decide(matches(candidate=>candidate.externalKeys?.some(saved=>saved.namespace===key.namespace&&saved.value===key.value)===true),'saved_external_identity')
  if(resolved)return resolved
 }
 const website=verification?.website,domain=website?.association==='confirmed'&&website.evidenceId&&website.scope===scope&&scope!=='group'?radarEntityDomain(website.url):undefined
 if(domain){
  const candidates=matches(candidate=>candidate.officialDomain===domain&&candidate.domainScope===scope&&named(mention.name,candidate.names))
  if(candidates.some(candidate=>addressConflict(mention.location,candidate.location)))return result('ambiguous',['official_domain_address_conflict'])
  const compatible=candidates.filter(candidate=>sameCity(mention.location,candidate.location)||!!(mention.location?.address&&candidate.location?.address&&norm(mention.location.address)===norm(candidate.location.address)&&!cityConflict(mention.location,candidate.location)))
  const resolved=decide(compatible.length?compatible:candidates.filter(candidate=>cityConflict(mention.location,candidate.location)),'official_domain_name_location')
  if(resolved)return resolved
 }
 // A directory quote alone can suggest a lookup, but never assert ownership.
 if(claimed&&!verifiedTaxId)return result('ambiguous',['claimed_tax_id_requires_verification'])
 return result('new_provisional',[verifiedTaxId?'verified_registry_identity':'identity_not_yet_associated'],undefined,verifiedTaxId)
}
