import { describe, expect, it, vi } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import type { CapabilityContext } from '../src/modules/action-engine/capability-registry.js'
import { resolveCapabilityDecision } from '../src/modules/action-engine/capability-policy.js'
import { assertFencingToken } from '../src/modules/action-engine/resource-claims.js'
import { verifyMutationLease, signMutationLease, type MutationLeaseClaims } from '../src/modules/action-engine/mutation-leases.js'
import { compileSupervisorPlan } from '../src/modules/action-engine/planner.js'
import { resolvePlanInputBindings } from '../src/modules/action-engine/plan-input-bindings.js'
import { missionArtifactHash } from '../src/modules/action-engine/mission-command.js'
import {
  CAMPAIGN_LAUNCH_PACK_V1,
  createCampaignLaunchPlan,
  type CampaignLaunchParameters,
} from '../src/modules/action-engine/packs/campaign-launch-v1.js'
import {
  deriveCampaignLaunchMetricSnapshot,
  evaluateCampaignLaunchMetrics,
} from '../src/modules/action-engine/metrics/campaign-launch.js'
import {
  ProviderEffectResolverRegistry,
  reconcileUnknownEffect,
  type ExternalEffectReconciliationStore,
} from '../src/modules/action-engine/provider-reconciliation.js'
import type { ExternalEffect } from '../src/modules/action-engine/external-effects.js'
import type { ActionMission } from '../src/modules/action-engine/types.js'

