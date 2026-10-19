import {createHash} from 'node:crypto'
import {canonicalRadarReadUrl} from './research-checkpoint.js'

type Evidence={id?:string;url:string;text:string;kind?:string;scope?:string}
export type RadarEvidenceBindings=Array<{id:string;key:string}>
export type RadarEvidenceVersion={hashVersion:2;hash:string;bindings:RadarEvidenceBindings;aliases?:string[];
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
 const canonical=canonicalRadarReadUrl(item.url)
 const url=canonical?new URL(canonical):undefined
 url?.searchParams.sort()
 return{url:url?.toString()??item.url,text:normalize(item.text),kind:item.kind??'institutional_candidate',scope:item.scope??'unresolved'}
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
 return{hashVersion:2,hash:version.hash,bindings:version.bindings,aliases:[...new Set([...(version.aliases??[]),...(paidHash&&paidHash!==version.hash?[paidHash]:[])])]}
}
