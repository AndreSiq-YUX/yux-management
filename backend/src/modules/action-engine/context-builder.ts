import type { CapabilityManifestEntry } from './capability-manifest.js'
import { collectMissionBaseline } from './baselines/index.js'
import type { PlatformToolCatalog } from './platform-tool-catalog.js'
import type { MissionAccountAvailability } from './mission-account-availability.js'
import { hashCanonical, type Queryable } from './repository.js'
import { ACTIVE_MISSION_CHANNELS_SQL } from './channel-readiness-source.js'

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
  platformToolCatalog?: PlatformToolCatalog
  accountAvailability?: MissionAccountAvailability
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
  platformToolCatalog?: PlatformToolCatalog
  accountAvailability?: MissionAccountAvailability
}): Promise<BuiltMissionOperationalContext> {
  if (input.accountAvailability && input.accountAvailability.organizationId !== input.organizationId) throw new Error('mission_account_context_scope_mismatch')
  const [entitlements, learningMemory, channels, advertising, platformEmail, crm] = await Promise.all([
    input.accountAvailability ? Promise.resolve({ rows: input.accountAvailability.enabledModules.map(module_key => ({ module_key })) }) : input.contractId
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
      `SELECT channel, TRUE AS is_active FROM (${ACTIVE_MISSION_CHANNELS_SQL}) active_channels ORDER BY channel`,
      [input.organizationId],
    )),
    safeRows(() => client.query<{ provider: string; status: string }>(
      `SELECT provider, status FROM public.ad_provider_connections
       WHERE organization_id = $1 ORDER BY provider`,
      [input.organizationId],
    )),
    input.accountAvailability ? safeRows(() => client.query<{ configured: boolean }>(
      `SELECT provider.status = 'active'
        AND EXISTS (SELECT 1 FROM public.platform_provider_secrets credential
          WHERE credential.provider_connection_id = provider.id AND credential.secret_kind = 'api_key')
        AND EXISTS (SELECT 1 FROM jsonb_each(COALESCE(provider.public_config, '{}'::jsonb)) setting
          WHERE setting.key IN ('invitationFromEmail','defaultFromEmail','senderEmail','fromEmail')
            AND jsonb_typeof(setting.value) = 'string' AND BTRIM(setting.value #>> '{}') <> '') AS configured
       FROM public.platform_provider_connections provider
       WHERE provider.provider_type = 'email' AND provider.provider_key = 'smtp2go' AND provider.environment = 'production'
       ORDER BY provider.is_default DESC, provider.updated_at DESC LIMIT 1`,
    )) : Promise.resolve({ rows: [], verified: false }),
    input.accountAvailability ? safeRows(() => client.query<{ status: string; max_pipeline_count: number }>(
      `SELECT status,max_pipeline_count FROM public.crm_instances WHERE organization_id=$1
       AND ($2::uuid IS NULL OR contract_id=$2) ORDER BY id LIMIT 1`, [input.organizationId, input.contractId ?? null],
    )) : Promise.resolve({ rows: [], verified: false }),
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
    channels: channels.rows.map((row) => ({ key: row.channel, ready: row.is_active === true }))
      .sort((left, right) => left.key.localeCompare(right.key)),
    advertising: advertising.rows.map((row) => ({ key: row.provider, ready: row.status === 'connected' }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  }
  const accountAvailability: MissionAccountAvailability | undefined = input.accountAvailability ? {
    ...input.accountAvailability,
    preparation: {
      available: crm.verified && ['draft', 'active'].includes(crm.rows[0]?.status ?? '')
        && ['crm', 'automations'].every(key => input.accountAvailability!.enabledModules.includes(key))
        && ['crm.pipeline.create_draft', 'email.template.create_draft', 'crm.sequence.create_draft'].every(key => input.capabilityManifest.some(item => item.key === key)),
      crmStatus: !crm.verified ? 'unverified' : crm.rows[0]?.status === 'draft' ? 'draft' : crm.rows[0]?.status === 'active' ? 'active' : 'unavailable',
      ...(Number.isInteger(crm.rows[0]?.max_pipeline_count) ? { maxPipelineCount: crm.rows[0]!.max_pipeline_count } : {}),
      blockers: [
        ...(!crm.verified ? ['crm_state_unverified'] : !['draft', 'active'].includes(crm.rows[0]?.status ?? '') ? ['crm_unavailable'] : []),
        ...(['crm', 'automations'].every(key => input.accountAvailability!.enabledModules.includes(key)) ? [] : ['module_not_enabled']),
        ...(['crm.pipeline.create_draft', 'email.template.create_draft', 'crm.sequence.create_draft'].every(key => input.capabilityManifest.some(item => item.key === key)) ? [] : ['user_not_permitted']),
      ],
    },
    connections: [
      { key: 'email', status: channels.verified && providerHealth.channels.some(item => item.key === 'email' && item.ready) ? 'connected'
        : !channels.verified || !platformEmail.verified || platformEmail.rows[0]?.configured === true ? 'unverified' : 'not_connected',
        ...(platformEmail.rows[0]?.configured === true ? { platformConfigured: true } : {}) },
      { key: 'whatsapp', status: !channels.verified ? 'unverified'
        : providerHealth.channels.some(item => item.key === 'whatsapp' && item.ready) ? 'connected' : 'not_connected' },
      { key: 'ads_provider', status: !advertising.verified ? 'unverified' : providerHealth.advertising.some(item => item.ready) ? 'connected' : 'not_connected' },
    ],
  } : undefined
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
    ...(input.platformToolCatalog ? { platformToolCatalog: input.platformToolCatalog } : {}),
    ...(accountAvailability ? { accountAvailability } : {}),
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
    ...(input.platformToolCatalog ? { platformToolCatalog: input.platformToolCatalog } : {}),
    ...(accountAvailability ? { accountAvailability } : {}),
  }
}

// Kept until the compatibility intake is removed. It no longer performs any
// company, customer-knowledge or YUX-strategy selection.
export const buildMissionContext = buildMissionOperationalContext

async function safeRows<T>(query: () => Promise<{ rows: T[] }>): Promise<{ rows: T[]; verified: boolean }> {
  try { return { rows: (await query()).rows, verified: true } }
  catch { return { rows: [], verified: false } }
}

function normalizeModule(value: string): string {
  return ({ automation: 'automations', marketing_studio: 'campaigns', ads: 'campaigns' } as Record<string, string>)[value] ?? value
}
