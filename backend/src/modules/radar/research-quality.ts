import type {RadarResearchDossier} from './research-service.js'
import type {RadarResearchPolicy} from './search-configuration.js'
import type {RadarResearchGap} from './research-planner.js'
import {isUsefulRadarContact,consolidateRadarContacts} from './contact-consolidation.js'
import {isRadarInstitutionalSource} from './source-identity.js'

export type RadarResearchQuality={identity:'associated'|'pending';contactability:'useful'|'missing'|'pending';fit:'high'|'possible'|'low'|'unknown';
  potential:{score:number|null;coverage:number|null};readyForReview:boolean;missing:RadarResearchGap[]}
export function usefulRadarDeliveryContacts(dossier:Pick<RadarResearchDossier,'contacts'>,policy:RadarResearchPolicy){
  const rule=policy.completion
  return consolidateRadarContacts(dossier.contacts,policy.contactPurpose).filter(contact=>isUsefulRadarContact(contact,policy.contactPurpose)&&contact.scope!=='group'
    &&rule.contactTypes.some(kind=>kind===contact.kind)&&(!rule.contactPurposes.length||rule.contactPurposes.some(purpose=>purpose===contact.purpose)))
}
export function evaluateRadarResearchQuality({dossier,policy,currentRevision}:{dossier:RadarResearchDossier;policy:RadarResearchPolicy;currentRevision:boolean}):RadarResearchQuality {
  const contacts=usefulRadarDeliveryContacts(dossier,policy),scope=dossier.presenceResolution?.scope
  const website=!!dossier.discovery.websiteUrl&&isRadarInstitutionalSource(dossier.discovery.websiteUrl)&&dossier.siteAssociation==='confirmed'&&scope!=='group'&&scope!=='unresolved'
  const identity=currentRevision&&(website||dossier.contacts.some(contact=>contact.association==='confirmed'&&(contact.scope??'establishment')==='establishment'))
  const rule=policy.completion,missing:RadarResearchGap[]=[]
  if((rule.enabled?rule.requireIdentity:true)&&!identity)missing.push('identity')
  if(rule.enabled&&rule.requireWebsite&&!website)missing.push('website')
  const requireQualification=!!dossier.funnel&&policy.semanticQualificationEnabled;
  if((rule.enabled&&rule.requireSegment||requireQualification)&&dossier.qualification?.targetStatus!=='confirmed')missing.push('segment')
  if(contacts.length<(rule.enabled?rule.minimumUsefulContacts:1))missing.push('contact')
  const size=dossier.sizeAssessment
  const score=size&&size.evidenceCoverage>0&&typeof size.score==='number'&&Number.isFinite(size.score)?size.score:null
  return{identity:identity?'associated':'pending',contactability:currentRevision&&contacts.length?'useful':dossier.contacts.some(contact=>contact.association==='review')?'pending':'missing',
    fit:dossier.qualification?.productFit??'unknown',potential:{score,coverage:size?.evidenceCoverage??null},
    readyForReview:currentRevision&&!missing.length&&dossier.qualification?.targetStatus!=='not_target',missing}
}
export function radarQualityFromPayload(data:Record<string,unknown>,policy:RadarResearchPolicy,revision:number):RadarResearchQuality {
  const presence=data.publicPresence as {website?:{url?:string;association?:string;scope?:string};contacts?:RadarResearchDossier['contacts']}|undefined
  const url=typeof data.websiteUrl==='string'?data.websiteUrl:presence?.website?.url
  const targetStatus=['confirmed','review','not_target','insufficient'].includes(String(data.targetStatus))?data.targetStatus as NonNullable<RadarResearchDossier['qualification']>['targetStatus']:'review'
  const productFit=['high','possible','low','unknown'].includes(String(data.productFit))?data.productFit as NonNullable<RadarResearchDossier['qualification']>['productFit']:'unknown'
  const scope=['establishment','group','unresolved'].includes(String(presence?.website?.scope))?presence!.website!.scope as 'establishment'|'group'|'unresolved':undefined
  const dossier:RadarResearchDossier={discovery:{websiteUrl:url,association:'review',hits:[],suggestions:[],limitations:[],queries:0},
    pages:[],contacts:Array.isArray(data.publicContacts)?data.publicContacts:presence?.contacts??[],
    siteAssociation:data.websiteStatus==='verified_present'||presence?.website?.association==='confirmed'?'confirmed':'review',
    presenceResolution:scope?{scope,reason:'Projeção corrente',claims:[]}:undefined,
    qualification:{targetStatus,productFit,reasons:[],evidenceIds:[],limitations:[]},
    sizeAssessment:data.sizeAssessment as RadarResearchDossier['sizeAssessment'],activity:{status:'inconclusive',signals:[],presenceSignals:[],limitation:''},limitations:[]}
  return evaluateRadarResearchQuality({dossier,policy,currentRevision:Number(data.researchRevision??data.analysisRevision??data.discoveryRevision??0)===revision})
}
