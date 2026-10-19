import type {RadarBusinessIdentity} from './site-discovery.js'
import {matchRadarBusinessIdentity} from './site-discovery.js'
import type {RadarResearchPolicy} from './search-configuration.js'
import {normalizeRadarText} from './search-configuration.js'
import type {RadarWebHit} from './web-search.js'
import type {RadarSiteEvidence} from './site-evidence.js'
import {isRadarInstitutionalSource} from './source-identity.js'
import {pendingRadarReadUrls} from './research-checkpoint.js'
import {hasRadarSearchCapacity,type RadarSearchCapacity,type RadarSearchSource,type RadarWebSearchSource} from './search-capacity.js'

export type RadarResearchGap='identity'|'website'|'contact'|'segment'|'profile'|'size'
export function radarResearchQueries(identity:RadarBusinessIdentity):string[] {
  return [...new Set([identity.name.trim(),(identity.legalName??'').replace(/\b(?:LTDA|LIMITADA|EIRELI|S\.?A\.?)\b/gi,'').trim(),
    `${identity.name} ${identity.city??''} ${identity.state??''}`.trim(),identity.cnpj?`"${identity.cnpj}" site`:''].filter(Boolean))]
}
export function hasUsefulRadarHits(identity:RadarBusinessIdentity,hits:RadarWebHit[]):boolean {
  return hits.some(hit=>{
    const text=`${hit.title} ${hit.snippets.join(' ')}`,normalized=normalizeRadarText(text)
    return isRadarInstitutionalSource(hit.url,{title:hit.title,text})&&(matchRadarBusinessIdentity(identity,text)==='confirmed'
      ||[identity.name,identity.legalName].some(name=>!!name&&normalizeRadarText(name).length>=4&&normalized.includes(normalizeRadarText(name))))
  })
}
export function planRadarResearch(input:{identity:RadarBusinessIdentity;policy:RadarResearchPolicy;hits:RadarWebHit[];pages:RadarSiteEvidence[];queriesUsed:number;missing:RadarResearchGap[];attemptedQueries?:string[];
  searchCapacity?:RadarSearchCapacity;attemptedSearches?:Array<{source:RadarSearchSource;query:string}>;searchAttempted?:(source:RadarSearchSource,query:string)=>boolean}):{next?:{kind:'web'|'local'|'read';query?:string;url?:string;source?:RadarWebSearchSource};stopReason?:string} {
  if(!input.missing.length)return{stopReason:'criteria_met'}
  const pending=pendingRadarReadUrls(input.hits,input.pages,input.policy.maxPagesPerCandidate)
  if(pending.length)return{next:{kind:'read',url:pending[0]}}
  const eligible=(source:RadarSearchSource)=>!input.searchCapacity||hasRadarSearchCapacity(input.searchCapacity,source)
  if(input.searchCapacity?!Object.values(input.searchCapacity.bySource).some(item=>item.remaining>0)||input.searchCapacity.totalRemaining===0:input.queriesUsed>=input.policy.maxSearchQueriesPerCandidate)return{stopReason:'query_limit'}
  const searched=(source:RadarSearchSource,query:string)=>input.searchAttempted?.(source,query)??input.attemptedSearches?.some(item=>item.source===source&&item.query===query)??input.attemptedQueries?.includes(query)??false
  const web=(query:string)=>{
    if(!input.searchCapacity)return!input.attemptedQueries?.includes(query)?{kind:'web' as const,query}:undefined
    const source=input.policy.webSearchProviders.find(source=>eligible(source)&&!searched(source,query))
    return source?{kind:'web' as const,query,source}:undefined
  }
  const official=input.pages.find(page=>!page.limitation&&isRadarInstitutionalSource(page.url,{text:page.text})&&matchRadarBusinessIdentity(input.identity,page.text)==='confirmed')
  if(official&&input.missing.includes('contact')&&input.policy.webSearchEnabled){
    const purpose={suppliers:'fornecedores compras contato',sales:'comercial vendas contato',finance:'financeiro contato',recruitment:'trabalhe conosco vagas',general:'contato fale conosco'}[input.policy.contactPurpose]
    const query=`site:${new URL(official.url).hostname} ${purpose}`
    const next=web(query);if(next)return{next}
  }
  if(input.policy.localSearchOrder==='before_web'&&eligible('brave_place_search')&&!searched('brave_place_search',input.identity.name)&&(!input.queriesUsed||!!input.searchCapacity))return{next:{kind:'local'}}
  if(input.policy.webSearchEnabled){
    const queries=radarResearchQueries(input.identity)
    if(input.searchCapacity){for(const query of queries){const next=web(query);if(next)return{next}}}
    else{const next=input.attemptedQueries?queries.find(query=>!input.attemptedQueries!.includes(query)):queries[input.queriesUsed];if(next)return{next:{kind:'web',query:next}}}
  }
  if(input.policy.localSearchOrder==='after_web_if_needed'&&eligible('brave_place_search')&&!searched('brave_place_search',input.identity.name)&&!official&&!hasUsefulRadarHits(input.identity,input.hits))return{next:{kind:'local'}}
  return{stopReason:'sources_exhausted'}
}
