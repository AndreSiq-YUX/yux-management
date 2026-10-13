import { normalizeRadarText } from './search-configuration.js'
import { publicRadarUrl, type RadarWebHit } from './web-search.js'
import {classifyRadarSource,isRadarInstitutionalSource} from './source-identity.js'
export type RadarBusinessIdentity = { name: string; legalName?: string; cnpj?: string; city?: string; state?: string; address?: string; phone?: string; websiteUrl?: string }
export type RadarPresenceDiscovery = { association: 'confirmed' | 'review' | 'not_found_in_consulted_sources' | 'blocked';
  websiteUrl?: string; hits: RadarWebHit[]; suggestions: RadarWebHit[]; limitations: string[]; queries: number }
export type RadarIdentityMatch = { association: 'confirmed' | 'review'; scope: 'establishment' | 'group' | 'unresolved'; reasons: string[] }
export function compareRadarBusinessIdentity(identity: RadarBusinessIdentity, content: string): RadarIdentityMatch {
  const text = normalizeRadarText(content)
  const cnpjs = [...content.matchAll(/\b\d{2}[. ]?\d{3}[. ]?\d{3}[/ ]?\d{4}[- ]?\d{2}\b/g)].map(match => match[0].replace(/\D/g, ''))
  if (identity.cnpj && cnpjs.length) {
    const expected = identity.cnpj.replace(/\D/g, '')
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
  policy: { maxSearchQueriesPerCandidate: number; webSearchEnabled: boolean },
  dependencies: { search: (query: string) => Promise<RadarWebHit[]>; local?: () => Promise<RadarWebHit[]>;
    checkpoint?: (hits: RadarWebHit[], queries: number) => Promise<void>; initialHits?: RadarWebHit[]; initialQueries?: number }): Promise<RadarPresenceDiscovery> {
  const hits = [...(dependencies.initialHits ?? [])]
  const limitations: string[] = []
  let queries = dependencies.initialQueries ?? 0
  const queriesText = [...new Set([`"${identity.name}" ${identity.city ?? ''} ${identity.state ?? ''} contato`,
    identity.cnpj ? `"${identity.cnpj}" contato site` : '',
    `"${identity.legalName || identity.name}" ${identity.city ?? ''} telefone email`].filter(Boolean))]
  const confirmed = () => hits.filter(hit => isRadarInstitutionalSource(hit.url,{title:hit.title,text:hit.snippets.join(' ')})&&matchRadarBusinessIdentity(identity, `${hit.title} ${hit.snippets.join(' ')}`) === 'confirmed')
  // One local query plus complementary web queries share a single cap, including previously reserved attempts.
  if (dependencies.local && queries === 0) {
    queries++
    try { hits.push(...await dependencies.local()) } catch (error) { limitations.push(error instanceof Error ? error.message : 'local_search_failed') }
    await dependencies.checkpoint?.(hits, queries)
  }
  for (let index = Math.max(0,queries-(dependencies.local?1:0)); policy.webSearchEnabled && queries < policy.maxSearchQueriesPerCandidate && index < queriesText.length; index++) {
    if (confirmed().some(hit => !isRadarReferenceUrl(hit.url))) break
    queries++
    try { hits.push(...await dependencies.search(queriesText[index])) } catch (error) { limitations.push(error instanceof Error ? error.message : 'web_search_failed'); break }
    await dependencies.checkpoint?.(hits, queries)
  }
  const unique = [...new Map(hits.map(hit => [hit.url, hit])).values()]
  const sites = [...new Map(confirmed().filter(hit => !isRadarReferenceUrl(hit.url)).map(hit => [new URL(hit.url).hostname.replace(/^www\./, ''), hit])).values()]
  const websiteUrl = sites.length === 1 ? publicRadarUrl(sites[0].url) : undefined
  return { association: websiteUrl ? 'confirmed' : unique.length ? 'review' : limitations.length ? 'blocked' : 'not_found_in_consulted_sources',
    websiteUrl, hits: unique, suggestions: unique.filter(hit => hit.url !== websiteUrl), limitations, queries }
}
