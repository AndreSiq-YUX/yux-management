import { describe, expect, it } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { resolveCapabilityDecision } from '../src/modules/action-engine/capability-policy.js'
import { createRevenueRecoveryPlan, REVENUE_RECOVERY_PACK_V0 } from '../src/modules/action-engine/packs/revenue-recovery-v0.js'
import { compileSupervisorPlan } from '../src/modules/action-engine/planner.js'

describe('Grounded Mission foundation vertical slice', () => {
  it('compiles a fake-provider plan and completes shadow execution with zero domain mutation', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const metadata = new Map(registry.listMetadata().map(item => [`${item.key}@${item.version}`, item]))
    const source = createRevenueRecoveryPlan({
      targetRevenueBrl: '10000', deadlineDays: 30, inactiveDays: 60, canarySize: 10, maxPopulation: 50,
      maxTotalCostBrl: '500', maxHumanHours: '4', humanHourlyRateBrl: '100', minimumValueCostRatio: '3', channels: ['human_task'],
    })
    const rawProposal = {
      kind: 'plan', interpretation: { objective: 'Recuperar receita sem produzir efeitos reais' }, questions: [],
      selectedPacks: [{ key: source.packKey, version: source.packVersion, contentHash: source.packContentHash }],
      sourceIds: ['knowledge-1'],
      trace: { profileKey: 'mission_supervisor', promptHash: 'd'.repeat(64) },
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      plan: {
        schemaVersion: 1, missionId: 'mission-1',
        actionPack: { key: source.packKey, version: source.packVersion, templateHash: source.packContentHash },
        resolvedParameters: source.parameters, deviations: [], rationale: 'Plano de simulação.', assumptions: [], risks: [],
        estimatedEconomics: { currency: 'BRL', aiAndProviderCost: '1', mediaCost: '0', humanHours: '1', humanCost: '100', totalExecutionCost: '101' },
        steps: source.steps.map(step => ({
          stepKey: step.stepKey, dependsOn: step.dependsOn, capabilityKey: step.capabilityKey,
          capabilityVersion: step.capabilityVersion, input: step.parameters, timeoutSeconds: 300, maxAttempts: 1,
          approvalRequired: step.approvalRequired,
          effect: metadata.get(`${step.capabilityKey}@${step.capabilityVersion}`)?.effect ?? 'none', outputBindings: {},
        })),
      },
    }
    const envelope = {
      mode: 'shadow' as const, allowedModules: ['crm'], allowedCapabilityKeys: registry.listMetadata().map(item => item.key),
      maxTotalCostBrl: '500', maxHumanHours: '4', expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: ['destructive'],
    }
    const result = compileSupervisorPlan({
      rawProposal, missionId: 'mission-1', packCatalog: [REVENUE_RECOVERY_PACK_V0], registry,
      maxTotalCostBrl: '500', allowedSourceIds: ['knowledge-1'], contextHash: 'a'.repeat(64),
      capabilityCatalogHash: 'b'.repeat(64), expectedCapabilityCatalogHash: 'b'.repeat(64), autonomyEnvelope: envelope,
    })
    expect(result.kind).toBe('plan')
    if (result.kind !== 'plan') throw new Error('expected_plan')
    expect(result.compiled.steps.every(step => Boolean(step.capabilityDefinitionHash && result.compiled.planHash && result.compiled.contextHash))).toBe(true)
    expect([rawProposal.trace]).toHaveLength(1)

    const decision = resolveCapabilityDecision({
      capability: { key: 'human.task.create', approval: 'risk_based', effect: 'internal' },
      globalKillSwitch: false, requiredConnectionsHealthy: true, legalOrConsentAllowed: true, budgetAvailable: true,
      missionMode: 'shadow', missionActive: true, envelopeExpiresAt: envelope.expiresAt,
      actorPermissions: [], capabilityAllowedByEnvelope: true,
    })
    expect(decision).toMatchObject({ outcome: 'allow', dryRun: true, requiresApproval: false })
    let domainMutations = 0
    const capabilityResult = await registry.invoke('human.task.create', 1, {
      organizationId: 'org-1', missionId: 'mission-1', actor: { type: 'system' }, idempotencyKey: 'shadow-1',
      dryRun: decision.outcome === 'allow' ? decision.dryRun : false,
      async query<T>() { return { rows: [] as T[] } },
      commands: { async createTask() { domainMutations += 1; return { id: 'task-1' } } },
    }, { title: 'Revisar abordagem', description: 'Simulação', dueAt: '2026-09-01T12:00:00.000Z' })
    expect(capabilityResult.effectProduced).toBe(false)
    expect(domainMutations).toBe(0)
  })
})

