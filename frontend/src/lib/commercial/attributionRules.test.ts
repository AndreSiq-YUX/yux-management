import { describe, expect, it } from 'vitest'
import { classifyLeadSource, normalizeUtm } from './attributionRules'

describe('attributionRules', () => {
  it('normalizes UTM fields into canonical analytics keys', () => {
    expect(normalizeUtm({
      source: 'Meta Ads ',
      medium: ' Paid Social ',
      campaign: 'Botox Junho',
    })).toEqual({
      source: 'meta_ads',
      medium: 'paid_social',
      campaign: 'botox_junho',
    })
  })

  it('classifies lead source from commercial attribution context', () => {
    expect(classifyLeadSource({ utmSource: 'meta', landingPageId: 'lp-1' })).toBe('paid_campaign')
    expect(classifyLeadSource({ whatsappClickId: 'wa-1' })).toBe('whatsapp_cta')
  })
})
