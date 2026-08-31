import { describe, expect, it } from 'vitest'
import type { ActionPackVersion } from '../src/modules/action-engine/action-pack.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { materializeArtifactBindings } from '../src/modules/action-engine/composite-execution.js'
import { evaluateCompositeMission } from '../src/modules/action-engine/metrics/composite.js'
import { compileSupervisorPlan } from '../src/modules/action-engine/planner.js'

const missionId = '00000000-0000-4000-8000-000000000001'
const funnelVersionId = '00000000-0000-4000-8000-000000000002'
const sourceId = 'source-1'
const registry = createActionEngineCapabilityRegistry()
const foundation = pack('funnel_foundation', 'a'.repeat(64), { consumes: [], produces: [{ key: 'crm.funnel', schemaVersion: 1 }] })
const campaign = pack('campaign_activation', 'b'.repeat(64), { consumes: [{ key: 'crm.funnel', schemaVersion: 1, optional: false }], produces: [{ key: 'campaign.launch', schemaVersion: 1 }] })

describe('composite Mission end-to-end acceptance', () => {
  it('compiles two immutable packs, binds the published funnel, creates paused and activates exactly once', () => {
    const compiled = compileSupervisorPlan(compileInput(proposal()))
    expect(compiled.kind).toBe('plan')
    if (compiled.kind !== 'plan') throw new Error('expected_plan')
    expect(compiled.compiled.steps.map(step => step.stepKey)).toEqual([
      'funnel_foundation.pack.evaluate', 'campaign_activation.pack.evaluate',
    ])
    expect(compiled.compiled.steps[1]?.dependsOn).toContain('funnel_foundation.pack.evaluate')

    const campaignInput = materializeArtifactBindings({ campaignName: 'Aquisição B2B' }, [{
      artifact_key: 'crm.funnel', output_path: 'versionId', input_key: 'funnelVersionId', schema_version: 1,
      source_output: { output: { versionId: funnelVersionId, contentHash: 'c'.repeat(64) } },
    }])
    expect(campaignInput).toMatchObject({ funnelVersionId })

    const provider = fakeProvider()
    const paused = provider.createPaused(String(campaignInput.funnelVersionId), compiled.compiled.planHash)
    expect(paused).toMatchObject({ status: 'provider_paused' })
    provider.activate(compiled.compiled.planHash)
    provider.activate(compiled.compiled.planHash)
    expect(provider.snapshot()).toEqual({ status: 'active', mutations: 2 })

    expect(evaluateCompositeMission({
      packs: [
        { packKey: foundation.key, conclusion: 'succeed', reasons: ['funnel_published'], optional: false, dependsOn: [] },
        { packKey: campaign.key, conclusion: 'succeed', reasons: ['campaign_active'], optional: false, dependsOn: [foundation.key] },
      ],
      economics: economics('2'), maxTotalCostBrl: '10', acceptanceCriteriaMet: true,
    })).toMatchObject({ conclusion: 'succeed', affectedPacks: [] })
  })

  it('rejects catalog, source and capability attacks before any provider mutation', () => {
    const unknownPack = proposal()
    unknownPack.selectedPacks[1]!.key = 'invented_pack'
    expect(() => compileSupervisorPlan(compileInput(unknownPack))).toThrow('mission_plan_pack_not_allowed')

    const crossTenantSource = proposal()
    crossTenantSource.sourceIds = ['other-tenant-source']
    expect(() => compileSupervisorPlan(compileInput(crossTenantSource))).toThrow('mission_plan_source_not_allowed')

    const escalation: any = proposal()
    escalation.plan.steps[1]!.capabilityKey = 'campaign.provider.activate'
    escalation.plan.steps[1]!.effect = 'external'
    escalation.plan.steps[1]!.approvalRequired = true
    expect(() => compileSupervisorPlan(compileInput(escalation))).toThrow()
  })

  it('propagates an upstream failure to its dependent pack and contains an aggregate budget breach', () => {
    const failed = evaluateCompositeMission({
      packs: [
        { packKey: foundation.key, conclusion: 'fail', reasons: ['funnel_publish_failed'], optional: false, dependsOn: [] },
        { packKey: campaign.key, conclusion: 'continue', reasons: [], optional: false, dependsOn: [foundation.key] },
      ],
      economics: economics('2'), maxTotalCostBrl: '10',
    })
    expect(failed).toMatchObject({ conclusion: 'fail' })
    expect(failed.affectedPacks).toEqual(expect.arrayContaining([foundation.key, campaign.key]))

    expect(evaluateCompositeMission({
      packs: [
        { packKey: foundation.key, conclusion: 'continue', reasons: [], optional: false, dependsOn: [] },
        { packKey: campaign.key, conclusion: 'continue', reasons: [], optional: false, dependsOn: [foundation.key] },
      ],
      economics: economics('10.01'), maxTotalCostBrl: '10',
    })).toMatchObject({ conclusion: 'pause', reasons: ['composite_budget_breached'] })
  })
})

