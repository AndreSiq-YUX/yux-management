import { describe, expect, it } from 'vitest'
import {
  buildExecutiveCampaignMetrics,
  buildReportAiInsight,
  buildReportPresets,
  calculateCpl,
  calculateMroi,
  calculateStageConversion,
  sanitizeReportForPortal,
  summarizeExecutiveCampaignMetrics,
} from './reportRules'
import type { OperationalReport } from '@/types/reports'

const report: OperationalReport = {
  organizationId: 'org-1',
  generatedAt: '2026-06-03T12:00:00.000Z',
  leadsBySource: [{ source: 'instagram', leads: 40 }],
  stageConversions: [{ stage: 'Novo', entered: 100, advanced: 28, conversionRate: 28 }],
  responseTimeHours: 2,
  stalledOpportunities: 3,
  campaignMetrics: [{
    campaignId: 'campaign-1',
    name: 'Botox',
    spend: 1200,
    impressions: 10000,
    clicks: 500,
    leads: 40,
    cpl: 30,
    opportunities: 12,
    proposals: 6,
    clients: 2,
    revenue: 7200,
    mroi: 5,
    syncStatus: 'connected',
    aiRecommendation: 'Escalar budget com controle de CPL.',
  }],
  landingPageMetrics: [{ landingPageId: 'lp-1', name: 'Landing Botox', visits: 1000, leads: 83, conversionRate: 8.3 }],
  proposalMetrics: { sent: 10, approved: 4, approvalRate: 40 },
  ownerActivity: [{ owner: 'Ana YUX', activities: 22 }],
  projectDelivery: [{ label: 'Projetos ativos', value: 5 }],
}

describe('reportRules', () => {
  it('calculates CPL', () => {
    expect(calculateCpl({ spend: 1200, leads: 40 })).toBe(30)
  })

  it('calculates MROI', () => {
    expect(calculateMroi({ spend: 1000, attributedRevenue: 5000 })).toBe(4)
  })

  it('calculates stage conversion', () => {
    expect(calculateStageConversion({ entered: 100, advanced: 28 })).toBe(28)
  })

  it('removes owner activity from portal report', () => {
    expect(sanitizeReportForPortal(report)).not.toHaveProperty('ownerActivity')
  })

  it('builds executive campaign metrics with spend, funnel, revenue, sync and recommendation', () => {
    const metrics = buildExecutiveCampaignMetrics(report.campaignMetrics)

    expect(metrics[0]).toMatchObject({
      spend: 1200,
      impressions: 10000,
      clicks: 500,
      leads: 40,
      cpl: 30,
      opportunities: 12,
      proposals: 6,
      clients: 2,
      revenue: 7200,
      mroi: 5,
      syncStatus: 'connected',
      aiRecommendation: 'Escalar budget com controle de CPL.',
    })
  })

  it('summarizes executive campaign metrics', () => {
    const summary = summarizeExecutiveCampaignMetrics(buildExecutiveCampaignMetrics(report.campaignMetrics))

    expect(summary).toMatchObject({
      spend: 1200,
      impressions: 10000,
      clicks: 500,
      leads: 40,
      cpl: 30,
      opportunities: 12,
      proposals: 6,
      clients: 2,
      revenue: 7200,
      mroi: 5,
      syncStatus: 'connected',
    })
  })

  it('exposes report presets for the growth workspace', () => {
    expect(buildReportPresets().map(preset => preset.key)).toEqual([
      'campaign_performance',
      'lead_source_roi',
      'landing_page_conversion',
      'whatsapp_follow_up',
      'automation_impact',
      'sector_onboarding_progress',
      'brand_knowledge_readiness',
    ])
  })

  it('adds attribution caveat when AI insight has no attribution data', () => {
    const insight = buildReportAiInsight({ ...report, crmAttribution: undefined })

    expect(insight.dataGaps).toContain('Atribuicao CRM/MROI indisponivel para confirmar origem de receita.')
    expect(insight.attributionCaveat).toContain('nao causalidade')
  })
})
