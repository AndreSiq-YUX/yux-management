import type {RadarCandidateRecord} from '@/types/radar'
import type {RadarResearchContact} from '@/types/radarResearch'

export function radarPublicLink(value:unknown):string|undefined {
  if(typeof value!=='string')return
  try{const url=new URL(value);if(['http:','https:'].includes(url.protocol)&&!url.username&&!url.password)return url.toString()}catch{/* Invalid evidence is displayed as a limitation, never as an active link. */}
}
const record=(value:unknown):Record<string,unknown>=>value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{}
export function buildRadarPresenceSummary(candidate:RadarCandidateRecord,revision:number):{website?:{url:string;label:string};contacts:RadarResearchContact[];presenceLabel:string;pending:string[]} {
  const data=candidate.normalizedPayload,projection=record(data.publicPresence),current=projection.version===1&&projection.configurationRevision===revision
  const stale=!current&&(projection.version===1||Number(data.researchRevision??data.analysisRevision??data.discoveryRevision??1)!==revision)
  const found=record(current?projection.website:undefined),url=radarPublicLink(found.url??data.websiteUrl)
  const association=!stale&&(found.association==='confirmed'||!current&&data.websiteStatus==='verified_present')?'confirmed':'review'
  const website=url?{url,label:association==='confirmed'?found.scope==='group'?'Site do grupo — filial a confirmar':'Site associado à empresa':'Site encontrado — confirmação pendente'}:undefined
  const raw=current&&Array.isArray(projection.contacts)?projection.contacts:Array.isArray(data.publicContacts)?data.publicContacts:[]
  const contacts=raw.filter((contact):contact is RadarResearchContact=>!!contact&&typeof contact==='object'
    &&['phone','email','whatsapp','social','business_person','contact_form'].includes(contact.kind)
    &&['confirmed','review'].includes(contact.association)&&typeof contact.value==='string'&&!!radarPublicLink(contact.sourceUrl)
    &&(!['social','contact_form'].includes(contact.kind)||!!radarPublicLink(contact.value)))
    .map(contact=>stale?{...contact,association:'review' as const,scope:'unresolved',preferred:false}:contact)
    .sort((a,b)=>Number(b.association==='confirmed')-Number(a.association==='confirmed')||Number(!!b.preferred)-Number(!!a.preferred))
  const pending:string[]=[]
  if(website&&association==='review')pending.push('O site foi encontrado; o vínculo com esta empresa ainda precisa de confirmação.')
  if(found.scope==='group')pending.push('A presença é do grupo; não confirma os contatos desta filial.')
  if(data.researchRevision&&data.researchRevision!==revision||projection.version===1&&!current)pending.push('Há dados de uma configuração anterior. Atualize ou reavalie a pesquisa antes de aprovar.')
  if(!contacts.length)pending.push('Nenhum canal público identificado nos dados disponíveis.')
  return {website,contacts,presenceLabel:website?found.readable===true?'Site acessível na última consulta':'Site encontrado; disponibilidade ainda não confirmada':'Site não encontrado nas fontes consultadas',pending}
}
