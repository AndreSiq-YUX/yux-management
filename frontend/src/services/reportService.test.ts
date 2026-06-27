import { describe, expect, it } from 'vitest'
import { buildMetricCachePayload, buildOperationalReport, mapReportSnapshot } from './reportService'

describe('reportService helpers', () => {
  it('builds operational report aggregates from module rows', () => {
    const report = buildOperationalReport({
      organizationId: 'org-1',
      leads: [
        { source_kind: 'instagram', stage: 'NEW', status: 'open', owner_name: 'Ana' },
        { source_kind: 'instagram', stage: 'QUALIFIED', status: 'open', owner_name: 'Ana' },
      ],
      campaigns: [{
        id: 'campaign-1',
        name: 'Botox',
        spend: 1200,
        impressions: 10000,
        clicks: 500,
        leads: 40,
        opportunities: 12,
        proposal_count: 6,
        client_count: 2,
        attributed_revenue: 6000,
        provider_sync_status: 'connected',
      }],
      landingPages: [{ id: 'lp-1', name: 'Landing Botox', visits: 1000, leads: 83 }],
      proposals: [{ status: 'sent' }, { status: 'approved' }],
      conversations: [{ first_response_minutes: 120 }],
      interactions: [{ owner_name: 'Ana' }],
      projects: [{ status: 'active' }],
    })

    expect(report.leadsBySource).toEqual([{ source: 'instagram', leads: 2 }])
    expect(report.campaignMetrics[0]).toMatchObject({ cpl: 30, mroi: 4 })
    expect(report.executiveCampaignMetrics?.[0]).toMatchObject({ clicks: 500, opportunities: 12, proposals: 6, clients: 2, syncStatus: 'connected' })
    expect(report.reportPresets?.map(preset => preset.key)).toContain('campaign_performance')
    expect(report.aiInsight?.topOpportunity).toBeTruthy()
    expect(report.landingPageMetrics[0]).toMatchObject({ conversionRate: 8.3 })
    expect(report.proposalMetrics).toMatchObject({ sent: 2, approved: 1, approvalRate: 50 })
  })

  it('maps report snapshots without exposing raw payload shape', () => {
    expect(mapReportSnapshot({
      id: 'snapshot-1',
      organization_id: 'org-1',
      scope: 'internal',
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      generated_at: '2026-06-03T12:00:00.000Z',
      metrics: { campaignMetrics: [] },
    })).toEqual(expect.objectContaining({
      id: 'snapshot-1',
      organizationId: 'org-1',
      scope: 'internal',
      metrics: { campaignMetrics: [] },
    }))
  })

  it('builds metric cache payloads for stable keys', () => {
    expect(buildMetricCachePayload({
      organizationId: 'org-1',
      metricKey: 'campaign.mroi',
      value: 4,
    })).toEqual({
      organization_id: 'org-1',
      metric_key: 'campaign.mroi',
      metric_value: 4,
      dimensions: {},
    })
  })
})