const ids = Array.from({ length: 30 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
const organizationId = ids[0]!
const missionId = ids[1]!
const sourceId = ids[2]!
const providerConnectionId = ids[3]!
const parameters: CampaignLaunchParameters = {
  icp: 'Gestores de empresas B2B', offer: 'Diagnóstico de crescimento', platform: 'meta', providerConnectionId,
  dailyBudgetBrl: '50', totalBudgetBrl: '500', targetLeads: 20, maximumCplBrl: '100', observationDays: 30,
  maxTotalCostBrl: '1000', maxHumanHours: '8', humanHourlyRateBrl: '100',
}
const artifacts = {
  brief: { name: 'Aquisição B2B', objective: 'lead_generation', offer: parameters.offer, platform: 'meta', providerConnectionId, dailyBudgetBrl: '50', totalBudgetBrl: '500', startsAt: '2026-09-01T00:00:00.000Z', sourceIds: [sourceId], funnelArtifactRefs: [] },
  audience: { targeting: { region: 'Brasil', role: 'gestor' }, exclusions: [], rationale: 'ICP publicado', sourceIds: [sourceId] },
  creativeSet: { creatives: [{ format: 'image', headline: 'Diagnóstico de crescimento', body: 'Converse com a equipe.', sourceIds: [sourceId] }], sourceIds: [sourceId] },
  acquisition: {
    landingPage: { name: 'Diagnóstico B2B', slug: 'diagnostico-b2b', title: 'Diagnóstico de crescimento', primaryCtaType: 'form', primaryCtaValue: 'Solicitar diagnóstico', content: { hero: 'Crescimento orientado por evidências' } },
    leadForm: { name: 'Interesse B2B', submitLabel: 'Enviar', successMessage: 'Recebemos seus dados', consentCode: 'campaign_lead', consentVersion: '1', privacyPolicyVersion: '1', fields: [{ fieldName: 'name', crmFieldKey: 'name', required: true }, { fieldName: 'email', crmFieldKey: 'email', required: true }] },
    trackingPlan: { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'diagnostico_b2b', conversion_event: 'lead', landing_page_url: 'https://preview.example.com/diagnostico-b2b' }, sourceIds: [sourceId],
  },
  measurement: { primaryMetrics: ['leads'], leadingMetrics: ['clicks'], attributionPolicyKey: 'campaign_last_touch_30d', attributionPolicyVersion: 1, sourceIds: [sourceId] },
  brandCompliance: { approved: true, forbiddenTerms: [], findings: [], sourceIds: [sourceId] }, sourceIds: [sourceId], risks: [],
}

describe('Campaign Launch governed vertical slice', () => {
  it('compiles grounded artifacts, creates paused, activates once and contains a budget breach', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const compiled = compileSupervisorPlan({
      rawProposal: proposal(registry), missionId, packCatalog: [CAMPAIGN_LAUNCH_PACK_V1], registry,
      maxTotalCostBrl: '1000', allowedSourceIds: [sourceId], contextHash: 'a'.repeat(64),
      capabilityCatalogHash: 'b'.repeat(64), expectedCapabilityCatalogHash: 'b'.repeat(64),
      autonomyEnvelope: { mode: 'assisted', allowedModules: ['campaigns','landing_pages','campaign_launch_agent'], allowedCapabilityKeys: [], maxTotalCostBrl: '1000', maxHumanHours: '8', expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: ['external'] },
    })
    expect(compiled.kind).toBe('plan')
    if (compiled.kind !== 'plan') throw new Error('expected_plan')
    expect(compiled.compiled.steps).toHaveLength(16)

    const readiness = await registry.invoke('system.readiness.check', 1, {
      ...context('readiness', {}),
      async query<T>(sql: string) {
        if (sql.includes('crm_instances')) throw new Error('campaign_readiness_must_not_require_crm')
        return { rows: [{ id: ids[24]! }] as T[] }
      },
    }, { requiredModules: ['campaigns','landing_pages','campaign_launch_agent'], requiredConnections: ['ads_provider'] })
    expect(readiness.output).toMatchObject({ ready: true })

    const provider = fakeProvider()
    const outputsByStep: Record<string, Record<string, unknown>> = {}
    for (const stepKey of ['pack.draft_landing_page','pack.draft_lead_form','pack.validate_tracking','pack.draft_campaign','pack.draft_creative','pack.attach_creative','pack.attach_landing_page','pack.attach_lead_form','pack.create_provider_paused'] as const) {
      const step = compiled.compiled.steps.find(item => item.stepKey === stepKey)!
      const input = resolvePlanInputBindings(step.parameters, { resolvedParameters: compiled.compiled.parameters, outputsByStep })
      const result = await registry.invoke(step.capabilityKey, step.capabilityVersion, context(stepKey, provider.commands), input)
      outputsByStep[stepKey] = result.output as Record<string, unknown>
    }
    expect(provider.state.status).toBe('provider_paused')
    expect(provider.state.externalMutations).toBe(1)

    const activation = compiled.compiled.steps.find(item => item.stepKey === 'pack.activate')!
    const activationInput = resolvePlanInputBindings(activation.parameters, { resolvedParameters: compiled.compiled.parameters, outputsByStep })
    const exactHash = String(outputsByStep['pack.draft_campaign']!.contentHash)
    expect(activationInput).toMatchObject({ expectedContentHash: exactHash, approvedSubjectHash: exactHash })
    await registry.invoke(activation.capabilityKey, activation.capabilityVersion, context('activate', provider.commands), activationInput)
    await registry.invoke(activation.capabilityKey, activation.capabilityVersion, context('activate', provider.commands), activationInput)
    expect(provider.state.status).toBe('active')
    expect(provider.state.externalMutations).toBe(2)

    const mission = campaignMission()
    const snapshot = deriveCampaignLaunchMetricSnapshot({
      mission, observations: [], executionCostBrl: '25', killSwitchActive: false, measuredAt: '2026-09-02T12:00:00.000Z',
      campaign: { id: ids[10]!, lifecycle_status: 'active', spent: '550', impressions: 1000, clicks: 100, leads: 4, total_budget: '500', daily_budget: '50', utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: 'diagnostico_b2b', snapshot_id: ids[11]!, snapshot_at: '2026-09-02T12:00:00.000Z', snapshot_spend: '550', snapshot_impressions: 1000, snapshot_clicks: 100, snapshot_leads: 4, raw_metrics: { dailySpendBrl: '55' } },
    })
    const evaluation = evaluateCampaignLaunchMetrics({ mission, snapshot, economics: economics(), now: '2026-09-02T12:00:00.000Z' })
    expect(evaluation).toMatchObject({ conclusion: 'pause' })
    expect(evaluation.reasons).toEqual(expect.arrayContaining(['campaign_total_budget_breached','campaign_daily_budget_breached']))
    await registry.invoke('campaign.provider.pause', 1, context('budget-containment', provider.commands), { versionId: ids[7], expectedContentHash: exactHash, approvedSubjectHash: exactHash })
    expect(provider.state.status).toBe('paused')
  })

  it('stops cancellation before dispatch and rejects stale approval, catalog drift and the exact kill switch', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const provider = fakeProvider(); provider.state.status = 'provider_paused'; provider.state.cancelled = true
    await expect(registry.invoke('campaign.provider.activate', 1, context('cancelled', provider.commands), { versionId: ids[7], expectedContentHash: provider.state.contentHash, approvedSubjectHash: provider.state.contentHash })).rejects.toThrow('mission_not_active')
    expect(provider.state.externalMutations).toBe(0)
    provider.state.cancelled = false
    await expect(registry.invoke('campaign.provider.activate', 1, context('stale', provider.commands), { versionId: ids[7], expectedContentHash: 'f'.repeat(64), approvedSubjectHash: 'f'.repeat(64) })).rejects.toThrow('campaign_version_hash_changed')
    expect(() => compileSupervisorPlan({
      rawProposal: proposal(registry), missionId, packCatalog: [CAMPAIGN_LAUNCH_PACK_V1], registry, maxTotalCostBrl: '1000', allowedSourceIds: [sourceId], contextHash: 'a'.repeat(64), capabilityCatalogHash: 'b'.repeat(64), expectedCapabilityCatalogHash: 'c'.repeat(64),
      autonomyEnvelope: { mode: 'assisted', allowedModules: ['campaigns','landing_pages','campaign_launch_agent'], allowedCapabilityKeys: [], maxTotalCostBrl: '1000', maxHumanHours: '8', expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: [] },
    })).toThrow('mission_capability_catalog_hash_mismatch')
    const activate = registry.get('campaign.provider.activate', 1)
    expect(resolveCapabilityDecision({ capability: activate, globalKillSwitch: false, capabilityKillSwitch: true, requiredConnectionsHealthy: true, legalOrConsentAllowed: true, budgetAvailable: true, missionMode: 'assisted', missionActive: true, actorPermissions: activate.requiredPermissions, capabilityAllowedByEnvelope: true })).toMatchObject({ outcome: 'deny', reason: 'capability_kill_switch_active' })
  })

  it('reconciles a timeout once, deduplicates the callback and escalates repeated SLO breaches', async () => {
    const effect = unknownEffect('effect-1')
    let claimed = false
    const store = reconciliationStore(effect, () => claimed ? null : (claimed = true, effect))
    const resolver = vi.fn(async () => ({ outcome: 'created' as const, providerReference: 'meta-42', evidence: { status: 'PAUSED' } }))
    const registry = new ProviderEffectResolverRegistry().register({ providerKey: 'meta', resolve: resolver })
    expect((await reconcileUnknownEffect(store, registry, { effectId: effect.id, organizationId, now: new Date('2026-09-01T12:01:00.000Z') })).outcome).toBe('created')
    expect((await reconcileUnknownEffect(store, registry, { effectId: effect.id, organizationId, now: new Date('2026-09-01T12:02:00.000Z') })).outcome).toBe('skipped')
    expect(resolver).toHaveBeenCalledTimes(1)

    for (const id of ['breach-1','breach-2']) {
      const breached = unknownEffect(id)
      const breachStore = reconciliationStore(breached, () => breached)
      const stillUnknown = new ProviderEffectResolverRegistry().register({ providerKey: 'meta', async resolve() { return { outcome: 'still_unknown', retryAfterSeconds: 60, evidence: { rehearsal: id } } } })
      expect((await reconcileUnknownEffect(breachStore, stillUnknown, { effectId: id, organizationId, now: new Date('2026-09-01T12:14:30.000Z') })).outcome).toBe('manual_review')
      expect(breachStore.manualReview).toHaveBeenCalledWith(expect.objectContaining({ incidentType: 'provider_effect_reconciliation_slo_exceeded' }))
    }
  })

  it('rejects an expired mutation lease and a stale resource fencing token', async () => {
    const claims: MutationLeaseClaims = { leaseId: ids[15]!, missionId, actionRunId: ids[16]!, attemptId: ids[17]!, capabilityKey: 'campaign.provider.activate', capabilityVersion: 1, capabilityDefinitionHash: 'd'.repeat(64), fencingToken: '7', effect: 'external', issuedAt: '2026-09-01T12:00:00.000Z', expiresAt: '2026-09-01T12:00:30.000Z' }
    expect(() => verifyMutationLease(signMutationLease(claims, 'campaign-lease-secret-longer-than-32-bytes'), 'campaign-lease-secret-longer-than-32-bytes', claims, new Date('2026-09-01T12:00:30.000Z'))).toThrow('mutation_lease_expired')
    const staleDb = { query: vi.fn(async () => ({ rows: [] })) }
    await expect(assertFencingToken(staleDb as never, { organizationId, missionId, resourceKey: 'campaign.provider_account', scope: providerConnectionId, fencingToken: 6n })).rejects.toThrow('resource_claim_stale_fencing_token')
  })
})

