import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { CapabilityRegistry, noEffectRecovery, type CapabilityDefinition } from '../src/modules/action-engine/capability-registry.js'
import {
  assertPinnedCapabilityAvailable,
  createCapabilityManifest,
  hashCapabilityManifest,
} from '../src/modules/action-engine/capability-manifest.js'

function definition(input: {
  key: string
  version?: number
  schema?: 'string' | 'number'
  recovery?: 'compensatable' | 'irreversible'
}): CapabilityDefinition {
  return {
    key: input.key,
    version: input.version ?? 1,
    title: input.key,
    description: `Capability ${input.key}`,
    risk: 'low',
    effect: 'internal',
    approval: 'risk_based',
    idempotency: 'required',
    inputSchema: input.schema === 'number' ? z.object({ value: z.number() }) : z.object({ value: z.string() }),
    outputSchema: z.object({ ok: z.boolean() }),
    requiredModules: ['crm'],
    requiredConnections: [],
    recovery: input.recovery === 'irreversible'
      ? { kind: 'irreversible', incidentType: 'test_effect' }
      : noEffectRecovery(),
    async execute() { return { output: { ok: true }, effectProduced: true } },
  }
}

function registry(...definitions: CapabilityDefinition[]): CapabilityRegistry {
  const result = new CapabilityRegistry()
  for (const item of definitions) result.register(item)
  return result
}

describe('immutable capability manifest', () => {
  it('has stable ordering and ignores unrelated catalog additions', () => {
    const firstRegistry = registry(definition({ key: 'beta.run' }), definition({ key: 'alpha.run' }))
    const references = [{ key: 'beta.run', version: 1 }, { key: 'alpha.run', version: 1 }]
    const first = createCapabilityManifest(firstRegistry, references)
    const expanded = registry(
      definition({ key: 'unrelated.read' }), definition({ key: 'alpha.run' }), definition({ key: 'beta.run' }),
    )
    const second = createCapabilityManifest(expanded, [...references].reverse())

    expect(first.entries.map((entry) => `${entry.key}@${entry.version}`)).toEqual(['alpha.run@1', 'beta.run@1'])
    expect(second).toEqual(first)
    expect(hashCapabilityManifest(first.entries)).toBe(first.hash)
  })

  it('detects schema and recovery drift at the exact pinned version', () => {
    const pinnedRegistry = registry(definition({ key: 'crm.update' }))
    const pinned = createCapabilityManifest(pinnedRegistry, [{ key: 'crm.update', version: 1 }]).entries[0]!

    expect(() => assertPinnedCapabilityAvailable(
      registry(definition({ key: 'crm.update', schema: 'number' })), pinned,
    )).toThrowError('capability_catalog_drift')
    expect(() => assertPinnedCapabilityAvailable(
      registry(definition({ key: 'crm.update', recovery: 'irreversible' })), pinned,
    )).toThrowError('capability_catalog_drift')
    expect(() => assertPinnedCapabilityAvailable(new CapabilityRegistry(), pinned))
      .toThrowError('capability_catalog_drift')
  })

  it('never resolves latest in an immutable plan', () => {
    const current = registry(definition({ key: 'crm.update' }))
    expect(() => createCapabilityManifest(current, [{ key: 'crm.update', version: 'latest' as never }]))
      .toThrowError('capability_exact_version_required')
  })
})