function proposal() {
  const perPack = estimatedEconomics('1')
  return {
    kind: 'plan' as const, interpretation: {}, questions: [], sourceIds: [sourceId],
    selectedPacks: [
      { key: foundation.key, version: foundation.semanticVersion, contentHash: foundation.contentHash },
      { key: campaign.key, version: campaign.semanticVersion, contentHash: campaign.contentHash },
    ],
    plan: {
      schemaVersion: 1 as const, missionId,
      actionPack: { key: 'composite', version: '1.0.0', templateHash: 'd'.repeat(64) },
      resolvedParameters: {
        packParameters: { [foundation.key]: {}, [campaign.key]: {} },
        packEconomics: { [foundation.key]: perPack, [campaign.key]: perPack },
        artifactBindings: [{
          fromPack: foundation.key, artifactKey: 'crm.funnel', fromStepKey: 'pack.evaluate', outputPath: 'versionId',
          toPack: campaign.key, toStepKey: 'pack.evaluate', inputKey: 'funnelVersionId', schemaVersion: 1,
        }],
      },
      deviations: [], rationale: 'Plano composto governado.', assumptions: [], risks: [],
      estimatedEconomics: estimatedEconomics('2'),
      steps: [wireStep(`${foundation.key}.pack.evaluate`), wireStep(`${campaign.key}.pack.evaluate`)],
    },
  }
}

function compileInput(rawProposal: ReturnType<typeof proposal>) {
  return {
    rawProposal, missionId, packCatalog: [foundation, campaign], registry, maxTotalCostBrl: '10',
    allowedSourceIds: [sourceId], contextHash: 'e'.repeat(64), capabilityCatalogHash: 'f'.repeat(64),
    expectedCapabilityCatalogHash: 'f'.repeat(64),
    autonomyEnvelope: { mode: 'assisted' as const, allowedModules: [], allowedCapabilityKeys: [], maxTotalCostBrl: '10', maxHumanHours: '1', expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: ['external'] },
  }
}

function pack(key: string, contentHash: string, artifactContract: NonNullable<ActionPackVersion['artifactContract']>): ActionPackVersion {
  return {
    key, semanticVersion: '1.0.0', schemaVersion: 1, outcomeType: key, status: 'published', parameterSchema: {},
    readinessSpec: { requiredModules: [] },
    topologyTemplate: { steps: [{ stepKey: 'pack.evaluate', capabilityKey: 'system.evaluation.checkpoint', capabilityVersion: 1, dependsOn: [], approvalRequired: false, protected: true, defaultParameters: { checkpointKey: key, targetRevenueBrl: '0' } }] },
    protectedStepKeys: ['pack.evaluate'], extensionPoints: [],
    allowedCapabilities: [{ key: 'system.evaluation.checkpoint', versions: [1], required: true }],
    metricSpec: {}, economicsSpec: {}, policyDefaults: {}, artifactContract, contentHash,
  }
}

function wireStep(stepKey: string) {
  return { stepKey, dependsOn: [], capabilityKey: 'system.evaluation.checkpoint', capabilityVersion: 1, input: { checkpointKey: stepKey, targetRevenueBrl: '0' }, timeoutSeconds: 300, maxAttempts: 1, approvalRequired: false, effect: 'none' as const, outputBindings: {} }
}

function economics(totalExecutionCostBrl: string) {
  return { producedValueBrl: '0', totalExecutionCostBrl, netValueBrl: `-${totalExecutionCostBrl}`, valueCostRatio: '0', valuePerHumanHourBrl: 'not_applicable' as const, humanFreeExecutionRate: '1' }
}

function estimatedEconomics(totalExecutionCost: string) {
  return { currency: 'BRL' as const, aiAndProviderCost: '1', mediaCost: '0', humanHours: '0', humanCost: '0', totalExecutionCost }
}

function fakeProvider() {
  let status = 'none'
  let mutations = 0
  let activatedHash: string | undefined
  return {
    createPaused(boundFunnelVersionId: string, approvedHash: string) {
      if (boundFunnelVersionId !== funnelVersionId) throw new Error('provider_funnel_binding_invalid')
      status = 'provider_paused'; activatedHash = approvedHash; mutations += 1
      return { status, approvedHash }
    },
    activate(approvedHash: string) {
      if (approvedHash !== activatedHash) throw new Error('provider_approval_hash_changed')
      if (status === 'active') return
      status = 'active'; mutations += 1
    },
    snapshot: () => ({ status, mutations }),
  }
}