function proposal(registry: ReturnType<typeof createActionEngineCapabilityRegistry>) {
  const canonical = createCampaignLaunchPlan(parameters)
  const resolvedParameters = { ...parameters, campaignLaunchArtifacts: artifacts }
  return { kind: 'plan', interpretation: { outcome: 'campaign_launch' }, questions: [], sourceIds: [sourceId], selectedPacks: [{ key: CAMPAIGN_LAUNCH_PACK_V1.key, version: CAMPAIGN_LAUNCH_PACK_V1.semanticVersion, contentHash: CAMPAIGN_LAUNCH_PACK_V1.contentHash }], plan: { schemaVersion: 1, missionId, actionPack: { key: CAMPAIGN_LAUNCH_PACK_V1.key, version: CAMPAIGN_LAUNCH_PACK_V1.semanticVersion, templateHash: CAMPAIGN_LAUNCH_PACK_V1.contentHash }, resolvedParameters, deviations: [], rationale: 'Plano governado e citado.', assumptions: [], risks: [], estimatedEconomics: { currency: 'BRL', aiAndProviderCost: '25', mediaCost: '500', humanHours: '1', humanCost: '100', totalExecutionCost: '625' }, steps: canonical.steps.map(step => ({ stepKey: step.stepKey, dependsOn: step.dependsOn, capabilityKey: step.capabilityKey, capabilityVersion: step.capabilityVersion, input: stepInput(step.stepKey), timeoutSeconds: step.stepKey === 'pack.wait_observation' ? 86400 : 300, maxAttempts: 1, approvalRequired: step.approvalRequired, effect: registry.get(step.capabilityKey, step.capabilityVersion).effect, outputBindings: {} })) } }
}

