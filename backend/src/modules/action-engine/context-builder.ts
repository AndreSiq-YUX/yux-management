import type { CapabilityManifestEntry } from './capability-manifest.js'
import { collectMissionBaseline } from './baselines/index.js'
import { hashCanonical, type Queryable } from './repository.js'

export type BuiltMissionOperationalContext = {
  query: string
  learningMemoryItems: Array<{
    id: string
    packKey: string
    packVersion: string
    outcomeHash: string
    summary: Record<string, unknown>
  }>
  liveState: Record<string, unknown>
  providerHealth: {
    channels: Array<{ key: string; ready: boolean }>
    advertising: Array<{ key: string; ready: boolean }>
  }
  capabilityManifest: CapabilityManifestEntry[]
  capabilityCatalogHash: string
  contextHash: string
  allowedModules: string[]
  // Compatibility fields for the legacy form-first planner. Knowledge is now
  // selected only by the Harness and therefore remains intentionally empty.
  companyContext: Record<string, never>
  strategyItems: []
  knowledgeItems: []
  sourceIds: string[]
}

export async function buildMissionOperationalContext(client: Queryable, input: {
  organizationId: string
  contractId?: string
  query: string
  agentProfileKey?: string
  requestedModules: string[]
  capabilityManifest: CapabilityManifestEntry[]
  packKeys?: string[]
}): Promise<BuiltMissionOperationalContext> {
  const [entitlements, learningMemory, channels, advertising] = await Promise.all([
    input.contractId
      ? client.query<{ module_key: string }>(
        `SELECT module.module_key
         FROM public.contract_modules module
         JOIN public.contracts contract ON contract.id = module.contract_id
         JOIN public.organizations organization ON organization.client_id = contract.client_id
         WHERE organization.id = $1 AND module.contract_id = $2 AND module.enabled = TRUE
         ORDER BY module.module_key`,
        [input.organizationId, input.contractId],
      )
      : Promise.resolve({ rows: input.requestedModules.map((module_key) => ({ module_key })) }),
    client.query<{ id: string; pack_key: string; pack_version: string; outcome_hash: string; summary: Record<string, unknown> }>(
      `SELECT id, pack_key, pack_version, outcome_hash, summary
       FROM public.action_mission_memory_summaries
       WHERE organization_id = $1 AND review_status = 'approved'
         AND (CARDINALITY($2::TEXT[]) = 0 OR pack_key = ANY($2::TEXT[]))
       ORDER BY reviewed_at DESC, id LIMIT 10`,
      [input.organizationId, [...new Set(input.packKeys ?? [])].sort()],
    ),
    safeRows(() => client.query<{ channel: string; is_active: boolean }>(
      `SELECT channel, is_active FROM public.channel_connections
       WHERE organization_id = $1 ORDER BY channel`,
      [input.organizationId],
    )),
    safeRows(() => client.query<{ provider: string; status: string }>(
      `SELECT provider, status FROM public.ad_provider_connections
       WHERE organization_id = $1 ORDER BY provider`,
      [input.organizationId],
    )),
  ])

  const entitled = new Set(entitlements.rows.map((row) => normalizeModule(row.module_key)))
  const allowedModules = [...new Set(
    input.requestedModules.map(normalizeModule).filter((item) => entitled.has(item)),
  )].sort()
  const learningMemoryItems = learningMemory.rows.map((row) => ({
    id: row.id,
    packKey: row.pack_key,
    packVersion: row.pack_version,
    outcomeHash: row.outcome_hash,
    summary: row.summary,
  })).sort((left, right) => left.id.localeCompare(right.id))
  const liveState = await collectMissionBaseline(client, {
    organizationId: input.organizationId,
    allowedModules,
  })
  const providerHealth = {
    channels: channels.map((row) => ({ key: row.channel, ready: row.is_active === true }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    advertising: advertising.map((row) => ({ key: row.provider, ready: row.status === 'connected' }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  }
  const capabilityManifest = [...input.capabilityManifest]
    .sort((left, right) => `${left.key}@${left.version}`.localeCompare(`${right.key}@${right.version}`))
  const capabilityCatalogHash = hashCanonical(capabilityManifest)
  const query = input.query.trim().slice(0, 2_000)
  const contextHash = hashCanonical({
    organizationId: input.organizationId,
    contractId: input.contractId ?? null,
    query,
    learningMemoryItems,
    liveState,
    providerHealth,
    capabilityManifest,
    capabilityCatalogHash,
    allowedModules,
  })
  return {
    query,
    learningMemoryItems,
    liveState,
    providerHealth,
    capabilityManifest,
    capabilityCatalogHash,
    contextHash,
    allowedModules,
    companyContext: {},
    strategyItems: [],
    knowledgeItems: [],
    sourceIds: [],
  }
}

// Kept until the compatibility intake is removed. It no longer performs any
// company, customer-knowledge or YUX-strategy selection.
export const buildMissionContext = buildMissionOperationalContext

async function safeRows<T>(query: () => Promise<{ rows: T[] }>): Promise<T[]> {
  try { return (await query()).rows }
  catch { return [] }
}

function normalizeModule(value: string): string {
  return ({ automation: 'automations', marketing_studio: 'campaigns', ads: 'campaigns' } as Record<string, string>)[value] ?? value
}
