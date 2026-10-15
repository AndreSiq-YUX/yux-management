import {z} from 'zod'
import {isRadarInstitutionalSource} from './source-identity.js'
import type {RadarBusinessIdentity} from './site-discovery.js'
export type RadarPresenceEvidence={id:string;url:string;text:string;observedAt:string;kind:'institutional_candidate'|'directory'|'social'|'third_party'}
const schema=z.object({candidateId:z.string().max(80).nullable(),scope:z.enum(['establishment','group','unresolved']),reason:z.string().min(8).max(1500),
  claims:z.array(z.object({evidenceId:z.string().max(80),excerpt:z.string().min(8).max(1500)}).strict()).max(8),provider:z.string().optional(),model:z.string().optional(),
  usage:z.object({inputTokens:z.number().int().nonnegative().nullable(),outputTokens:z.number().int().nonnegative().nullable(),costUsd:z.number().nonnegative().nullable()}).strict().optional()}).strict()
export type RadarPresenceResolution={websiteUrl?:string;scope:'establishment'|'group'|'unresolved';reason:string;claims:Array<{evidenceId:string;excerpt:string;sourceUrl:string;observedAt:string}>;provider?:string;model?:string;usage?:{inputTokens:number|null;outputTokens:number|null;costUsd:number|null}}
export function validateRadarPresenceResolution(value:unknown,identity:RadarBusinessIdentity,evidence:RadarPresenceEvidence[]):RadarPresenceResolution{
  const parsed=schema.safeParse(value)
  const fail=(code='radar_presence_unverifiable')=>{throw new Error(code)}
  if(!parsed.success)return fail()
  const result=parsed.data,byId=new Map(evidence.map(item=>[item.id,item]))
  if(byId.size!==evidence.length)return fail()
  const claims=result.claims.map(claim=>{const source=byId.get(claim.evidenceId);if(!source||!source.text.includes(claim.excerpt))return fail();return{...claim,sourceUrl:source.url,observedAt:source.observedAt}})
  if(result.candidateId===null)return{scope:'unresolved',reason:result.reason,claims,usage:result.usage}
  const page=byId.get(result.candidateId)
  if(!page||page.kind!=='institutional_candidate'||!isRadarInstitutionalSource(page.url,{text:page.text})||!claims.some(claim=>claim.evidenceId===page.id))return fail()
  const cnpjs=[...page.text.matchAll(/\b\d{2}[. ]?\d{3}[. ]?\d{3}[/ ]?\d{4}[- ]?\d{2}\b/g)].map(match=>match[0].replace(/\D/g,''))
  const expected=identity.cnpj?.replace(/\D/g,'')
  if(expected&&cnpjs.some(value=>value!==expected&&(result.scope==='establishment'||value.slice(0,8)!==expected.slice(0,8))))return fail('radar_presence_scope_conflict')
  return{websiteUrl:result.scope==='unresolved'?undefined:page.url,scope:result.scope,reason:result.reason,claims,provider:result.provider,model:result.model,usage:result.usage}
}
