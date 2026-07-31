import { describe, expect, it } from 'vitest'
import {
  filterGrowthTemplates,
  getTemplatesForCampaignStep,
  growthTemplateCatalog,
  summarizeTemplateCoverage,
} from './templateRules'

describe('templateRules', () => {
  it('covers all required commercial template kinds', () => {
    const coverage = summarizeTemplateCoverage(growthTemplateCatalog)

    expect(coverage.byKind.campaign).toBeGreaterThan(0)
    expect(coverage.byKind.landing_page).toBeGreaterThan(0)
    expect(coverage.byKind.post).toBeGreaterThan(0)
    expect(coverage.byKind.paid_ad).toBeGreaterThan(0)
    expect(coverage.byKind.whatsapp_message).toBeGreaterThan(0)
    expect(coverage.byKind.email).toBeGreaterThan(0)
    expect(coverage.byKind.smart_segment).toBeGreaterThan(0)
    expect(coverage.byKind.automation).toBeGreaterThan(0)
    expect(coverage.byKind.report).toBeGreaterThan(0)
  })

  it('filters by sector, objective, module and channel together', () => {
    const templates = filterGrowthTemplates(growthTemplateCatalog, {
      sectorKey: 'real_estate',
      objectiveKey: 'lead_generation',
      moduleKey: 'campaigns',
      channel: 'meta_ads',
    })

    expect(templates.map(template => template.id)).toContain('campaign:lead-generation-360')
    expect(templates.every(template => template.moduleKey === 'campaigns')).toBe(true)
    expect(templates.every(template => template.channels.includes('meta_ads'))).toBe(true)
  })

  it('filters by required modules', () => {
    const templates = filterGrowthTemplates(growthTemplateCatalog, {
      requiredModuleKey: 'bi_reports',
    })

    expect(templates.map(template => template.id)).toEqual(expect.arrayContaining([
      'campaign:lead-generation-360',
      'report:mroi-campaign',
    ]))
    expect(templates.every(template => template.requiredModuleKeys.includes('bi_reports'))).toBe(true)
  })

  it('can limit templates to portal-visible options', () => {
    const templates = filterGrowthTemplates(growthTemplateCatalog, {
      portalVisibleOnly: true,
      moduleKey: 'automations',
    })

    expect(templates.map(template => template.id)).toContain('automation:new-lead-response')
    expect(templates.map(template => template.id)).not.toContain('automation:internal-cpl-alert')
    expect(templates.every(template => template.portalVisible)).toBe(true)
  })

  it('prefilters templates for a campaign plan step', () => {
    const segmentTemplates = getTemplatesForCampaignStep('segment', {
      objectiveKey: 'reactivation',
      portalVisibleOnly: true,
    })

    expect(segmentTemplates.map(template => template.id)).toContain('smart_segment:stale-opportunities')
    expect(segmentTemplates.every(template => template.recommendedForCampaignStepKeys.includes('segment'))).toBe(true)
  })
})
