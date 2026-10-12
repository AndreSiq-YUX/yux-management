import { expect, it } from 'vitest'
import { assessRadarCompanySize } from '../src/modules/radar/company-size.js'
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js'
const policy=resolveRadarSearchConfiguration({research:{sizeAssessment:{enabled:true,criteria:[
  {metric:'units',weight:2,maxAgeDays:365,bands:[{min:0,points:0},{min:10,points:80}]},
  {metric:'annualRevenue',weight:2,maxAgeDays:365,bands:[{min:0,points:0},{min:1000000,points:100}]},
]}}}).research.sizeAssessment
const fact={metric:'units' as const,amount:12,referenceDate:'2026-01-01',scope:'establishment' as const,
  value:'12 unidades',evidenceId:'page-0',excerpt:'12 unidades',sourceUrl:'https://alfa.example',observedAt:'2026-10-12'}
it('separates size score from coverage and reverses priority for smaller prospects',()=>{
  expect(assessRadarCompanySize(policy,[fact],new Date('2026-10-12'))).toMatchObject({score:80,evidenceCoverage:50})
  expect(assessRadarCompanySize({...policy,direction:'smaller'},[fact],new Date('2026-10-12')).score).toBe(20)
})
it('never converts missing, outdated, group or incomparable data into small size',()=>{
  for(const facts of [[],[{...fact,scope:'group' as const}],[{...fact,referenceDate:'2020-01-01'}],[{...fact,referenceDate:undefined}]])
    expect(assessRadarCompanySize(policy,facts,new Date('2026-10-12')).score).toBeNull()
  expect(assessRadarCompanySize(policy,[{...fact,metric:'capital',amount:10000000}],new Date('2026-10-12')).score).toBeNull()
})
it('disables size by default and rejects duplicate metrics and invalid bands',()=>{
  expect(resolveRadarSearchConfiguration().research.sizeAssessment.enabled).toBe(false)
  expect(()=>resolveRadarSearchConfiguration({research:{sizeAssessment:{...policy,criteria:[policy.criteria[0],policy.criteria[0]]}}})).toThrow()
})
