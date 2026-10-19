import { expect, it } from 'vitest'
import { evaluateRadarResearchAvailability } from '../src/modules/radar/research-availability.js'
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js'

const policy = resolveRadarSearchConfiguration({research:{enabled:true,webSearchEnabled:true}}).research
it('evaluates Serper credentials and retention separately and permits only explicitly selected available fallbacks',()=>{
  const configured=resolveRadarSearchConfiguration({research:{enabled:true,webSearchEnabled:true,webSearchProviders:['brave_web_search','serper_web_search']}}).research
  const result=evaluateRadarResearchAvailability({policy:configured,canManage:true,sources:[{sourceType:'brave_web_search',enabled:false,defaultCostPerUnit:.01},{sourceType:'serper_web_search',enabled:true,defaultCostPerUnit:.02}],
    providers:{serper:{status:'active',hasSecret:true,publicConfig:{webSearchLicensed:true}}}})
  expect(result.allowed).toBe(true)
  expect(result.availableSearchSources).toEqual(['serper_web_search'])
  expect(result.maximumCostPerCandidate).toBeCloseTo(.06)
})
it('exposes saved-evidence reanalysis independently of search restrictions but preserves authorization gates',()=>{
  const input={policy,canManage:true,sources:[{sourceType:'brave_web_search',enabled:false,defaultCostPerUnit:0,remaining:0}]}
  const result=evaluateRadarResearchAvailability(input)
  expect(result.allowed).toBe(false)
  expect(result).toMatchObject({operations:{reanalyze:{allowed:true,reasons:[]}}})
  expect(evaluateRadarResearchAvailability({...input,canManage:false})).toMatchObject({operations:{reanalyze:{allowed:false}}})
  expect(evaluateRadarResearchAvailability({...input,campaignActive:false})).toMatchObject({operations:{reanalyze:{allowed:false}}})
})
it('reports_exact_blockers_without_provider_calls', () => {
  const result = evaluateRadarResearchAvailability({ policy, canManage: true, provider: { status: 'active', hasSecret: true,
    publicConfig: { retentionLicensed: true, credentialPurpose: 'licensed_retention', webSearchLicensed: true } },
    sources: [{ sourceType: 'brave_place_search', enabled: false, defaultCostPerUnit: 0 },
      { sourceType: 'brave_web_search', enabled: true, defaultCostPerUnit: .01, remaining: 0 }], localEnabled: true })
  expect(result.reasons.map(item => item.code)).toEqual(expect.arrayContaining(['source_disabled', 'source_cost_required', 'source_limit_exceeded']))
  expect(result.reasons.some(item => item.code.includes('license'))).toBe(false)
  expect(result.allowed).toBe(false)
})
it('preserves_existing_campaign_configuration', () => {
  const config = resolveRadarSearchConfiguration({ qualification: { includeAnyTerms: ['serviços'] } })
  expect(config.research.enabled).toBe(false)
  expect(config.qualification.includeAnyTerms).toEqual(['serviços'])
})
it('inherits the configured cap independently for each eligible search endpoint', () => {
  const result = evaluateRadarResearchAvailability({ policy, canManage: true, localEnabled: true,
    provider: { status: 'active', hasSecret: true, publicConfig: { retentionLicensed: true, credentialPurpose: 'licensed_retention', webSearchLicensed: true } },
    sources: ['brave_place_search','brave_web_search'].map(sourceType => ({ sourceType, enabled: true, defaultCostPerUnit: .01, remaining: 10 })) })
  expect(result.allowed).toBe(true)
  expect(result.maxQueriesPerCandidate).toBe(6)
  expect(result.maximumCostPerCandidate).toBeCloseTo(.06)
  expect(evaluateRadarResearchAvailability({ policy: { ...policy, enabled: false }, canManage: false, sources: [] }).reasons.map(item => item.code))
    .toEqual(expect.arrayContaining(['campaign_research_disabled', 'research_admin_required']))
})
it('allows saved-evidence analysis when an explicit search cap is zero',()=>{
  const result=evaluateRadarResearchAvailability({policy:{...policy,maxSearchQueriesTotalPerCandidate:0} as never,canManage:true,
    sources:[{sourceType:'brave_web_search',enabled:true,defaultCostPerUnit:.01}],provider:{status:'active',hasSecret:true,publicConfig:{retentionLicensed:true,credentialPurpose:'licensed_retention',webSearchLicensed:true}}})
  expect(result.allowed).toBe(false)
  expect(result.operations.reanalyze.allowed).toBe(true)
})
it('estimates eligible searches by source price and cap instead of a shared maximum',()=>{
  const configured={...policy,webSearchProviders:['brave_web_search','serper_web_search'],maxSearchQueriesPerCandidate:5,
    maxSearchQueriesBySource:{brave_web_search:3,serper_web_search:5},maxSearchQueriesTotalPerCandidate:null}
  const result=evaluateRadarResearchAvailability({policy:configured as never,canManage:true,
    sources:[{sourceType:'brave_web_search',enabled:true,defaultCostPerUnit:.02},{sourceType:'serper_web_search',enabled:true,defaultCostPerUnit:.01}],
    providers:{brave_place:{status:'active',hasSecret:true,publicConfig:{retentionLicensed:true,credentialPurpose:'licensed_retention',webSearchLicensed:true}},serper:{status:'active',hasSecret:true,publicConfig:{webSearchLicensed:true}}}})
  expect(result.estimates.map(item=>item.maximumQueries)).toEqual([3,5])
  expect(result.maxQueriesPerCandidate).toBe(8)
  expect(result.maximumCostPerCandidate).toBeCloseTo(.11)
})
it('does not reserve research budget for a source that cannot run',()=>{
  const result=evaluateRadarResearchAvailability({policy:{...policy,webSearchProviders:['brave_web_search','serper_web_search']} as never,canManage:true,
    sources:[{sourceType:'brave_web_search',enabled:false,defaultCostPerUnit:5},{sourceType:'serper_web_search',enabled:true,defaultCostPerUnit:.01}],
    providers:{serper:{status:'active',hasSecret:true,publicConfig:{webSearchLicensed:true}}}})
  expect(result.maxQueriesPerCandidate).toBe(3)
  expect(result.maximumCostPerCandidate).toBeCloseTo(.03)
})
