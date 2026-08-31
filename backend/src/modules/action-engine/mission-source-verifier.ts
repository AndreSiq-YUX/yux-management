import type { MissionSourceRefWire } from './generated/mission-wire.js'
import type { BuiltMissionOperationalContext } from './context-builder.js'
import { hashCanonical, type Queryable } from './repository.js'

type StrategyRow = {
  id: string
  updated_at: string | Date
  visibility: 'internal_only' | 'client_safe'
  allowed_agent_profile_keys: string[]
  human_review_status: string
  concept?: string
  section_key?: string
  chunk_text?: string
}

type CustomerChunkRow = {
  id: string
  updated_at: string | Date
  body: string
  title: string | null
  chunk_kind: string
  curation_status: string
  document_status: string
  source_id: string
  source_status: string
  source_visibility: 'internal' | 'external' | 'both'
  allowed_agent_profile_keys: string[]
  blocked_agent_profile_keys: string[]
}

type CustomerEntryRow = {
  id: string
  updated_at: string | Date
  title: string
  body: string
  entry_status: string
  source_id: string
  source_status: string
  source_visibility: 'internal' | 'external' | 'both'
  allowed_agent_profile_keys: string[]
  blocked_agent_profile_keys: string[]
}

export type VerifiedMissionSource = {
  ref: string
  namespace: 'yux' | 'customer' | 'memory'
  kind: MissionSourceRefWire['kind']
  id: string
  version: string
  contentHash: string
  visibility: MissionSourceRefWire['visibility']
  title: string
  displayMode: MissionSourceRefWire['displayMode']
  content: string
  sourceId?: string
}

export type VerifiedMissionKnowledgeContext = {
  sources: VerifiedMissionSource[]
  strategyItems: VerifiedMissionSource[]
  knowledgeItems: VerifiedMissionSource[]
  memoryItems: VerifiedMissionSource[]
  sourceIds: string[]
  contextHash: string
}

