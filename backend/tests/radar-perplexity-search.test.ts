import {describe,it,expect} from 'vitest'
import {searchRadarPerplexity} from '../src/modules/radar/perplexity-search.js'

const input={apiKey:'test-secret',queries:['empresa A','empresa B','empresa C','empresa D','empresa E'],searchType:'fast' as const,maxResults:10,maxTokens:12000,maxTokensPerPage:2000,region:'BR',language:'pt'}
describe('Perplexity Search governed transport',()=>{
 it('bills one successful request while retaining five rate units and query scope',async()=>{
  let body:Record<string,unknown>={},url=''
  const result=await searchRadarPerplexity({...input,fetchImpl:async(target,options)=>{
   url=String(target);body=JSON.parse(String(options?.body))
   return Response.json({id:'response-1',results:[{url:'https://empresa.example/',title:'<b>Empresa</b>',snippet:'Atende empresas',unknown:'ignored'}]})
  }})
  expect(url).toBe('https://api.perplexity.ai/search')
  expect(body).toEqual({query:input.queries,search_type:'fast',max_results:10,max_tokens:12000,max_tokens_per_page:2000,country:'BR',search_language_filter:['pt']})
  expect(result).toMatchObject({queryCount:5,billableRequestCount:1,providerResponseId:'response-1'})
  expect(result.hits[0]).toMatchObject({url:'https://empresa.example/',title:'Empresa',queries:input.queries,evidenceKind:'search_excerpt'})
  expect(JSON.stringify(result)).not.toContain('test-secret')
 })
 it('bills an empty success without inventing hits',async()=>{
  expect(await searchRadarPerplexity({...input,queries:['empresa'],searchType:'web',fetchImpl:async()=>Response.json({results:[]})})).toMatchObject({hits:[],queryCount:1,billableRequestCount:1})
 })
 it.each([400,429,502])('classifies confirmed HTTP %s as not billed without disclosing the remote body',async(status)=>{
  await expect(searchRadarPerplexity({...input,fetchImpl:async()=>new Response('test-secret invalid',{status})})).rejects.toMatchObject({message:`radar_perplexity_http_${status}`,billingOutcome:'not_billed',transportOutcome:'received'})
 })
 it('never replays an uncertain transport',async()=>{
  let calls=0
  await expect(searchRadarPerplexity({...input,fetchImpl:async()=>{calls++;throw Error('test-secret')}})).rejects.toMatchObject({message:'radar_perplexity_transport_uncertain',billingOutcome:'uncertain'})
  expect(calls).toBe(1)
 })
 it('rejects invalid inputs before sending and strips private URLs from results',async()=>{
  let calls=0
  const fetchImpl=async()=>{calls++;return Response.json({results:[{url:'http://127.0.0.1/x'},{url:'https://localhost./'},{url:'https://valid.example',title:'valid',snippet:'ok'}]})}
  await expect(searchRadarPerplexity({...input,queries:Array(6).fill('query'),fetchImpl})).rejects.toThrow('radar_perplexity_input_invalid')
  expect(calls).toBe(0)
  expect((await searchRadarPerplexity({...input,fetchImpl})).hits).toHaveLength(1)
 })
 it('captures the received response before rejecting its shape',async()=>{
  let captured:unknown
  await expect(searchRadarPerplexity({...input,fetchImpl:async()=>Response.json({wrong:true}),onResponse:async value=>{captured=value}})).rejects.toMatchObject({message:'radar_perplexity_response_invalid',billingOutcome:'billed'})
  expect(captured).toEqual({wrong:true})
 })
})
