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

type GovernedStrategyRow = {
  id: string
  publication_id: string
  item_id: string
  content: string
  visibility: 'internal_only' | 'client_safe'
  title: string
  use_mode: 'internal_reasoning' | 'quotable'
  binding_fingerprint: string
}

type GovernedCustomerRow = {
  id: string
  publication_id: string
  item_id: string
  document_id: string
  contract_id: string
  content: string
  title: string
  source_id: string
  visibility: 'internal' | 'external' | 'both'
  use_mode: 'internal_reasoning' | 'quotable'
  binding_fingerprint: string
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
  publicationId?: string
  itemId?: string
  knowledgePolicyVersion?: 1
  useMode?: 'internal_reasoning' | 'quotable'
  bindingFingerprint?: string
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
  contractId?: string | null
  moduleKey?: string
  workflowKey?: string | null
  channel?: string | null
}): Promise<VerifiedMissionKnowledgeContext> {
  const profileKey = input.agentProfileKey ?? 'growth_strategist'
  const moduleKey = input.moduleKey ?? 'marketing_studio'
  const requested = [...input.sourceRefs].sort((left, right) => left.ref.localeCompare(right.ref))
  const duplicate = requested.find((item, index) => index > 0 && item.ref === requested[index - 1]?.ref)
  if (duplicate) throw new Error(`mission_source_duplicate:${duplicate.ref}`)
  for (const source of requested) assertRefIdentity(source)

  const cardIds = requested.filter((item) => item.kind === 'strategy_card' && !isGovernedSource(item)).map((item) => item.id)
  const chunkIds = requested.filter((item) => item.kind === 'strategy_chunk').map((item) => item.id)
  const customerChunkIds = requested.filter((item) => item.kind === 'knowledge_chunk' && !isGovernedSource(item)).map((item) => item.id)
  const governedCardIds = requested.filter((item) => item.kind === 'strategy_card' && isGovernedSource(item)).map((item) => item.id)
  const governedCustomerIds = requested.filter((item) => item.kind === 'knowledge_chunk' && isGovernedSource(item)).map((item) => item.id)
  const [cards, chunks, customerChunks, customerEntries, governedCards, governedCustomerChunks] = await Promise.all([
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
    governedCardIds.length ? client.query<GovernedStrategyRow>(
      `SELECT card.id,release.id AS publication_id,card.pack_item_id AS item_id,
              BTRIM(card.concept || E'\n' || COALESCE(card.problem_solved,'') || E'\n' ||
                array_to_string(card.decision_rules,E'\n') || E'\n' || array_to_string(card.recommended_actions,E'\n')) AS content,
              release.visibility,card.concept AS title,
              CASE WHEN release.visibility='client_safe' THEN 'quotable' ELSE 'internal_reasoning' END AS use_mode,
              binding.fingerprint AS binding_fingerprint
       FROM public.yux_strategy_concept_cards card
       JOIN public.yux_strategy_pack_releases release ON release.id=card.pack_release_id
       JOIN public.yux_strategy_release_items release_item
         ON release_item.release_id=release.id AND release_item.item_id=card.pack_item_id
       JOIN public.yux_strategy_packs pack
         ON pack.id=release.pack_id AND pack.current_release_id=release.id AND pack.status='published'
       JOIN public.yux_strategy_pack_items item
         ON item.id=card.pack_item_id AND item.pack_id=pack.id AND item.status='approved'
       JOIN LATERAL (
         SELECT encode(public.digest(string_agg(
           candidate.id::TEXT || ':' || EXTRACT(EPOCH FROM candidate.updated_at)::TEXT,
           ',' ORDER BY candidate.priority,candidate.id
         ),'sha256'),'hex') AS fingerprint
         FROM public.yux_strategy_pack_bindings candidate
         WHERE candidate.pack_id=pack.id AND candidate.status='active'
           AND (candidate.organization_id IS NULL OR candidate.organization_id=$1)
           AND (candidate.profile_key IS NULL OR candidate.profile_key=$2)
           AND (candidate.module_key IS NULL OR candidate.module_key=$3)
           AND (candidate.workflow_key IS NULL OR candidate.workflow_key=$4)
           AND (candidate.channel IS NULL OR candidate.channel=$5)
         HAVING COUNT(*)>0
       ) binding ON TRUE
       WHERE card.id=ANY($6::UUID[]) AND card.human_review_status='approved'
         AND (pack.owner_organization_id IS NULL OR pack.owner_organization_id=$1)
         AND (cardinality(release.allowed_agent_profile_keys)=0 OR $2=ANY(release.allowed_agent_profile_keys))
         AND NOT $2=ANY(release.blocked_agent_profile_keys)
         AND (cardinality(card.allowed_agent_profile_keys)=0 OR $2=ANY(card.allowed_agent_profile_keys))
         AND ($7='internal_operator' OR release.visibility='client_safe')`,
      [input.organizationId, profileKey, moduleKey, input.workflowKey ?? null, input.channel ?? null, governedCardIds, input.audience],
    ) : Promise.resolve({ rows: [] as GovernedStrategyRow[] }),
    governedCustomerIds.length ? client.query<GovernedCustomerRow>(
      `SELECT chunk.id,publication.id AS publication_id,chunk.id AS item_id,document.id AS document_id,
              document.contract_id,chunk.body AS content,COALESCE(chunk.title,document.title) AS title,
              source.id AS source_id,publication.visibility,
              'internal_reasoning'::TEXT AS use_mode,
              encode(public.digest(publication.id::TEXT || ':' || publication.content_hash,'sha256'),'hex') AS binding_fingerprint
       FROM public.marketing_knowledge_chunks chunk
       JOIN public.marketing_knowledge_documents document ON document.id=chunk.document_id
         AND document.status='published' AND document.current_publication_id IS NOT NULL
       JOIN public.knowledge_sources source ON source.id=document.source_id
         AND source.organization_id=document.organization_id AND source.status='published'
         AND source.current_publication_id=document.current_publication_id
       JOIN public.knowledge_publications publication ON publication.id=document.current_publication_id
         AND publication.id=source.current_publication_id AND publication.organization_id=document.organization_id
         AND publication.entry_id=chunk.entry_id
       JOIN public.knowledge_publication_items publication_item
         ON publication_item.publication_id=publication.id AND publication_item.item_id=chunk.id
       WHERE document.organization_id=$1 AND chunk.id=ANY($2::UUID[])
         AND ($3::UUID IS NULL OR document.contract_id=$3)
         AND chunk.organization_id=document.organization_id
         AND chunk.client_id=document.client_id AND chunk.contract_id=document.contract_id
         AND chunk.chunk_kind IN ('curated_fact','curated_summary') AND chunk.curation_status='approved'
         AND (cardinality(publication.allowed_agent_profile_keys)=0 OR $4=ANY(publication.allowed_agent_profile_keys))
         AND NOT $4=ANY(publication.blocked_agent_profile_keys)`,
      [input.organizationId, governedCustomerIds, input.contractId ?? null, profileKey],
    ) : Promise.resolve({ rows: [] as GovernedCustomerRow[] }),
  ])

  const cardById = new Map(cards.rows.map((row) => [row.id, row]))
  const chunkById = new Map(chunks.rows.map((row) => [row.id, row]))
  const customerChunkById = new Map(customerChunks.rows.map((row) => [row.id, row]))
  const customerEntryById = new Map(customerEntries.rows.map((row) => [row.id, row]))
  const governedCardById = new Map(governedCards.rows.map((row) => [row.id, row]))
  const governedCustomerById = new Map(governedCustomerChunks.rows.map((row) => [row.id, row]))
  const verified = requested.map((source): VerifiedMissionSource => {
    if (source.kind === 'strategy_card') {
      if (isGovernedSource(source)) {
        const governed = governedCardById.get(source.id)
        if (!governed) return failed(source)
        return verifySource(source, {
          namespace: 'yux', version: governed.publication_id, content: governed.content,
          visibility: governed.visibility, title: governed.title,
          displayMode: input.audience === 'client_user' && governed.visibility === 'internal_only' ? 'generic' : 'named',
          publicationId: governed.publication_id, itemId: governed.item_id,
          knowledgePolicyVersion: 1, useMode: governed.use_mode, bindingFingerprint: governed.binding_fingerprint,
        })
      }
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
      if (isGovernedSource(source)) {
        const governed = governedCustomerById.get(source.id)
        if (!governed) return failed(source)
        return verifySource(source, {
          namespace: 'customer', version: governed.publication_id, content: governed.content,
          visibility: governed.visibility, title: governed.title, displayMode: 'named', sourceId: governed.source_id,
          publicationId: governed.publication_id, itemId: governed.item_id,
          knowledgePolicyVersion: 1, useMode: governed.use_mode, bindingFingerprint: governed.binding_fingerprint,
        })
      }
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
  publicationId?: string
  itemId?: string
  knowledgePolicyVersion?: 1
  useMode?: 'internal_reasoning' | 'quotable'
  bindingFingerprint?: string
}): VerifiedMissionSource {
  const contentHash = hashCanonical({ id: source.id, version: record.version, content: record.content })
  if (source.version !== record.version || source.contentHash !== contentHash) return failed(source)
  if (record.publicationId && (
    source.publicationId !== record.publicationId
    || source.itemId !== record.itemId
    || source.knowledgePolicyVersion !== record.knowledgePolicyVersion
    || source.useMode !== record.useMode
    || source.bindingFingerprint !== record.bindingFingerprint
  )) return failed(source)
  return {
    ref: source.ref, namespace: record.namespace, kind: source.kind, id: source.id,
    version: record.version, contentHash, visibility: record.visibility, title: record.title,
    displayMode: record.displayMode, content: record.content,
    ...(record.sourceId ? { sourceId: record.sourceId } : {}),
    ...(record.publicationId ? {
      publicationId: record.publicationId,
      itemId: record.itemId!,
      knowledgePolicyVersion: record.knowledgePolicyVersion!,
      useMode: record.useMode!,
      bindingFingerprint: record.bindingFingerprint!,
    } : {}),
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
  const governed = [source.publicationId, source.itemId, source.knowledgePolicyVersion, source.useMode, source.bindingFingerprint]
  if (governed.some(value => value != null) && !governed.every(value => value != null)) {
    throw new Error(`mission_source_governed_identity_incomplete:${source.ref}`)
  }
  if (source.kind === 'mission_memory' && governed.some(value => value != null)) {
    throw new Error(`mission_memory_governed_identity_forbidden:${source.ref}`)
  }
}

function isGovernedSource(source: MissionSourceRefWire) {
  return source.publicationId != null
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
