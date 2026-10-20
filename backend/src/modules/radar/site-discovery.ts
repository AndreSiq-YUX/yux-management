import { normalizeRadarText } from './search-configuration.js'
import { publicRadarUrl, type RadarWebHit } from './web-search.js'
import {classifyRadarSource,isRadarInstitutionalSource} from './source-identity.js'
import {radarResearchQueries} from './research-planner.js'
import {hasRadarSearchCapacity,type RadarSearchCapacity,type RadarSearchSource,type RadarWebSearchSource} from './search-capacity.js'
import {extractRadarCnpjIdentifiers,normalizeRadarCnpjIdentifier} from './cnpj-identifier.js'
import {rethrowRadarAdaptiveYield} from './adaptive-research.js'
export type RadarBusinessIdentity = { name: string; legalName?: string; cnpj?: string; city?: string; state?: string; address?: string; phone?: string; websiteUrl?: string }
export type RadarPresenceDiscovery = { association: 'confirmed' | 'review' | 'not_found_in_consulted_sources' | 'blocked';
  websiteUrl?: string; hits: RadarWebHit[]; suggestions: RadarWebHit[]; limitations: string[]; queries: number }
export type RadarIdentityMatch = { association: 'confirmed' | 'review'; scope: 'establishment' | 'group' | 'unresolved'; reasons: string[] }
export function compareRadarBusinessIdentity(identity: RadarBusinessIdentity, content: string): RadarIdentityMatch {
  const text = normalizeRadarText(content)
  const cnpjs = extractRadarCnpjIdentifiers(content)
  if (identity.cnpj && cnpjs.length) {
    const expected = normalizeRadarCnpjIdentifier(identity.cnpj)
    if(!expected)return {association:'review',scope:'unresolved',reasons:['Identificador cadastral inválido; conferir a identidade.']}
    if (cnpjs.every(value => value === expected)) return {association:'confirmed',scope:'establishment',reasons:['CNPJ do estabelecimento presente na fonte.']}
    return {association:'review',scope:cnpjs.some(value=>value.slice(0,8)===expected.slice(0,8))?'group':'unresolved',reasons:['A fonte menciona CNPJ diferente; conferir estabelecimento e grupo.']}
  }
  const names = [identity.name, identity.legalName].filter((name): name is string => !!name)
  const named = names.some(name => {
    const normalized=normalizeRadarText(name)
    const brand=normalized.split(' ').filter(token=>!['empresa','ltda','limitada','sa','me','epp','de','da','do','das','dos','e','servicos','comercio','industria'].includes(token)).slice(0,2)
    return normalized.length>=4&&text.includes(normalized)||brand.join('').length>=5&&new RegExp(`\\b${brand.join('\\s*')}\\b`).test(text)
  })
  const located = !!identity.city && !!identity.state && text.includes(normalizeRadarText(identity.city)) && new RegExp(`\\b${identity.state.toLowerCase()}\\b`).test(text)
  const canonicalAddress = (value:string) => normalizeRadarText(value).replace(/\b(avenida|av)\b/g,'av').replace(/\b(rua|r)\b/g,'r').replace(/\b(rodovia|rod)\b/g,'rod')
  // Compare street + street number, not registry punctuation, district, ZIP or room.
  const address = canonicalAddress(identity.address ?? '').match(/^(.+?)\s+(\d+)\b/)
  const addressed = !!address && address[1].length >= 5 && new RegExp(`\\b${address[1]}\\s+${address[2]}\\b`).test(canonicalAddress(content))
  const phone = (identity.phone ?? '').replace(/\D/g, '')
  const called = phone.length >= 10 && content.replace(/\D/g, '').includes(phone)
  return named && located && (addressed || called)
    ? {association:'confirmed',scope:'establishment',reasons:[`Nome, cidade/UF e ${addressed?'rua/número':'telefone cadastral'} corroborados.`]}
    : {association:'review',scope:'unresolved',reasons:['Nome e região sem outro identificador não confirmam a empresa.']}
}
export function matchRadarBusinessIdentity(identity: RadarBusinessIdentity, content: string): 'confirmed' | 'review' {
  return compareRadarBusinessIdentity(identity,content).association
}
export function isRadarSocialUrl(value: string) {
  try { return /(^|\.)(instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com|wa\.me|whatsapp\.com)$/.test(new URL(value).hostname) } catch { return false }
}
export function isRadarReferenceUrl(value:string) {
  return classifyRadarSource(value).kind!=='institutional_candidate'
}
export async function discoverRadarBusinessPresence(identity: RadarBusinessIdentity,
  policy: { maxSearchQueriesPerCandidate: number; webSearchEnabled: boolean;webSearchProviders?:RadarWebSearchSource[];localSearchOrder?:'before_web'|'after_web_if_needed'|'disabled' },
  dependencies: { search: (query: string,source?:RadarWebSearchSource) => Promise<RadarWebHit[]>; local?: () => Promise<RadarWebHit[]>;
    searchCapacity?:()=>RadarSearchCapacity;searchAttempted?:(source:RadarSearchSource,query:string)=>boolean;
    inspectCandidates?:(hits:RadarWebHit[])=>Promise<boolean>;
    checkpoint?: (hits: RadarWebHit[], queries: number) => Promise<void>; initialHits?: RadarWebHit[]; initialQueries?: number;queriesUsed?:()=>number }): Promise<RadarPresenceDiscovery> {
  const hits = [...(dependencies.initialHits ?? [])]
  const limitations: string[] = []
  let queries = dependencies.initialQueries ?? 0
  const queriesText = radarResearchQueries(identity)
  const order=policy.localSearchOrder??'before_web'
  const webBudget=order==='after_web_if_needed'&&dependencies.local?Math.max(1,policy.maxSearchQueriesPerCandidate-1):policy.maxSearchQueriesPerCandidate
  let plausible=false
  const confirmed = () => hits.filter(hit => isRadarInstitutionalSource(hit.url,{title:hit.title,text:hit.snippets.join(' ')})&&matchRadarBusinessIdentity(identity, `${hit.title} ${hit.snippets.join(' ')}`) === 'confirmed')
  if(dependencies.searchCapacity){
    const attempted=new Set<string>()
    const canSearch=(source:RadarSearchSource,query:string)=>hasRadarSearchCapacity(dependencies.searchCapacity!(),source)
      &&!attempted.has(`${source}:${query}`)&&!dependencies.searchAttempted?.(source,query)
    const local=async()=>{
      if(!dependencies.local||!canSearch('brave_place_search',identity.name))return
      attempted.add(`brave_place_search:${identity.name}`)
      queries++
      try{hits.push(...await dependencies.local())}catch(cause){rethrowRadarAdaptiveYield(cause);limitations.push(cause instanceof Error?cause.message:'local_search_failed')}
      queries=dependencies.queriesUsed?.()??queries
      await dependencies.checkpoint?.(hits,queries)
    }
    if(order==='before_web')await local()
    if(policy.webSearchEnabled)for(const query of queriesText){
      for(const source of policy.webSearchProviders??['brave_web_search']){
        if(confirmed().length||plausible)break
        if(!canSearch(source,query))continue
        attempted.add(`${source}:${query}`);queries++
        try{hits.push(...await dependencies.search(query,source))}catch(cause){rethrowRadarAdaptiveYield(cause);limitations.push(cause instanceof Error?cause.message:'web_search_failed')}
        queries=dependencies.queriesUsed?.()??queries
        await dependencies.checkpoint?.(hits,queries)
        plausible=await dependencies.inspectCandidates?.(hits)??false
      }
      if(confirmed().length||plausible)break
    }
    if(order==='after_web_if_needed'&&!plausible&&!confirmed().length)await local()
  }else{
  // One local query plus complementary web queries share a single cap, including previously reserved attempts.
  if (dependencies.local && order==='before_web' && queries === 0) {
    queries++
    try { hits.push(...await dependencies.local()) } catch (error) { rethrowRadarAdaptiveYield(error);limitations.push(error instanceof Error ? error.message : 'local_search_failed') }
    queries=dependencies.queriesUsed?.()??queries
    await dependencies.checkpoint?.(hits, queries)
  }
  for (let index = Math.max(0,queries-(dependencies.local&&order==='before_web'?1:0)); policy.webSearchEnabled && queries < webBudget && index < queriesText.length; index++) {
    if (confirmed().length) break
    queries++
    try { hits.push(...await dependencies.search(queriesText[index])) } catch (error) { rethrowRadarAdaptiveYield(error);limitations.push(error instanceof Error ? error.message : 'web_search_failed'); break }
    queries=dependencies.queriesUsed?.()??queries
    await dependencies.checkpoint?.(hits, queries)
    if(await dependencies.inspectCandidates?.(hits)){plausible=true;break}
  }
  if(dependencies.local&&order==='after_web_if_needed'&&!plausible&&!confirmed().length&&queries<policy.maxSearchQueriesPerCandidate){
    queries++
    try{hits.push(...await dependencies.local())}catch(error){rethrowRadarAdaptiveYield(error);limitations.push(error instanceof Error?error.message:'local_search_failed')}
    queries=dependencies.queriesUsed?.()??queries
    await dependencies.checkpoint?.(hits,queries)
  }
  }
  const unique = [...new Map(hits.map(hit => [hit.url, hit])).values()].sort((a,b)=>Number(isRadarInstitutionalSource(b.url,{title:b.title,text:b.snippets.join(' ')}))-Number(isRadarInstitutionalSource(a.url,{title:a.title,text:a.snippets.join(' ')})))
  const sites = [...new Map(confirmed().filter(hit => !isRadarReferenceUrl(hit.url)).map(hit => [new URL(hit.url).hostname.replace(/^www\./, ''), hit])).values()]
  const websiteUrl = sites.length === 1 ? publicRadarUrl(sites[0].url) : undefined
  return { association: websiteUrl ? 'confirmed' : unique.length ? 'review' : limitations.length ? 'blocked' : 'not_found_in_consulted_sources',
    websiteUrl, hits: unique, suggestions: unique.filter(hit => hit.url !== websiteUrl), limitations, queries }
}