function stepInput(stepKey: string): Record<string, unknown> {
  if (stepKey === 'pack.readiness') return { requiredModules: ['campaigns','landing_pages','campaign_launch_agent'], requiredConnections: ['ads_provider'] }
  if (stepKey === 'pack.inspect') return {}
  if (stepKey === 'pack.draft_landing_page') return artifacts.acquisition.landingPage
  if (stepKey === 'pack.draft_lead_form') return { ...artifacts.acquisition.leadForm, landingPageId: 'binding:pack.draft_landing_page.entityId' }
  if (stepKey === 'pack.validate_tracking') return { utmSource: 'meta', utmMedium: 'paid_social', utmCampaign: 'diagnostico_b2b', conversionEvent: 'lead', landingPageUrl: 'https://preview.example.com/diagnostico-b2b' }
  if (stepKey === 'pack.draft_campaign') return { ...artifacts.brief, audience: artifacts.audience.targeting, creatives: artifacts.creativeSet.creatives, trackingPlan: artifacts.acquisition.trackingPlan, landingPageId: 'binding:pack.draft_landing_page.entityId', leadFormId: 'binding:pack.draft_lead_form.entityId', sourceIds: [sourceId] }
  if (stepKey === 'pack.draft_creative') return { campaignVersionId: 'binding:pack.draft_campaign.versionId', position: 0, creative: artifacts.creativeSet.creatives[0] }
  if (stepKey === 'pack.attach_creative') return { campaignVersionId: 'binding:pack.draft_campaign.versionId', creativeVersionId: 'binding:pack.draft_creative.versionId', expectedContentHash: 'binding:pack.draft_creative.contentHash' }
  if (stepKey === 'pack.attach_landing_page') return { campaignVersionId: 'binding:pack.draft_campaign.versionId', assetKind: 'landing_page', sourceEntityId: 'binding:pack.draft_landing_page.entityId', payload: { versionId: 'binding:pack.draft_landing_page.versionId', contentHash: 'binding:pack.draft_landing_page.contentHash' } }
  if (stepKey === 'pack.attach_lead_form') return { campaignVersionId: 'binding:pack.draft_campaign.versionId', assetKind: 'lead_form', sourceEntityId: 'binding:pack.draft_lead_form.entityId', payload: { contentHash: 'binding:pack.draft_lead_form.contentHash' } }
  if (stepKey === 'pack.create_provider_paused') return { versionId: 'binding:pack.draft_campaign.versionId', expectedContentHash: 'binding:pack.draft_campaign.contentHash', approvedSubjectHash: 'binding:pack.draft_campaign.contentHash', maxTotalBudgetBrl: '500' }
  if (stepKey === 'pack.approve_launch') return { approvalType: 'external_effect', subject: { artifactSet: 'campaign_launch', providerState: 'paused' } }
  if (stepKey === 'pack.activate') return { versionId: 'binding:pack.draft_campaign.versionId', expectedContentHash: 'binding:pack.draft_campaign.contentHash', approvedSubjectHash: 'binding:pack.draft_campaign.contentHash' }
  if (stepKey === 'pack.wait_observation') return { durationHours: 24 }
  if (stepKey === 'pack.collect_metrics_and_costs') return { campaignId: 'binding:pack.draft_campaign.entityId' }
  return { checkpointKey: 'campaign_launch_24h', targetRevenueBrl: '0' }
}

