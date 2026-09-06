import type pg from 'pg'
import { recordDomainEvent } from '../events/repository.js'
import { hashCanonical } from '../action-engine/repository.js'
import { strategyCurationItemSchema, strategyItemHash, validateStrategyEvidence, type StrategyCurationSection } from './curation.js'
import { projectStrategyRelease, type StrategyPackItemForProjection } from './projection.js'

type PackRow = {
  id: string
  pack_key: string
  name: string
  description: string
  scope: string
  visibility: string
  owner_organization_id: string | null
  target_profile_keys: string[]
  target_modules: string[]
  metadata: Record<string, unknown>
  governance_version: number
}

type ItemRow = StrategyPackItemForProjection & {
  priority: number
  source_reference: string | null
  source_document_id: string | null
  status: string
}

export type StrategyPublicationCommand = {
  packId: string
  expectedVersion: number
  visibility: 'internal_only' | 'client_safe'
  allowedAgentProfileKeys: string[]
  blockedAgentProfileKeys: string[]
  approvedItemIds: string[]
  policyVersion: string
  publishedBy: string
}

export async function publishStrategyPack(pool: pg.Pool, input: StrategyPublicationCommand) {
  const approvedItemIds = uniqueSorted(input.approvedItemIds)
  const allowed = uniqueSorted(input.allowedAgentProfileKeys)
  const blocked = uniqueSorted(input.blockedAgentProfileKeys)
  if (!approvedItemIds.length) throw publicationError('strategy_publication_items_required', 409)
  if (allowed.some(profile => blocked.includes(profile))) throw publicationError('strategy_publication_profile_conflict', 409)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const pack = (await client.query<PackRow>(
      `SELECT id,pack_key,name,description,scope,visibility,owner_organization_id,target_profile_keys,target_modules,metadata,governance_version
       FROM public.yux_strategy_packs WHERE id=$1 FOR UPDATE`,
      [input.packId],
    )).rows[0]
    if (!pack) throw publicationError('strategy_pack_not_found', 404)
    if (Number(pack.governance_version) !== input.expectedVersion) throw publicationError('strategy_publication_version_conflict', 409)
    const items = (await client.query<ItemRow>(
      `SELECT id,item_type,title,summary,body,profile_keys,stage_tags,retrieval_tags,source_reference,
              priority,payload,source_origin,source_document_id,content_hash,status
       FROM public.yux_strategy_pack_items WHERE pack_id=$1 AND id=ANY($2::uuid[]) ORDER BY priority,id FOR SHARE`,
      [pack.id, approvedItemIds],
    )).rows
    if (items.length !== approvedItemIds.length || items.some(item => item.status !== 'approved')) {
      throw publicationError('strategy_publication_items_not_approved', 409)
    }
    for (const item of items) await validatePublishableItem(client, item)
    const snapshot = {
      schemaVersion: 1,
      governance: { visibility: input.visibility, allowedAgentProfileKeys: allowed, blockedAgentProfileKeys: blocked },
      pack: {
        key: pack.pack_key, name: pack.name, description: pack.description, scope: pack.scope,
        ownerOrganizationId: pack.owner_organization_id, targetModules: pack.target_modules, metadata: pack.metadata,
      },
      items: items.map(item => ({
        id: item.id, kind: item.item_type, title: item.title, summary: item.summary, body: item.body,
        profileKeys: item.profile_keys, stageTags: item.stage_tags, retrievalTags: item.retrieval_tags,
        sourceReference: item.source_reference, sourceOrigin: item.source_origin, sourceDocumentId: item.source_document_id,
        contentHash: item.content_hash, priority: item.priority, payload: item.payload,
      })),
    }
    const contentHash = hashCanonical(snapshot)
    const duplicate = await client.query(`SELECT id FROM public.yux_strategy_pack_releases WHERE pack_id=$1 AND content_hash=$2`, [pack.id, contentHash])
    if (duplicate.rows[0]) throw publicationError('strategy_publication_unchanged', 409)
    const version = Number((await client.query<{ version: number }>(
      `SELECT COALESCE(MAX(version),0)+1 AS version FROM public.yux_strategy_pack_releases WHERE pack_id=$1`, [pack.id],
    )).rows[0]?.version || 1)
    const publication = (await client.query<{ id: string; published_at: Date | string }>(
      `INSERT INTO public.yux_strategy_pack_releases (
         pack_id,version,content_hash,policy_version,snapshot,published_by,visibility,
         allowed_agent_profile_keys,blocked_agent_profile_keys,approved_item_ids,retrieval_mode
       ) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,'semantic') RETURNING id,published_at`,
      [pack.id, version, contentHash, input.policyVersion, JSON.stringify(snapshot), input.publishedBy,
        input.visibility, allowed, blocked, approvedItemIds],
    )).rows[0]!
    await projectStrategyRelease(client, {
      releaseId: publication.id, ownerOrganizationId: pack.owner_organization_id, items,
      visibility: input.visibility, allowedAgentProfileKeys: allowed, blockedAgentProfileKeys: blocked,
    })
    const organizationId = pack.owner_organization_id || (await client.query<{ id: string }>(
      `SELECT id FROM public.organizations WHERE is_internal_growth_workspace=true ORDER BY created_at LIMIT 1`,
    )).rows[0]?.id
    if (!organizationId) throw publicationError('strategy_publication_organization_required', 409)
    const updated = await client.query(
      `UPDATE public.yux_strategy_packs SET current_release_id=$2,status='published',version=$3,
         visibility=$4,target_profile_keys=$5,allowed_agent_profile_keys=$5,blocked_agent_profile_keys=$6,
         governance_version=governance_version+1,updated_at=NOW()
       WHERE id=$1 AND governance_version=$7`,
      [pack.id, publication.id, version, input.visibility, allowed, blocked, input.expectedVersion],
    )
    if (updated.rowCount !== 1) throw publicationError('strategy_publication_version_conflict', 409)
    await recordDomainEvent(client, {
      eventType: 'strategy.pack_published', organizationId, aggregateType: 'strategy_pack', aggregateId: pack.id,
      actor: { type: 'user', id: input.publishedBy }, correlationId: publication.id,
      payload: { publicationId: publication.id, version, contentHash, visibility: input.visibility,
        allowedAgentProfileKeys: allowed, blockedAgentProfileKeys: blocked, approvedItemIds },
    })
    await client.query('COMMIT')
    return { publicationId: publication.id, version, contentHash, publishedAt: new Date(publication.published_at).toISOString() }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

async function validatePublishableItem(client: Pick<pg.PoolClient, 'query'>, item: ItemRow) {
  if (!item.source_document_id || !item.content_hash || item.source_origin === 'seed_example') {
    throw publicationError('strategy_publication_item_evidence_required', 409)
  }
  const parsed = strategyCurationItemSchema.safeParse(item.payload)
  if (!parsed.success || strategyItemHash(parsed.data) !== item.content_hash) {
    throw publicationError('strategy_publication_item_invalid', 409)
  }
  const document = (await client.query<{ source_hash: string }>(
    `SELECT source_hash FROM public.yux_strategy_source_documents WHERE id=$1`, [item.source_document_id],
  )).rows[0]
  const sections: StrategyCurationSection[] = (await client.query<{ chunk_text: string; metadata: Record<string, unknown> }>(
    `SELECT chunk_text,metadata FROM public.yux_strategy_source_chunks WHERE document_id=$1 ORDER BY chunk_index,id`, [item.source_document_id],
  )).rows.map((chunk, index) => ({
    locator: typeof chunk.metadata?.sourceLocator === 'string' ? chunk.metadata.sourceLocator : `section:${index + 1}`,
    documentId: item.source_document_id!, documentHash: document?.source_hash || '', body: chunk.chunk_text,
  }))
  if (!document || !validateStrategyEvidence(parsed.data, sections)) {
    throw publicationError('strategy_publication_item_evidence_invalid', 409)
  }
}

export async function getStrategyRelease(pool: pg.Pool, publicationId: string) {
  const result = await pool.query(
    `SELECT release.id AS publication_id,release.id AS release_id,release.pack_id,release.version,release.content_hash,
            release.policy_version,release.visibility,release.allowed_agent_profile_keys,release.blocked_agent_profile_keys,
            release.approved_item_ids,release.retrieval_mode,release.snapshot,release.published_by,release.published_at,
            (pack.current_release_id=release.id) AS is_current
     FROM public.yux_strategy_pack_releases release JOIN public.yux_strategy_packs pack ON pack.id=release.pack_id
     WHERE release.id=$1`,
    [publicationId],
  )
  return result.rows[0] ?? null
}

function uniqueSorted(values: string[]) {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

function publicationError(message: string, statusCode: number) {
  return Object.assign(new Error(message), { statusCode })
}
