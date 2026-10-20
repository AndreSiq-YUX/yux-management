import {it,expect} from 'vitest'
import {discoverRadarProviderPage} from '../src/modules/radar/discovery-providers.js'
const scope={key:'scope',source:'serper_web_search' as const,term:'empresas de alimentação coletiva',query:'empresas de alimentação coletiva SP Brasil',state:'SP'}
it('keeps web hits as documents needing extraction, not companies or official sites',async()=>{
 const result=await discoverRadarProviderPage({scope,pageSize:10,apiKey:'synthetic',continuation:undefined},{web:async()=>[{url:'https://lista.example/top',title:'10 empresas',snippets:['Alfa e Beta'],observedAt:'2026-10-20T00:00:00Z'}]})
 expect(result.candidates).toEqual([])
 expect(result.documents).toHaveLength(1)
 expect(result.exhaustion).toBe('unknown')
 expect(result.continuation).toBeUndefined()
})
it('preserves registry continuation without inventing a cursor for map/web searches',async()=>{
 const result=await discoverRadarProviderPage({scope:{...scope,source:'cnpja_advanced_search'},pageSize:10,apiKey:'synthetic',continuation:{token:'next'}},{registry:async input=>{
  expect(input.token).toBe('next');return{candidates:[{taxId:'37335118000180',legalName:'Empresa Alfa',cnaes:[],websiteStatus:'unknown',rawPayload:{}}],nextToken:'following'}
 }})
 expect(result.candidates).toHaveLength(1)
 expect(result).toMatchObject({exhaustion:'more',continuation:{token:'following'}})
})
it('does not call Places without a city or persist a preview-only response',async()=>{
 let calls=0
 await expect(discoverRadarProviderPage({scope:{...scope,source:'serper_places'},pageSize:10,apiKey:'synthetic'},{places:async()=>{calls++;return[]}})).rejects.toThrow('radar_discovery_city_coverage_required')
 expect(calls).toBe(0)
})
