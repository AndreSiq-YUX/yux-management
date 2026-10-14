import sanitizeHtml from 'sanitize-html'
import { inspectRadarBusinessSite } from './b2b-site-inspection.js'
import type { RadarReadDiagnostic } from './site-read-errors.js'
import type {RadarExpiredCertificate,RadarTlsExceptionEvidence,RadarTlsReadOptions} from './site-tls-exception.js'
export type RadarSiteEvidence = { url: string; observedAt: string; text: string; html?: string; limitation?: string; diagnostic?:RadarReadDiagnostic; certificate?:RadarExpiredCertificate; tlsException?:RadarTlsExceptionEvidence;linkedFromUrl?:string }
export const RADAR_READER_VERSION = 3
export function isRetryableRadarPage(page: RadarSiteEvidence) {
  return !!page.limitation && /^(robots_unavailable|robots_transport_failed|robots_timeout|(?:robots_)?tls_(?:expired|invalid)|(?:robots_)?connection_(?:reset|refused)|dns_(?:failed|dns)|request_failed|timeout|response_interrupted|empty_or_oversized_page|page_too_large|http_429|http_5\d\d)$/.test(page.limitation)
}
function usefulLinks(html:string, base:string, origin:string) {
  return radarHtmlLinks(html).flatMap(link=>{
    try {
      const target=new URL(link,base);target.hash=''
      return target.origin===origin && !target.search
        && /contat|contact|sobre|about|empresa|servic|solu[cç]|fornecedor|supplier|institucional|quem-somos|^\/a-/i.test(target.pathname)
        && !/\.(pdf|zip|png|jpg|jpeg|svg)$/i.test(target.pathname) ? [target.toString()] : []
    } catch {return []}
  }).sort((a,b)=>linkPriority(b)-linkPriority(a))
}
function linkPriority(url:string) {
  const path=new URL(url).pathname
  if (/vaga|recrut|carreira|trabalhe/i.test(path)) return -1
  if (/fornecedor|supplier/i.test(path)) return 4
  if (/contat|contact/i.test(path)) return 3
  if (/sobre|about|empresa|institucional|quem-somos|^\/a-/i.test(path)) return 2
  return 1
}
export function radarHtmlLinks(html: string) {
  const links: string[] = []
  sanitizeHtml(html, { allowedTags: ['a'], allowedAttributes: { a: ['href'] }, transformTags: { a: (tagName, attribs) => {
    if (attribs.href) links.push(attribs.href); return { tagName, attribs }
  } } })
  return links.slice(0, 300)
}
export async function collectRadarSiteEvidence(url: string, policy: { maxPagesPerCandidate: number;maxAttemptsPerCandidate?:number },
  dependencies: { inspect?: typeof inspectRadarBusinessSite; signal?: AbortSignal;
    tlsOptions?:(hostname:string)=>Promise<RadarTlsReadOptions|undefined>;
    initialPages?: RadarSiteEvidence[]; checkpoint?: (pages: RadarSiteEvidence[]) => Promise<void>;deadlineAt?:number } = {}): Promise<RadarSiteEvidence[]> {
  const pages: RadarSiteEvidence[] = [...(dependencies.initialPages ?? [])]
  const origin = new URL(url).origin
  const pending = [url, ...pages.flatMap(page => usefulLinks(page.html ?? '',page.url,origin))]
  const seen = new Set(pages.map(page => page.url))
  const deadline = dependencies.deadlineAt??Date.now() + 110_000
  const maxAttempts=policy.maxAttemptsPerCandidate??policy.maxPagesPerCandidate*2
  for (let index = 0; index < pending.length && pages.filter(page=>!page.limitation).length < policy.maxPagesPerCandidate && pages.length<maxAttempts; index++) {
    if (dependencies.signal?.aborted || Date.now() > deadline) break
    const target = pending[index]
    if (seen.has(target)) continue
    seen.add(target)
    const result = await (dependencies.inspect ?? inspectRadarBusinessSite)(target,{tlsOptions:dependencies.tlsOptions})
    const page = { url: result.finalUrl ?? target, observedAt: result.checkedAt, text: result.text ?? '', html: result.html,
      diagnostic:result.diagnostic,certificate:result.certificate,tlsException:result.tlsException,
      limitation: result.status === 'verified_present' && (result.text?.length ?? 0) > 30 ? undefined : result.reason ?? 'limited_public_content' }
    pages.push(page)
    await dependencies.checkpoint?.(pages)
    if (result.status !== 'verified_present') continue
    const links = usefulLinks(result.html ?? '',page.url,new URL(page.url).origin)
    pending.push(...links)
  }
  return pages
}