export async function verifyMissionKnowledgeContext(client: Queryable, input: {
  organizationId: string
  audience: 'internal_operator' | 'client_user'
  sourceRefs: MissionSourceRefWire[]
  agentProfileKey?: string
}): Promise<VerifiedMissionKnowledgeContext> {
  const profileKey = input.agentProfileKey ?? 'growth_strategist'
  const requested = [...input.sourceRefs].sort((left, right) => left.ref.localeCompare(right.ref))
  const duplicate = requested.find((item, index) => index > 0 && item.ref === requested[index - 1]?.ref)
  if (duplicate) throw new Error(`mission_source_duplicate:${duplicate.ref}`)
  for (const source of requested) assertRefIdentity(source)

  const cardIds = requested.filter((item) => item.kind === 'strategy_card').map((item) => item.id)
  const chunkIds = requested.filter((item) => item.kind === 'strategy_chunk').map((item) => item.id)
  const customerChunkIds = requested.filter((item) => item.kind === 'knowledge_chunk').map((item) => item.id)
  const [cards, chunks, customerChunks, customerEntries] = await Promise.all([
    cardIds.length ? client.query<StrategyRow>(
      `SELECT id, updated_at, visibility, allowed_agent_profile_keys, human_review_status, concept
       FROM public.yux_strategy_concept_cards
       WHERE id = ANY($1::UUID[]) AND human_review_status = 'approved'`,
      [cardIds],
    ) : Promise.resolve({ rows: [] as StrategyRow[] }),
    chunkIds.length ? client.query<StrategyRow>(
      `SELECT id, updated_at, visibility, allowed_agent_profile_keys, human_review_status,
              section_key, chunk_text
       FROM public.yux_strategy_source_chunks
       WHERE id = ANY($1::UUID[]) AND human_review_status = 'approved'`,
      [chunkIds],
    ) : Promise.resolve({ rows: [] as StrategyRow[] }),
    customerChunkIds.length ? client.query<CustomerChunkRow>(
      `SELECT chunk.id, chunk.updated_at, chunk.body, chunk.title, chunk.chunk_kind,
              chunk.curation_status, document.status AS document_status, source.id AS source_id,
              source.status AS source_status, source.visibility AS source_visibility,
              source.allowed_agent_profile_keys, source.blocked_agent_profile_keys
       FROM public.marketing_knowledge_chunks chunk
       JOIN public.marketing_knowledge_documents document
         ON document.id = chunk.document_id AND document.organization_id = chunk.organization_id
       JOIN public.knowledge_sources source
         ON source.id = document.source_id AND source.organization_id = chunk.organization_id
       WHERE chunk.organization_id = $1 AND chunk.id = ANY($2::UUID[])
         AND chunk.chunk_kind IN ('curated_fact','curated_summary')
         AND chunk.curation_status = 'approved' AND document.status = 'published'
         AND source.status = 'published'`,
      [input.organizationId, customerChunkIds],
    ) : Promise.resolve({ rows: [] as CustomerChunkRow[] }),
    customerChunkIds.length ? client.query<CustomerEntryRow>(
      `SELECT entry.id, entry.updated_at, entry.title, entry.body, entry.status AS entry_status,
              source.id AS source_id, source.status AS source_status,
              source.visibility AS source_visibility, source.allowed_agent_profile_keys,
              source.blocked_agent_profile_keys
       FROM public.knowledge_entries entry
       JOIN public.knowledge_sources source
         ON source.id = entry.source_id AND source.organization_id = entry.organization_id
       WHERE entry.organization_id = $1 AND entry.id = ANY($2::UUID[])
         AND entry.status IN ('approved','published') AND source.status = 'published'`,
      [input.organizationId, customerChunkIds],
    ) : Promise.resolve({ rows: [] as CustomerEntryRow[] }),
  ])

  const cardById = new Map(cards.rows.map((row) => [row.id, row]))
  const chunkById = new Map(chunks.rows.map((row) => [row.id, row]))
  const customerChunkById = new Map(customerChunks.rows.map((row) => [row.id, row]))
  const customerEntryById = new Map(customerEntries.rows.map((row) => [row.id, row]))
  const verified = requested.map((source): VerifiedMissionSource => {
    if (source.kind === 'strategy_card') {
      const row = cardById.get(source.id)
      if (!row || !profileAllowed(row.allowed_agent_profile_keys, profileKey)) return failed(source)
      return verifySource(source, {
        namespace: 'yux', version: recordVersion(row.updated_at), content: row.concept ?? '',
        visibility: row.visibility,
        title: input.audience === 'client_user' && row.visibility === 'internal_only'
          ? 'Metodologia YUX' : row.concept ?? 'Metodologia YUX',
        displayMode: input.audience === 'client_user' && row.visibility === 'internal_only' ? 'generic' : 'named',
      })
    }
    if (source.kind === 'strategy_chunk') {
      const row = chunkById.get(source.id)
      if (!row || !profileAllowed(row.allowed_agent_profile_keys, profileKey)) return failed(source)
      return verifySource(source, {
        namespace: 'yux', version: recordVersion(row.updated_at), content: row.chunk_text ?? '',
        visibility: row.visibility,
        title: input.audience === 'client_user' && row.visibility === 'internal_only'
          ? 'Metodologia YUX' : row.section_key ?? 'Metodologia YUX',
        displayMode: input.audience === 'client_user' && row.visibility === 'internal_only' ? 'generic' : 'named',
      })
    }
    if (source.kind === 'knowledge_chunk') {
      const chunk = customerChunkById.get(source.id)
      if (chunk && customerAllowed(chunk, profileKey, input.audience)) {
        return verifySource(source, {
          namespace: 'customer', version: recordVersion(chunk.updated_at), content: chunk.body,
          visibility: chunk.source_visibility, title: chunk.title ?? 'Contexto da empresa',
          displayMode: 'named', sourceId: chunk.source_id,
        })
      }
      const entry = customerEntryById.get(source.id)
      if (entry && customerAllowed(entry, profileKey, input.audience)) {
        return verifySource(source, {
          namespace: 'customer', version: recordVersion(entry.updated_at), content: entry.body,
          visibility: entry.source_visibility, title: entry.title,
          displayMode: 'named', sourceId: entry.source_id,
        })
      }
      return failed(source)
    }
    return failed(source)
  })
  const strategyItems = verified.filter((item) => item.namespace === 'yux')
  const knowledgeItems = verified.filter((item) => item.namespace === 'customer')
  const memoryItems = verified.filter((item) => item.namespace === 'memory')
  const sourceIds = [...new Set(knowledgeItems.map((item) => item.sourceId).filter(Boolean) as string[])].sort()
  const contextHash = hashCanonical({ sources: verified, sourceIds })
  return { sources: verified, strategyItems, knowledgeItems, memoryItems, sourceIds, contextHash }
}

