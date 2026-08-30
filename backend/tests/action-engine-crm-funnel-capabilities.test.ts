import { describe, expect, it, vi } from 'vitest'
import { resolveCapabilityDecision } from '../src/modules/action-engine/capability-policy.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'

const organizationId = '00000000-0000-4000-8000-000000000001'
const missionId = '00000000-0000-4000-8000-000000000002'
const actionRunId = '00000000-0000-4000-8000-000000000003'
const actorId = '00000000-0000-4000-8000-000000000004'
const versionId = '00000000-0000-4000-8000-000000000005'
const pipelineId = '00000000-0000-4000-8000-000000000006'
const contentHash = 'a'.repeat(64)

const draft = {
  name: 'Funil consultivo',
  description: 'Da descoberta ao fechamento',
  stages: [
    { key: 'discovery', name: 'Descoberta', exitCriteria: ['Problema confirmado'], isWon: false, isLost: false },
    { key: 'proposal', name: 'Proposta', exitCriteria: ['Proposta enviada'], isWon: false, isLost: false },
    { key: 'won', name: 'Ganho', exitCriteria: ['Contrato assinado'], isWon: true, isLost: false },
  ],
}

function context(overrides: Record<string, unknown> = {}) {
  return {
    organizationId,
    missionId,
    actionRunId,
    actor: { type: 'user' as const, id: actorId },
    idempotencyKey: 'funnel-test',
    dryRun: false,
    async query<T>() { return { rows: [] as T[] } },
    ...overrides,
  }
}

describe('governed CRM funnel capabilities', () => {
  it('registers inspection, simulation, draft and publication with explicit effects', () => {
    const registry = createActionEngineCapabilityRegistry()
    expect(registry.get('crm.pipeline.inspect', 1)).toMatchObject({ effect: 'none', approval: 'never' })
    expect(registry.get('crm.pipeline.simulate', 1)).toMatchObject({ effect: 'none', approval: 'never' })
    expect(registry.get('crm.pipeline.create_draft', 1)).toMatchObject({ effect: 'draft', approval: 'never' })
    expect(registry.get('crm.pipeline.publish', 1)).toMatchObject({ effect: 'internal', approval: 'always' })
  })

  it('inspects pipelines with their stages in stable order', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const query = vi.fn(async () => ({ rows: [
      { pipeline_id: pipelineId, pipeline_name: 'Principal', pipeline_description: null, stage_id: versionId, stage_key: 'new', stage_name: 'Novo', order_index: 0, is_won: false, is_lost: false },
      { pipeline_id: pipelineId, pipeline_name: 'Principal', pipeline_description: null, stage_id: actionRunId, stage_key: 'won', stage_name: 'Ganho', order_index: 1, is_won: true, is_lost: false },
    ] }))
    const result = await registry.invoke('crm.pipeline.inspect', 1, context({ query }), {})
    expect(result.effectProduced).toBe(false)
    expect(result.output).toMatchObject({ pipelines: [{ id: pipelineId, stages: [{ key: 'new', position: 0 }, { key: 'won', position: 1 }] }] })
  })

  it('simulates an ordered funnel without invoking a mutation command', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const createPipelineDraft = vi.fn()
    const result = await registry.invoke('crm.pipeline.simulate', 1, context({ commands: { createPipelineDraft } }), draft)
    expect(result.output).toMatchObject({ preview: true, stageCount: 3, activated: false, stages: draft.stages })
    expect((result.output as { contentHash: string }).contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(createPipelineDraft).not.toHaveBeenCalled()
  })

  it('rejects duplicate stage keys at the capability boundary', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const duplicated = { ...draft, stages: [...draft.stages, { ...draft.stages[0] }] }
    await expect(registry.invoke('crm.pipeline.create_draft', 1, context(), duplicated)).rejects.toThrow('capability_input_invalid')
  })

  it('keeps shadow draft mutation-free and creates a real draft in prepare mode', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const createPipelineDraft = vi.fn(async () => ({ entityId: versionId, versionId, status: 'draft', contentHash, evidence: { stageCount: 3, activated: false } }))
    const preview = await registry.invoke('crm.pipeline.create_draft', 1, context({ dryRun: true, commands: { createPipelineDraft } }), draft)
    expect(preview.output).toMatchObject({ preview: true, stageCount: 3, activated: false })
    expect(createPipelineDraft).not.toHaveBeenCalled()

    const created = await registry.invoke('crm.pipeline.create_draft', 1, context({ commands: { createPipelineDraft } }), draft)
    expect(created.output).toEqual({ preview: false, versionId, contentHash, status: 'draft', stageCount: 3, activated: false })
    expect(created.sourceRecords).toEqual([{ type: 'crm_pipeline_version', id: versionId }])
  })

  it('turns prepare publication into preview and requires approval in assisted mode', () => {
    const capability = createActionEngineCapabilityRegistry().get('crm.pipeline.publish', 1)
    const base = {
      capability,
      globalKillSwitch: false,
      requiredConnectionsHealthy: true,
      legalOrConsentAllowed: true,
      budgetAvailable: true,
      missionActive: true,
      actorPermissions: capability.requiredPermissions ?? [],
      capabilityAllowedByEnvelope: true,
    }
    expect(resolveCapabilityDecision({ ...base, missionMode: 'prepare' })).toMatchObject({ outcome: 'allow', dryRun: true, requiresApproval: false })
    expect(resolveCapabilityDecision({ ...base, missionMode: 'assisted' })).toMatchObject({ outcome: 'allow', dryRun: false, requiresApproval: true })
  })

  it('publishes only the exact approved version hash and surfaces stale-hash rejection', async () => {
    const registry = createActionEngineCapabilityRegistry()
    const publishPipelineDraft = vi.fn(async (input: Record<string, unknown>) => {
      if (input.expectedContentHash !== contentHash) throw new Error('pipeline_draft_hash_changed')
      return { entityId: pipelineId, versionId, status: 'published', contentHash, evidence: { stageCount: 3, activated: true } }
    })
    const published = await registry.invoke('crm.pipeline.publish', 1, context({ commands: { publishPipelineDraft } }), { versionId, expectedContentHash: contentHash })
    expect(published.output).toEqual({ preview: false, pipelineId, versionId, contentHash, status: 'published', stageCount: 3, activated: true })
    expect(publishPipelineDraft).toHaveBeenCalledWith(expect.objectContaining({ actionRunId, actorId, expectedContentHash: contentHash }))
    await expect(registry.invoke('crm.pipeline.publish', 1, context({ commands: { publishPipelineDraft }, idempotencyKey: 'stale' }), {
      versionId, expectedContentHash: 'b'.repeat(64),
    })).rejects.toThrow('pipeline_draft_hash_changed')
  })
})
