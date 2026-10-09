import sanitizeHtml from 'sanitize-html'
import { inspectRadarBusinessSite } from './b2b-site-inspection.js'
export type RadarSiteEvidence = { url: string; observedAt: string; text: string; html?: string; limitation?: string }
export function radarHtmlLinks(html: string) {
  const links: string[] = []
  sanitizeHtml(html, { allowedTags: ['a'], allowedAttributes: { a: ['href'] }, transformTags: { a: (tagName, attribs) => {
    if (attribs.href) links.push(attribs.href); return { tagName, attribs }
  } } })
  return links.slice(0, 300)
}
export async function collectRadarSiteEvidence(url: string, policy: { maxPagesPerCandidate: number },
  dependencies: { inspect?: typeof inspectRadarBusinessSite; signal?: AbortSignal;
    initialPages?: RadarSiteEvidence[]; checkpoint?: (pages: RadarSiteEvidence[]) => Promise<void> } = {}): Promise<RadarSiteEvidence[]> {
  const pages: RadarSiteEvidence[] = [...(dependencies.initialPages ?? [])]
  const origin = new URL(url).origin
  const pending = [url, ...pages.flatMap(page => radarHtmlLinks(page.html ?? '').flatMap(link => {
    try { const target = new URL(link, page.url); return target.origin === origin && /contat|contact|sobre|about|empresa|servic/i.test(target.pathname) ? [target.toString()] : [] } catch { return [] }
  }))]
  const seen = new Set(pages.map(page => page.url))
  const deadline = Date.now() + 110_000
  for (let index = 0; index < pending.length && pages.length < policy.maxPagesPerCandidate; index++) {
    if (dependencies.signal?.aborted || Date.now() > deadline) break
    const target = pending[index]
    if (seen.has(target)) continue
    seen.add(target)
    const result = await (dependencies.inspect ?? inspectRadarBusinessSite)(target)
    const page = { url: result.finalUrl ?? target, observedAt: result.checkedAt, text: result.text ?? '', html: result.html,
      limitation: result.status === 'verified_present' && (result.text?.length ?? 0) > 30 ? undefined : result.reason ?? 'limited_public_content' }
    pages.push(page)
    await dependencies.checkpoint?.(pages)
    if (result.status !== 'verified_present') continue
    const links = radarHtmlLinks(result.html ?? '').flatMap(link => {
      try {
        const next = new URL(link, page.url); next.hash = ''
        return next.origin === origin && !next.search && /contat|contact|sobre|about|empresa|servic/i.test(next.pathname)
          && !/\.(pdf|zip|png|jpg|jpeg|svg)$/i.test(next.pathname) ? [next.toString()] : []
      } catch { return [] }
    }).sort((a, b) => Number(/contat|contact/i.test(b)) - Number(/contat|contact/i.test(a)))
    pending.push(...links)
  }
  return pages
}
