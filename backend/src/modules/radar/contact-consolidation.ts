import type {RadarContactEvidence,RadarContactPurpose} from './contact-evidence.js'
import {normalizeRadarPhone} from './contact-evidence.js'
import {isRadarPublicProfile} from './social-profile.js'

export function isUsefulRadarContact(contact:RadarContactEvidence,purpose:RadarContactPurpose):boolean {
  if(contact.association!=='confirmed'||contact.scope==='unresolved')return false
  if(!['email','phone','whatsapp','contact_form','business_person'].includes(contact.kind))return false
  if(contact.kind==='email'&&/^(?:dpo|lgpd|privacidade|privacy|abuse|noreply|no-reply|webmaster)@/i.test(contact.value))return false
  return !contact.purpose||['general','unknown',purpose].includes(contact.purpose)
}
function identityOrigin(contact:RadarContactEvidence){try{return new URL(contact.linkedFromUrl??contact.sourceUrl).hostname.replace(/^www\./,'')}catch{return contact.sourceUrl}}
function normalizedValue(contact:RadarContactEvidence){
  if(contact.kind==='email')return contact.value.trim().toLowerCase()
  if(['phone','whatsapp'].includes(contact.kind))return normalizeRadarPhone(contact.value)??contact.value.trim()
  if(['social','contact_form'].includes(contact.kind)){try{const url=new URL(contact.value);url.hash='';return url.toString()}catch{/* Keep invalid historical values separate, never invent a URL. */}}
  return contact.value.trim()
}
export function consolidateRadarContacts(contacts:RadarContactEvidence[],purpose:RadarContactPurpose):RadarContactEvidence[] {
  const byKey=new Map<string,RadarContactEvidence>()
  const rank=(contact:RadarContactEvidence)=>Number(isUsefulRadarContact(contact,purpose))*100+Number(contact.purpose===purpose)*40+Number(contact.purpose==='general')*10
  for(const input of contacts){
    if(input?.kind==='social'&&!isRadarPublicProfile(input.value))continue;
    if(!input||typeof input!=='object'||typeof input.value!=='string'||typeof input.sourceUrl!=='string'
      ||typeof input.observedAt!=='string'||!['phone','email','whatsapp','social','business_person','contact_form'].includes(input.kind)
      ||!['confirmed','review'].includes(input.association))continue
    const value=normalizedValue(input),scope=input.scope??(input.association==='confirmed'?'establishment':'unresolved')
    const key=JSON.stringify([input.kind,value,scope,input.association,identityOrigin(input)])
    const previous=byKey.get(key)
    const source={sourceUrl:input.sourceUrl,observedAt:input.observedAt,purpose:input.purpose}
    const sources=[...new Map([...(previous?.sources??[]),...(Array.isArray(input.sources)?input.sources:[]),source]
      .filter(item=>!!item&&typeof item==='object'&&typeof item.sourceUrl==='string'&&typeof item.observedAt==='string')
      .map(item=>[`${item.sourceUrl}:${item.observedAt}:${item.purpose??''}`,{...item}])).values()]
    const selected=!previous||rank(input)>rank(previous)||rank(input)===rank(previous)&&(Date.parse(input.observedAt)||0)>(Date.parse(previous.observedAt)||0)?input:previous
    byKey.set(key,{...selected,value,scope,sources,preferred:false})
  }
  const result=[...byKey.values()].sort((a,b)=>rank(b)-rank(a)||(b.sources?.length??0)-(a.sources?.length??0)||(Date.parse(b.observedAt)||0)-(Date.parse(a.observedAt)||0))
  const preferredKinds=new Set<string>()
  for(const contact of result)if(isUsefulRadarContact(contact,purpose)&&!preferredKinds.has(contact.kind)){
    contact.preferred=true;preferredKinds.add(contact.kind)
    contact.note=contact.purpose===purpose?'Canal publicado para a finalidade selecionada; atendimento não validado.':'Canal público alternativo; finalidade e atendimento precisam de conferência.'
  }
  return result
}
