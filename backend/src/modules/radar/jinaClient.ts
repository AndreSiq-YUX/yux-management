export type RadarJinaEvidence = {
  title: string
  url: string
  content: string
  description?: string
  emails: string[]
  phones: string[]
  links: string[]
  ctaTerms: string[]
}

export type RadarJinaSearchResult = RadarJinaEvidence & {
  snippet: string
}

type FetchLike = typeof fetch

type JinaRequestOptions = {
  fetchImpl?: FetchLike
  apiKey?: string
  limit?: number
  maxAttempts?: number
  retryDelayMs?: number
}

type JinaJsonResponse = {
  data?: unknown
  title?: string
  url?: string
  content?: string
  description?: string
}

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const PHONE_PATTERN = /(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?(?:9\s?)?\d{4}[-\s]?\d{4}/g
const MARKDOWN_LINK_PATTERN = /\[[^\]]+]\((https?:\/\/[^)\s]+)\)/g
const CTA_TERMS = [
  'agende',
  'orcamento',
  'orçamento',
  'consulta',
  'whatsapp',
  'contato',
  'fale conosco',
  'diagnostico',
  'diagnóstico',
]

export async function readJinaUrl(url: string, options: JinaRequestOptions = {}) {
  const normalizedUrl = normalizeHttpUrl(url)
  const response = await requestJina(`https://r.jina.ai/${normalizedUrl}`, options)
  return normalizeJinaEvidence(response, normalizedUrl)
}

export async function searchJinaWeb(
  query: string,
  options: JinaRequestOptions = {},
) {
  const response = await requestJina(`https://s.jina.ai/${encodeURIComponent(query)}`, options)
  const data = extractData(response)
  const records = Array.isArray(data) ? data : [data]
  return records
    .map((record, index) => normalizeJinaEvidence(record, undefined, `Resultado ${index + 1}`))
    .filter(result => result.url || result.title || result.content)
    .slice(0, options.limit ?? 5)
    .map(result => ({
      ...result,
      snippet: result.description || excerpt(result.content, 220),
    }))
}

async function requestJina(url: string, options: JinaRequestOptions) {
  const fetchImpl = options.fetchImpl ?? fetch
  const baseHeaders: Record<string, string> = {
    Accept: 'application/json',
    'X-Respond-With': 'markdown',
    'X-Retain-Images': 'all',
    'X-Timeout': '10',
    'X-Max-Tokens': '8000',
  }
  let apiKey = (options.apiKey ?? process.env.JINA_API_KEY)?.trim() || undefined
  const maxAttempts = Math.max(1, Math.min(5, options.maxAttempts ?? 3))
  const retryDelayMs = Math.max(0, options.retryDelayMs ?? 300)
  let lastStatus = 0
  let authFallbackUsed = false

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const headers = { ...baseHeaders }
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`
    const response = await fetchImpl(url, { headers })
    if (response.ok) return await response.json() as JinaJsonResponse

    lastStatus = response.status
    if (apiKey && !authFallbackUsed && (response.status === 401 || response.status === 403)) {
      apiKey = undefined
      authFallbackUsed = true
      attempt -= 1
      continue
    }
    if (!isTransientJinaStatus(response.status) || attempt === maxAttempts) break
    if (retryDelayMs) await wait(retryDelayMs * attempt)
  }

  throw Object.assign(new Error('jina_request_failed'), { statusCode: lastStatus })
}

function isTransientJinaStatus(status: number) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function wait(milliseconds: number) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

function normalizeJinaEvidence(value: unknown, fallbackUrl?: string, fallbackTitle = 'Resultado') {
  const data = extractData(value)
  const record = isRecord(data) ? data : {}
  const content = stringValue(record.content) || stringValue(record.text) || stringValue(record.markdown) || ''
  const title = stringValue(record.title) || firstTitle(content) || fallbackTitle
  const url = stringValue(record.url) || stringValue(record.source_url) || fallbackUrl || ''
  const description = stringValue(record.description) || firstParagraph(content)
  const links = extractLinks(content)
  return {
    title,
    url,
    content,
    description,
    emails: unique(content.match(EMAIL_PATTERN) ?? []),
    phones: unique(content.match(PHONE_PATTERN) ?? []).map(phone => phone.trim()),
    links,
    ctaTerms: CTA_TERMS.filter(term => content.toLowerCase().includes(term)),
  } satisfies RadarJinaEvidence
}

function extractData(value: unknown): unknown {
  if (!isRecord(value)) return value
  return value.data ?? value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined
}

function normalizeHttpUrl(value: string) {
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function firstTitle(content: string) {
  const match = content.match(/^#\s+(.+)$/m)
  return match?.[1]?.trim()
}

function firstParagraph(content: string) {
  return content
    .split(/\n{2,}/)
    .map(part => part.replace(/^#+\s*/, '').trim())
    .find(Boolean)
}

function excerpt(content: string, length: number) {
  const compact = content.replace(/\s+/g, ' ').trim()
  return compact.length > length ? `${compact.slice(0, length - 1)}...` : compact
}

function extractLinks(content: string) {
  const links: string[] = []
  for (const match of content.matchAll(MARKDOWN_LINK_PATTERN)) {
    if (match[1]) links.push(match[1])
  }
  return unique(links).slice(0, 20)
}

function unique(values: string[]) {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)))
}

