import type {RadarSiteEvidence} from './site-evidence.js'
/** Retry cleanup must not erase the diagnostic needed for explicit TLS consent.
 * History is evidence only: authorizing still reprobes and pins the certificate. */
export function radarTlsEvidencePages(run:{output?:{pages?:RadarSiteEvidence[];historicalEvidence?:{pages?:RadarSiteEvidence[]}};calls?:Record<string,{source?:string;status?:string;result?:unknown}>}):RadarSiteEvidence[]{
 const current=run.output?.pages??[],byUrl=new Map(current.map(page=>[page.url,page]))
 const history=[...(run.output?.historicalEvidence?.pages??[]),...Object.values(run.calls??{}).flatMap(call=>call.source==='public_read'&&call.status==='completed'&&Array.isArray(call.result)?call.result as RadarSiteEvidence[]:[])]
 for(const page of history){
  if(typeof page?.url!=='string'||page.diagnostic?.kind!=='tls_expired'||!page.certificate)continue
  const existing=byUrl.get(page.url)
  if(!existing||existing.diagnostic?.kind==='tls_expired'&&Date.parse(page.observedAt)>Date.parse(existing.observedAt))byUrl.set(page.url,page)
 }
 return[...byUrl.values()]
}
