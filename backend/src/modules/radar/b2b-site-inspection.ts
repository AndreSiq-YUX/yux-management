import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import type { LookupFunction } from 'node:net'
import { isIP } from 'node:net'
import sanitizeHtml from 'sanitize-html'
import { isPublicRadarSiteIp } from './osm-site-check.js'
import { classifyRadarReadError, type RadarReadDiagnostic } from './site-read-errors.js'
import {createRadarExpiredCertificateAgent,probeRadarExpiredCertificate,type RadarTlsReadOptions,type RadarTlsExceptionEvidence,type RadarExpiredCertificate} from './site-tls-exception.js'

type GetResult = { status: number; location?: string; contentType?: string; body?: string; tlsException?:RadarTlsExceptionEvidence }
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
  diagnostic?: RadarReadDiagnostic
  certificate?:RadarExpiredCertificate
  tlsException?:RadarTlsExceptionEvidence
}

const MAX_HTML_BYTES = 2 * 1024 * 1024
const MAX_ROBOTS_BYTES = 256 * 1024
const USER_AGENT = 'YUX-Radar-SiteVerification/1.0'

async function resolvePublicIpv4(hostname: string) {
  const values = await dns.lookup(hostname, { all: true, family: 4, verbatim: true })
  return values.map(value => value.address)
}

export function createRadarPinnedLookup(address: string): LookupFunction {
  return (_hostname, options, callback) => {
    const family = isIP(address)
    if (!family) { callback(new Error('invalid_pinned_address'), '', 0); return }
    if (options.all) callback(null, [{ address, family }])
    else callback(null, address, family)
  }
}

// Only call after public-IP validation. Exported for native-transport regression tests.
export async function getRadarPublicPage(url: URL, address: string, options:RadarTlsReadOptions={}): Promise<GetResult> {
  const deadline=Date.now()+8000
  try {return await requestRadarPublicPage(url,address,{},8000)}
  catch(cause) {
    if(url.protocol!=='https:'||!options.tlsException||(cause as NodeJS.ErrnoException)?.code!=='CERT_HAS_EXPIRED')throw cause
    const remaining=deadline-Date.now();if(remaining<=0)throw new Error('timeout')
    return requestRadarPublicPage(url,address,options,remaining)
  }
}
function requestRadarPublicPage(url:URL,address:string,options:RadarTlsReadOptions,timeout:number):Promise<GetResult> {
  return new Promise((resolve, reject) => {
    const agent=options.tlsException?createRadarExpiredCertificateAgent(url,address,options):undefined
    const tlsException=options.tlsException?{grantId:options.tlsException.id,hostname:options.tlsException.hostname,
      fingerprint256:options.tlsException.fingerprint256,observedAt:new Date().toISOString()}:undefined
    const maxBytes = url.pathname === '/robots.txt' ? MAX_ROBOTS_BYTES : MAX_HTML_BYTES
    const transport = url.protocol === 'https:' ? https : http
    const request = transport.request(url, {
      method: 'GET', timeout,
      lookup: createRadarPinnedLookup(address),
      ...(url.protocol==='https:'?{rejectUnauthorized:true,agent}:{}),
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,text/plain' },
    }, response => {
      const status = response.statusCode ?? 0
      const location = response.headers.location
      const contentType = response.headers['content-type']
      if (status >= 300 && status < 400 || status < 200 || status >= 400) {
        response.resume()
        resolve({ status, location, contentType, tlsException })
        return
      }
      let size = 0
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => {
        size += chunk.length
        if (size > maxBytes) {
          request.destroy(new Error('page_too_large'))
          return
        }
        chunks.push(chunk)
      })
      response.on('end', () => resolve({ status, location, contentType, tlsException, body: Buffer.concat(chunks).toString('utf8') }))
      response.on('error', reject)
      response.on('aborted', () => reject(new Error('response_interrupted')))
    })
    const deadline=setTimeout(()=>request.destroy(new Error('timeout')),timeout)
    request.once('close',()=>{clearTimeout(deadline);agent?.destroy()})
    request.on('timeout', () => request.destroy(new Error('timeout')))
    request.on('error', reject)
    request.end()
  })
}

