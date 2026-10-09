import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'
import sanitizeHtml from 'sanitize-html'
import { isPublicRadarSiteIp } from './osm-site-check.js'

type GetResult = { status: number; location?: string; contentType?: string; body?: string }
type Resolve = (hostname: string) => Promise<string[]>
type Get = (url: URL, address: string) => Promise<GetResult>

export type RadarBusinessSiteInspection = {
  status: 'verified_present' | 'unknown' | 'blocked'
  checkedAt: string
  finalUrl?: string
  text?: string
  html?: string
  emails: string[]
  phones: string[]
  reason?: string
}

const MAX_HTML_BYTES = 200_000
const USER_AGENT = 'YUX-Radar-SiteVerification/1.0'

async function resolvePublicIpv4(hostname: string) {
  const values = await dns.lookup(hostname, { all: true, family: 4, verbatim: true })
  return values.map(value => value.address)
}

function getHtml(url: URL, address: string): Promise<GetResult> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(url, {
      method: 'GET', timeout: 8000,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain' },
    }, response => {
      const status = response.statusCode ?? 0
      const location = response.headers.location
      const contentType = response.headers['content-type']
      if (status >= 300 && status < 400 || status < 200 || status >= 400) {
        response.resume()
        resolve({ status, location, contentType })
        return
      }
      let size = 0
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > MAX_HTML_BYTES) {
          request.destroy(new Error('page_too_large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({ status, location, contentType, body: Buffer.concat(chunks).toString('utf8') }))
      response.on('error', reject)
    })
    request.on('timeout', () => request.destroy(new Error('timeout')))
    request.on('error', reject)
    request.end()
  })
}

function robotsBlocksHomepage(body: string, path = '/') {
  let applies = false
  let disallowed = 0
  let allowed = 0
  for (const original of body.split(/\r?\n/)) {
    const line = original.split('#', 1)[0].trim()
    if (!line) continue
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim().toLowerCase()
    const value = line.slice(separator + 1).trim().toLowerCase()
    if (key === 'user-agent') applies = value === '*' || USER_AGENT.toLowerCase().startsWith(value)
    if (applies && value && (key === 'disallow' || key === 'allow')) {
      const expression = value.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')
      const matches = new RegExp(`^${expression}`).test(path)
      if (matches && key === 'disallow') disallowed = Math.max(disallowed, value.length)
      if (matches && key === 'allow') allowed = Math.max(allowed, value.length)
    }
  }
  return disallowed > allowed
}

export async function inspectRadarBusinessSite(
  value: string | null,
  options: { resolve?: Resolve; get?: Get } = {},
): Promise<RadarBusinessSiteInspection> {
  const checkedAt = new Date().toISOString()
  const empty = { checkedAt, emails: [], phones: [] }
  if (!value) return { ...empty, status: 'unknown', reason: 'site_not_found_in_sources' }
  let url: URL
  try { url = new URL(value) } catch { return { ...empty, status: 'blocked', reason: 'invalid_url' } }
  const resolve = options.resolve ?? resolvePublicIpv4
  const get = options.get ?? getHtml
  const checkedRobots = new Set<string>()
  const originalHost = url.hostname.replace(/^www\./i, '').toLowerCase()
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || (url.port && url.port !== '80' && url.port !== '443')
      || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
      return { ...empty, status: 'blocked', reason: 'unsafe_url' }
    }
    let addresses: string[]
    try { addresses = isIP(url.hostname) ? [url.hostname] : await resolve(url.hostname) }
    catch { return { ...empty, status: 'unknown', reason: 'dns_failed' } }
    if (!addresses.length) return { ...empty, status: 'unknown', reason: 'dns_empty' }
    if (!addresses.every(isPublicRadarSiteIp)) return { ...empty, status: 'blocked', reason: 'private_or_reserved_address' }
    if (!checkedRobots.has(url.origin)) {
      const robotsUrl = new URL('/robots.txt', url)
      let robots: GetResult
      try { robots = await get(robotsUrl, addresses[0]) }
      catch { return { ...empty, status: 'unknown', reason: 'robots_unavailable' } }
      if (robots.status === 403 || robots.status === 401) {
        return { ...empty, status: 'blocked', reason: 'robots_access_denied' }
      }
      if (robots.status >= 500) return { ...empty, status: 'unknown', reason: 'robots_unavailable' }
      if (robots.status === 200 && /text\/plain/i.test(robots.contentType ?? '')
        && robotsBlocksHomepage(robots.body ?? '', url.pathname + url.search)) {
        return { ...empty, status: 'blocked', reason: 'robots_disallow' }
      }
      checkedRobots.add(url.origin)
    }
    let response: GetResult
    try { response = await get(url, addresses[0]) }
    catch { return { ...empty, status: 'unknown', reason: 'request_failed' } }
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirects === 2) return { ...empty, status: 'unknown', reason: 'too_many_redirects' }
      try {
        const redirected = new URL(response.location, url)
        if (redirected.hostname === 'localhost' || redirected.hostname.endsWith('.localhost')
          || (isIP(redirected.hostname) && !isPublicRadarSiteIp(redirected.hostname))) {
          return { ...empty, status: 'blocked', reason: 'private_or_reserved_address' }
        }
        if (redirected.hostname.replace(/^www\./i, '').toLowerCase() !== originalHost) {
          return { ...empty, status: 'unknown', reason: 'external_redirect' }
        }
        url = redirected
      }
      catch { return { ...empty, status: 'unknown', reason: 'invalid_redirect' } }
      continue
    }
    if (response.status < 200 || response.status >= 300) {
      return { ...empty, status: 'unknown', finalUrl: url.toString(), reason: `http_${response.status}` }
    }
    if (!/^(text\/html|text\/plain)/i.test(response.contentType ?? '')) {
      return { ...empty, status: 'blocked', finalUrl: url.toString(), reason: 'unsupported_content_type' }
    }
    if (!response.body || Buffer.byteLength(response.body) > MAX_HTML_BYTES) {
      return { ...empty, status: 'unknown', finalUrl: url.toString(), reason: 'empty_or_oversized_page' }
    }
    const text = sanitizeHtml(response.body, { allowedTags: [], allowedAttributes: {},
      nonTextTags: ['style', 'script', 'textarea', 'noscript'] }).replace(/\s+/g, ' ').trim().slice(0, 20_000)
    const emails = [...new Set(text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? [])].slice(0, 20)
    const phones = [...new Set(text.match(/\(?\d{2}\)?\s?\d{4,5}[-.\s]?\d{4}/g) ?? [])].slice(0, 20)
    return { ...empty, status: 'verified_present', finalUrl: url.toString(), text, html: response.body, emails, phones }
  }
  return { ...empty, status: 'unknown', reason: 'too_many_redirects' }
}
