import type {RadarSiteEvidence} from './site-evidence.js'
/** Retry cleanup must not erase the diagnostic needed for explicit TLS consent.
 * History is evidence only: authorizing still reprobes and pins the certificate. */
export function radarTlsEvidencePages(run:{output?:{pages?:RadarSiteEvidence[]};calls?:Record<string,{source?:string;status?:string;result?:unknown}>}):RadarSiteEvidence[]{
 const current=run.output?.pages??[],byUrl=new Map(current.map(page=>[page.url,page]))
 for(const call of Object.values(run.calls??{}))if(call.source==='public_read'&&call.status==='completed'&&Array.isArray(call.result))for(const page of call.result as RadarSiteEvidence[]){
  if(typeof page?.url!=='string'||page.diagnostic?.kind!=='tls_expired'||!page.certificate)continue
  const existing=byUrl.get(page.url)
  if(!existing||existing.diagnostic?.kind==='tls_expired'&&Date.parse(page.observedAt)>Date.parse(existing.observedAt))byUrl.set(page.url,page)
 }
 return[...byUrl.values()]
}
