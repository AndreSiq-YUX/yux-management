import type { CapabilityManifestEntry } from './capability-manifest.js'
import { collectMissionBaseline } from './baselines/index.js'
import { hashCanonical, type Queryable } from './repository.js'

export type BuiltMissionContext = {
  query: string
  companyContext: Record<string, unknown>
  strategyItems: Array<{ id: string; version: number; contentHash: string }>
  knowledgeItems: Array<{ id: string; sourceId: string; contentHash: string; visibility: string; excerpt: string }>
  liveState: Record<string, unknown>
  capabilityManifest: CapabilityManifestEntry[]
  capabilityCatalogHash: string
  contextHash: string
  sourceIds: string[]
  allowedModules: string[]
}

export async function buildMissionContext(client: Queryable, input: {
  organizationId: string
  contractId?: string
  query: string
  agentProfileKey: string
  requestedModules: string[]
  capabilityManifest: CapabilityManifestEntry[]
}): Promise<BuiltMissionContext> {
  const [company, knowledge, strategy, entitlements] = await Promise.all([
    client.query<Record<string, unknown>>(
      `SELECT legal_name, trade_name, description, website_url, industry, positioning,
              differentiators, service_regions, business_hours, social_links, updated_at
       FROM public.organization_company_profiles WHERE organization_id = $1 LIMIT 1`, [input.organizationId]),
    client.query<{ id: string; source_id: string; title: string; body_snapshot: string; visibility: string; checksum_sha256: string | null; published_at: string | Date }>(
      `SELECT entry.id, source.id AS source_id, entry.title, publication.body_snapshot,
              source.visibility, source.checksum_sha256, publication.published_at
       FROM public.knowledge_entries entry
       JOIN public.knowledge_sources source ON source.id = entry.source_id AND source.organization_id = entry.organization_id
       JOIN LATERAL (
         SELECT body_snapshot, published_at FROM public.knowledge_publications publication
         WHERE publication.entry_id = entry.id AND publication.organization_id = entry.organization_id
         ORDER BY published_at DESC LIMIT 1
       ) publication ON TRUE
       WHERE entry.organization_id = $1 AND entry.status = 'published' AND source.status = 'published'
         AND source.visibility IN ('external','both')
         AND (CARDINALITY(source.allowed_agent_profile_keys) = 0 OR $2 = ANY(source.allowed_agent_profile_keys))
         AND NOT ($2 = ANY(source.blocked_agent_profile_keys))
       ORDER BY publication.published_at DESC, entry.id LIMIT 40`, [input.organizationId, input.agentProfileKey]),
    client.query<{ id: string; updated_at: string | Date; concept: string; decision_rules: string[]; recommended_actions: string[]; metadata: Record<string, unknown> }>(
      `SELECT id, updated_at, concept, decision_rules, recommended_actions, metadata
       FROM public.yux_strategy_concept_cards
       WHERE human_review_status = 'approved' AND visibility = 'client_safe'
         AND (CARDINALITY(allowed_agent_profile_keys) = 0 OR $1 = ANY(allowed_agent_profile_keys))
       ORDER BY quality_score DESC NULLS LAST, id LIMIT 20`, [input.agentProfileKey]),
    input.contractId
      ? client.query<{ module_key: string }>(
        `SELECT module_key FROM public.contract_modules
         WHERE contract_id = $1 AND enabled = TRUE ORDER BY module_key`, [input.contractId])
      : Promise.resolve({ rows: input.requestedModules.map((module_key) => ({ module_key })) }),
  ])

  const entitled = new Set(entitlements.rows.map((row) => normalizeModule(row.module_key)))
  const allowedModules = [...new Set(input.requestedModules.map(normalizeModule).filter((item) => entitled.has(item)))].sort()
  const companyContext = sanitizeCompanyContext(company.rows[0] ?? {})
  let remainingChars = 12_000
  const knowledgeItems = knowledge.rows.map((row) => {
    const excerpt = `${row.title}\n${row.body_snapshot}`.trim().slice(0, Math.min(1_200, remainingChars))
    remainingChars = Math.max(0, remainingChars - excerpt.length)
    return {
      id: row.id, sourceId: row.source_id,
      contentHash: row.checksum_sha256 ?? hashCanonical({ body: row.body_snapshot, publishedAt: row.published_at }),
      visibility: row.visibility, excerpt,
    }
  }).filter((item) => item.excerpt.length > 0).sort((a, b) => a.id.localeCompare(b.id))
  const strategyItems = strategy.rows.map((row) => ({
    id: row.id,
    version: Math.max(1, Math.floor(Date.parse(String(row.updated_at)) / 1000)),
    contentHash: hashCanonical({ concept: row.concept, decisionRules: row.decision_rules, recommendedActions: row.recommended_actions, metadata: row.metadata }),
  })).sort((a, b) => a.id.localeCompare(b.id))
  const liveState = await collectMissionBaseline(client, { organizationId: input.organizationId, allowedModules })
  const capabilityManifest = [...input.capabilityManifest].sort((a, b) => `${a.key}@${a.version}`.localeCompare(`${b.key}@${b.version}`))
  const capabilityCatalogHash = hashCanonical(capabilityManifest)
  const query = input.query.trim().slice(0, 2_000)
  const sourceIds = [...new Set(knowledgeItems.map((item) => item.sourceId))].sort()
  const contextHash = hashCanonical({ organizationId: input.organizationId, query, companyContext, strategyItems, knowledgeItems, liveState, capabilityManifest, capabilityCatalogHash, allowedModules })
  return { query, companyContext, strategyItems, knowledgeItems, liveState, capabilityManifest, capabilityCatalogHash, contextHash, sourceIds, allowedModules }
}

function sanitizeCompanyContext(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => !['emails','phones','address','internal_notes'].includes(key))
    .sort(([left], [right]) => left.localeCompare(right)))
}

function normalizeModule(value: string): string {
  return ({ automation: 'automations', marketing_studio: 'campaigns', ads: 'campaigns' } as Record<string, string>)[value] ?? value
}
