import { describe, expect, it, vi } from 'vitest'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'
import { resolveCapabilityDecision } from '../src/modules/action-engine/capability-policy.js'
import { resolvePlanInputBindings } from '../src/modules/action-engine/plan-input-bindings.js'
import { compileSupervisorPlan } from '../src/modules/action-engine/planner.js'
import { FUNNEL_NURTURE_PACK_V1 } from '../src/modules/action-engine/packs/funnel-nurture-v1.js'

const ids = Array.from({ length: 20 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
const sourceId = ids[0]!
const funnel = { name: 'Comercial consultivo', description: 'Funil seguro', stages: [
  { key: 'diagnosis', name: 'Diagnóstico', exitCriteria: ['Dor confirmada'], isWon: false, isLost: false },
  { key: 'won', name: 'Ganho', exitCriteria: ['Contrato assinado'], isWon: true, isLost: false },
] }
const emails = [1, 2, 3].map(index => ({ key: `education_${index}`, name: `Educação ${index}`, subject: `Diagnóstico ${index}`, previewText: 'Roteiro consultivo', bodyHtml: '<p>Conteúdo.</p><a href="{{unsubscribe_url}}">Sair</a>', bodyText: 'Conteúdo. Sair: {{unsubscribe_url}}', sourceIds: [sourceId], complianceNotes: ['Sem promessa absoluta'], forbiddenTerms: ['resultado garantido'] }))
const sequence = { name: 'Nutrição', description: 'Educacional', conversionGoal: 'Resposta', steps: emails.map((_, index) => ({ templateVersionId: `binding:pack.draft_email_${index + 1}.versionId`, delayMinutes: index * 1440, exitConditions: ['replied'] })) }
const automation = { name: 'Entrada segura', trigger: { type: 'lead.created' }, eligibilityConditions: [{ field: 'lead.status', operator: 'equals', value: 'open' }], sequenceVersionId: 'binding:pack.draft_sequence.versionId', exitConditions: ['replied', 'unsubscribed'], consentPolicy: 'require_granted', suppressionPolicy: 'check_before_enrollment', dailyRunLimit: 100 }
const artifacts = { funnel, emails, sequence: { ...sequence, steps: emails.map((email, index) => ({ emailKey: email.key, delayMinutes: index * 1440, exitConditions: ['replied'] })) }, automation, sourceIds: [sourceId], brandCompliance: { approved: true, findings: [], sourceIds: [sourceId] }, risks: [] }

describe('Funnel + Nurture disposable vertical slice', () => {
  it('compiles the protected pack, materializes immutable bindings and keeps publication approval-gated', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const metadata = new Map(registry.listMetadata().map(item => [`${item.key}@${item.version}`, item]))
    const rawProposal = {
      kind: 'plan', interpretation: { outcome: 'funnel_nurture' }, questions: [], sourceIds: [sourceId],
      selectedPacks: [{ key: FUNNEL_NURTURE_PACK_V1.key, version: FUNNEL_NURTURE_PACK_V1.semanticVersion, contentHash: FUNNEL_NURTURE_PACK_V1.contentHash }],
      plan: {
        schemaVersion: 1, missionId: ids[1], actionPack: { key: FUNNEL_NURTURE_PACK_V1.key, version: FUNNEL_NURTURE_PACK_V1.semanticVersion, templateHash: FUNNEL_NURTURE_PACK_V1.contentHash },
        resolvedParameters: { icp: 'Donos de clínicas', offer: 'Consultoria', funnelNurtureArtifacts: artifacts }, deviations: [], rationale: 'Configuração governada.', assumptions: [], risks: [],
        estimatedEconomics: { currency: 'BRL', aiAndProviderCost: '10', mediaCost: '0', humanHours: '1', humanCost: '100', totalExecutionCost: '110' },
        steps: FUNNEL_NURTURE_PACK_V1.topologyTemplate.steps.map(step => ({
          stepKey: step.stepKey, dependsOn: step.dependsOn, capabilityKey: step.capabilityKey, capabilityVersion: 1,
          input: inputFor(step.stepKey), timeoutSeconds: step.stepKey === 'pack.wait_observation' ? 86400 : 300, maxAttempts: 1,
          approvalRequired: step.approvalRequired, effect: metadata.get(`${step.capabilityKey}@1`)?.effect ?? 'none', outputBindings: {},
        })),
      },
    }
    const compiled = compileSupervisorPlan({
      rawProposal, missionId: ids[1]!, packCatalog: [FUNNEL_NURTURE_PACK_V1], registry, maxTotalCostBrl: '500',
      allowedSourceIds: [sourceId], contextHash: 'c'.repeat(64), capabilityCatalogHash: 'd'.repeat(64), expectedCapabilityCatalogHash: 'd'.repeat(64),
      autonomyEnvelope: { mode: 'prepare', allowedModules: ['crm','automations','funnel_nurture_agent'], allowedCapabilityKeys: [], maxTotalCostBrl: '500', maxHumanHours: '4', expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: ['internal'] },
    })
    expect(compiled.kind).toBe('plan')
    if (compiled.kind !== 'plan') throw new Error('expected_plan')
    expect(compiled.compiled.steps).toHaveLength(21)

    const outputsByStep: Record<string, Record<string, unknown>> = {}
    for (let index = 1; index <= 3; index += 1) outputsByStep[`pack.draft_email_${index}`] = { versionId: ids[index + 2] }
    const sequenceInput = resolvePlanInputBindings(inputFor('pack.draft_sequence'), { resolvedParameters: rawProposal.plan.resolvedParameters, outputsByStep }) as Record<string, unknown>
    expect(sequenceInput).toMatchObject({ steps: [{ templateVersionId: ids[3] }, { templateVersionId: ids[4] }, { templateVersionId: ids[5] }] })
    const createSequenceDraft = vi.fn(async () => ({ entityId: ids[8], versionId: ids[9], status: 'draft', contentHash: 'e'.repeat(64), evidence: { existingEnrollments: 0 } }))
    const result = await registry.invoke('crm.sequence.create_draft', 1, capabilityContext({ createSequenceDraft }), sequenceInput)
    expect(result.output).toMatchObject({ sequenceId: ids[8], versionId: ids[9], existingEnrollments: 0 })

    const publication = registry.get('automation.flow.publish', 1)
    const base = { capability: publication, requiredConnectionsHealthy: true, legalOrConsentAllowed: true, budgetAvailable: true, missionActive: true, actorPermissions: publication.requiredPermissions, capabilityAllowedByEnvelope: true }
    expect(resolveCapabilityDecision({ ...base, globalKillSwitch: false, missionMode: 'assisted' })).toMatchObject({ outcome: 'allow', requiresApproval: true, dryRun: false })
    expect(resolveCapabilityDecision({ ...base, globalKillSwitch: false, capabilityKillSwitch: true, missionMode: 'assisted' })).toMatchObject({ outcome: 'deny', reason: 'capability_kill_switch_active' })
  })

  it('rejects an undeclared or forward output dependency before it reaches a worker', () => {
    const registry = createActionEngineCapabilityRegistry()
    const metadata = new Map(registry.listMetadata().map(item => [`${item.key}@${item.version}`, item]))
    const steps = FUNNEL_NURTURE_PACK_V1.topologyTemplate.steps.map(step => ({ stepKey: step.stepKey, dependsOn: step.dependsOn, capabilityKey: step.capabilityKey, capabilityVersion: 1, input: inputFor(step.stepKey), timeoutSeconds: 300, maxAttempts: 1, approvalRequired: step.approvalRequired, effect: metadata.get(`${step.capabilityKey}@1`)?.effect ?? 'none', outputBindings: {} }))
    const target = steps.find(step => step.stepKey === 'pack.draft_sequence')!
    target.input = { ...sequence, steps: [{ templateVersionId: 'binding:pack.publish_flow.versionId', delayMinutes: 0, exitConditions: [] }] }
    expect(() => compileSupervisorPlan({ rawProposal: { kind: 'plan', interpretation: {}, questions: [], sourceIds: [sourceId], selectedPacks: [{ key: FUNNEL_NURTURE_PACK_V1.key, version: '1.0.0', contentHash: FUNNEL_NURTURE_PACK_V1.contentHash }], plan: { schemaVersion: 1, missionId: ids[1], actionPack: { key: FUNNEL_NURTURE_PACK_V1.key, version: '1.0.0', templateHash: FUNNEL_NURTURE_PACK_V1.contentHash }, resolvedParameters: { funnelNurtureArtifacts: artifacts }, deviations: [], rationale: 'Teste', assumptions: [], risks: [], estimatedEconomics: { currency: 'BRL', aiAndProviderCost: '1', mediaCost: '0', humanHours: '0', humanCost: '0', totalExecutionCost: '1' }, steps } }, missionId: ids[1]!, packCatalog: [FUNNEL_NURTURE_PACK_V1], registry, maxTotalCostBrl: '10', allowedSourceIds: [sourceId], contextHash: 'a'.repeat(64), capabilityCatalogHash: 'b'.repeat(64), expectedCapabilityCatalogHash: 'b'.repeat(64), autonomyEnvelope: { mode: 'prepare', allowedModules: ['crm','automations'], allowedCapabilityKeys: [], maxTotalCostBrl: '10', maxHumanHours: '1', expiresAt: '2099-01-01T00:00:00.000Z', alwaysRequireApprovalFor: [] } })).toThrowError('mission_plan_output_binding_invalid')
  })
})

function inputFor(stepKey: string): Record<string, unknown> {
  if (stepKey === 'pack.readiness') return { requiredModules: ['crm','automations','funnel_nurture_agent'], requiredConnections: ['email'] }
  if (stepKey === 'pack.simulate_funnel' || stepKey === 'pack.draft_funnel') return funnel
  const emailIndex = /^pack\.draft_email_(\d)$/.exec(stepKey)?.[1]
  if (emailIndex) { const { key: _key, ...copy } = emails[Number(emailIndex) - 1]!; return copy }
  if (stepKey === 'pack.draft_sequence') return sequence
  if (stepKey === 'pack.simulate_sequence') return { sequenceId: 'binding:pack.draft_sequence.entityId', versionId: 'binding:pack.draft_sequence.versionId', expectedContentHash: 'binding:pack.draft_sequence.contentHash' }
  if (stepKey === 'pack.draft_flow') return automation
  if (stepKey === 'pack.simulate_flow') return { flowId: 'binding:pack.draft_flow.entityId', versionId: 'binding:pack.draft_flow.versionId', expectedContentHash: 'binding:pack.draft_flow.contentHash' }
  if (stepKey === 'pack.approve_publication') return { approvalType: 'plan', subject: { artifactSet: 'funnel_nurture' } }
  if (stepKey === 'pack.publish_funnel') return { versionId: 'binding:pack.draft_funnel.versionId', expectedContentHash: 'binding:pack.draft_funnel.contentHash' }
  const publishEmail = /^pack\.publish_email_(\d)$/.exec(stepKey)?.[1]
  if (publishEmail) return { templateId: `binding:pack.draft_email_${publishEmail}.entityId`, expectedContentHash: `binding:pack.draft_email_${publishEmail}.contentHash` }
  if (stepKey === 'pack.publish_sequence') return { sequenceId: 'binding:pack.draft_sequence.entityId', versionId: 'binding:pack.draft_sequence.versionId', expectedContentHash: 'binding:pack.draft_sequence.contentHash' }
  if (stepKey === 'pack.publish_flow') return { flowId: 'binding:pack.draft_flow.entityId', versionId: 'binding:pack.draft_flow.versionId', expectedContentHash: 'binding:pack.draft_flow.contentHash' }
  if (stepKey === 'pack.wait_observation') return { durationHours: 720 }
  if (stepKey === 'pack.evaluate') return { checkpointKey: 'funnel_nurture_30d', targetRevenueBrl: '0' }
  return {}
}

function capabilityContext(commands: Record<string, unknown>) {
  return { organizationId: ids[1]!, missionId: ids[2]!, actionRunId: ids[10]!, actor: { type: 'user' as const, id: ids[11]! }, idempotencyKey: 'e2e', dryRun: false, async query<T>() { return { rows: [] as T[] } }, commands }
}