function fakeProvider() {
  const state = { status: 'draft', contentHash: 'a'.repeat(64), externalMutations: 0, cancelled: false, activatedKeys: new Set<string>() }
  const artifact = (input: Record<string, unknown>, id: string, status = 'draft') => ({ entityId: id, versionId: id, status, contentHash: missionArtifactHash(input) })
  const exact = (input: Record<string, unknown>) => { if (input.expectedContentHash !== state.contentHash || input.approvedSubjectHash !== state.contentHash) throw new Error('campaign_version_hash_changed') }
  const commands: NonNullable<CapabilityContext['commands']> = {
    createLandingPageDraft: async input => artifact(input, ids[4]!), createLeadFormDraft: async input => artifact(input, ids[5]!),
    createCampaignDraft: async input => { const result = artifact(input, ids[7]!); state.contentHash = result.contentHash; return { ...result, entityId: ids[6]! } },
    generateCreativeDraft: async input => artifact(input, ids[8]!), attachCampaignCreativeDraft: async input => artifact(input, ids[8]!), attachAcquisitionAsset: async input => artifact(input, ids[9]!, input.validated === true ? 'validated' : 'draft'),
    createProviderCampaignPaused: async input => { exact(input); if (Number(input.maxTotalBudgetBrl) < 500) throw new Error('campaign_budget_exceeds_envelope'); state.status = 'provider_paused'; state.externalMutations += 1; return { entityId: ids[6]!, versionId: ids[7]!, status: state.status, contentHash: state.contentHash, providerReference: 'meta-campaign-42', mutationRunId: ids[12]! } },
    activateProviderCampaign: async input => { if (state.cancelled) throw new Error('mission_not_active'); exact(input); const key = String(input.idempotencyKey); if (!state.activatedKeys.has(key)) { state.activatedKeys.add(key); state.externalMutations += 1; state.status = 'active' } return { entityId: ids[6]!, versionId: ids[7]!, status: state.status, contentHash: state.contentHash, providerReference: 'meta-campaign-42', mutationRunId: ids[13]! } },
    pauseProviderCampaign: async input => { exact(input); state.externalMutations += 1; state.status = 'paused'; return { entityId: ids[6]!, versionId: ids[7]!, status: state.status, contentHash: state.contentHash, providerReference: 'meta-campaign-42', mutationRunId: ids[14]! } },
  }
  return { state, commands }
}

