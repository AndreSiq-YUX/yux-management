import { describe, expect, it } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { createRevenueRecoveryPlan, REVENUE_RECOVERY_PACK_V0 } from '../src/modules/action-engine/packs/revenue-recovery-v0.js'
import { compileMissionPlan } from '../src/modules/action-engine/planner.js'

const missionId = '00000000-0000-4000-8000-000000000001'
const registry = createActionEngineCapabilityRegistry()
const metadata = new Map(registry.listMetadata().map((item) => [`${item.key}@${item.version}`, item]))

function rawPlan(): any {
  const plan = createRevenueRecoveryPlan({
    targetRevenueBrl: '10000', deadlineDays: 30, inactiveDays: 60, canarySize: 20, maxPopulation: 100,
    maxTotalCostBrl: '1000', maxHumanHours: '10', humanHourlyRateBrl: '100', minimumValueCostRatio: '3', channels: ['human_task'],
  })
  return {
    schemaVersion: 1, missionId,
    actionPack: { key: plan.packKey, version: plan.packVersion, templateHash: plan.packContentHash },
    resolvedParameters: plan.parameters, deviations: [], rationale: 'Plano protegido', assumptions: [], risks: [],
    estimatedEconomics: { currency: 'BRL', aiAndProviderCost: '10', mediaCost: '0', humanHours: '2', humanCost: '200', totalExecutionCost: '210' },
    steps: plan.steps.map((step) => ({
      stepKey: step.stepKey, dependsOn: step.dependsOn, capabilityKey: step.capabilityKey,
      capabilityVersion: step.capabilityVersion, input: step.parameters, timeoutSeconds: 300, maxAttempts: 3,
      approvalRequired: step.approvalRequired,
      effect: metadata.get(`${step.capabilityKey}@${step.capabilityVersion}`)?.effect ?? 'none', outputBindings: {},
    })),
  }
}

function compile(raw: unknown, maxTotalCostBrl = '1000') {
  return compileMissionPlan({ rawPlan: raw, missionId, pack: REVENUE_RECOVERY_PACK_V0, registry, maxTotalCostBrl })
}

describe('Action Engine deterministic plan compiler', () => {
  it('compiles a valid protected plan to a stable hash', () => {
    const raw = rawPlan()
    const first = compile(raw)
    const second = compile(structuredClone(raw))
    expect(first.planHash).toMatch(/^[a-f0-9]{64}$/)
    expect(first.planHash).toBe(second.planHash)
    expect(first.steps.find((step) => step.stepKey === 'pack.approve_canary')?.approvalRequired).toBe(true)
  })

  it('rejects pack drift, protected removal and unknown capabilities', () => {
    const drifted = rawPlan(); drifted.actionPack.templateHash = 'b'.repeat(64)
    expect(() => compile(drifted)).toThrowError('action_pack_hash_mismatch')
    const missing = rawPlan(); missing.steps = missing.steps.filter((step: { stepKey: string }) => step.stepKey !== 'pack.evaluate')
    expect(() => compile(missing)).toThrowError('action_pack_protected_step_missing')
    const unknown = rawPlan(); unknown.steps[0].capabilityKey = 'campaign.change_budget'
    expect(() => compile(unknown)).toThrowError('action_pack_protected_step_changed')
  })

  it('rejects missing dependencies and cycles before persistence', () => {
    const missing = rawPlan(); missing.steps[1].dependsOn = ['does.not.exist']
    expect(() => compile(missing)).toThrowError('mission_plan_dependency_missing')
    const cyclic = rawPlan(); cyclic.steps[0].dependsOn = ['pack.evaluate']
    expect(() => compile(cyclic)).toThrowError('mission_plan_cycle_detected')
  })

  it('validates capability inputs and output bindings', () => {
    const invalidInput = rawPlan(); invalidInput.steps[0].input = { requiredModules: 'crm' }
    expect(() => compile(invalidInput)).toThrowError('mission_plan_capability_input_invalid')
    const invalidBinding = rawPlan(); invalidBinding.steps[1].outputBindings = { value: { fromStep: 'pack.evaluate', path: '$.value' } }
    expect(() => compile(invalidBinding)).toThrowError('mission_plan_output_binding_invalid')
  })

  it('enforces extension points, approvals and budget', () => {
    const deviation = rawPlan(); deviation.deviations = [{ path: 'free_dag', reason: 'fora do pack', approvalRequired: true }]
    expect(() => compile(deviation)).toThrowError('action_pack_extension_point_unknown')
    const noApproval = rawPlan(); noApproval.steps.find((step: { stepKey: string }) => step.stepKey === 'pack.approve_canary')!.approvalRequired = false
    expect(() => compile(noApproval)).toThrowError('mission_plan_required_approval_missing')
    expect(() => compile(rawPlan(), '100')).toThrowError('mission_plan_budget_exceeded')
  })

  it('rejects invalid wait timeouts at the contract boundary', () => {
    const invalid = rawPlan(); invalid.steps.find((step: { stepKey: string }) => step.stepKey === 'pack.wait_signals')!.timeoutSeconds = 0
    expect(() => compile(invalid)).toThrowError('mission_plan_contract_invalid')
  })
})
