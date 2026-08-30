import { describe, expect, it } from 'vitest'
import {
  deriveCampaignLaunchMetricSnapshot,
  evaluateCampaignLaunchMetrics,
  type CampaignLaunchMetricSource,
} from '../src/modules/action-engine/metrics/campaign-launch.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from '../src/modules/action-engine/packs/campaign-launch-v1.js'
import type { ActionMission } from '../src/modules/action-engine/types.js'

const mission: ActionMission = {
  id: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  packVersionId: '33333333-3333-4333-8333-333333333333',
  status: 'active', mode: 'assisted', title: 'Campanha', objective: 'Gerar leads',
  goal: { statement: 'Gerar leads', requestedOutcome: 'paid_campaign_launch', scopeHints: ['campaigns'], constraints: {}, acceptanceCriteria: [] },
  autonomyEnvelope: { mode: 'assisted', allowedModules: ['campaigns'], allowedCapabilityKeys: [], maxTotalCostBrl: '2000', maxHumanHours: '8', expiresAt: '2026-10-01T00:00:00.000Z', alwaysRequireApprovalFor: ['external'] },
  packSelection: {},
  parameters: { targetLeads: 20, maximumCplBrl: '50', totalBudgetBrl: '1000' },
  budget: {}, deadlineAt: '2026-10-01T00:00:00.000Z', version: 1,
  createdBy: '44444444-4444-4444-8444-444444444444',
  createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z',
}

const campaign = {
  id: '55555555-5555-4555-8555-555555555555', lifecycle_status: 'active', spent: '100', impressions: 1000, clicks: 100, leads: 5,
  total_budget: '1000', daily_budget: '100', utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'launch-1',
  snapshot_id: '66666666-6666-4666-8666-666666666666', snapshot_at: '2026-08-30T12:00:00.000Z', snapshot_spend: '100',
  snapshot_impressions: 1000, snapshot_clicks: 100, snapshot_leads: 5, raw_metrics: { dailySpendBrl: '50' },
}

const economics = {
  producedValueBrl: '0', totalExecutionCostBrl: '0', netValueBrl: '0',
  valueCostRatio: 'not_applicable' as const, valuePerHumanHourBrl: 'not_applicable' as const,
  humanFreeExecutionRate: 'not_applicable' as const,
}

function source(overrides: Partial<CampaignLaunchMetricSource> = {}): CampaignLaunchMetricSource {
  return { campaign, observations: [], executionCostBrl: '20', killSwitchActive: false, mission, measuredAt: '2026-08-30T12:00:00.000Z', ...overrides }
}

function observation(id: string, eventType: string, payload: Record<string, unknown>) {
  return { id, observation_type: eventType, source_event_id: id, payload: { eventType, ...payload }, observed_at: '2026-08-15T12:00:00.000Z' }
}

