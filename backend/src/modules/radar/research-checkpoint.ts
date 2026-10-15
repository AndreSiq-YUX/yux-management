import type {RadarWebHit} from './web-search.js'
import type {RadarSiteEvidence} from './site-evidence.js'
import {isRadarInstitutionalSource} from './source-identity.js'

export function canonicalRadarReadUrl(value:string):string|undefined {
  try{const url=new URL(value);if(!['http:','https:'].includes(url.protocol)||url.username||url.password)return
    url.hash='';for(const key of [...url.searchParams.keys()])if(/^utm_|^(?:gclid|fbclid)$/i.test(key))url.searchParams.delete(key)
    return url.toString()
  }catch{return}
}
export function pendingRadarReadUrls(hits:RadarWebHit[],pages:RadarSiteEvidence[],maxPages:number):string[] {
  const seen=new Set(pages.map(page=>canonicalRadarReadUrl(page.url)))
  const remaining=Math.max(0,maxPages-pages.filter(page=>!page.limitation).length)
  return [...new Set(hits.filter(hit=>isRadarInstitutionalSource(hit.url,{title:hit.title,text:hit.snippets.join(' ')}))
    .map(hit=>canonicalRadarReadUrl(hit.url)).filter((url):url is string=>!!url&&!seen.has(url)))].slice(0,remaining)
}
