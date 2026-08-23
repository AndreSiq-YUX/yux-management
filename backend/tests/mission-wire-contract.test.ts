import { describe, expect, it } from 'vitest'
import { validateMissionPlanResponseWire } from '../src/modules/action-engine/mission-wire-validator.js'

function proposal(): unknown {
  return {
    kind: 'plan',
    interpretation: { requestedOutcome: 'Criar um funil e uma sequência de nutrição' },
    questions: [],
    selectedPacks: [{ key: 'funnel_nurture', version: '1.0.0', contentHash: 'a'.repeat(64) }],
    sourceIds: ['knowledge-1'],
    plan: {
      schemaVersion: 1,
      missionId: '00000000-0000-4000-8000-000000000001',
      actionPack: { key: 'funnel_nurture', version: '1.0.0', templateHash: 'a'.repeat(64) },
      resolvedParameters: {},
      deviations: [],
      rationale: 'Plano baseado no contexto publicado.',
      assumptions: [],
      risks: [],
      estimatedEconomics: {
        currency: 'BRL', aiAndProviderCost: '10', mediaCost: '0', humanHours: '1',
        humanCost: '100', totalExecutionCost: '110',
      },
      steps: [{
        stepKey: 'pack.readiness', dependsOn: [], capabilityKey: 'system.readiness.check',
        capabilityVersion: 1, input: {}, timeoutSeconds: 300, maxAttempts: 1,
        approvalRequired: false, effect: 'none', outputBindings: {},
      }],
    },
  }
}

describe('Mission wire contract generated from Pydantic JSON Schema', () => {
  it('accepts a valid proposal', () => {
    expect(validateMissionPlanResponseWire(proposal())).toEqual(proposal())
  })

  it('rejects an extra root property', () => {
    expect(() => validateMissionPlanResponseWire({ ...(proposal() as object), injectedTool: 'http.any' }))
      .toThrowError('mission_wire_response_invalid')
  })

  it('rejects malformed output bindings and unknown response kinds', () => {
    const malformed = structuredClone(proposal()) as any
    malformed.plan.steps[0].outputBindings = { leadId: { fromStep: 42, path: '$.leadId' } }
    expect(() => validateMissionPlanResponseWire(malformed)).toThrowError('mission_wire_response_invalid')
    expect(() => validateMissionPlanResponseWire({ kind: 'execute', interpretation: {} }))
      .toThrowError('mission_wire_response_invalid')
  })
})
