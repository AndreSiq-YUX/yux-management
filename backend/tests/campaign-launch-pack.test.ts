import { describe, expect, it } from 'vitest'
import { validatePackParameters, validatePlanConformance } from '../src/modules/action-engine/action-pack.js'
import {
  CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY,
  CAMPAIGN_LAUNCH_PACK_V1,
  createCampaignLaunchPlan,
} from '../src/modules/action-engine/packs/campaign-launch-v1.js'

const parameters = {
  icp: 'Gestores de empresas B2B',
  offer: 'Diagnóstico de crescimento',
  platform: 'meta' as const,
  providerConnectionId: '11111111-1111-4111-8111-111111111111',
  dailyBudgetBrl: '50',
  totalBudgetBrl: '1500',
  targetLeads: 50,
  maximumCplBrl: '100',
  observationDays: 30,
  maxTotalCostBrl: '2000',
  maxHumanHours: '8',
  humanHourlyRateBrl: '100',
}

describe('Campaign Launch Action Pack v1', () => {
  it('has an immutable identity and validates bounded launch parameters', () => {
    expect(CAMPAIGN_LAUNCH_PACK_V1).toMatchObject({
      key: 'campaign_launch', semanticVersion: '1.0.0', status: 'published', outcomeType: 'paid_campaign_launch',
    })
    expect(CAMPAIGN_LAUNCH_PACK_V1.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(validatePackParameters(parameters, CAMPAIGN_LAUNCH_PACK_V1).success).toBe(true)
    expect(validatePackParameters({ ...parameters, totalBudgetBrl: '10' }, CAMPAIGN_LAUNCH_PACK_V1).success).toBe(false)
  })

  it('accepts the canonical topology and rejects a removed protected step', () => {
    expect(() => validatePlanConformance(createCampaignLaunchPlan(parameters), CAMPAIGN_LAUNCH_PACK_V1)).not.toThrow()
    const plan = createCampaignLaunchPlan(parameters)
    plan.steps = plan.steps.filter(step => step.stepKey !== 'pack.validate_tracking')
    expect(() => validatePlanConformance(plan, CAMPAIGN_LAUNCH_PACK_V1)).toThrow('action_pack_protected_step_missing')
  })

  it('keeps provider creation paused and activation behind exact approval ordering', () => {
    const plan = createCampaignLaunchPlan(parameters)
    expect(plan.steps.map(step => step.stepKey)).toEqual(expect.arrayContaining([
      'pack.readiness', 'pack.inspect', 'pack.draft_landing_page', 'pack.draft_lead_form',
      'pack.validate_tracking', 'pack.draft_campaign', 'pack.draft_creative',
      'pack.create_provider_paused', 'pack.approve_launch', 'pack.activate',
      'pack.collect_metrics_and_costs', 'pack.evaluate',
    ]))
    plan.steps.find(step => step.stepKey === 'pack.activate')!.approvalRequired = false
    expect(() => validatePlanConformance(plan, CAMPAIGN_LAUNCH_PACK_V1)).toThrow('action_pack_campaign_activation_approval_missing')
  })

  it('publishes campaign metrics, economics, guardrails and exact attribution semantics', () => {
    expect(CAMPAIGN_LAUNCH_ATTRIBUTION_POLICY).toMatchObject({
      version: 1, model: 'last_touch', windowDays: 30,
      identityResolution: 'exact_campaign_utm_or_declared_lead_binding',
    })
    expect(CAMPAIGN_LAUNCH_PACK_V1.metricSpec).toMatchObject({
      primary: expect.arrayContaining([
        expect.objectContaining({ key: 'leads' }),
        expect.objectContaining({ key: 'qualified_leads' }),
        expect.objectContaining({ key: 'attributed_revenue_brl', attributionPolicyHash: expect.stringMatching(/^[a-f0-9]{64}$/) }),
      ]),
      leading: expect.arrayContaining(['impressions', 'clicks', 'ctr', 'landing_conversion_rate']),
      economics: expect.arrayContaining(['spend_brl', 'total_execution_cost_brl', 'cpl_brl', 'mroi']),
      guardrails: expect.arrayContaining(['total_budget_brl', 'daily_budget_brl', 'consent_blocks', 'tracking_failure', 'complaint_rate']),
      unknownPolicy: 'revenue_and_mroi_unknown_when_identity_or_tracking_unresolved',
    })
    expect(CAMPAIGN_LAUNCH_PACK_V1.economicsSpec).toMatchObject({ trackFromFirstRun: true })
  })
})
