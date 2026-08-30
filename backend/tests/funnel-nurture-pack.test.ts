import { describe, expect, it } from 'vitest'
import { validatePackParameters, validatePlanConformance } from '../src/modules/action-engine/action-pack.js'
import { createFunnelNurturePlan, FUNNEL_NURTURE_PACK_V1 } from '../src/modules/action-engine/packs/funnel-nurture-v1.js'

const parameters = { icp: 'Donos de clínicas', offer: 'Consultoria de crescimento', targetOutcome: 'qualified_lead' as const,
  observationDays: 30, maxTotalCostBrl: '1000', maxHumanHours: '8', humanHourlyRateBrl: '100', expectedReplyRate: 0.05, maximumOptOutRate: 0.02 }

describe('Funnel + Nurture Action Pack v1', () => {
  it('has an immutable identity, bounded parameters and complete protected topology', () => {
    expect(FUNNEL_NURTURE_PACK_V1).toMatchObject({ key: 'funnel_nurture', semanticVersion: '1.0.0', status: 'published' })
    expect(FUNNEL_NURTURE_PACK_V1.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(validatePackParameters(parameters, FUNNEL_NURTURE_PACK_V1).success).toBe(true)
    expect(validatePackParameters({ ...parameters, icp: '' }, FUNNEL_NURTURE_PACK_V1).success).toBe(false)
    expect(FUNNEL_NURTURE_PACK_V1.protectedStepKeys).toEqual(expect.arrayContaining([
      'pack.inspect','pack.draft_funnel','pack.draft_email_1','pack.draft_sequence','pack.draft_flow',
      'pack.simulate_funnel','pack.simulate_sequence','pack.simulate_flow','pack.approve_publication',
      'pack.publish_funnel','pack.publish_email_1','pack.publish_sequence','pack.publish_flow','pack.baseline','pack.evaluate',
    ]))
  })

  it('accepts the canonical plan and rejects removed protected nodes', () => {
    expect(() => validatePlanConformance(createFunnelNurturePlan(parameters), FUNNEL_NURTURE_PACK_V1)).not.toThrow()
    const plan = createFunnelNurturePlan(parameters)
    plan.steps = plan.steps.filter(step => step.stepKey !== 'pack.simulate_flow')
    expect(() => validatePlanConformance(plan, FUNNEL_NURTURE_PACK_V1)).toThrow('action_pack_protected_step_missing')
  })

  it('requires every publication node to remain behind exact approval', () => {
    const plan = createFunnelNurturePlan(parameters)
    plan.steps.find(step => step.stepKey === 'pack.publish_sequence')!.approvalRequired = false
    expect(() => validatePlanConformance(plan, FUNNEL_NURTURE_PACK_V1)).toThrow('action_pack_publication_approval_missing')
  })

  it('limits extensions to scoring context and internal owner tasks', () => {
    expect(FUNNEL_NURTURE_PACK_V1.extensionPoints.map(item => item.key)).toEqual(['optional_scoring_fields','internal_owner_tasks'])
    expect(FUNNEL_NURTURE_PACK_V1.policyDefaults).toMatchObject({ setupEnrollsExistingLeads: false, activationCapabilitiesDisabledByDefault: true })
  })

  it('tracks operational, guardrail, cost and human intervention metrics from the first run', () => {
    expect(FUNNEL_NURTURE_PACK_V1.metricSpec).toMatchObject({
      operational: expect.arrayContaining(['published_artifact_count','enrollment_readiness','funnel_conversion_baseline','reply_rate']),
      guardrails: expect.arrayContaining(['opt_out_rate','consent_blocks','suppression_blocks']),
      unknownPolicy: 'preserve_unknown_when_identity_unresolved',
    })
    expect(FUNNEL_NURTURE_PACK_V1.economicsSpec).toMatchObject({ trackFromFirstRun: true, formulas: expect.objectContaining({ valueCostRatio: expect.any(String), valuePerHumanHour: expect.any(String), interventionRate: expect.any(String) }) })
  })
})
