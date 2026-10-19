import {createHash} from 'node:crypto'
import {canonicalRadarReadUrl} from './research-checkpoint.js'

type Evidence={id?:string;url?:string;sourceUrl?:string;text:string;kind?:string;scope?:string}
export type RadarEvidenceBindings=Array<{id:string;key:string}>
export type RadarResearchDependencyVersions={version:1;identityHash:string;presenceHash:string;contactsHash:string;qualificationHash:string;presentationHash:string}
type DependencyContact={kind:string;value:string;sourceUrl?:string;scope?:string;purpose?:string}
type DependencyInput={identity:object;criteria:unknown;evidence:Evidence[];contacts?:DependencyContact[]}
type AnalysisDependencies={version:1;identityHash:string;materialHash:string;bindings:RadarEvidenceBindings}
export type RadarEvidenceVersion={hashVersion:2;hash:string;bindings:RadarEvidenceBindings;aliases?:string[];
 dependencies?:AnalysisDependencies;derivedFromHash?:string;
 legacy?:{hash:string;hashVersion:1;contentHash:string;bindings:RadarEvidenceBindings}}
const normalize=(text:string)=>text.normalize('NFC').replace(/\s+/gu,' ').trim()
function ordered(value:unknown):unknown{
 if(typeof value==='string')return normalize(value)
 if(Array.isArray(value))return value.map(ordered)
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>[k,ordered(v)]))
 return value
}
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(ordered(value))).digest('hex')
function material(item:Evidence){
 const source=item.url??item.sourceUrl??''
 const canonical=canonicalRadarReadUrl(source)
 const url=canonical?new URL(canonical):undefined
 url?.searchParams.sort()
 return{url:url?.toString()??source,text:normalize(item.text),kind:item.kind??'institutional_candidate',scope:item.scope??'unresolved'}
}
// This is deliberately separate from the paid v2 hash. Only known contact values
// are masked; CNPJ, revenue, dates and other identity/business facts are retained.
function dependencyEvidence(input:DependencyInput):Evidence[]{
 const identity=input.identity as Record<string,unknown>
 const contacts=[...(input.contacts??[]),...(['phone','email'] as const).flatMap(kind=>typeof identity[kind]==='string'?[{kind,value:identity[kind] as string}]:[])]
 const escape=(value:string)=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
 const patterns=contacts.flatMap(contact=>{
  if(contact.kind==='phone'||contact.kind==='whatsapp'){
   let digits=contact.value.replace(/\D/g,'');if(digits.startsWith('55')&&[12,13].includes(digits.length))digits=digits.slice(2)
   return [10,11].includes(digits.length)?[{pattern:new RegExp(`(?<![\\d/])(?:\\+?55[ ().-]*)?${digits.split('').join('[ ().-]*')}(?![\\d/])`,'g'),replacement:'[contact:phone]'}]:[]
  }
  return ['email','social'].includes(contact.kind)&&contact.value.length>=5?[{pattern:new RegExp(escape(contact.value),'gi'),replacement:`[contact:${contact.kind}]`}]:[]
 })
 return input.evidence.map(item=>({...item,text:patterns.reduce((value,{pattern,replacement})=>value.replace(pattern,replacement),item.text)}))
}
export function radarResearchDependencyVersions(input:DependencyInput):RadarResearchDependencyVersions{
 const identity=Object.fromEntries(Object.entries(input.identity).filter(([key])=>['name','legalName','cnpj','city','state','address'].includes(key)))
 const identityHash=hash({dependencyVersion:1,identity})
 const content=[...new Set(dependencyEvidence(input).map(item=>JSON.stringify(ordered(material(item)))))].sort()
 return{version:1,identityHash,presenceHash:hash({identityHash,content}),qualificationHash:hash({identityHash,content,criteria:input.criteria}),
  contactsHash:hash({identityHash,contacts:(input.contacts??[]).map(({kind,value,sourceUrl,scope,purpose})=>({kind,value,sourceUrl,scope,purpose})).map(item=>JSON.stringify(ordered(item))).sort()}),
  presentationHash:hash({identityHash,evidence:input.evidence,contacts:input.contacts,criteria:input.criteria})}
}
export function radarAnalysisDependencies(input:DependencyInput,purpose:'presence'|'qualification'):AnalysisDependencies{
 const versions=radarResearchDependencyVersions(input)
 return{version:1,identityHash:versions.identityHash,materialHash:purpose==='presence'?versions.presenceHash:versions.qualificationHash,bindings:radarEvidenceBindings(dependencyEvidence(input))}
}
export function radarDependencyBindingMatch(previous:RadarEvidenceVersion|undefined,current:RadarEvidenceVersion):{from:RadarEvidenceBindings;to:RadarEvidenceBindings}|undefined{
 const before=previous?.dependencies,after=current.dependencies
 if(before?.version===1&&after?.version===1&&before.identityHash===after.identityHash&&before.materialHash===after.materialHash)return{from:before.bindings,to:after.bindings}
}
export function radarEvidenceContentHash(input:{identity:object;criteria:unknown;purpose:string;evidence:Evidence[]}):string{
 const identity=Object.fromEntries(Object.entries(input.identity).filter(([key])=>['name','legalName','cnpj','city','state','address','phone','email'].includes(key)))
 return hash({hashVersion:2,identity,criteria:input.criteria,purpose:input.purpose,
  evidence:[...new Set(input.evidence.map(item=>JSON.stringify(ordered(material(item)))))].sort()})
}
export function radarEvidenceBindings(evidence:Evidence[]):RadarEvidenceBindings{
 return evidence.map((item,index)=>({id:item.id??`page-${index}`,key:hash(material(item))}))
}
export function canonicalRadarAnalysisEvidence<T extends Evidence>(evidence:T[]):Array<T & {id:string}>{
 return evidence.map(item=>({item,key:hash(material(item))})).sort((a,b)=>a.key.localeCompare(b.key)).map(({item},index)=>({...item,id:`page-${index}`,url:material(item).url}))
}
export function radarEvidenceBindingMatch(previous:{evidenceHash?:string;evidenceVersion?:RadarEvidenceVersion},current:RadarEvidenceVersion):RadarEvidenceBindings|undefined{
 if(previous.evidenceVersion?.hashVersion===2&&previous.evidenceVersion.hash===current.hash&&(previous.evidenceHash===current.hash||!!previous.evidenceHash&&previous.evidenceVersion.aliases?.includes(previous.evidenceHash)))return previous.evidenceVersion.bindings
 if(previous.evidenceHash===current.hash)return current.bindings
 if(current.legacy&&previous.evidenceHash===current.legacy.hash&&current.legacy.contentHash===current.hash)return current.legacy.bindings
}
export function remapRadarEvidenceResult<T>(result:T,from:RadarEvidenceBindings,to:RadarEvidenceBindings):T{
 const targets=new Map(to.map(binding=>[binding.key,binding.id])),ids=new Map(from.map(binding=>[binding.id,targets.get(binding.key)]))
 const remap=(id:unknown)=>{if(typeof id!=='string'||!ids.get(id))throw new Error('radar_analysis_evidence_binding_missing');return ids.get(id)!}
 const visit=(value:unknown):unknown=>{
  if(Array.isArray(value))return value.map(visit)
  if(!value||typeof value!=='object')return value
  return Object.fromEntries(Object.entries(value).map(([key,nested])=>[key,
   key==='evidenceId'||key==='candidateId'&&nested!==null?remap(nested):key==='evidenceIds'&&Array.isArray(nested)?nested.map(remap)
    :key==='evidenceSources'&&Array.isArray(nested)?nested.map(source=>({...source,id:remap(source.id)})):visit(nested)]))
 }
 return visit(result) as T
}
export function persistedRadarEvidenceVersion(version:RadarEvidenceVersion,paidHash?:string):RadarEvidenceVersion{
 return{hashVersion:2,hash:version.hash,bindings:version.bindings,...(version.dependencies?{dependencies:version.dependencies}:{}),...(version.derivedFromHash?{derivedFromHash:version.derivedFromHash}:{}),aliases:[...new Set([...(version.aliases??[]),...(paidHash&&paidHash!==version.hash?[paidHash]:[])])]}
}