function robotsBlocksHomepage(body: string, path = '/') {
  const groups:Array<{agents:string[];rules:Array<{key:string;value:string}>}>=[]
  let group={agents:[] as string[],rules:[] as Array<{key:string;value:string}>}
  for(const original of body.split(/\r?\n/)) {
    const line=original.split('#',1)[0].trim(),separator=line.indexOf(':')
    if(separator<0)continue
    const key=line.slice(0,separator).trim().toLowerCase(),value=line.slice(separator+1).trim()
    if(key==='user-agent') {
      if(group.rules.length){groups.push(group);group={agents:[],rules:[]}}
      group.agents.push(value.toLowerCase())
    } else if(group.agents.length&&(key==='allow'||key==='disallow'))group.rules.push({key,value})
  }
  groups.push(group)
  const matching=groups.filter(item=>item.agents.some(agent=>agent==='*'||USER_AGENT.toLowerCase().startsWith(agent)))
  const specific=matching.filter(item=>item.agents.some(agent=>agent!=='*'&&USER_AGENT.toLowerCase().startsWith(agent)))
  let disallowed = 0
  let allowed = 0
  for (const {key,value} of (specific.length?specific:matching).flatMap(item=>item.rules)) {
    if (value) {
      const anchored=value.endsWith('$')
      const expression = (anchored?value.slice(0,-1):value).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*')+(anchored?'$':'')
      const matches = new RegExp(`^${expression}`).test(path)
      if (matches && key === 'disallow') disallowed = Math.max(disallowed, value.length)
      if (matches && key === 'allow') allowed = Math.max(allowed, value.length)
    }
  }
  return disallowed > allowed
}

export async function inspectRadarBusinessSite(
  value: string | null,
  options: { resolve?: Resolve; get?: Get; probe?:typeof probeRadarExpiredCertificate; tlsOptions?:(hostname:string)=>Promise<RadarTlsReadOptions|undefined> } = {},
): Promise<RadarBusinessSiteInspection> {
  const checkedAt = new Date().toISOString()
  const empty = { checkedAt, emails: [], phones: [] }
  if (!value) return { ...empty, status: 'unknown', reason: 'site_not_found_in_sources' }
  let url: URL
  try { url = new URL(value) } catch { return { ...empty, status: 'blocked', reason: 'invalid_url' } }
  const resolve = options.resolve ?? resolvePublicIpv4
  const get = options.get ?? (async(url:URL,address:string)=>getRadarPublicPage(url,address,await options.tlsOptions?.(url.hostname)))
  const failure=async(cause:unknown,stage:'robots'|'page',target:URL,address:string):Promise<RadarBusinessSiteInspection>=>{
    const result:RadarBusinessSiteInspection={...empty,status:'unknown',finalUrl:target.toString(),...classifyRadarReadError(cause,stage)}
    if(result.diagnostic?.kind==='tls_expired'&&(options.probe||!options.get)) {
      try {result.certificate=await (options.probe??probeRadarExpiredCertificate)(target,address)}catch{/* Other TLS defects never receive approval. */}
    }
    return result
  }
  let tlsException:RadarTlsExceptionEvidence|undefined
  const checkedRobots = new Map<string,string>()
  const originalHost = url.hostname.replace(/^www\./i, '').toLowerCase()
  for (let redirects = 0; redirects <= 2; redirects++) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password
      || (url.port && url.port !== '80' && url.port !== '443')
      || url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
      return { ...empty, status: 'blocked', reason: 'unsafe_url' }
    }
    let addresses: string[]
    try { addresses = isIP(url.hostname) ? [url.hostname] : await resolve(url.hostname) }
    catch(cause) { return { ...empty, status: 'unknown', ...classifyRadarReadError(cause,'dns') } }
    if (!addresses.length) return { ...empty, status: 'unknown', reason: 'dns_empty' }
    if (!addresses.every(isPublicRadarSiteIp)) return { ...empty, status: 'blocked', reason: 'private_or_reserved_address' }
    if (!checkedRobots.has(url.origin)) {
      const robotsUrl = new URL('/robots.txt', url)
      let robots: GetResult
      try { robots = await get(robotsUrl, addresses[0]) }
      catch (cause) { return failure(cause,'robots',url,addresses[0]) }
      tlsException=robots.tlsException??tlsException
      if (robots.status === 403 || robots.status === 401) {
        return { ...empty, status: 'blocked', reason: 'robots_access_denied' }
      }
      if (robots.status >= 500) return { ...empty, status: 'unknown', reason: 'robots_unavailable' }
      if (robots.status >= 300 && robots.status < 400) return { ...empty, status:'unknown',reason:'robots_redirect_requires_review' }
      checkedRobots.set(url.origin,robots.status===200 ? robots.body??'':'')
    }
    if(robotsBlocksHomepage(checkedRobots.get(url.origin)??'',url.pathname+url.search))return {...empty,status:'blocked',reason:'robots_disallow'}
    let response: GetResult
    try { response = await get(url, addresses[0]) }
    catch (cause) { return failure(cause,'page',url,addresses[0]) }
    tlsException=response.tlsException??tlsException
    if (response.status >= 300 && response.status < 400 && response.location) {
      if (redirects === 2) return { ...empty, status: 'unknown', reason: 'too_many_redirects' }
      try {
        const redirected = new URL(response.location, url)
        if(url.protocol==='https:'&&redirected.protocol==='http:')return {...empty,status:'blocked',reason:'https_downgrade_blocked'}
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
    return { ...empty, status: 'verified_present', finalUrl: url.toString(), text, html: response.body, emails, phones, tlsException }
  }
  return { ...empty, status: 'unknown', reason: 'too_many_redirects' }
}
