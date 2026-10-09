import { expect, it } from 'vitest'
import { evaluateRadarResearchAvailability } from '../src/modules/radar/research-availability.js'
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js'

const policy = { enabled: true, webSearchEnabled: true, maxSearchQueriesPerCandidate: 3, maxPagesPerCandidate: 4, freshnessDays: 7, semanticQualificationEnabled: false }
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
it('limits_apply_across_all_search_endpoints', () => {
  const result = evaluateRadarResearchAvailability({ policy, canManage: true, localEnabled: true,
    provider: { status: 'active', hasSecret: true, publicConfig: { retentionLicensed: true, credentialPurpose: 'licensed_retention', webSearchLicensed: true } },
    sources: ['brave_place_search','brave_web_search'].map(sourceType => ({ sourceType, enabled: true, defaultCostPerUnit: .01, remaining: 10 })) })
  expect(result.allowed).toBe(true)
  expect(result.maxQueriesPerCandidate).toBe(3)
  expect(result.maximumCostPerCandidate).toBeCloseTo(.03)
  expect(evaluateRadarResearchAvailability({ policy: { ...policy, enabled: false }, canManage: false, sources: [] }).reasons.map(item => item.code))
    .toEqual(expect.arrayContaining(['campaign_research_disabled', 'research_admin_required']))
})
