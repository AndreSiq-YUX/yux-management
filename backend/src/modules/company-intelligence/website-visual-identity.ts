import type { ResolveHost } from './website-discovery.js'
import { assertPublicHostname, normalizePublicUrl } from './website-discovery.js'

type FetchLike = typeof fetch

export type WebsiteVisualSignals = {
  logoUrl?: string
  colors: string[]
  typography: string[]
  evidenceText: string
}

export async function inspectWebsiteVisualIdentity(inputUrl: string, options: {
  fetchImpl?: FetchLike
  resolveHost?: ResolveHost
  maxStylesheets?: number
} = {}): Promise<WebsiteVisualSignals> {
  const root = normalizePublicUrl(inputUrl)
  const fetchImpl = options.fetchImpl || fetch
  const homepage = await fetchPublicText(root, fetchImpl, options.resolveHost)
  const stylesheetUrls = extractStylesheetUrls(homepage.text, homepage.url)
    .filter(url => url.hostname === homepage.url.hostname)
    .slice(0, Math.max(0, Math.min(8, options.maxStylesheets ?? 4)))
  const stylesheets = await Promise.allSettled(
    stylesheetUrls.map(url => fetchPublicText(url, fetchImpl, options.resolveHost)),
  )
  const css = stylesheets
    .filter((result): result is PromiseFulfilledResult<{ url: URL; text: string }> => result.status === 'fulfilled')
    .map(result => result.value.text)
    .join('\n')
  const combined = `${homepage.text}\n${css}`
  const logoUrl = extractLogoUrl(homepage.text, homepage.url)
  const colors = extractFrequentColors(combined)
  const typography = extractTypography(combined)
  const evidenceLines = [
    logoUrl ? `Logo detectado: ${logoUrl}` : '',
    colors.length ? `Cores detectadas no site: ${colors.join(', ')}` : '',
    typography.length ? `Tipografias detectadas no site: ${typography.join(', ')}` : '',
  ].filter(Boolean)

  return { logoUrl, colors, typography, evidenceText: evidenceLines.join('\n') }
}

async function fetchPublicText(url: URL, fetchImpl: FetchLike, resolveHost?: ResolveHost) {
  let current = new URL(url)
  for (let redirects = 0; redirects <= 4; redirects += 1) {
    await assertPublicHostname(current.hostname, resolveHost)
    const response = await fetchImpl(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'YUX-Company-Intelligence/1.0', Accept: 'text/html,text/css;q=0.9' },
      signal: AbortSignal.timeout(12_000),
    })
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (!location) throw new Error('website_visual_redirect_without_location')
      current = new URL(location, current)
      continue
    }
    if (!response.ok) throw new Error(`website_visual_request_failed_${response.status}`)
    return { url: current, text: (await response.text()).slice(0, 1_500_000) }
  }
  throw new Error('website_visual_redirect_limit')
}

function extractStylesheetUrls(html: string, baseUrl: URL) {
  const urls: URL[] = []
  for (const tag of html.match(/<link\b[^>]*>/gi) || []) {
    if (!/rel=["'][^"']*stylesheet/i.test(tag)) continue
    const href = attribute(tag, 'href')
    if (!href) continue
    try { urls.push(new URL(href, baseUrl)) } catch { /* Ignore malformed stylesheet links. */ }
  }
  return urls
}

function extractLogoUrl(html: string, baseUrl: URL) {
  const candidates: Array<{ url: string; score: number }> = []
  for (const tag of html.match(/<(?:img|source|link)\b[^>]*>/gi) || []) {
    const rel = attribute(tag, 'rel') || ''
    const alt = attribute(tag, 'alt') || ''
    const className = attribute(tag, 'class') || ''
    const id = attribute(tag, 'id') || ''
    const source = attribute(tag, 'src') || attribute(tag, 'href') || ''
    if (!source || source.startsWith('data:')) continue
    const searchable = `${rel} ${alt} ${className} ${id} ${source}`.toLowerCase()
    let score = 0
    if (/\blogo\b/.test(searchable)) score += 100
    if (/apple-touch-icon|icon/.test(rel)) score += 30
    if (/header|brand/.test(searchable)) score += 20
    if (!score) continue
    try { candidates.push({ url: new URL(source, baseUrl).toString(), score }) } catch { /* Ignore malformed asset URLs. */ }
  }
  return candidates.sort((left, right) => right.score - left.score)[0]?.url
}

function extractFrequentColors(source: string) {
  const counts = new Map<string, number>()
  for (const match of source.matchAll(/#[0-9a-f]{3}(?:[0-9a-f]{3})?\b/gi)) {
    const color = normalizeHex(match[0])
    counts.set(color, (counts.get(color) || 0) + 1)
  }
  return [...counts.entries()]
    .filter(([color, count]) => count >= 2 && !['#ffffff', '#000000'].includes(color))
    .sort((left, right) => right[1] - left[1])
    .slice(0, 10)
    .map(([color]) => color)
}

function extractTypography(source: string) {
  const fonts: string[] = []
  for (const match of source.matchAll(/font-family\s*:\s*([^;}]+)/gi)) {
    for (const raw of match[1].split(',')) {
      const font = raw.trim().replace(/^['"]|['"]$/g, '')
      if (!font || /^(inherit|initial|sans-serif|serif|monospace|system-ui)$/i.test(font)) continue
      if (!fonts.some(existing => existing.toLowerCase() === font.toLowerCase())) fonts.push(font)
    }
  }
  return fonts.slice(0, 8)
}

function normalizeHex(value: string) {
  const hex = value.toLowerCase()
  return hex.length === 4 ? `#${hex.slice(1).split('').map(character => character.repeat(2)).join('')}` : hex
}

function attribute(tag: string, name: string) {
  return tag.match(new RegExp(`\\b${name}=["']([^"']+)["']`, 'i'))?.[1]
}
