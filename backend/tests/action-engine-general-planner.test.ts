import { describe, expect, it } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { createRevenueRecoveryPlan, REVENUE_RECOVERY_PACK_V0 } from '../src/modules/action-engine/packs/revenue-recovery-v0.js'
import { compileSupervisorPlan } from '../src/modules/action-engine/planner.js'

const missionId = '00000000-0000-4000-8000-000000000001'
const registry = createActionEngineCapabilityRegistry()
const metadata = new Map(registry.listMetadata().map((item) => [`${item.key}@${item.version}`, item]))

function proposal(): any {
  const sourcePlan = createRevenueRecoveryPlan({
    targetRevenueBrl: '10000', deadlineDays: 30, inactiveDays: 60, canarySize: 20, maxPopulation: 100,
    maxTotalCostBrl: '1000', maxHumanHours: '10', humanHourlyRateBrl: '100', minimumValueCostRatio: '3', channels: ['human_task'],
  })
  return {
    kind: 'plan', interpretation: { objective: 'Recuperar receita' }, questions: [],
    selectedPacks: [{ key: sourcePlan.packKey, version: sourcePlan.packVersion, contentHash: sourcePlan.packContentHash }],
    sourceIds: ['source-1'],
    plan: {
      schemaVersion: 1, missionId,
      actionPack: { key: sourcePlan.packKey, version: sourcePlan.packVersion, templateHash: sourcePlan.packContentHash },
      resolvedParameters: sourcePlan.parameters, deviations: [], rationale: 'Plano fundamentado.', assumptions: [], risks: [],
      estimatedEconomics: {
        currency: 'BRL', aiAndProviderCost: '10', mediaCost: '0', humanHours: '2', humanCost: '200', totalExecutionCost: '210',
      },
      steps: sourcePlan.steps.map((step) => ({
        stepKey: step.stepKey, dependsOn: step.dependsOn, capabilityKey: step.capabilityKey,
        capabilityVersion: step.capabilityVersion, input: step.parameters, timeoutSeconds: 300, maxAttempts: 3,
        approvalRequired: step.approvalRequired,
        effect: metadata.get(`${step.capabilityKey}@${step.capabilityVersion}`)?.effect ?? 'none', outputBindings: {},
      })),
    },
  }
}

function compile(rawProposal: unknown, overrides: Record<string, unknown> = {}) {
  return compileSupervisorPlan({
    rawProposal, missionId, packCatalog: [REVENUE_RECOVERY_PACK_V0], registry,
    maxTotalCostBrl: '1000', allowedSourceIds: ['source-1'], contextHash: 'b'.repeat(64),
    capabilityCatalogHash: 'c'.repeat(64), expectedCapabilityCatalogHash: 'c'.repeat(64),
    autonomyEnvelope: {
      mode: 'assisted', allowedModules: ['crm'], allowedCapabilityKeys: registry.listMetadata().map((item) => item.key),
      maxTotalCostBrl: '1000', maxHumanHours: '10', expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: [],
    },
    ...overrides,
  } as Parameters<typeof compileSupervisorPlan>[0])
}

describe('Generic Mission Supervisor compiler', () => {
  it('binds the plan hash to frozen context, exact catalogs and sources', () => {
    const first = compile(proposal())
    const second = compile(proposal(), { contextHash: 'd'.repeat(64) })
    expect(first.kind).toBe('plan')
    if (first.kind !== 'plan' || second.kind !== 'plan') throw new Error('expected_plan')
    expect(first.compiled.contextHash).toBe('b'.repeat(64))
    expect(first.compiled.sourceIds).toEqual(['source-1'])
    expect(first.compiled.planHash).not.toBe(second.compiled.planHash)
  })

  it('returns clarification without creating a compiled plan', () => {
    const result = compile({
      kind: 'clarification', interpretation: { objective: 'Criar campanha' },
      questions: [{ key: 'channel', label: 'Qual canal?', whyNeeded: 'Selecionar capability', priority: 1,
        answerType: 'single_choice', defaultValue: null, defaultSourceId: 'source-1' }],
      selectedPacks: [], sourceIds: ['source-1'], plan: null,
    })
    expect(result).toMatchObject({ kind: 'clarification', questions: [{ key: 'channel' }] })
  })

  it('rejects invented sources and packs', () => {
    const badSource = proposal(); badSource.sourceIds = ['source-invented']
    expect(() => compile(badSource)).toThrowError('mission_plan_source_not_allowed')
    const badPack = proposal(); badPack.selectedPacks[0].key = 'invented_pack'
    expect(() => compile(badPack)).toThrowError('mission_plan_pack_not_allowed')
  })

  it('rejects removed protected steps, cycles and future bindings', () => {
    const removed = proposal(); removed.plan.steps = removed.plan.steps.filter((step: any) => step.stepKey !== 'pack.evaluate')
    expect(() => compile(removed)).toThrowError('action_pack_protected_step_missing')
    const cycle = proposal(); cycle.plan.steps[0].dependsOn = ['pack.evaluate']
    expect(() => compile(cycle)).toThrowError('mission_plan_cycle_detected')
    const future = proposal(); future.plan.steps[0].outputBindings = { value: { fromStep: 'pack.evaluate', path: '$.value' } }
    expect(() => compile(future)).toThrowError('mission_plan_output_binding_invalid')
  })

  it('rejects catalog drift, expired envelopes and unsupported modes', () => {
    expect(() => compile(proposal(), { expectedCapabilityCatalogHash: 'd'.repeat(64) }))
      .toThrowError('mission_capability_catalog_hash_mismatch')
    expect(() => compile(proposal(), { now: new Date('2100-01-01T00:00:00.000Z') }))
      .toThrowError('mission_autonomy_envelope_expired')
    expect(() => compile(proposal(), { autonomyEnvelope: {
      mode: 'unbounded', allowedModules: [], allowedCapabilityKeys: [], maxTotalCostBrl: '1000', maxHumanHours: '1',
      expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: [],
    } })).toThrowError('mission_autonomy_mode_unsupported')
  })

  it('rejects plans whose estimated execution cost exceeds the envelope', () => {
    expect(() => compile(proposal(), { maxTotalCostBrl: '100' })).toThrowError('mission_plan_budget_exceeded')
  })
})
