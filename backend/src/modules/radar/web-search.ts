import sanitizeHtml from 'sanitize-html'
export type RadarWebSearchProvider='brave_web_search'|'serper_web_search'|'perplexity_search_fast'|'perplexity_search_web'
export type RadarWebHit = { url: string; title: string; snippets: string[]; observedAt: string;provider?:RadarWebSearchProvider;query?:string;queries?:string[];position?:number;extractedText?:string;evidenceKind?:'search_excerpt' }
const plain = (value: unknown) => sanitizeHtml(typeof value === 'string' ? value : '', { allowedTags: [], allowedAttributes: {} }).slice(0, 3000)
export async function searchRadarWeb(input: { provider?:RadarWebSearchProvider;apiKey: string; query: string; limit: number; fetchImpl?: typeof fetch;onResponse?:(body:unknown)=>Promise<void> }): Promise<RadarWebHit[]> {
  if (!input.apiKey || !input.query.trim()) throw new Error('radar_web_input_missing')
  if(input.provider?.startsWith('perplexity_')){
    const {searchRadarPerplexity}=await import('./perplexity-search.js')
    return(await searchRadarPerplexity({apiKey:input.apiKey,queries:[input.query],searchType:input.provider==='perplexity_search_fast'?'fast':'web',maxResults:Math.min(20,Math.max(1,input.limit)),maxTokens:12000,maxTokensPerPage:2000,region:'BR',language:'pt',fetchImpl:input.fetchImpl,onResponse:input.onResponse})).hits
  }
  if(input.provider==='serper_web_search'){
    const response=await (input.fetchImpl??fetch)('https://google.serper.dev/search',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json','X-API-KEY':input.apiKey},
      body:JSON.stringify({q:input.query.slice(0,600),gl:'br',hl:'pt-br',num:Math.min(10,Math.max(1,input.limit))}),redirect:'error',signal:AbortSignal.timeout(8000)})
    if(!response.ok)throw new Error(`radar_serper_web_http_${response.status}`)
    const body=await response.json() as {organic?:Array<{link?:string;title?:string;snippet?:string;position?:number}>}
    await input.onResponse?.(body)
    return normalizeSavedRadarWeb(input,body,10)
  }
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  for (const [key, value] of Object.entries({ q: input.query.slice(0, 600), count: String(Math.min(10, Math.max(1, input.limit))),
    country: 'BR', search_lang: 'pt-br', ui_lang: 'pt-BR', extra_snippets: 'true', text_decorations: 'false', result_filter: 'web' })) url.searchParams.set(key, value)
  const response = await (input.fetchImpl ?? fetch)(url, { headers: { Accept: 'application/json', 'X-Subscription-Token': input.apiKey }, redirect: 'error', signal: AbortSignal.timeout(8000) })
  if (!response.ok) throw new Error(`radar_web_http_${response.status}`)
  const body = await response.json() as { web?: { results?: Array<{ url?: string; title?: string; description?: string; extra_snippets?: string[] }> } }
  await input.onResponse?.(body)
  return normalizeSavedRadarWeb(input,body,10)
}
export async function normalizeSavedRadarWeb(input:{provider?:RadarWebSearchProvider;query:string;limit:number},raw:unknown,maximum?:number):Promise<RadarWebHit[]>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('radar_web_response_invalid')
  if(input.provider?.startsWith('perplexity_')){
    const {normalizeSavedPerplexitySearch}=await import('./perplexity-search.js')
    return normalizeSavedPerplexitySearch(raw,{queries:[input.query],searchType:input.provider==='perplexity_search_fast'?'fast':'web',maxResults:20}).hits
  }
  if(input.provider==='serper_web_search'){
    const body=raw as {organic?:Array<{link?:string;title?:string;snippet?:string;position?:number}>}
    if(!Array.isArray(body.organic))throw Error('radar_web_response_invalid')
    return body.organic.slice(0,maximum).flatMap(item=>{const url=publicRadarUrl(item.link);return url?[{url,title:plain(item.title),snippets:[plain(item.snippet)].filter(Boolean),observedAt:new Date().toISOString(),provider:input.provider,query:input.query,position:item.position}]:[]})
  }
  const body=raw as {type?:string;query?:{original?:string};error?:unknown;web?:{results?:Array<{url?:string;title?:string;description?:string;extra_snippets?:string[]}>}|null}
  // Brave documents web as nullable. A typed successful search with no web
  // section is empty, not a malformed result. Never accept error envelopes.
  if(body.web==null&&body.type==='search'&&typeof body.query?.original==='string'&&!body.error)return[]
  if(!Array.isArray(body.web?.results))throw Error('radar_web_response_invalid')
  return body.web.results.slice(0,maximum).flatMap(item => {
    const safeUrl = publicRadarUrl(item.url)
    return safeUrl ? [{ url: safeUrl, title: plain(item.title), snippets: [item.description, ...(item.extra_snippets ?? []).slice(0, 5)].filter(Boolean).map(plain), observedAt: new Date().toISOString(),provider:'brave_web_search' as const,query:input.query }] : []
  })
}
export function publicRadarUrl(value: unknown): string | undefined {
  try { const url = new URL(String(value)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return; url.hash = ''; return url.toString() } catch { return }
}
