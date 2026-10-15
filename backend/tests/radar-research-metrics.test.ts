import {expect,it} from 'vitest'
import {summarizeRadarResearchMetrics,getRadarResearchMetrics} from '../src/modules/radar/research-metrics.js'
it('excludes proven pre-provider rejection receipts from unknown provider cost counts',async()=>{
  const pool={query:async(sql:string)=>({rows:sql.includes('FROM public.radar_campaigns')?[{configuration_revision:1,search_configuration:{}}]:sql.includes('FROM public.radar_analysis_receipts')?[{request_id:'run:presence:hash',status:'rejected_before_provider',usage:null}]:[]})}
  expect(await getRadarResearchMetrics(pool as never,{role:'yux_admin'} as never,{organizationId:'org',campaignId:'campaign',from:'2026-10-15',to:'2026-10-15'})).toMatchObject({aiAnalyses:0,aiCostUnknown:0,aiReportedUsd:null})
})
const quality={identity:'associated' as const,contactability:'useful' as const,fit:'high' as const,potential:{score:null,coverage:null},readyForReview:true,missing:[]}
it('counts companies rather than provider calls and keeps currencies and unknown AI costs separate',()=>{
  const companies=Array.from({length:30},(_,index)=>({candidateId:String(index),quality}))
  const result=summarizeRadarResearchMetrics({companies,usage:[{sourceType:'serper_web_search',units:141,estimatedCostBrl:1.41},{sourceType:'brave_web_search',units:10,estimatedCostBrl:.4},{sourceType:'brave_place_search',units:44,estimatedCostBrl:1.76}],analyses:[{id:'one',costUsd:.002},{id:'legacy',costUsd:null}]})
  expect(result).toMatchObject({companies:30,searchQueries:195,searchEstimatedBrl:3.57,searchCostPerCompanyBrl:.119,searchCostPerReadyForReviewBrl:.119,aiReportedUsd:.002,aiCostUnknown:1,readyForReview:30})
})
it('does not multiply companies or receipts and returns null rather than zero for unavailable unit cost',()=>{
  const result=summarizeRadarResearchMetrics({companies:[{candidateId:'a',quality},{candidateId:'a',quality}],usage:[],analyses:[{id:'a',costUsd:null},{id:'a',costUsd:null}]})
  expect(result.companies).toBe(1);expect(result.aiCostUnknown).toBe(1);expect(result.aiReportedUsd).toBeNull()
  expect(summarizeRadarResearchMetrics({companies:[],usage:[],analyses:[]}).searchCostPerCompanyBrl).toBeNull()
})
it('uses the evidence snapshot from the selected period, not newer contacts on the current company record',async()=>{
  const pool={query:async(sql:string)=>{
    if(sql.includes('FROM public.radar_campaigns'))return{rows:[{configuration_revision:1,search_configuration:{}}]}
    if(sql.includes('DISTINCT ON'))return{rows:[{id:'old-run',candidate_id:'company',configuration_revision:1,calls:{},output:{siteAssociation:'review',discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:1},contacts:[],pages:[]},
      normalized_payload:{researchRevision:1,researchRunId:'newer-run',websiteUrl:'https://alfa.example/',websiteStatus:'verified_present',publicContacts:[{kind:'email',value:'new@alfa.example',sourceUrl:'https://alfa.example/',association:'confirmed',scope:'establishment',observedAt:'2026-10-16'}]}}]}
    return{rows:[]}
  }}
  const result=await getRadarResearchMetrics(pool as never,{role:'yux_admin'} as never,{organizationId:'org',campaignId:'campaign',from:'2026-10-15',to:'2026-10-15'})
  expect(result.companies).toBe(1)
  expect(result.withUsefulContact).toBe(0)
  expect(result.readyForReview).toBe(0)
})
