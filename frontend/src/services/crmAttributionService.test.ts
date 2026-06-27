import { describe, expect, it, vi } from 'vitest'
import {
  buildAttributionCsv,
  buildAttributionDashboard,
  buildAttributionEventPayload,
  buildLeadSourcePayload,
  buildReportExportPayload,
  mapLeadSourceRollup,
  mapMroiAlert,
} from './crmAttributionService'
import { sanitizePortalAttribution } from '@/lib/crm/attributionRules'
import type { LeadSourceRollup } from '@/types/crmAttribution'

vi.mock('@/lib/crmOpsDataClient', () => ({
  crmOpsDataClient: {},
}))

const rollup: LeadSourceRollup = {
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

describe('crmAttributionService builders and mappers', () => {
  it('builds source and event payloads from UTM attribution', () => {
    const input = {
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      leadId: 'lead-1',
      source: 'Meta Ads',
      campaignId: 'campaign-1',
      landingPageId: 'lp-1',
      utm: { source: 'Meta Ads', medium: 'CPC', campaign: 'Botox Junho' },
      occurredAt: '2026-06-04T12:00:00Z',
    }

    expect(buildLeadSourcePayload(input)).toMatchObject({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      key: 'botox_junho',
      kind: 'paid_campaign',
      campaign_id: 'campaign-1',
      landing_page_id: 'lp-1',
      utm_source: 'meta_ads',
      utm_medium: 'cpc',
    })

    expect(buildAttributionEventPayload({ ...input, eventKind: 'campaign_click' }, 'source-1')).toMatchObject({
      lead_id: 'lead-1',
      source_id: 'source-1',
      event_kind: 'campaign_click',
      campaign_id: 'campaign-1',
      metadata: {},
    })
  })

  it('maps rollups and alerts from database rows', () => {
    expect(mapLeadSourceRollup({
      id: 'rollup-1',
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      source_id: 'source-1',
      lead_sources: { key: 'google', name: 'Google', kind: 'paid_campaign' },
      period_start: '2026-06-01',
      period_end: '2026-06-30',
      leads: 10,
      opportunities: 4,
      sales: 2,
      media_cost: '700',
      operational_cost: '100',
      client_visible_cost: '700',
      attributed_revenue: '3000',
      cpl: '70',
      opportunity_rate: '40',
      conversion_rate: '20',
      mroi: '2.8',
    })).toMatchObject({
      sourceName: 'Google',
      mediaCost: 700,
      mroi: 2.8,
    })

    expect(mapMroiAlert({
      id: 'alert-1',
      organization_id: 'org-1',
      severity: 'warning',
      status: 'open',
      title: 'Lead caro',
      description: 'CPL alto',
      metric_key: 'cpl',
      metric_value: '250',
      threshold_value: '100',
    })).toMatchObject({
      title: 'Lead caro',
      metricKey: 'cpl',
      metricValue: 250,
    })
  })

  it('builds dashboard totals and portal-safe views', () => {
    const dashboard = buildAttributionDashboard({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      rollups: [rollup],
    })

    expect(dashboard.totals).toMatchObject({
      leads: 20,
      sales: 4,
      cpl: 50,
      conversionRate: 20,
      mroi: 3,
    })

    const safe = sanitizePortalAttribution(dashboard)
    expect(safe.sources[0]).not.toHaveProperty('operationalCost')
    expect(safe.sources[0].mroi).toBe(5)
  })

  it('exports internal and portal CSV payloads', () => {
    const dashboard = buildAttributionDashboard({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      rollups: [rollup],
    })

    expect(buildAttributionCsv(dashboard.sources, 'internal')).toContain('Custo operacional')
    expect(buildAttributionCsv(sanitizePortalAttribution(dashboard).sources, 'portal')).not.toContain('Custo operacional')

    expect(buildReportExportPayload({ dashboard, scope: 'internal', requestedBy: 'user-1' })).toMatchObject({
      organization_id: 'org-1',
      crm_instance_id: 'crm-1',
      scope: 'internal',
      row_count: 1,
      requested_by: 'user-1',
    })
  })
})
