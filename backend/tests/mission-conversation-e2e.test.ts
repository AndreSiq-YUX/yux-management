import { describe, expect, it, vi } from 'vitest'
import { validateMissionConversationTurnResponseWire } from '../src/modules/action-engine/mission-wire-validator.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { createRevenueRecoveryPlan, REVENUE_RECOVERY_PACK_V0 } from '../src/modules/action-engine/packs/revenue-recovery-v0.js'
import { compileMissionPlan } from '../src/modules/action-engine/planner.js'
import { buildMissionDecisionSummary } from '../src/modules/action-engine/decision-summary.js'
import { hashCanonical } from '../src/modules/action-engine/repository.js'

const missionId = '00000000-0000-4000-8000-000000000001'

describe('Conversational Mission governed release boundary', () => {
  it('keeps the confirmed brief, deterministic plan and approval subject pinned end to end', () => {
    const harness = vi.fn(() => validateMissionConversationTurnResponseWire(harnessResponse()))
    const response = harness()
    const briefHash = hashCanonical(response.brief)
    const registry = createActionEngineCapabilityRegistry()
    const packPlan = createRevenueRecoveryPlan({
      targetRevenueBrl: '10000', deadlineDays: 30, inactiveDays: 60, canarySize: 20, maxPopulation: 100,
      maxTotalCostBrl: '1000', maxHumanHours: '8', humanHourlyRateBrl: '100', minimumValueCostRatio: '3', channels: ['human_task'],
    })
    const metadata = new Map(registry.listMetadata().map(item => [`${item.key}@${item.version}`, item]))
    const compiled = compileMissionPlan({
      missionId, pack: REVENUE_RECOVERY_PACK_V0, registry, maxTotalCostBrl: '1000',
      rawPlan: {
        schemaVersion: 1, missionId,
        actionPack: { key: packPlan.packKey, version: packPlan.packVersion, templateHash: packPlan.packContentHash },
        resolvedParameters: packPlan.parameters, deviations: [], rationale: 'Plano derivado do briefing confirmado', assumptions: [], risks: [],
        estimatedEconomics: { currency: 'BRL', aiAndProviderCost: '10', mediaCost: '0', humanHours: '2', humanCost: '200', totalExecutionCost: '210' },
        steps: packPlan.steps.map(step => ({ stepKey: step.stepKey, dependsOn: step.dependsOn, capabilityKey: step.capabilityKey, capabilityVersion: step.capabilityVersion, input: step.parameters, timeoutSeconds: 300, maxAttempts: 3, approvalRequired: step.approvalRequired, effect: metadata.get(`${step.capabilityKey}@${step.capabilityVersion}`)?.effect ?? 'none', outputBindings: {} })),
      },
    })
    const summary = buildMissionDecisionSummary({
      headline: 'Recuperar oportunidades inativas com abordagem humana', planRevision: 1,
      planHash: compiled.planHash, manifestHash: compiled.capabilityManifestHash, sourceIds: (response.sources ?? []).map(source => source.id),
      artifacts: [{ id: 'recovery-list', entityType: 'lead_list', operation: 'prepare', quantity: 1, label: 'lista de recuperação', version: 1 }],
      existingContacts: 100, futureEligibleContacts: false, channels: ['human_task'], estimatedCostBrl: '210', maximumCostBrl: '1000', estimatedHumanMinutes: 120,
      capabilityManifest: compiled.capabilityManifest, assumptions: [],
    })

    const persistedApproval = { subjectHash: summary.decisionSubjectHash, planHash: compiled.planHash, briefHash }
    expect(harness).toHaveBeenCalledTimes(1)
    expect(response.kind).toBe('brief_confirmation')
    expect(persistedApproval.subjectHash).toBe(summary.decisionSubjectHash)
    expect(persistedApproval.planHash).toBe(compiled.planHash)
    expect(persistedApproval.briefHash).toBe(briefHash)
    expect(compiled.steps.every(step => !('executionResult' in step))).toBe(true)
    expect(() => ({ ...persistedApproval, subjectHash: 'f'.repeat(64) })).not.toThrow()
    expect('f'.repeat(64)).not.toBe(persistedApproval.subjectHash)
  })
})

function harnessResponse() {
  return {
    schemaVersion: 1, kind: 'brief_confirmation', reply: 'O briefing está pronto para confirmação.', understood: { objective: 'Recuperar receita' }, questions: [],
    readiness: { status: 'ready_for_plan', knownFacts: [], assumptions: [], missing: [] },
    brief: { title: 'Recuperação de receita', objective: 'Recuperar oportunidades inativas', requestedOutcome: 'recovered_revenue', scopeHints: ['crm'], constraints: { targetRevenueBrl: '10000' }, acceptanceCriteria: [], packKeys: ['revenue_recovery'], deadlineAt: '2026-09-30T23:59:59.000Z', maxTotalCostBrl: '1000', maxHumanHours: '8', mode: 'assisted' },
    suggestedActions: [{ key: 'confirm_brief', label: 'Confirmar briefing', kind: 'confirm_brief', payload: {} }], sources: [], retrievalTraceId: 'trace-1', contextHash: 'a'.repeat(64),
    usage: { inputTokens: 500, outputTokens: 200, totalTokens: 700 },
  }
}
