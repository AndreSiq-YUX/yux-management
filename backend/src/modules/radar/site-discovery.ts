import { normalizeRadarText } from './search-configuration.js'
import { publicRadarUrl, type RadarWebHit } from './web-search.js'
export type RadarBusinessIdentity = { name: string; legalName?: string; cnpj?: string; city?: string; state?: string; address?: string; phone?: string; websiteUrl?: string }
export type RadarPresenceDiscovery = { association: 'confirmed' | 'review' | 'not_found_in_consulted_sources' | 'blocked';
  websiteUrl?: string; hits: RadarWebHit[]; suggestions: RadarWebHit[]; limitations: string[]; queries: number }
export function matchRadarBusinessIdentity(identity: RadarBusinessIdentity, content: string): 'confirmed' | 'review' {
  const text = normalizeRadarText(content)
  const cnpjs = [...content.matchAll(/\b\d{2}[. ]?\d{3}[. ]?\d{3}[/ ]?\d{4}[- ]?\d{2}\b/g)].map(match => match[0].replace(/\D/g, ''))
  if (identity.cnpj && cnpjs.includes(identity.cnpj.replace(/\D/g, ''))) return 'confirmed'
  // A different establishment of the same group is not corroboration for this branch.
  if (identity.cnpj && cnpjs.some(value => value.slice(0, 8) === identity.cnpj!.replace(/\D/g, '').slice(0, 8))) return 'review'
  const names = [identity.name, identity.legalName].filter((name): name is string => !!name)
  const named = names.some(name => normalizeRadarText(name).length >= 4 && text.includes(normalizeRadarText(name)))
  const located = !!identity.city && !!identity.state && text.includes(normalizeRadarText(identity.city)) && new RegExp(`\\b${identity.state.toLowerCase()}\\b`).test(text)
  const address = normalizeRadarText(identity.address ?? '')
  const addressed = address.length >= 8 && /\d/.test(address) && text.includes(address)
  const phone = (identity.phone ?? '').replace(/\D/g, '')
  const called = phone.length >= 10 && content.replace(/\D/g, '').includes(phone)
  return named && located && (addressed || called) ? 'confirmed' : 'review'
}
export function isRadarSocialUrl(value: string) {
  try { return /(^|\.)(instagram\.com|facebook\.com|linkedin\.com|youtube\.com|tiktok\.com|wa\.me|whatsapp\.com)$/.test(new URL(value).hostname) } catch { return false }
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
  const confirmed = () => hits.filter(hit => matchRadarBusinessIdentity(identity, `${hit.title} ${hit.snippets.join(' ')}`) === 'confirmed')
  // One local query plus complementary web queries share a single cap, including previously reserved attempts.
  if (dependencies.local && queries === 0) {
    queries++
    try { hits.push(...await dependencies.local()) } catch (error) { limitations.push(error instanceof Error ? error.message : 'local_search_failed') }
    await dependencies.checkpoint?.(hits, queries)
  }
  for (let index = 0; policy.webSearchEnabled && queries < policy.maxSearchQueriesPerCandidate && index < queriesText.length; index++) {
    if (confirmed().some(hit => !isRadarSocialUrl(hit.url))) break
    queries++
    try { hits.push(...await dependencies.search(queriesText[index])) } catch (error) { limitations.push(error instanceof Error ? error.message : 'web_search_failed'); break }
    await dependencies.checkpoint?.(hits, queries)
  }
  const unique = [...new Map(hits.map(hit => [hit.url, hit])).values()]
  const sites = [...new Map(confirmed().filter(hit => !isRadarSocialUrl(hit.url)).map(hit => [new URL(hit.url).hostname.replace(/^www\./, ''), hit])).values()]
  const websiteUrl = sites.length === 1 ? publicRadarUrl(sites[0].url) : undefined
  return { association: websiteUrl ? 'confirmed' : unique.length ? 'review' : limitations.length ? 'blocked' : 'not_found_in_consulted_sources',
    websiteUrl, hits: unique, suggestions: unique.filter(hit => hit.url !== websiteUrl), limitations, queries }
}
