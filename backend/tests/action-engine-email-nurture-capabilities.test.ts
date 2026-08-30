import { describe, expect, it, vi } from 'vitest'
import { resolveCapabilityDecision } from '../src/modules/action-engine/capability-policy.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'

const ids = Array.from({ length: 14 }, (_, index) => `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`)
const [organizationId, missionId, actionRunId, actorId, sourceId, templateId, templateVersionId, sequenceId, sequenceVersionId, flowId, flowVersionId] = ids
const hash = 'a'.repeat(64)

const copy = {
  name: 'Nutrição consultiva 1', subject: 'Como estruturar sua operação', previewText: 'Um guia direto',
  bodyHtml: '<p>Olá, {{contact_name}}.</p><p>Conteúdo útil.</p><a href="{{unsubscribe_url}}">Cancelar inscrição</a>',
  bodyText: 'Olá, {{contact_name}}. Conteúdo útil. Cancelar inscrição: {{unsubscribe_url}}',
  sourceIds: [sourceId], complianceNotes: ['Sem promessa de resultado; opt-out explícito.'], forbiddenTerms: ['resultado garantido'],
}
const sequence = {
  name: 'Nutrição consultiva', description: 'Sequência inicial', conversionGoal: 'Reunião agendada',
  steps: [{ templateVersionId, delayMinutes: 0, exitConditions: ['replied'] }],
}
const flow = {
  name: 'Entrada na nutrição', description: 'Inscreve somente leads futuros e elegíveis',
  trigger: { type: 'lead.stage_changed', pipelineId: ids[11], stageId: ids[12] },
  eligibilityConditions: [{ field: 'lead.status', operator: 'equals', value: 'open' }],
  sequenceVersionId, exitConditions: ['replied', 'converted', 'unsubscribed'],
  consentPolicy: 'require_granted', suppressionPolicy: 'check_before_enrollment', dailyRunLimit: 100,
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    organizationId, missionId, actionRunId, actor: { type: 'user' as const, id: actorId },
    idempotencyKey: 'nurture-test', dryRun: false,
    async query<T>() { return { rows: [] as T[] } }, ...overrides,
  }
}

