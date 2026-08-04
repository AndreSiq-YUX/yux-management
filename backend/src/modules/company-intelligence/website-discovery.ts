import { isIP } from 'node:net'
import { lookup } from 'node:dns/promises'
import { readJinaUrl, type RadarJinaEvidence } from '../radar/jinaClient.js'

type ReadPage = (url: string) => Promise<RadarJinaEvidence>
type ResolveHost = (hostname: string) => Promise<string[]>

const preferredPaths = /\b(sobre|quem-somos|empresa|servicos|servi[cç]os|produtos|solucoes|solu[cç][oõ]es|contato|faq|precos|pre[cç]os|planos|cases|clientes|politica|pol[ií]tica)\b/i

export type DiscoveredWebsitePage = Pick<RadarJinaEvidence, 'title' | 'url' | 'content' | 'description' | 'emails' | 'phones'>

export async function discoverCompanyWebsite(inputUrl: string, options: {
  maxPages?: number
  concurrency?: number
  readPage?: ReadPage
  resolveHost?: ResolveHost
} = {}) {
  const root = normalizePublicUrl(inputUrl)
  await assertPublicHostname(root.hostname, options.resolveHost)
  const readPage = options.readPage || (url => readJinaUrl(url))
  const maxPages = Math.max(1, Math.min(20, options.maxPages || 10))
  const homepage = await readPage(root.toString())
  const candidates = rankSameOriginLinks(root, homepage.links).slice(0, maxPages - 1)
  const pages: DiscoveredWebsitePage[] = [pickPage(homepage, root.toString())]
  const concurrency = Math.max(1, Math.min(5, options.concurrency || 3))
  for (let index = 0; index < candidates.length; index += concurrency) {
    const batch = candidates.slice(index, index + concurrency)
    const results = await Promise.allSettled(batch.map(async url => {
      await assertPublicHostname(new URL(url).hostname, options.resolveHost)
      return pickPage(await readPage(url), url)
    }))
    for (const result of results) if (result.status === 'fulfilled' && result.value.content.trim()) pages.push(result.value)
  }
  return { rootUrl: root.toString(), pages, failedPages: Math.max(0, candidates.length + 1 - pages.length) }
}

export function rankSameOriginLinks(root: URL, links: string[]) {
  const seen = new Set<string>()
  return links.flatMap(value => {
    try {
      const url = new URL(value, root)
      url.hash = ''
      if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== root.hostname) return []
      if (/\.(pdf|jpe?g|png|gif|svg|webp|zip|docx?|xlsx?)$/i.test(url.pathname)) return []
      const normalized = url.toString()
      if (seen.has(normalized) || normalized === root.toString()) return []
      seen.add(normalized)
      const depth = url.pathname.split('/').filter(Boolean).length
      const score = (preferredPaths.test(url.pathname) ? 100 : 0) - depth * 5 - normalized.length / 1000
      return [{ url: normalized, score }]
    } catch {
      return []
    }
  }).sort((left, right) => right.score - left.score).map(item => item.url)
}

export function normalizePublicUrl(value: string) {
  const normalized = /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
  const url = new URL(normalized)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('invalid_company_website_url')
  url.hash = ''
  return url
}

async function assertPublicHostname(hostname: string, resolveHost?: ResolveHost) {
  const normalized = hostname.toLowerCase()
  if (normalized === 'localhost' || normalized.endsWith('.local') || normalized.endsWith('.internal')) throw new Error('private_company_website_url')
  const addresses = isIP(normalized) ? [normalized] : await (resolveHost || defaultResolve)(normalized)
  if (!addresses.length || addresses.some(isPrivateAddress)) throw new Error('private_company_website_url')
}

async function defaultResolve(hostname: string) {
  return (await lookup(hostname, { all: true })).map(item => item.address)
}

function isPrivateAddress(value: string) {
  const address = value.toLowerCase()
  if (address === '::1' || address === '::' || address.startsWith('fc') || address.startsWith('fd') || address.startsWith('fe80:')) return true
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false
  const [a, b] = address.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224
}

function pickPage(page: RadarJinaEvidence, fallbackUrl: string): DiscoveredWebsitePage {
  return {
    title: page.title,
    url: page.url || fallbackUrl,
    content: page.content,
    description: page.description,
    emails: page.emails,
    phones: page.phones,
  }
}
