import { z } from 'zod'
import { describe, expect, it } from 'vitest'
import { CapabilityRegistry, noEffectRecovery } from '../src/modules/action-engine/capability-registry.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'

const definition = {
  key: 'test.echo', version: 1, title: 'Echo', description: 'Echo test',
  risk: 'read_only' as const, effect: 'none' as const, approval: 'never' as const,
  idempotency: 'none' as const, requiredModules: [], requiredConnections: [],
  recovery: noEffectRecovery<{ value: string }>(),
  inputSchema: z.object({ value: z.string() }), outputSchema: z.object({ value: z.string() }),
  async execute(_context: never, input: { value: string }) { return { output: input, effectProduced: false } },
}

const context = {
  organizationId: '00000000-0000-4000-8000-000000000001', missionId: '00000000-0000-4000-8000-000000000002',
  actor: { type: 'system' as const }, idempotencyKey: 'test', dryRun: true,
  async query<T>() { return { rows: [] as T[] } },
}

describe('Action Engine capability registry', () => {
  it('rejects duplicate and unknown capabilities', () => {
    const registry = new CapabilityRegistry()
    expect(() => registry.register(definition)).not.toThrow()
    expect(() => registry.register(definition)).toThrowError('capability_duplicate')
    expect(() => registry.get('crm.unknown', 1)).toThrowError('capability_not_found')
  })

  it('validates input and output at the execution boundary', async () => {
    const registry = new CapabilityRegistry().register(definition)
    await expect(registry.invoke('test.echo', 1, context, { wrong: true })).rejects.toThrow('capability_input_invalid')
    const invalidOutput = { ...definition, key: 'test.invalid', async execute() { return { output: { value: 42 }, effectProduced: false } } }
    registry.register(invalidOutput as unknown as typeof definition)
    await expect(registry.invoke('test.invalid', 1, context, { value: 'ok' })).rejects.toThrow('capability_output_invalid')
  })

  it('serializes planner metadata without executable functions or secrets', () => {
    const registry = createActionEngineCapabilityRegistry()
    const metadata = registry.listMetadata()
    const serialized = JSON.stringify(metadata)
    expect(metadata.every((item) => !Object.prototype.hasOwnProperty.call(item, 'execute'))).toBe(true)
    expect(serialized).not.toContain('secret')
    expect(registry.get('crm.recovery_candidates.search', 1).idempotency).toBe('none')
    expect(registry.get('crm.task.create', 1).idempotency).toBe('required')
    expect(metadata.some((item) => item.key === 'crm.sequence.enroll')).toBe(true)
    expect(metadata.some((item) => item.key === 'email.message.queue')).toBe(false)
    expect(metadata.some((item) => item.key === 'whatsapp.template.queue')).toBe(false)
    expect(metadata.some((item) => item.key === 'automation.flow.execute')).toBe(false)
  })

  it('keeps command dry-runs mutation-free', async () => {
    let mutations = 0
    const registry = createActionEngineCapabilityRegistry()
    const result = await registry.invoke('crm.task.create', 1, {
      ...context,
      commands: { async createTask() { mutations += 1; return { id: '00000000-0000-4000-8000-000000000003' } } },
    }, { leadId: '00000000-0000-4000-8000-000000000004', title: 'Follow-up', dueAt: '2026-09-01T12:00:00.000Z' })
    expect(result.effectProduced).toBe(false)
    expect(mutations).toBe(0)
  })
})
