import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import { isIP } from 'node:net'

export type RadarOsmSiteCheck = {
  status: 'verified_present' | 'unknown' | 'blocked'
  checkedAt: string
  finalUrl?: string
  httpStatus?: number
  reason?: string
}

export function isPublicRadarSiteIp(value: string) {
  if (isIP(value) !== 4) return false
  const parts = value.split('.').map(Number)
  const [a, b, c] = parts
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && (b === 0 && c === 0 || b === 0 && c === 2 || b === 88 && c === 99 || b === 168)) return false
  if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return false
  if (a === 203 && b === 0 && c === 113) return false
  return true
}

type HeadResult = { status: number; location?: string }
type Resolve = (hostname: string) => Promise<string[]>
type Head = (url: URL, address: string) => Promise<HeadResult>

async function defaultResolve(hostname: string) {
  const results = await dns.lookup(hostname, { all: true, verbatim: true })
  return results.map(result => result.address)
}

function defaultHead(url: URL, address: string): Promise<HeadResult> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(url, {
      method: 'HEAD', timeout: 6000,
      lookup: (_hostname, _options, callback) => callback(null, address, 4),
      headers: { 'User-Agent': 'YUX-Radar-SiteCheck/1.0', Accept: '*/*' },
    }, response => {
      response.resume()
      resolve({ status: response.statusCode ?? 0, location: response.headers.location })
    })
    request.on('timeout', () => request.destroy(new Error('timeout')))
    request.on('error', reject)
    request.end()
  })
}

export async function checkRadarOsmSite(value: string | null, options: { resolve?: Resolve; head?: Head } = {}): Promise<RadarOsmSiteCheck> {
  const checkedAt = new Date().toISOString()
  if (!value) return { status: 'unknown', checkedAt, reason: 'site_not_in_source' }
  let url: URL
  try { url = new URL(value) } catch { return { status: 'blocked', checkedAt, reason: 'invalid_url' } }
  const resolve = options.resolve ?? defaultResolve
  const head = options.head ?? defaultHead
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || (url.port && url.port !== '80' && url.port !== '443')
      || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
      return { status: 'blocked', checkedAt, reason: 'unsafe_url' }
    }
    let addresses: string[]
    try { addresses = isIP(url.hostname) ? [url.hostname] : await resolve(url.hostname) }
    catch { return { status: 'unknown', checkedAt, reason: 'dns_failed' } }
    if (addresses.length === 0) return { status: 'unknown', checkedAt, reason: 'dns_empty' }
    if (!addresses.every(isPublicRadarSiteIp)) return { status: 'blocked', checkedAt, reason: 'private_or_reserved_address' }
    let response: HeadResult
    try { response = await head(url, addresses[0]) }
    catch { return { status: 'unknown', checkedAt, reason: 'request_failed' } }
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirects === 2) return { status: 'unknown', checkedAt, reason: 'too_many_redirects' }
      try { url = new URL(response.location, url) }
      catch { return { status: 'unknown', checkedAt, reason: 'invalid_redirect' } }
      continue
    }
    return {
      status: response.status >= 200 && response.status < 400 ? 'verified_present' : 'unknown',
      checkedAt, finalUrl: url.toString(), httpStatus: response.status,
    }
  }
  return { status: 'unknown', checkedAt, reason: 'too_many_redirects' }
}
