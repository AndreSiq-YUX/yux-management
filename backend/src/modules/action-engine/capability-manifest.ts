import { createHash } from 'node:crypto'
import type { CapabilityEffect, CapabilityMetadata, CapabilityRecovery, CapabilityRegistry } from './capability-registry.js'

export type CapabilityManifestEntry = {
  key: string
  version: number
  definitionHash: string
  effect: CapabilityEffect
  recoveryKind: CapabilityRecovery['kind']
}

export type CapabilityManifest = { entries: CapabilityManifestEntry[]; hash: string }

export function createCapabilityManifest(
  registry: CapabilityRegistry,
  references: Array<{ key: string; version: number }>,
): CapabilityManifest {
  const metadata = new Map(registry.listMetadata().map((item) => [identity(item.key, item.version), item]))
  const unique = new Map<string, CapabilityManifestEntry>()
  for (const reference of references) {
    if (!reference.key.trim() || !Number.isInteger(reference.version) || reference.version < 1) {
      throw new Error('capability_exact_version_required')
    }
    const item = metadata.get(identity(reference.key, reference.version))
    if (!item) throw new Error('capability_catalog_drift')
    unique.set(identity(reference.key, reference.version), createEntry(item))
  }
  const entries = [...unique.values()].sort(compareEntries)
  return { entries, hash: hashCapabilityManifest(entries) }
}

export function hashCapabilityManifest(entries: CapabilityManifestEntry[]): string {
  return sha256(stableSerialize([...entries].sort(compareEntries)))
}

export function assertPinnedCapabilityAvailable(registry: CapabilityRegistry, pinned: CapabilityManifestEntry): void {
  try {
    if (!Number.isInteger(pinned.version) || pinned.version < 1) throw new Error('invalid_version')
    const metadata = registry.listMetadata().find((item) => item.key === pinned.key && item.version === pinned.version)
    if (!metadata || stableSerialize(createEntry(metadata)) !== stableSerialize(pinned)) throw new Error('changed')
  } catch {
    throw new Error('capability_catalog_drift')
  }
}

function createEntry(metadata: CapabilityMetadata): CapabilityManifestEntry {
  const normalized = {
    ...metadata,
    requiredModules: [...metadata.requiredModules].sort(),
    requiredConnections: [...metadata.requiredConnections].sort(),
  }
  return {
    key: metadata.key,
    version: metadata.version,
    definitionHash: sha256(stableSerialize(normalized)),
    effect: metadata.effect,
    recoveryKind: metadata.recoveryKind,
  }
}

function compareEntries(left: CapabilityManifestEntry, right: CapabilityManifestEntry): number {
  return identity(left.key, left.version).localeCompare(identity(right.key, right.version))
}

function identity(key: string, version: number): string { return `${key.trim()}@${version}` }
function sha256(value: string): string { return createHash('sha256').update(value).digest('hex') }

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
