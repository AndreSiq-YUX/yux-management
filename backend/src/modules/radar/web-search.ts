import sanitizeHtml from 'sanitize-html'
export type RadarWebHit = { url: string; title: string; snippets: string[]; observedAt: string;provider?:'brave_web_search'|'serper_web_search';query?:string;position?:number }
const plain = (value: unknown) => sanitizeHtml(typeof value === 'string' ? value : '', { allowedTags: [], allowedAttributes: {} }).slice(0, 3000)
export async function searchRadarWeb(input: { provider?:'brave_web_search'|'serper_web_search';apiKey: string; query: string; limit: number; fetchImpl?: typeof fetch }): Promise<RadarWebHit[]> {
  if (!input.apiKey || !input.query.trim()) throw new Error('radar_web_input_missing')
  if(input.provider==='serper_web_search'){
    const response=await (input.fetchImpl??fetch)('https://google.serper.dev/search',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-API-KEY':input.apiKey},
      body:JSON.stringify({q:input.query.slice(0,600),gl:'br',hl:'pt-br',num:Math.min(10,Math.max(1,input.limit))}),redirect:'error',signal:AbortSignal.timeout(8000)})
    if(!response.ok)throw new Error(`radar_serper_web_http_${response.status}`)
    const body=await response.json() as {organic?:Array<{link?:string;title?:string;snippet?:string;position?:number}>}
    return (Array.isArray(body.organic)?body.organic:[]).slice(0,10).flatMap(item=>{const url=publicRadarUrl(item.link);return url?[{url,title:plain(item.title),snippets:[plain(item.snippet)].filter(Boolean),observedAt:new Date().toISOString(),provider:input.provider,query:input.query,position:item.position}]:[]})
  }
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  for (const [key, value] of Object.entries({ q: input.query.slice(0, 600), count: String(Math.min(10, Math.max(1, input.limit))),
    country: 'BR', search_lang: 'pt-br', ui_lang: 'pt-BR', extra_snippets: 'true', text_decorations: 'false', result_filter: 'web' })) url.searchParams.set(key, value)
  const response = await (input.fetchImpl ?? fetch)(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': input.apiKey }, redirect: 'error', signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`radar_web_http_${response.status}`)
  const body = await response.json() as { web?: { results?: Array<{ url?: string; title?: string; description?: string; extra_snippets?: string[] }> } }
  return (body.web?.results ?? []).slice(0, 10).flatMap(item => {
    const safeUrl = publicRadarUrl(item.url)
    return safeUrl ? [{ url: safeUrl, title: plain(item.title), snippets: [item.description, ...(item.extra_snippets ?? []).slice(0, 5)].filter(Boolean).map(plain), observedAt: new Date().toISOString(),provider:'brave_web_search',query:input.query }] : []
  })
}
export function publicRadarUrl(value: unknown): string | undefined {
  try { const url = new URL(String(value)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return; url.hash = ''; return url.toString() } catch { return }
}