describe('Campaign Launch pack metric collector and evaluator', () => {
  it('preserves unknown revenue and MROI when tracking is unresolved', () => {
    const snapshot = deriveCampaignLaunchMetricSnapshot(source({ campaign: { ...campaign, utm_campaign: null } }))
    expect(snapshot.metrics.attributed_revenue_brl).toMatchObject({ kind: 'unknown', reason: 'campaign_tracking_unresolved' })
    expect(snapshot.metrics.mroi).toMatchObject({ kind: 'unknown' })
    expect(evaluateCampaignLaunchMetrics({ mission, snapshot, economics, now: '2026-08-30T12:00:00.000Z' }).conclusion).toBe('block')
  })

  it('distinguishes known zero from not-applicable ratios', () => {
    const snapshot = deriveCampaignLaunchMetricSnapshot(source({ campaign: { ...campaign, spent: '0', snapshot_spend: '0', impressions: 0, snapshot_impressions: 0, clicks: 0, snapshot_clicks: 0, leads: 0, snapshot_leads: 0 } }))
    expect(snapshot.metrics.leads).toEqual({ kind: 'known', value: '0', unit: 'count' })
    expect(snapshot.metrics.attributed_revenue_brl).toEqual({ kind: 'known', value: '0', unit: 'BRL' })
    expect(snapshot.metrics.ctr).toMatchObject({ kind: 'not_applicable', reason: 'zero_denominator' })
  })

  it('pauses deterministically for budget and tracking guardrails', () => {
    const budget = deriveCampaignLaunchMetricSnapshot(source({ campaign: { ...campaign, snapshot_spend: '1000.01' } }))
    expect(budget.signals.reasons).toContain('campaign_total_budget_breached')
    expect(evaluateCampaignLaunchMetrics({ mission, snapshot: budget, economics, now: '2026-08-30T12:00:00.000Z' }).conclusion).toBe('pause')

    const tracking = deriveCampaignLaunchMetricSnapshot(source({ observations: [observation('77777777-7777-4777-8777-777777777777', 'tracking_failure', {})] }))
    expect(evaluateCampaignLaunchMetrics({ mission, snapshot: tracking, economics, now: '2026-08-30T12:00:00.000Z' }).reasons).toContain('campaign_tracking_failed')
  })

  it('proposes replan when CPL is off-track after the minimum sample', () => {
    const snapshot = deriveCampaignLaunchMetricSnapshot(source({ campaign: { ...campaign, snapshot_spend: '500', snapshot_leads: 5 } }))
    expect(snapshot.metrics.cpl_brl).toEqual({ kind: 'known', value: '104', unit: 'BRL' })
    expect(evaluateCampaignLaunchMetrics({ mission, snapshot, economics, now: '2026-08-30T12:00:00.000Z' }).conclusion).toBe('propose_replan')
  })

  it('deduplicates provider events and exposes the exact attribution proof', () => {
    const touchId = '88888888-8888-4888-8888-888888888888'
    const revenueId = '99999999-9999-4999-8999-999999999999'
    const observations = [
      observation(touchId, 'campaign_click', { bindingId: 'lead-1' }),
      { ...observation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'campaign_click', { bindingId: 'lead-1' }), source_event_id: touchId },
      observation(revenueId, 'invoice_paid', { bindingId: 'lead-1', amountBrl: '500', currency: 'BRL' }),
      { ...observation('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'invoice_paid', { bindingId: 'lead-1', amountBrl: '500', currency: 'BRL' }), source_event_id: revenueId },
    ]
    const snapshot = deriveCampaignLaunchMetricSnapshot(source({ observations }))
    expect(snapshot.metrics.attributed_revenue_brl).toEqual({ kind: 'known', value: '500', unit: 'BRL' })
    expect(snapshot.evidence.attributed_revenue_brl?.attribution).toMatchObject({
      status: 'versioned', policyVersion: 1,
      policyHash: (CAMPAIGN_LAUNCH_PACK_V1.metricSpec.primary as Array<{ attributionPolicyHash?: string }>)[2]?.attributionPolicyHash,
      eventIds: [touchId, revenueId],
    })
  })

  it('keeps attribution unknown when an observed revenue identity cannot be resolved', () => {
    const snapshot = deriveCampaignLaunchMetricSnapshot(source({
      observations: [observation('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'invoice_paid', { amountBrl: '500', currency: 'BRL' })],
    }))
    expect(snapshot.metrics.attributed_revenue_brl).toMatchObject({ kind: 'unknown', reason: 'attribution_identity_unresolved' })
  })

  it('reflects provider pause and succeeds when the lead target is achieved', () => {
    const paused = deriveCampaignLaunchMetricSnapshot(source({ campaign: { ...campaign, lifecycle_status: 'paused' } }))
    expect(evaluateCampaignLaunchMetrics({ mission, snapshot: paused, economics, now: '2026-08-30T12:00:00.000Z' }).reasons).toContain('campaign_provider_paused')

    const achieved = deriveCampaignLaunchMetricSnapshot(source({ campaign: { ...campaign, snapshot_leads: 20 } }))
    expect(evaluateCampaignLaunchMetrics({ mission, snapshot: achieved, economics, now: '2026-08-30T12:00:00.000Z' }).conclusion).toBe('succeed')
  })
})
