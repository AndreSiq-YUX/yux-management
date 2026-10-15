import {describe,it,expect} from 'vitest'
import {radarQualityBenchmark,radarContactBenchmark} from './fixtures/radar-quality-benchmark.js'
import {projectRadarPublicPresence} from '../src/modules/radar/public-presence.js'
import {consolidateRadarContacts,isUsefulRadarContact} from '../src/modules/radar/contact-consolidation.js'
import {evaluateRadarResearchQuality} from '../src/modules/radar/research-quality.js'
import {resolveRadarSearchConfiguration} from '../src/modules/radar/search-configuration.js'
import {planRadarResearch} from '../src/modules/radar/research-planner.js'
import {pendingRadarReadUrls} from '../src/modules/radar/research-checkpoint.js'
import {summarizeRadarResearchMetrics} from '../src/modules/radar/research-metrics.js'
import type {RadarResearchDossier} from '../src/modules/radar/research-service.js'
const policy=resolveRadarSearchConfiguration({research:{contactPurpose:'suppliers',completion:{enabled:true,requireWebsite:false}}}).research
const contact={kind:'email' as const,value:'compras@alfa.example',sourceUrl:'https://alfa.example/',observedAt:'2026-10-15',purpose:'suppliers' as const,association:'confirmed' as const,scope:'establishment' as const}
const empty:RadarResearchDossier={discovery:{association:'review',hits:[],suggestions:[],limitations:[],queries:0},siteAssociation:'review',contacts:[],pages:[],activity:{status:'inconclusive',signals:[],presenceSignals:[],limitation:''},limitations:[]}
describe('20 offline Radar quality reference cases',()=>{
  it.each(radarQualityBenchmark)('$name',({url,text,official,name})=>{
    const presence=projectRadarPublicPresence({...empty,configurationRevision:1,discovery:{...empty.discovery,websiteUrl:url},pages:[{url,text,observedAt:contact.observedAt}]})
    expect(!!presence.website).toBe(official)
    // Being a candidate, including a public entity or homonym, is never proof of ownership.
    if(official)expect(presence.website?.association).toBe('review')
    if(!official&&name!=='social profile')expect(presence.externalReferences?.some(item=>item.url===url)).toBe(true)
    if(name==='group is not establishment')expect(evaluateRadarResearchQuality({dossier:{...empty,contacts:[{...contact,scope:'group'}]},policy,currentRevision:true}).identity).toBe('pending')
  })
  it.each(radarContactBenchmark)('$name',({purpose,value,useful})=>expect(isUsefulRadarContact({...contact,purpose,value},'suppliers')).toBe(useful))
  it('consolidates repeat contacts without losing provenance',()=>{
    const result=consolidateRadarContacts([contact,{...contact,value:'COMPRAS@ALFA.EXAMPLE',sourceUrl:'https://alfa.example/fornecedor/'}],'suppliers')
    expect(result).toHaveLength(1);expect(result[0].sources).toHaveLength(2)
  })
  it('supports sufficient independently associated contacts without a website',()=>{
    const quality=evaluateRadarResearchQuality({dossier:{...empty,contacts:[contact]},policy,currentRevision:true})
    expect(quality).toMatchObject({identity:'associated',contactability:'useful',readyForReview:true,potential:{score:null}})
  })
  it('stops a quota-exhausted query without inventing completion',()=>{
    expect(planRadarResearch({identity:{name:'Alfa'},policy,hits:[],pages:[],queriesUsed:policy.maxSearchQueriesPerCandidate,missing:['identity']})).toEqual({stopReason:'query_limit'})
  })
  it('recovers unread evidence after a crash without rereading existing evidence',()=>{
    const hits=['https://alfa.example/','https://alfa.example/fornecedor/'].map(url=>({url,title:'Alfa',snippets:[],observedAt:contact.observedAt}))
    expect(pendingRadarReadUrls(hits,[{url:hits[0].url,text:'Alfa',observedAt:contact.observedAt}],3)).toEqual([hits[1].url])
  })
  it('reports unknown receipt cost as unknown, not free',()=>{
    expect(summarizeRadarResearchMetrics({companies:[],usage:[{sourceType:'serper_web_search',units:3,estimatedCostBrl:.03}],analyses:[{id:'lost',costUsd:null}]})).toMatchObject({searchQueries:3,searchEstimatedBrl:.03,aiReportedUsd:null,aiCostUnknown:1,searchCostPerCompanyBrl:null})
  })
})