export function composeVerifiedMissionContext(input: {
  organizationId: string
  companyContext: Record<string, unknown>
  operational: BuiltMissionOperationalContext
  knowledge: VerifiedMissionKnowledgeContext
  harnessRetrievalTraceId: string
  harnessKnowledgeContextHash: string
}) {
  const canonical = {
    organizationId: input.organizationId,
    companyContext: input.companyContext,
    strategyItems: input.knowledge.strategyItems,
    knowledgeItems: input.knowledge.knowledgeItems,
    approvedLearningMemory: input.operational.learningMemoryItems,
    liveState: { ...input.operational.liveState, providerHealth: input.operational.providerHealth },
    capabilityManifest: input.operational.capabilityManifest,
    capabilityCatalogHash: input.operational.capabilityCatalogHash,
    allowedModules: input.operational.allowedModules,
    sourceIds: input.knowledge.sourceIds,
    harnessRetrievalTraceId: input.harnessRetrievalTraceId,
    harnessKnowledgeContextHash: input.harnessKnowledgeContextHash,
  }
  return { ...canonical, contextHash: hashCanonical(canonical) }
}

export type MissionCorrectionAction = { key: string; label: string; routeTemplate: string }

export function mapMissionCorrectionAction(input: {
  category: string
  key: string
  audience: 'internal_operator' | 'client_user'
  modelUrl?: string
}): MissionCorrectionAction | null {
  const suffix = ({
    company: 'empresa/perfil', offer: 'empresa/perfil', audience: 'empresa/marca', brand: 'empresa/marca',
    knowledge: 'empresa/conhecimento', integration: 'empresa/integracoes', consent: 'empresa/integracoes',
    permission: 'empresa/usuarios',
  } as Record<string, string>)[input.category]
  if (!suffix) return null
  const prefix = input.audience === 'internal_operator'
    ? '/client-workspaces/:organizationId/'
    : '/portal/'
  return { key: input.key, label: correctionLabel(input.category), routeTemplate: `${prefix}${suffix}` }
}

function verifySource(source: MissionSourceRefWire, record: {
  namespace: 'yux' | 'customer' | 'memory'
  version: string
  content: string
  visibility: MissionSourceRefWire['visibility']
  title: string
  displayMode: MissionSourceRefWire['displayMode']
  sourceId?: string
}): VerifiedMissionSource {
  const contentHash = hashCanonical({ id: source.id, version: record.version, content: record.content })
  if (source.version !== record.version || source.contentHash !== contentHash) return failed(source)
  return {
    ref: source.ref, namespace: record.namespace, kind: source.kind, id: source.id,
    version: record.version, contentHash, visibility: record.visibility, title: record.title,
    displayMode: record.displayMode, content: record.content,
    ...(record.sourceId ? { sourceId: record.sourceId } : {}),
  }
}

function failed(source: MissionSourceRefWire): never {
  throw new Error(`mission_source_verification_failed:${source.ref}`)
}

function assertRefIdentity(source: MissionSourceRefWire): void {
  const namespace = source.ref.split(':', 1)[0]
  const expected = source.ref.slice(namespace.length + 1)
  if (expected !== source.id) throw new Error(`mission_source_identity_mismatch:${source.ref}`)
  if ((source.kind.startsWith('strategy_') && namespace !== 'yux')
    || (source.kind.startsWith('knowledge_') && namespace !== 'customer')
    || (source.kind === 'mission_memory' && namespace !== 'memory')) {
    throw new Error(`mission_source_namespace_mismatch:${source.ref}`)
  }
}

function profileAllowed(allowed: string[] | null | undefined, profileKey: string): boolean {
  return !allowed?.length || allowed.includes(profileKey)
}

function customerAllowed(row: {
  source_visibility: string
  allowed_agent_profile_keys: string[]
  blocked_agent_profile_keys: string[]
}, profileKey: string, audience: 'internal_operator' | 'client_user'): boolean {
  if (row.blocked_agent_profile_keys?.includes(profileKey)) return false
  if (!profileAllowed(row.allowed_agent_profile_keys, profileKey)) return false
  return audience !== 'client_user' || row.source_visibility !== 'internal'
}

function recordVersion(value: string | Date): string {
  return String(Math.max(1, Math.floor(new Date(value).getTime() / 1_000)))
}

function correctionLabel(category: string): string {
  return ({
    company: 'Completar perfil da empresa', offer: 'Completar oferta', audience: 'Completar público',
    brand: 'Completar marca', knowledge: 'Revisar base de conhecimento',
    integration: 'Conectar ferramenta', consent: 'Revisar consentimento', permission: 'Revisar permissões',
  } as Record<string, string>)[category] ?? 'Corrigir configuração'
}