describe('governed e-mail nurture capabilities', () => {
  it('registers all copy, sequence and automation capabilities with governed effects', () => {
    const registry = createActionEngineCapabilityRegistry()
    for (const key of ['email.templates.inspect', 'crm.sequence.simulate', 'automation.flow.simulate']) {
      expect(registry.get(key, 1)).toMatchObject({ effect: 'none', approval: 'never' })
    }
    for (const key of ['email.template.create_draft', 'crm.sequence.create_draft', 'automation.flow.create_draft']) {
      expect(registry.get(key, 1)).toMatchObject({ effect: 'draft', idempotency: 'required' })
    }
    for (const key of ['email.template.publish', 'crm.sequence.publish', 'automation.flow.publish']) {
      expect(registry.get(key, 1)).toMatchObject({ effect: 'internal', approval: 'always', idempotency: 'required' })
    }
  })

  it('rejects missing citations, forbidden vocabulary and absent unsubscribe intent', async () => {
    const registry = createActionEngineCapabilityRegistry()
    await expect(registry.invoke('email.template.create_draft', 1, context(), { ...copy, sourceIds: [] })).rejects.toThrow('capability_input_invalid')
    await expect(registry.invoke('email.template.create_draft', 1, context(), { ...copy, bodyText: `${copy.bodyText} resultado garantido` })).rejects.toThrow('capability_input_invalid')
    await expect(registry.invoke('email.template.create_draft', 1, context(), { ...copy, bodyHtml: '<p>Sem opt-out</p>', bodyText: 'Sem opt-out' })).rejects.toThrow('capability_input_invalid')
  })

  it('rejects excessive sequence size, invalid delays and mutable template references', async () => {
    const registry = createActionEngineCapabilityRegistry()
    await expect(registry.invoke('crm.sequence.create_draft', 1, context(), { ...sequence, steps: Array.from({ length: 13 }, (_, index) => ({ templateVersionId: ids[index % ids.length], delayMinutes: index * 60, exitConditions: [] })) })).rejects.toThrow('capability_input_invalid')
    await expect(registry.invoke('crm.sequence.create_draft', 1, context(), { ...sequence, steps: [{ templateVersionId, delayMinutes: -1, exitConditions: [] }] })).rejects.toThrow('capability_input_invalid')
    await expect(registry.invoke('crm.sequence.create_draft', 1, context(), { ...sequence, steps: [{ templateName: 'Mutável', delayMinutes: 0, exitConditions: [] }] })).rejects.toThrow('capability_input_invalid')
  })

  it('rejects invalid CRM triggers and requires consent plus suppression policy', async () => {
    const registry = createActionEngineCapabilityRegistry()
    await expect(registry.invoke('automation.flow.create_draft', 1, context(), { ...flow, trigger: { type: 'email.opened' } })).rejects.toThrow('capability_input_invalid')
    await expect(registry.invoke('automation.flow.create_draft', 1, context(), { ...flow, consentPolicy: 'ignore' })).rejects.toThrow('capability_input_invalid')
    await expect(registry.invoke('automation.flow.create_draft', 1, context(), { ...flow, suppressionPolicy: 'skip' })).rejects.toThrow('capability_input_invalid')
  })

  it('keeps shadow mutations as previews and permits drafts in prepare', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const createEmailTemplateDraft = vi.fn(async () => ({ entityId: templateId, status: 'draft', contentHash: hash, evidence: { activated: false, sourceIds: [sourceId] } }))
    const preview = await registry.invoke('email.template.create_draft', 1, context({ dryRun: true, commands: { createEmailTemplateDraft } }), copy)
    expect(preview.output).toMatchObject({ preview: true, activated: false })
    expect(createEmailTemplateDraft).not.toHaveBeenCalled()
    const prepared = await registry.invoke('email.template.create_draft', 1, context({ commands: { createEmailTemplateDraft } }), copy)
    expect(prepared.output).toMatchObject({ preview: false, templateId, contentHash: hash, activated: false })
  })

  it('requires assisted approval for every internal publication', () => {
    const registry = createActionEngineCapabilityRegistry()
    for (const key of ['email.template.publish', 'crm.sequence.publish', 'automation.flow.publish']) {
      const capability = registry.get(key, 1)
      const base = { capability, globalKillSwitch: false, requiredConnectionsHealthy: true, legalOrConsentAllowed: true,
        budgetAvailable: true, missionActive: true, actorPermissions: capability.requiredPermissions ?? [], capabilityAllowedByEnvelope: true }
      expect(resolveCapabilityDecision({ ...base, missionMode: 'prepare' })).toMatchObject({ outcome: 'allow', dryRun: true })
      expect(resolveCapabilityDecision({ ...base, missionMode: 'assisted' })).toMatchObject({ outcome: 'allow', dryRun: false, requiresApproval: true })
    }
  })

  it('pins published template versions in sequence drafts and propagates stale hashes', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const createSequenceDraft = vi.fn(async () => ({ entityId: sequenceId, versionId: sequenceVersionId, status: 'draft', contentHash: hash, evidence: { stepCount: 1, existingEnrollments: 0, activated: false } }))
    const created = await registry.invoke('crm.sequence.create_draft', 1, context({ commands: { createSequenceDraft } }), sequence)
    expect(createSequenceDraft).toHaveBeenCalledWith(expect.objectContaining({ steps: [expect.objectContaining({ templateVersionId })] }))
    expect(created.output).toMatchObject({ sequenceId, versionId: sequenceVersionId, existingEnrollments: 0 })
    const publishSequence = vi.fn(async () => { throw new Error('sequence_draft_hash_changed') })
    await expect(registry.invoke('crm.sequence.publish', 1, context({ commands: { publishSequence }, idempotencyKey: 'stale' }), { sequenceId, versionId: sequenceVersionId, expectedContentHash: 'b'.repeat(64) })).rejects.toThrow('sequence_draft_hash_changed')
  })

  it('rejects publication when the approved template hash is stale', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const publishEmailTemplate = vi.fn(async () => { throw new Error('email_template_hash_changed') })
    await expect(registry.invoke('email.template.publish', 1, context({ commands: { publishEmailTemplate }, idempotencyKey: 'stale-template' }), {
      templateId, expectedContentHash: 'b'.repeat(64),
    })).rejects.toThrow('email_template_hash_changed')
    expect(publishEmailTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateId, expectedContentHash: 'b'.repeat(64) }))
  })

  it('simulates consent and suppression preflight without enrolling existing leads', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const simulateAutomationFlow = vi.fn(async () => ({ entityId: flowId, versionId: flowVersionId, status: 'simulated', contentHash: hash,
      evidence: { providerReady: true, consentPolicyReady: true, suppressionPolicyReady: true, existingEnrollments: 0, activationPerformed: false, blockers: [] } }))
    const result = await registry.invoke('automation.flow.simulate', 1, context({ commands: { simulateAutomationFlow } }), { flowId, versionId: flowVersionId, expectedContentHash: hash })
    expect(result.output).toMatchObject({ ready: true, existingEnrollments: 0, activationPerformed: false, blockers: [] })
  })

  it('publishes the exact automation version while retaining zero setup enrollments', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const publishAutomationFlow = vi.fn(async () => ({ entityId: flowId, versionId: flowVersionId, status: 'published', contentHash: hash, evidence: { activated: true, existingEnrollments: 0 } }))
    const result = await registry.invoke('automation.flow.publish', 1, context({ commands: { publishAutomationFlow } }), { flowId, versionId: flowVersionId, expectedContentHash: hash })
    expect(result.output).toMatchObject({ flowId, versionId: flowVersionId, activated: true, existingEnrollments: 0 })
  })
})
