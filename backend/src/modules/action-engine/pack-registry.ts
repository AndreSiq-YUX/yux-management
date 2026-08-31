import type { ActionPackVersion, PackArtifactContract } from './action-pack.js'

export type PackCatalogEntry = {
  key: string
  semanticVersion: string
  contentHash: string
  status: ActionPackVersion['status']
  requiredModules: string[]
  requiredCapabilities: Array<{ key: string; version: number }>
  consumesArtifacts: Array<{ key: string; schemaVersion: number; optional: boolean }>
  producesArtifacts: Array<{ key: string; schemaVersion: number }>
  pack: ActionPackVersion
}

const BUILTIN_ARTIFACT_CONTRACTS: Record<string, PackArtifactContract> = {
  revenue_recovery: { consumes: [], produces: [{ key: 'revenue_recovery.outcome', schemaVersion: 1 }] },
  funnel_nurture: { consumes: [], produces: [{ key: 'crm.funnel', schemaVersion: 1 }, { key: 'crm.nurture', schemaVersion: 1 }] },
  campaign_launch: { consumes: [{ key: 'crm.funnel', schemaVersion: 1, optional: true }], produces: [{ key: 'campaign.launch', schemaVersion: 1 }] },
  campaign_optimization: { consumes: [{ key: 'campaign.launch', schemaVersion: 1, optional: false }], produces: [{ key: 'campaign.optimization_checkpoint', schemaVersion: 1 }] },
}

export class PublishedPackRegistry {
  private readonly entries = new Map<string, PackCatalogEntry>()

  register(pack: ActionPackVersion): this {
    const identity = packIdentity(pack.key, pack.semanticVersion)
    if (this.entries.has(identity)) throw new Error('action_pack_registry_duplicate')
    const contract = pack.artifactContract ?? BUILTIN_ARTIFACT_CONTRACTS[pack.key] ?? { consumes: [], produces: [] }
    const requiredModules = Array.isArray(pack.readinessSpec.requiredModules)
      ? pack.readinessSpec.requiredModules.filter((value): value is string => typeof value === 'string') : []
    const requiredCapabilities = pack.allowedCapabilities
      .filter(item => item.required)
      .flatMap(item => item.versions.map(version => ({ key: item.key, version })))
    this.entries.set(identity, {
      key: pack.key, semanticVersion: pack.semanticVersion, contentHash: pack.contentHash, status: pack.status,
      requiredModules: [...new Set(requiredModules)].sort(), requiredCapabilities,
      consumesArtifacts: contract.consumes.map(item => ({ ...item })), producesArtifacts: contract.produces.map(item => ({ ...item })), pack,
    })
    return this
  }

  list(): PackCatalogEntry[] { return [...this.entries.values()].sort((a, b) => packIdentity(a.key, a.semanticVersion).localeCompare(packIdentity(b.key, b.semanticVersion))) }
  get(key: string, semanticVersion: string): PackCatalogEntry | undefined { return this.entries.get(packIdentity(key, semanticVersion)) }
}

export function createPublishedPackRegistry(packs: ActionPackVersion[]): PublishedPackRegistry {
  const registry = new PublishedPackRegistry()
  for (const pack of packs) registry.register(pack)
  return registry
}

function packIdentity(key: string, version: string) { return `${key.trim()}@${version.trim()}` }
