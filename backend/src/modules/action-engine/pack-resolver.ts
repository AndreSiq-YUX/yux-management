import type { PackCatalogEntry } from './pack-registry.js'

export type RequestedPackSelection = { key: string; semanticVersion: string; contentHash: string; optional?: boolean }
export type ResolvedPackSelection = PackCatalogEntry & { optional: boolean; order: number }

export function resolvePackSelection(input: {
  requested: RequestedPackSelection[]
  catalog: PackCatalogEntry[]
  entitledModules: string[]
  availableCapabilities: Array<{ key: string; version: number }>
}): ResolvedPackSelection[] {
  if (input.requested.length === 0) throw new Error('mission_pack_selection_required')
  const identities = input.requested.map(item => `${item.key}@${item.semanticVersion}`)
  if (new Set(identities).size !== identities.length) throw new Error('mission_pack_selection_duplicate')
  const catalog = new Map(input.catalog.map(entry => [`${entry.key}@${entry.semanticVersion}`, entry]))
  const modules = new Set(input.entitledModules)
  const capabilities = new Set(input.availableCapabilities.map(item => `${item.key}@${item.version}`))
  const selected = input.requested.map(requested => {
    const entry = catalog.get(`${requested.key}@${requested.semanticVersion}`)
    if (!entry || !['published','published_for_internal_pilot'].includes(entry.status)) throw new Error('mission_pack_unpublished')
    if (entry.contentHash !== requested.contentHash) throw new Error('mission_pack_hash_mismatch')
    if (entry.requiredModules.some(moduleKey => !modules.has(moduleKey))) throw new Error('mission_pack_entitlement_missing')
    if (entry.requiredCapabilities.some(capability => !capabilities.has(`${capability.key}@${capability.version}`))) throw new Error('mission_pack_capability_unavailable')
    return { ...entry, optional: requested.optional === true }
  })
  const remaining = [...selected]
  const ordered: ResolvedPackSelection[] = []
  const produced = new Set<string>()
  while (remaining.length) {
    const index = remaining.findIndex(entry => entry.consumesArtifacts.every(contract => {
      const identity = artifactIdentity(contract)
      if (produced.has(identity)) return true
      if (!contract.optional) return false
      return !remaining.some(candidate => candidate !== entry && candidate.producesArtifacts.some(artifact => artifactIdentity(artifact) === identity))
    }))
    if (index < 0) throw new Error('mission_pack_artifact_requirement_unsatisfied')
    const entry = remaining.splice(index, 1)[0]!
    ordered.push({ ...entry, order: ordered.length })
    for (const artifact of entry.producesArtifacts) produced.add(artifactIdentity(artifact))
  }
  return ordered
}

function artifactIdentity(value: { key: string; schemaVersion: number }) { return `${value.key}@${value.schemaVersion}` }
