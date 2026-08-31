import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { validatePackParameters, validatePlanConformance } from '../src/modules/action-engine/action-pack.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { decideCampaignOptimization, validateBoundedBudgetChange } from '../src/modules/action-engine/capabilities/campaign-optimization.js'
import { CAMPAIGN_OPTIMIZATION_PACK_V1, createCampaignOptimizationPlan } from '../src/modules/action-engine/packs/campaign-optimization-v1.js'
import { handleCampaignOptimizationCheckpoints } from '../src/jobs/handlers/action-engine.js'

const parameters = {
  campaignId: '11111111-1111-4111-8111-111111111111',
  campaignVersionId: '22222222-2222-4222-8222-222222222222', checkpointFrequency: 'hourly' as const,
  minimumImpressions: 1000, minimumClicks: 50, minimumLeadsForScale: 5, minimumCtr: '0.01',
  targetCplBrl: '50', maximumCplBrl: '100', maxBudgetAdjustmentPercent: '10',
  maxTotalCostBrl: '1000', maxHumanHours: '4',
}

describe('Campaign Optimization Action Pack v1', () => {
  it('publishes an immutable bounded pack and migration', () => {
    expect(CAMPAIGN_OPTIMIZATION_PACK_V1).toMatchObject({
      key: 'campaign_optimization', semanticVersion: '1.0.0', status: 'published_for_internal_pilot',
      outcomeType: 'continuous_campaign_optimization',
    })
    expect(CAMPAIGN_OPTIMIZATION_PACK_V1.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(validatePackParameters(parameters, CAMPAIGN_OPTIMIZATION_PACK_V1).success).toBe(true)
    expect(validatePackParameters({ ...parameters, maxBudgetAdjustmentPercent: '21' }, CAMPAIGN_OPTIMIZATION_PACK_V1).success).toBe(false)
    const sql = readFileSync(new URL('../src/db/migrations/0145_campaign_optimization_pack.sql', import.meta.url), 'utf8')
    expect(sql).toContain('action_campaign_optimization_checkpoints')
    expect(sql).toContain(CAMPAIGN_OPTIMIZATION_PACK_V1.contentHash)
    expect(sql).toContain('campaign_optimization_agent')
    expect(sql).toContain('private.rls_can_access_organization(organization_id)')
    expect(sql).not.toContain('public.app_can_access_organization')
  })

  it('accepts the protected topology and requires exact approval for an increase extension', () => {
    expect(() => validatePlanConformance(createCampaignOptimizationPlan(parameters), CAMPAIGN_OPTIMIZATION_PACK_V1)).not.toThrow()
    const plan = createCampaignOptimizationPlan(parameters)
    const checkpoint = plan.steps.find(step => step.stepKey === 'pack.record_checkpoint')!
    const action = {
      stepKey: 'extension.increase_budget', capabilityKey: 'campaign.budget.increase', capabilityVersion: 1,
      dependsOn: ['pack.evaluate_guardrails'], parameters: {}, approvalRequired: false, protected: false,
      extensionPoint: 'bounded_optimization_action',
    }
    checkpoint.dependsOn = [action.stepKey]
    plan.steps.splice(plan.steps.indexOf(checkpoint), 0, action)
    expect(() => validatePlanConformance(plan, CAMPAIGN_OPTIMIZATION_PACK_V1)).toThrow('action_pack_campaign_budget_increase_approval_missing')
    action.approvalRequired = true
    expect(() => validatePlanConformance(plan, CAMPAIGN_OPTIMIZATION_PACK_V1)).not.toThrow()
  })

  it('waits for a minimum sample and pauses immediately when tracking is lost', () => {
    expect(decision({ impressions: 999 })).toMatchObject({ conclusion: 'observe', reason: 'campaign_sample_insufficient' })
    expect(decision({ trackingKnown: false })).toMatchObject({ conclusion: 'pause', reason: 'campaign_tracking_lost' })
  })

  it('recommends a creative for weak CTR, decreases high CPL and requires approval to scale', () => {
    expect(decision({ impressions: 10_000, clicks: 50, leads: 0, spendBrl: '200' })).toMatchObject({ conclusion: 'creative_draft' })
    expect(decision({ impressions: 10_000, clicks: 500, leads: 1, spendBrl: '150' })).toMatchObject({
      conclusion: 'decrease_budget', nextDailyBudgetBrl: '90.00', requiresApproval: false,
    })
    expect(decision({ impressions: 10_000, clicks: 500, leads: 10, spendBrl: '300' })).toMatchObject({
      conclusion: 'increase_budget', nextDailyBudgetBrl: '110.00', requiresApproval: true,
    })
  })

  it('enforces direction and the 20 percent hard ceiling on provider mutations', () => {
    expect(validateBoundedBudgetChange({ currentDailyBudgetBrl: '100', nextDailyBudgetBrl: '90', maxAdjustmentPercent: '10', direction: 'decrease' })).toMatchObject({ adjustmentPercent: '10.0000' })
    expect(() => validateBoundedBudgetChange({ currentDailyBudgetBrl: '100', nextDailyBudgetBrl: '79', maxAdjustmentPercent: '20', direction: 'decrease' })).toThrow('campaign_budget_adjustment_exceeds_ceiling')
    expect(() => validateBoundedBudgetChange({ currentDailyBudgetBrl: '100', nextDailyBudgetBrl: '110', maxAdjustmentPercent: '10', direction: 'decrease' })).toThrow('campaign_budget_adjustment_direction_invalid')
  })

  it('registers only draft, bounded budget and pause capabilities; publication is absent', () => {
    const metadata = createActionEngineCapabilityRegistry().listMetadata()
    expect(metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: 'campaign.optimization.evaluate', effect: 'none' }),
      expect.objectContaining({ key: 'campaign.budget.decrease_bounded', approval: 'risk_based' }),
      expect.objectContaining({ key: 'campaign.budget.increase', approval: 'always' }),
      expect.objectContaining({ key: 'marketing.creative.optimization_draft', effect: 'draft' }),
    ]))
    expect(metadata.some(item => item.key === 'marketing.creative.optimization_publish')).toBe(false)
  })

  it('records one durable checkpoint for a repeated hourly scheduler window', async () => {
    let inserted = false
    const candidate = {
      mission_id:'33333333-3333-4333-8333-333333333333',organization_id:'44444444-4444-4444-8444-444444444444',
      plan_id:'55555555-5555-4555-8555-555555555555',mission_version:4,parameters:{...parameters,minimumImpressions:1000},
      campaign_id:parameters.campaignId,campaign_version_id:parameters.campaignVersionId,daily_budget_brl:'100',spent_brl:'10',
      impressions:100,clicks:5,leads:0,tracking_known:true,
    }
    const clientQuery = vi.fn(async (sql: string) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
      if (sql.includes('INSERT INTO public.action_campaign_optimization_checkpoints')) {
        if (inserted) return { rows: [] }
        inserted = true; return { rows: [{ id: '66666666-6666-4666-8666-666666666666' }] }
      }
      if (sql.includes('INSERT INTO public.action_evaluations')) return { rows: [{ id: '77777777-7777-4777-8777-777777777777' }] }
      throw new Error(`unexpected_query:${sql.slice(0,80)}`)
    })
    const pool = {
      query: vi.fn(async () => ({ rows: [candidate] })),
      async connect() { return { query: clientQuery, release() {} } },
    }
    const first = await handleCampaignOptimizationCheckpoints(pool as never, { now: '2026-08-31T12:15:00.000Z' })
    const duplicate = await handleCampaignOptimizationCheckpoints(pool as never, { now: '2026-08-31T12:45:00.000Z' })
    expect(first).toMatchObject({ recorded: 1, duplicates: 0 })
    expect(duplicate).toMatchObject({ recorded: 0, duplicates: 1 })
    expect(clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO public.action_evaluations'))).toHaveLength(1)
  })
})

function decision(overrides: Partial<Parameters<typeof decideCampaignOptimization>[0]> = {}) {
  return decideCampaignOptimization({
    trackingKnown:true,impressions:2000,clicks:100,leads:2,spendBrl:'100',currentDailyBudgetBrl:'100',
    minimumImpressions:1000,minimumClicks:50,minimumLeadsForScale:5,minimumCtr:'0.01',targetCplBrl:'50',
    maximumCplBrl:'100',maxBudgetAdjustmentPercent:'10',...overrides,
  })
}
