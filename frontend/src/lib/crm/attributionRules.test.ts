import { describe, expect, it } from 'vitest'
import {
  buildMroiAlerts,
  calculateCpl,
  calculateMroi,
  calculateSourceConversion,
  derivePrimarySource,
  hydrateRollupMetrics,
  normalizeUtmSource,
  sanitizePortalAttribution,
} from './attributionRules'
import type { CrmAttributionDashboard, LeadSourceRollup } from '@/types/crmAttribution'

const baseRollup: LeadSourceRollup = {
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  sourceId: 'source-1',
  sourceKey: 'meta_botox',
  sourceName: 'Meta Botox',
  sourceKind: 'paid_campaign',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  leads: 20,
  opportunities: 10,
  sales: 4,
  mediaCost: 1000,
  operationalCost: 500,
  clientVisibleCost: 1000,
  attributedRevenue: 6000,
  cpl: 50,
  opportunityRate: 50,
  conversionRate: 20,
  mroi: 3,
  campaignId: 'campaign-1',
}

describe('crm attribution rules', () => {
  it('normalizes UTM source tokens', () => {
    expect(normalizeUtmSource(' Meta Ads / Botox Junho ')).toBe('meta_ads_botox_junho')
    expect(normalizeUtmSource('')).toBeUndefined()
  })

  it('derives WhatsApp direct source with high confidence', () => {
    expect(derivePrimarySource({ whatsappClickId: 'wa-1', source: 'whatsapp' })).toMatchObject({
      key: 'whatsapp',
      name: 'WhatsApp',
      kind: 'whatsapp',
      confidence: 'high',
    })
  })

  it('derives paid campaign sources from campaign id and UTMs', () => {
    expect(derivePrimarySource({
      campaignId: 'campaign-1',
      landingPageId: 'lp-1',
      utm: { source: 'Meta Ads', medium: 'cpc', campaign: 'Botox Junho' },
    })).toMatchObject({
      key: 'botox_junho',
      kind: 'paid_campaign',
      confidence: 'high',
      campaignId: 'campaign-1',
      landingPageId: 'lp-1',
      utm: { source: 'meta_ads', medium: 'cpc', campaign: 'botox_junho' },
    })
  })

  it('handles zero-cost or zero-lead metrics safely', () => {
    expect(calculateCpl({ cost: 0, leads: 12 })).toBe(0)
    expect(calculateCpl({ cost: 1000, leads: 0 })).toBe(0)
    expect(calculateSourceConversion({ leads: 0, sales: 2 })).toBe(0)
  })

  it('calculates MROI from media plus operational cost', () => {
    expect(calculateMroi({ mediaCost: 1000, operationalCost: 500, attributedRevenue: 6000 })).toBe(3)
  })

  it('hydrates rollup metrics consistently', () => {
    const {
      cpl: _cpl,
      opportunityRate: _opportunityRate,
      conversionRate: _conversionRate,
      mroi: _mroi,
      ...rawRollup
    } = baseRollup

    expect(hydrateRollupMetrics({
      ...rawRollup,
      leads: 10,
      opportunities: 5,
      sales: 2,
      clientVisibleCost: 800,
      mediaCost: 800,
      operationalCost: 200,
      attributedRevenue: 4000,
    })).toMatchObject({
      cpl: 80,
      opportunityRate: 50,
      conversionRate: 20,
      mroi: 3,
    })
  })

  it('removes internal cost fields from portal attribution', () => {
    const dashboard: CrmAttributionDashboard = {
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      totals: {
        leads: 20,
        opportunities: 10,
        sales: 4,
        clientVisibleCost: 1000,
        attributedRevenue: 6000,
        cpl: 50,
        conversionRate: 20,
        mroi: 3,
      },
      sources: [baseRollup],
      alerts: [{
        organizationId: 'org-1',
        sourceId: 'source-1',
        severity: 'warning',
        status: 'open',
        title: 'Lead caro',
        description: 'custo operacional interno acima do esperado',
        metricKey: 'cpl',
        metricValue: 50,
        thresholdValue: 40,
      }],
    }

    const safe = sanitizePortalAttribution(dashboard)
    expect(safe.sources[0]).not.toHaveProperty('mediaCost')
    expect(safe.sources[0]).not.toHaveProperty('operationalCost')
    expect(safe.sources[0].cpl).toBe(50)
    expect(safe.alerts[0].description).not.toContain('interno')
  })

  it('builds alerts for expensive, weak and strong sources', () => {
    const alerts = buildMroiAlerts({
      rollups: [
        { ...baseRollup, cpl: 120, conversionRate: 15, mroi: 2 },
        { ...baseRollup, sourceId: 'source-2', sourceName: 'Google', cpl: 20, conversionRate: 3, mroi: -0.4 },
        { ...baseRollup, sourceId: 'source-3', sourceName: 'Instagram', cpl: 30, conversionRate: 35, mroi: 4 },
      ],
      highCplThreshold: 100,
      lowConversionThreshold: 5,
      highConversionThreshold: 30,
    })

    expect(alerts.map(alert => alert.title)).toEqual(expect.arrayContaining(['Lead caro', 'Conversao baixa', 'MROI negativo', 'Alta conversao']))
  })
})
