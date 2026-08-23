import { z } from 'zod'
import { describe, expect, it, vi } from 'vitest'
import { CapabilityRegistry, type CapabilityContext, type CapabilityDefinition } from '../src/modules/action-engine/capability-registry.js'
import { automationFlowExecute } from '../src/modules/action-engine/capabilities/automation.js'
import { emailMessageQueue, whatsappTemplateQueue } from '../src/modules/action-engine/capabilities/communications.js'
import { createActionEngineCapabilityRegistry } from '../src/modules/action-engine/capabilities/index.js'

const inputSchema = z.object({ value: z.string() })
const outputSchema = z.object({ value: z.string() })

function context(commands: CapabilityContext['commands'] = {}): CapabilityContext {
  return {
    organizationId: '00000000-0000-4000-8000-000000000001',
    missionId: '00000000-0000-4000-8000-000000000002',
    actor: { type: 'system' },
    idempotencyKey: 'recovery-test',
    dryRun: false,
    commands,
    async query<T>() { return { rows: [] as T[] } },
  }
}

function definition(recovery: CapabilityDefinition<{ value: string }, { value: string }>['recovery']): CapabilityDefinition<{ value: string }, { value: string }> {
  return {
    key: 'test.recovery', version: 1, title: 'Recovery', description: 'Recovery contract test',
    risk: 'low', effect: 'internal', approval: 'never', idempotency: 'required',
    requiredModules: [], requiredConnections: [], inputSchema, outputSchema, recovery,
    async execute(_context, input) { return { output: input, effectProduced: true } },
  }
}

describe('Action Engine capability recovery contract', () => {
  it('rejects missing or malformed recovery metadata at registration', () => {
    const missing = { ...definition({ kind: 'irreversible', incidentType: 'test_incident' }), recovery: undefined }
    expect(() => new CapabilityRegistry().register(missing as never)).toThrowError('capability_recovery_invalid')
    const malformed = { ...definition({ kind: 'irreversible', incidentType: 'test_incident' }), recovery: { kind: 'pausable' } }
    expect(() => new CapabilityRegistry().register(malformed as never)).toThrowError('capability_recovery_invalid')
  })

  it('executes compensatable and pausable recovery handlers after output validation', async () => {
    const compensate = vi.fn(async () => ({ output: { recovered: true }, effectProduced: true }))
    const compensatable = new CapabilityRegistry().register(definition({ kind: 'compensatable', compensate }))
    await expect(compensatable.recover('test.recovery', 1, context(), { value: 'created' }))
      .resolves.toMatchObject({ output: { recovered: true } })
    expect(compensate).toHaveBeenCalledOnce()

    const contain = vi.fn(async () => ({ output: { paused: true }, effectProduced: true }))
    const pausableDefinition = { ...definition({ kind: 'pausable', contain }), key: 'test.pausable' }
    const pausable = new CapabilityRegistry().register(pausableDefinition)
    await expect(pausable.recover('test.pausable', 1, context(), { value: 'active' }))
      .resolves.toMatchObject({ output: { paused: true } })
    expect(contain).toHaveBeenCalledOnce()
  })

  it('does not pretend an irreversible effect can be undone', async () => {
    const registry = new CapabilityRegistry().register(definition({ kind: 'irreversible', incidentType: 'message_sent' }))
    await expect(registry.recover('test.recovery', 1, context(), { value: 'sent' }))
      .rejects.toThrowError('capability_irreversible:message_sent')
  })

  it('uses domain recovery commands for CRM tasks and sequence containment', async () => {
    const cancelTask = vi.fn(async () => ({ status: 'cancelled' }))
    const pauseSequenceEnrollment = vi.fn(async () => ({ status: 'paused' }))
    const registry = createActionEngineCapabilityRegistry()

    await registry.recover('crm.task.create', 1, context({ cancelTask }), {
      preview: false, taskId: '00000000-0000-4000-8000-000000000003',
    })
    await registry.recover('crm.sequence.enroll', 1, context({ pauseSequenceEnrollment }), {
      preview: false, enrollmentId: '00000000-0000-4000-8000-000000000004',
    })

    expect(cancelTask).toHaveBeenCalledWith(expect.objectContaining({ taskId: '00000000-0000-4000-8000-000000000003' }))
    expect(pauseSequenceEnrollment).toHaveBeenCalledWith(expect.objectContaining({ enrollmentId: '00000000-0000-4000-8000-000000000004' }))
  })

  it('classifies the shipped catalog and external communication honestly', () => {
    const metadata = createActionEngineCapabilityRegistry().listMetadata()
    expect(metadata.every((item) => ['compensatable', 'pausable', 'irreversible'].includes(item.recoveryKind))).toBe(true)
    expect(metadata.find((item) => item.key === 'crm.task.create')?.recoveryKind).toBe('compensatable')
    expect(metadata.find((item) => item.key === 'crm.sequence.enroll')?.recoveryKind).toBe('pausable')
    expect(automationFlowExecute.recovery.kind).toBe('pausable')
    expect(emailMessageQueue.recovery).toEqual({ kind: 'irreversible', incidentType: 'email_dispatch_accepted' })
    expect(whatsappTemplateQueue.recovery).toEqual({ kind: 'irreversible', incidentType: 'whatsapp_dispatch_accepted' })
  })
})
