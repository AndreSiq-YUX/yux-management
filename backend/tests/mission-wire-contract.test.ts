import { describe, expect, it } from 'vitest'
import { validateMissionConversationTurnResponseWire, validateMissionPlanResponseWire } from '../src/modules/action-engine/mission-wire-validator.js'

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

  it('validates a grounded conversational turn and rejects additional properties', () => {
    const turn = conversationTurn()
    expect(validateMissionConversationTurnResponseWire(turn)).toEqual(turn)
    expect(() => validateMissionConversationTurnResponseWire({ ...(turn as object), injectedTool: 'http.any' }))
      .toThrowError('mission_conversation_wire_response_invalid')
  })

  it('rejects invalid conversational source namespaces and excessive questions', () => {
    const invalidSource = structuredClone(conversationTurn()) as any
    invalidSource.sources[0].ref = 'tool:http.any'
    expect(() => validateMissionConversationTurnResponseWire(invalidSource))
      .toThrowError('mission_conversation_wire_response_invalid')

    const excessive = structuredClone(conversationTurn()) as any
    excessive.questions = Array.from({ length: 4 }, (_, index) => ({ ...excessive.questions[0], key: `question-${index}` }))
    expect(() => validateMissionConversationTurnResponseWire(excessive))
      .toThrowError('mission_conversation_wire_response_invalid')
  })
})

function conversationTurn(): unknown {
  return {
    schemaVersion: 1,
    kind: 'questions',
    reply: 'Entendi. Preciso confirmar o público.',
    understood: { objective: 'Criar um funil' },
    questions: [{
      key: 'audience', label: 'Qual público?', whyNeeded: 'Define a estratégia', priority: 1,
      answerType: 'text', defaultValue: 'PMEs', defaultSourceRef: 'customer:source-1',
    }],
    readiness: {
      status: 'needs_information',
      knownFacts: [{ key: 'offer', value: 'Consultoria', sourceRef: 'customer:source-1' }],
      assumptions: [],
      missing: [{ key: 'audience', category: 'audience', reason: 'Público ausente', requiredFor: ['funnel_nurture'] }],
    },
    brief: {
      objective: 'Criar um funil', requestedOutcome: 'funnel_nurture', scopeHints: ['crm'],
      constraints: {}, acceptanceCriteria: [], packKeys: ['funnel_nurture'],
    },
    suggestedActions: [{
      key: 'confirm_audience', label: 'Usar PMEs', kind: 'quick_reply',
      capabilityKey: 'crm.pipeline.create_draft', packKey: 'funnel_nurture', payload: { answer: 'PMEs' },
    }],
    sources: [{
      ref: 'customer:source-1', kind: 'knowledge_source', id: 'source-1', version: '1',
      contentHash: 'b'.repeat(64), visibility: 'both', title: 'Oferta', displayMode: 'named',
    }],
    retrievalTraceId: 'trace-1', contextHash: 'c'.repeat(64),
    usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
  }
}
