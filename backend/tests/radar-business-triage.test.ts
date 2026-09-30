import { describe, expect, it } from 'vitest'
import { triageRadarBusiness } from '../src/modules/radar/business-triage.js'
import { resolveRadarSearchConfiguration } from '../src/modules/radar/search-configuration.js'

const website = (text: string) => ({ status: 'verified_present' as const, checkedAt: '',
  finalUrl: 'https://alfa.example/', text, emails: [], phones: [] })
describe('campaign-configured business triage', () => {
  it('supports distinct audiences and offers without implicit kitchen rules', () => {
    for (const [term,product,cnae] of [['cozinha industrial','massas','5620101'],
      ['consultoria de tecnologia','software','6201501'], ['revenda de carros','financiamento','4511102']]) {
      const result = triageRadarBusiness({ name: 'Empresa Alfa', cnaes: [cnae], desiredCnaes: [cnae],
        configuration: resolveRadarSearchConfiguration({ qualification: { includeAnyTerms: [term],
          requireCnaeMatch: true, productTerms: [product] } }),
        website: website(`Empresa Alfa: ${term}. Oferecemos ${product}.`) })
      expect(result.targetStatus).toBe('confirmed')
      expect(result.productFit).toBe('possible')
      expect(result.evidenceUrls).toEqual(['https://alfa.example/'])
    }
  })
  it('never confirms a CNAE alone or empty positive criteria', () => {
    const input = { name: 'Empresa Alfa', cnaes: ['5620101'], desiredCnaes: ['5620101'],
      configuration: resolveRadarSearchConfiguration() }
    expect(triageRadarBusiness(input).targetStatus).toBe('review')
    expect(triageRadarBusiness({ ...input, website: website('Empresa Alfa: cozinha industrial') }).targetStatus).toBe('review')
  })
  it('applies any/all criteria, exclusions, CNAE requirements and missing-site policy', () => {
    const base = { name: 'Empresa Alfa', cnaes: ['6201501'], desiredCnaes: ['6201501'],
      configuration: resolveRadarSearchConfiguration({ qualification: { includeAnyTerms: ['tecnologia','software'],
        includeAllTerms: ['consultoria'], excludeTerms: ['somente varejo'], requireCnaeMatch: true, missingWebsite: 'insufficient' } }) }
    expect(triageRadarBusiness(base).targetStatus).toBe('insufficient')
    expect(triageRadarBusiness({ ...base, website: website('Empresa Alfa: tecnologia e consultoria') }).targetStatus).toBe('confirmed')
    expect(triageRadarBusiness({ ...base, website: website('Empresa Alfa: tecnologia') }).targetStatus).toBe('review')
    expect(triageRadarBusiness({ ...base, website: website('Empresa Alfa: tecnologia, consultoria e somente varejo') }).targetStatus).toBe('not_target')
    expect(triageRadarBusiness({ ...base, cnaes: ['5611201'], website: website('Empresa Alfa: tecnologia e consultoria') }).targetStatus).toBe('not_target')
    expect(triageRadarBusiness({ ...base, website: website('Outra Empresa: tecnologia e consultoria') }).targetStatus).toBe('review')
  })
  it('matches complete expressions ignoring accents, not fragments of words', () => {
    const input = { name: 'Empresa Alfa', cnaes: [], desiredCnaes: [],
      configuration: resolveRadarSearchConfiguration({ qualification: { includeAnyTerms: ['pães'] } }) }
    expect(triageRadarBusiness({ ...input, website: website('Empresa Alfa: pães frescos') }).targetStatus).toBe('confirmed')
    expect(triageRadarBusiness({ ...input, website: website('Empresa Alfa: repaes') }).targetStatus).toBe('review')
  })
})
