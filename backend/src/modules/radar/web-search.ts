import sanitizeHtml from 'sanitize-html'
export type RadarWebHit = { url: string; title: string; snippets: string[]; observedAt: string }
const plain = (value: unknown) => sanitizeHtml(typeof value === 'string' ? value : '', { allowedTags: [], allowedAttributes: {} }).slice(0, 3000)
export async function searchRadarWeb(input: { apiKey: string; query: string; limit: number; fetchImpl?: typeof fetch }): Promise<RadarWebHit[]> {
  if (!input.apiKey || !input.query.trim()) throw new Error('radar_web_input_missing')
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  for (const [key, value] of Object.entries({ q: input.query.slice(0, 600), count: String(Math.min(10, Math.max(1, input.limit))),
    country: 'BR', search_lang: 'pt-br', ui_lang: 'pt-BR', extra_snippets: 'true', text_decorations: 'false', result_filter: 'web' })) url.searchParams.set(key, value)
  const response = await (input.fetchImpl ?? fetch)(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': input.apiKey }, redirect: 'error', signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`radar_web_http_${response.status}`)
  const body = await response.json() as { web?: { results?: Array<{ url?: string; title?: string; description?: string; extra_snippets?: string[] }> } }
  return (body.web?.results ?? []).slice(0, 10).flatMap(item => {
    const safeUrl = publicRadarUrl(item.url)
    return safeUrl ? [{ url: safeUrl, title: plain(item.title), snippets: [item.description, ...(item.extra_snippets ?? []).slice(0, 5)].filter(Boolean).map(plain), observedAt: new Date().toISOString() }] : []
  })
}
export function publicRadarUrl(value: unknown): string | undefined {
  try { const url = new URL(String(value)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return; url.hash = ''; return url.toString() } catch { return }
}
