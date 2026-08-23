import { describe, expect, it } from 'vitest'
import { validatePackParameters, validatePlanConformance } from '../src/modules/action-engine/action-pack.js'
import { createRevenueRecoveryPlan, REVENUE_RECOVERY_PACK_V0 } from '../src/modules/action-engine/packs/revenue-recovery-v0.js'

const parameters = {
  targetRevenueBrl: '10000', deadlineDays: 30, inactiveDays: 60, canarySize: 20,
  maxPopulation: 100, maxTotalCostBrl: '1000', maxHumanHours: '10', humanHourlyRateBrl: '100',
  minimumValueCostRatio: '3', channels: ['human_task'] as Array<'human_task' | 'email' | 'whatsapp' | 'automation'>,
}

describe('Revenue Recovery Pack v0', () => {
  it('has a stable published identity and accepts bounded pilot parameters', () => {
    expect(REVENUE_RECOVERY_PACK_V0.key).toBe('revenue_recovery')
    expect(REVENUE_RECOVERY_PACK_V0.semanticVersion).toBe('0.2.0')
    expect(REVENUE_RECOVERY_PACK_V0.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(validatePackParameters({ targetRevenueBrl: '10000', canarySize: 20 }, REVENUE_RECOVERY_PACK_V0).success).toBe(true)
    expect(validatePackParameters({ targetRevenueBrl: '10000', canarySize: 21 }, REVENUE_RECOVERY_PACK_V0).success).toBe(false)
  })

  it('accepts the canonical topology', () => {
    const plan = createRevenueRecoveryPlan(parameters)
    expect(() => validatePlanConformance(plan, REVENUE_RECOVERY_PACK_V0)).not.toThrow()
  })

  it('rejects missing approval/protected steps and unknown capabilities', () => {
    const withoutApproval = createRevenueRecoveryPlan(parameters)
    withoutApproval.steps = withoutApproval.steps.filter((step) => step.stepKey !== 'pack.approve_canary')
    expect(() => validatePlanConformance(withoutApproval, REVENUE_RECOVERY_PACK_V0)).toThrowError('action_pack_protected_step_missing')

    const unknownCapability = createRevenueRecoveryPlan(parameters)
    unknownCapability.steps[0].capabilityKey = 'crm.unknown'
    expect(() => validatePlanConformance(unknownCapability, REVENUE_RECOVERY_PACK_V0)).toThrowError('action_pack_protected_step_changed')
  })

  it('rejects a protected reordering', () => {
    const plan = createRevenueRecoveryPlan(parameters)
    const first = plan.steps[0]
    plan.steps[0] = plan.steps[1]
    plan.steps[1] = first
    expect(() => validatePlanConformance(plan, REVENUE_RECOVERY_PACK_V0)).toThrowError('action_pack_protected_order_invalid')
  })
})