function context(key: string, commands: NonNullable<CapabilityContext['commands']>): CapabilityContext {
  return { organizationId, missionId, actionRunId: ids[20]!, actor: { type: 'user', id: ids[21]! }, idempotencyKey: `campaign-e2e:${key}`, dryRun: false, async query<T>() { return { rows: [] as T[] } }, commands }
}

function campaignMission(): ActionMission { return { id: missionId, organizationId, packVersionId: ids[22]!, status: 'active', mode: 'assisted', title: 'Campanha B2B', objective: 'Gerar leads', goal: { statement: 'Gerar leads', requestedOutcome: '20 leads', scopeHints: ['campaigns'], constraints: {}, acceptanceCriteria: [] }, parameters, packSelection: {}, budget: { currency: 'BRL', maxTotalCostBrl: '1000', maxHumanHours: '8' }, autonomyEnvelope: { mode: 'assisted', allowedModules: ['campaigns'], allowedCapabilityKeys: [], maxTotalCostBrl: '1000', maxHumanHours: '8', expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: [] }, version: 1, createdBy: ids[21]!, createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z' } }
function economics() { return { producedValueBrl: '0', totalExecutionCostBrl: '575', netValueBrl: '-575', valueCostRatio: '0', valuePerHumanHourBrl: 'not_applicable' as const, humanFreeExecutionRate: 'not_applicable' as const } }

function unknownEffect(id: string): ExternalEffect { return { id, organizationId, missionId, runId: ids[16]!, capabilityKey: 'campaign.provider.create_paused', capabilityVersion: 1, providerKey: 'meta', providerIdempotencyKey: `provider:${id}`, requestHash: 'a'.repeat(64), requestMetadata: {}, status: 'unknown', outcomeEvidence: {}, reconciliationDeadlineAt: '2026-09-01T12:15:00.000Z', createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z' } }
function reconciliationStore(effect: ExternalEffect, claim: () => ExternalEffect | null) {
  return { claim: vi.fn(async () => claim()), resolve: vi.fn(async input => ({ ...effect, status: input.outcome === 'created' ? 'confirmed_created' as const : 'confirmed_failed' as const })), defer: vi.fn(async () => ({ ...effect, status: 'unknown' as const })), manualReview: vi.fn(async () => ({ ...effect, status: 'manual_review' as const })) } satisfies ExternalEffectReconciliationStore
}
