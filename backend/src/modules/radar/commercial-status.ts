import type {CommercialResearchStatusV1} from '../../contracts/generated/radarResearch.js'
import {assessRadarResearchProgress} from './capture-research-state.js'
import {validateRadarResearchContract} from './effect-receipts.js'
import {z} from 'zod'
import {projectRadarResearchAttention} from './research-attention.js'
type Field=CommercialResearchStatusV1['updatedFields'][number]
export const radarCommercialStatusSchema=z.custom<CommercialResearchStatusV1>(value=>validateRadarResearchContract(value)&&value!==null&&typeof value==='object'&&'updatedFields' in value)
const object=(value:unknown):Record<string,any>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,any>:{}
const array=(value:unknown):Array<Record<string,any>>=>Array.isArray(value)?value.map(object):[]
const contactFields=new Set<Field>(['email','phone','whatsapp','social','supplierChannel'])
function values(value:Record<string,any>,dossier:boolean):Partial<Record<Field,unknown>>{
 const contacts=array(dossier?value.contacts:value.publicContacts??value.contacts)
 const profile=object(dossier?value.profile:value.companyProfile??value.profile)
 const profileValues=[profile.summary,...['services','customerSegments','operatingRegions','scaleSignals'].flatMap(key=>array(profile[key]))].filter(Boolean).map(claim=>claim.value).filter(Boolean).sort()
 const contact=(kind:string)=>contacts.filter(item=>item.kind===kind).map(item=>item.value).filter(Boolean).sort()
 const suppliers=contacts.filter(item=>item.purpose==='suppliers').map(item=>item.value).filter(Boolean).sort()
 const activity=object(dossier?value.activity:value.activityAssessment)
 const signals=[...array(activity.signals),...array(activity.presenceSignals)].map(item=>item.excerpt).filter(Boolean).sort()
 const qualification=object(value.qualification)
 const result:Partial<Record<Field,unknown>>={website:dossier?object(value.discovery).websiteUrl:value.websiteUrl,
  email:contact('email'),phone:contact('phone'),whatsapp:contact('whatsapp'),social:contact('social'),supplierChannel:suppliers,
  companyProfile:profileValues,companySize:object(value.sizeAssessment).score,activity:signals,
  identity:(dossier?value.siteAssociation==='confirmed':value.websiteStatus==='verified_present'||object(object(value.publicPresence).website).association==='confirmed')?true:undefined,
  fit:qualification.targetStatus??value.targetStatus}
 for(const [key,item] of Object.entries(result))if(item==null||item===''||Array.isArray(item)&&!item.length)delete result[key as Field]
 return result
}
/** Deliberately emits only enumerated commercial outcomes, never free-text errors. */
export function projectRadarCommercialResearchStatus(input:{run?:unknown;previous?:unknown;requestedFields?:Field[]}):CommercialResearchStatusV1{
 const run=object(input.run),output=object(run.output),previous=object(input.previous)
 const requested=[...new Set(input.requestedFields??['website','identity','email','phone'] as Field[])]
 const current=values(output,true),prior=values(previous,false),assessment=assessRadarResearchProgress({status:run.status??'blocked',...run})
 const active=['queued','running'].includes(run.status),waiting=!!input.run&&!active&&assessment.status==='blocked'
 const read=array(output.pages).some(page=>!!page.text&&!page.limitation),restricted=array(output.pages).some(page=>!!page.limitation&&!page.text)
 const outside=object(output.qualification).targetStatus==='not_target'||output.decisionExcluded===true
 const terminalFunnel=!!output.funnel&&assessment.status==='completed'
 const updatedFields=active?[]:requested.filter(field=>current[field]!==undefined&&JSON.stringify(current[field])!==JSON.stringify(prior[field]))
 const unresolvedFields:CommercialResearchStatusV1['unresolvedFields']=[]
 for(const field of requested){
  let reason:CommercialResearchStatusV1['unresolvedFields'][number]['reason']|undefined
  if(field==='fit'&&outside)reason='outside_profile'
  else if(field==='fit'&&output.funnel&&object(output.qualification).targetStatus!=='confirmed')reason=output.siteAssociation==='confirmed'?'verification_pending':'identity_unresolved'
  else if(current[field]===undefined){
   if(active||!output.readingComplete&&!terminalFunnel)reason='verification_pending'
   else if(restricted&&!read)reason='reading_restricted'
   else if(['companyProfile','companySize','activity','identity','fit'].includes(field))reason=output.siteAssociation!=='confirmed'?'identity_unresolved':'verification_pending'
   else reason='not_found'
  }else if(contactFields.has(field)&&output.siteAssociation!=='confirmed')reason='identity_unresolved'
  else if(field==='website'&&output.siteAssociation!=='confirmed')reason='identity_unresolved'
  if(reason)unresolvedFields.push({field,reason})
 }
 const complete=assessment.status==='completed'&&object(output.quality).readyForReview===true&&!outside
 const status=active?'researching':waiting?'waiting':complete?(!updatedFields.length&&Object.keys(previous).length?'unchanged':'complete'):'incomplete'
 const timestamp=run.updated_at??run.completed_at??run.created_at
 const date=timestamp&&new Date(timestamp)
 const attention=waiting?projectRadarResearchAttention({assessment}):null
 return{schemaVersion:1,status,updatedFields,unresolvedFields,lastAttemptAt:date&&Number.isFinite(date.getTime())?date.toISOString():null,
  ...(attention?{attention}:{}),
  nextAction:active||waiting?'wait':outside||complete||terminalFunnel?'review_result':restricted&&!read?'review_source':'continue'}
}
