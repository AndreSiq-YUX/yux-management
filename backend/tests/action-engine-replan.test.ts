import { describe, expect, it } from 'vitest'
import type { CompiledMissionPlan } from '../src/modules/action-engine/planner.js'
import { diffMissionPlans } from '../src/modules/action-engine/planner.js'

function plan(): CompiledMissionPlan {
  return {
    missionId: 'mission-1', packKey: 'revenue_recovery', packVersion: '0.1.0', packContentHash: 'a'.repeat(64), planHash: 'b'.repeat(64),
    capabilityManifest: [], capabilityManifestHash: 'c'.repeat(64),
    parameters: { maxPopulation: 20, ownershipMode: 'exclusive' }, deviations: [],
    estimatedEconomics: { currency: 'BRL', aiAndProviderCost: '10', mediaCost: '0', humanHours: '2', humanCost: '200', totalExecutionCost: '210' },
    steps: [{ stepKey: 'pack.readiness', capabilityKey: 'system.readiness.check', capabilityVersion: 1, dependsOn: [], parameters: {}, approvalRequired: false, protected: true, timeoutSeconds: 300, maxAttempts: 3, outputBindings: {} }],
  }
}

describe('Action Engine replan safety', () => {
  it('detects material population, budget and step changes', () => {
    const previous = plan()
    const proposed = structuredClone(previous)
    proposed.parameters.maxPopulation = 40
    proposed.estimatedEconomics.totalExecutionCost = '400'
    proposed.steps.push({ ...proposed.steps[0], stepKey: 'extension.follow_up', protected: false })
    expect(diffMissionPlans(previous, proposed)).toMatchObject({ populationExpanded: true, budgetExpanded: true, addedSteps: ['extension.follow_up'], requiresReplanApproval: true })
  })

  it('forbids changing pack version or hash during an active mission', () => {
    const proposed = plan(); proposed.packVersion = '0.2.0'
    expect(() => diffMissionPlans(plan(), proposed)).toThrowError('replan_pack_change_forbidden')
  })

  it('recognizes an identical revision as non-material', () => {
    expect(diffMissionPlans(plan(), structuredClone(plan())).requiresReplanApproval).toBe(false)
  })
})
