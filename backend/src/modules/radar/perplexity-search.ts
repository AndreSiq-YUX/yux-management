import sanitizeHtml from 'sanitize-html'
import {z} from 'zod'
import {publicRadarDiscoveryUrl} from './discovery-extraction.js'
import type {RadarWebHit} from './web-search.js'

const requestSchema=z.object({queries:z.array(z.string().trim().min(1).max(600)).min(1).max(5),searchType:z.enum(['fast','web']),
 maxResults:z.number().int().min(1).max(20),maxTokens:z.number().int().min(1).max(1000000),maxTokensPerPage:z.number().int().min(1).max(1000000),
 region:z.string().regex(/^[A-Z]{2}$/),language:z.string().regex(/^[a-z]{2}$/)})
const failure=(message:string,billingOutcome:'not_billed'|'billed'|'uncertain',transportOutcome='received')=>Object.assign(Error(message),{billingOutcome,transportOutcome})
const clean=(value:unknown,max:number)=>sanitizeHtml(typeof value==='string'?value:'',{allowedTags:[],allowedAttributes:{}}).slice(0,max)
export async function searchRadarPerplexity(input:{apiKey:string;queries:string[];searchType:'fast'|'web';maxResults:number;maxTokens:number;maxTokensPerPage:number;region:string;language:string;
 fetchImpl?:typeof fetch;onResponse?:(body:unknown)=>Promise<void>}):Promise<{hits:RadarWebHit[];queryCount:number;billableRequestCount:number;providerResponseId?:string}>{
 const parsed=requestSchema.safeParse(input)
 if(!parsed.success||!input.apiKey.trim())throw failure('radar_perplexity_input_invalid','not_billed','not_started')
 const config=parsed.data
 let response:Response
 try{response=await(input.fetchImpl??fetch)('https://api.perplexity.ai/search',{method:'POST',headers:{Authorization:`Bearer ${input.apiKey}`,Accept:'application/json','Content-Type':'application/json'},
  body:JSON.stringify({query:config.queries,search_type:config.searchType,max_results:config.maxResults,max_tokens:config.maxTokens,max_tokens_per_page:config.maxTokensPerPage,country:config.region,search_language_filter:[config.language]}),redirect:'error',signal:AbortSignal.timeout(20000)})}
 catch{throw failure('radar_perplexity_transport_uncertain','uncertain','uncertain')}
 if(!response.ok)throw failure(`radar_perplexity_http_${response.status}`,response.status>=400?'not_billed':'uncertain')
 // Successful empty responses are billed; parsing/validation failures are not
 // transport uncertainty. Capture the protected reply before interpreting it.
 let body:unknown
 try{
  const reader=response.body?.getReader();let size=0;const chunks:Uint8Array[]=[]
  if(reader)while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>1_000_000){await reader.cancel();throw Error('size')}chunks.push(part.value)}
  const raw=Buffer.concat(chunks).toString('utf8')
  try{body=JSON.parse(raw)}catch{body={unparsed:raw}}
  await input.onResponse?.(body)
 }catch{throw failure('radar_perplexity_response_unreadable','billed')}
 return normalizeSavedPerplexitySearch(body,config)
}
export function normalizeSavedPerplexitySearch(body:unknown,config:Pick<z.infer<typeof requestSchema>,'searchType'|'queries'|'maxResults'>){
 if(!body||typeof body!=='object'||!Array.isArray((body as Record<string,unknown>).results))throw failure('radar_perplexity_response_invalid','billed')
 const data=body as {id?:unknown;results:unknown[]},observedAt=new Date().toISOString()
 const provider=config.searchType==='fast'?'perplexity_search_fast' as const:'perplexity_search_web' as const
 const hits:RadarWebHit[]=data.results.slice(0,config.maxResults*config.queries.length).flatMap(raw=>{
  if(!raw||typeof raw!=='object')return[]
  const item=raw as Record<string,unknown>
  if(typeof item.url!=='string'||!publicRadarDiscoveryUrl(item.url))return[]
  const snippet=clean(item.snippet,32000)
  // The public API may merge multi-query results without a query index. Keep
  // the request scope, never fabricate a per-query attribution in that case.
  return[{url:new URL(item.url).href,title:clean(item.title,3000),snippets:snippet?[snippet]:[],observedAt,provider,queries:config.queries,...(config.queries.length===1?{query:config.queries[0]}:{}),extractedText:snippet,evidenceKind:'search_excerpt' as const}]
 })
 return{hits,queryCount:config.queries.length,billableRequestCount:1,...(typeof data.id==='string'?{providerResponseId:data.id.slice(0,200)}:{})}
}
