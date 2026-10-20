import {z} from 'zod'
import {publicRadarDiscoveryUrl} from './discovery-extraction.js'
import {classifyRadarSource} from './source-identity.js'
import type {ResearchEvidenceV1} from '../../contracts/generated/radarResearch.js'

const claimSchema=z.object({kind:z.enum(['email','phone','website','social','contact_form','activity','profile']),value:z.string().min(1).max(2000),excerpt:z.string().min(8).max(4000),sourceIds:z.array(z.string().min(1).max(100)).length(1)}).strict()
type Claim=z.infer<typeof claimSchema>&{association:'review';sourceUrl:string;evidenceId:string}
/** References are not verified contacts. Local identity/purpose checks remain mandatory. */
export function normalizePerplexityEvidence(raw:unknown,observedAt=new Date().toISOString()):{evidence:ResearchEvidenceV1[];references:Array<{marker:string;evidenceId:string}>;unresolved:string[];claims:Claim[]}{
 if(!raw||typeof raw!=='object'||Buffer.byteLength(JSON.stringify(raw))>1_000_000)throw Error('radar_deep_research_response_invalid')
 const body=raw as Record<string,unknown>
 if(typeof body.id!=='string'||!body.id||!Array.isArray(body.output))throw Error('radar_deep_research_response_invalid')
 const sources=new Map<string,ResearchEvidenceV1>(),ambiguous=new Set<string>(),markers=new Set<string>()
 for(const block of body.output){
  if(!block||typeof block!=='object')continue
  const item=block as Record<string,unknown>
  if(item.type==='search_results')for(const entry of [item.results,item.contents].flatMap(value=>Array.isArray(value)?value:[])){
   if(!entry||typeof entry!=='object')continue
   const source=entry as Record<string,unknown>,id=String(source.id??''),scope=source.source??item.source??'web'
   if(!/^[a-z][a-z0-9_]{0,20}$/.test(String(scope))||!/^\d{1,8}$/.test(id)||typeof source.url!=='string'||!publicRadarDiscoveryUrl(source.url)||typeof source.snippet!=='string')continue
   const key=`${scope}:${id}`,previous=sources.get(key)
   if(previous&&(previous.sourceUrl!==source.url||previous.text!==source.snippet)){ambiguous.add(key);continue}
   sources.set(key,{schemaVersion:1,id:`${body.id}:${key}`,sourceUrl:source.url,text:source.snippet.slice(0,32000),observedAt,kind:classifyRadarSource(source.url).kind,scope:'unresolved'})
  }
  if(item.type==='message')for(const content of Array.isArray(item.content)?item.content:[]){
   if(typeof content?.text==='string')for(const match of content.text.matchAll(/\[([a-z][a-z0-9_]*:\d+)\]/g))markers.add(match[1])
   for(const annotation of Array.isArray(content?.annotations)?content.annotations:[]){
    if(typeof annotation?.source==='string'&&annotation.id!==undefined)markers.add(`${annotation.source}:${annotation.id}`)
   }
  }
 }
 const claims:Claim[]=[]
 for(const rawClaim of Array.isArray(body.claims)?body.claims:[]){
  const parsed=claimSchema.safeParse(rawClaim);if(!parsed.success)continue
  const claim=parsed.data,key=claim.sourceIds[0],source=sources.get(key)
  if(!source||ambiguous.has(key)||!source.text.includes(claim.excerpt)||!claim.excerpt.includes(claim.value))continue
  if(claim.kind==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claim.value))continue
  claims.push({...claim,association:'review',sourceUrl:source.sourceUrl,evidenceId:source.id})
 }
 return{evidence:[...sources.entries()].filter(([key])=>!ambiguous.has(key)).map(([,value])=>value),references:[...markers].flatMap(marker=>sources.has(marker)&&!ambiguous.has(marker)?[{marker,evidenceId:sources.get(marker)!.id}]:[]),unresolved:[...markers].filter(marker=>!sources.has(marker)||ambiguous.has(marker)),claims}
}
