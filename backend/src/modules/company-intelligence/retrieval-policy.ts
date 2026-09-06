import { createHash, randomUUID } from 'node:crypto'
import type pg from 'pg'
import { z } from 'zod'
import type { KnowledgeQueryV1, KnowledgeSourceRefV1, RetrievalResultV1 } from '../../contracts/generated/knowledge.js'
import { hashCanonical } from '../action-engine/repository.js'

export const knowledgeQueryV1Schema = z.object({
  schemaVersion: z.literal(1),
  organizationId: z.string().uuid(),
  contractId: z.string().uuid().nullable(),
  profileKey: z.string().trim().min(1).max(120),
  audience: z.enum(['internal_operator', 'client_user', 'external_contact']),
  moduleKey: z.string().trim().min(1).max(120),
  workflowKey: z.string().trim().min(1).max(120).nullable(),
  channel: z.string().trim().min(1).max(120).nullable(),
  queryText: z.string().trim().min(1).max(10_000),
  matchLimit: z.number().int().min(1).max(20),
}).strict()

const legacyKnowledgeArgsSchema = z.object({
  target_contract_id: z.string().uuid(),
  query_text: z.string().trim().max(10_000).optional(),
  match_limit: z.coerce.number().int().min(1).max(20).optional(),
  search_query: z.string().trim().max(10_000).optional(),
  match_count: z.coerce.number().int().min(1).max(20).optional(),
}).strict().superRefine((value, context) => {
  if (value.query_text !== undefined && value.search_query !== undefined && value.query_text !== value.search_query) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'conflicting_query_names' })
  }
  if (value.match_limit != null && value.match_count != null && value.match_limit !== value.match_count) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: 'conflicting_limit_names' })
  }
})

type CandidateRow = {
  namespace: 'strategy' | 'company'
  id: string
  publication_id: string
  item_id: string
  document_id: string | null
  source_locator: string | null
  content: string
  source_content_hash: string | null
  use_mode: 'internal_reasoning' | 'quotable'
  lexical_score: number
  vector_score: number | null
  combined_score: number
  embedding_model: string | null
  binding_fingerprint: string
}

export type AuthorizedKnowledgeCandidate = KnowledgeSourceRefV1 & {
  content: string
  lexicalScore: number
  vectorScore: number | null
  combinedScore: number
  embeddingModel: string | null
  bindingFingerprint: string
}

export type AuthorizedKnowledgeRetrieval = {
  result: RetrievalResultV1
  candidates: AuthorizedKnowledgeCandidate[]
  cacheKey: string
}

export const draftKnowledgeAuditQuerySchema = z.object({
  schemaVersion: z.literal(1),
  organizationId: z.string().uuid(),
  contractId: z.string().uuid().nullable(),
  queryText: z.string().trim().min(1).max(10_000),
  matchLimit: z.number().int().min(1).max(50),
}).strict()

type DraftAuditRow = {
  namespace: 'strategy' | 'company'
  id: string
  document_id: string | null
  title: string
  content: string
  lifecycle_status: string
  review_status: string
}

export type DraftKnowledgeAudit = {
  schemaVersion: 1
  auditOnly: true
  label: 'UNPUBLISHED_DRAFT_AUDIT'
  items: Array<{
    namespace: 'strategy' | 'company'
    id: string
    documentId: string | null
    title: string
    content: string
    lifecycleStatus: string
    reviewStatus: string
  }>
}

export function parseLegacyKnowledgeArgs(value: unknown) {
  const parsed = legacyKnowledgeArgsSchema.safeParse(value)
  if (!parsed.success) return parsed
  return {
    success: true as const,
    data: {
      targetContractId: parsed.data.target_contract_id,
      queryText: parsed.data.query_text ?? parsed.data.search_query ?? '',
      matchLimit: parsed.data.match_limit ?? parsed.data.match_count ?? 8,
      usedLegacyNames: parsed.data.search_query !== undefined || parsed.data.match_count != null,
    },
  }
}

export async function retrieveAuthorizedKnowledge(
  pool: Pick<pg.Pool, 'query'>,
  input: KnowledgeQueryV1,
  options: { queryEmbedding?: number[]; embeddingModel?: string } = {},
): Promise<AuthorizedKnowledgeRetrieval> {
  const startedAt = performance.now()
  const rows = (await pool.query<CandidateRow>(
    `SELECT * FROM private.retrieve_authorized_knowledge_v1(
       $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'all'
     )`,
    [input.organizationId, input.contractId, input.profileKey, input.audience, input.moduleKey,
      input.workflowKey, input.channel, input.queryText, input.matchLimit,
      options.queryEmbedding ? JSON.stringify(options.queryEmbedding) : null, options.embeddingModel ?? null],
  )).rows
  const candidates = rows.map(mapCandidate)
  const hasVectorResult = candidates.some(candidate => candidate.vectorScore != null)
  const hybrid = Boolean(options.queryEmbedding?.length && hasVectorResult)
  const degraded = !hybrid
  const sources = candidates.map(({ content: _content, lexicalScore: _lexicalScore, vectorScore: _vectorScore,
    combinedScore: _combinedScore, embeddingModel: _embeddingModel, bindingFingerprint: _bindingFingerprint, ...source }) => source)
  const contextHash = hashCanonical({
    sources,
    scope: { organizationId: input.organizationId, contractId: input.contractId, profileKey: input.profileKey,
      audience: input.audience, moduleKey: input.moduleKey, workflowKey: input.workflowKey, channel: input.channel },
    policy: 'knowledge:v1',
  })
  const result: RetrievalResultV1 = {
    schemaVersion: 1,
    status: degraded ? 'degraded' : sources.length ? 'ok' : 'empty',
    reasonCode: degraded ? options.queryEmbedding?.length ? 'candidate_embeddings_unavailable' : 'query_embedding_unavailable' : null,
    retrievalMode: hybrid ? 'hybrid' : 'lexical',
    queryId: randomUUID(),
    sources,
    contextHash,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
  }
  return { result, candidates, cacheKey: knowledgeRetrievalCacheKey(input, candidates, options.embeddingModel) }
}

/** Curator-only inspection. These rows intentionally cannot be converted to RetrievalResultV1. */
export async function auditDraftKnowledge(
  pool: Pick<pg.Pool, 'query'>,
  input: z.infer<typeof draftKnowledgeAuditQuerySchema>,
): Promise<DraftKnowledgeAudit> {
  const rows = (await pool.query<DraftAuditRow>(
    `WITH search AS (SELECT websearch_to_tsquery('portuguese',$3) terms), candidates AS (
       SELECT 'company'::TEXT namespace,chunk.id,document.id document_id,COALESCE(chunk.title,document.title) title,
              chunk.body content,document.status lifecycle_status,chunk.curation_status review_status,
              ts_rank_cd(to_tsvector('portuguese',COALESCE(chunk.title,'') || ' ' || chunk.body),search.terms) rank
       FROM public.marketing_knowledge_chunks chunk
       JOIN public.marketing_knowledge_documents document ON document.id=chunk.document_id
       JOIN public.knowledge_sources source ON source.id=document.source_id
       LEFT JOIN public.knowledge_publication_items published_item
         ON published_item.publication_id=document.current_publication_id AND published_item.item_id=chunk.id
       CROSS JOIN search
       WHERE document.organization_id=$1 AND ($2::UUID IS NULL OR document.contract_id=$2)
         AND NOT (
           document.status='published' AND source.status='published'
           AND source.current_publication_id=document.current_publication_id
           AND published_item.item_id IS NOT NULL
           AND chunk.chunk_kind IN ('curated_fact','curated_summary') AND chunk.curation_status='approved'
         )
     UNION ALL
       SELECT 'strategy'::TEXT namespace,item.id,NULL::UUID document_id,item.title,
              COALESCE(item.body,item.summary,item.title) content,pack.status lifecycle_status,item.status review_status,
              ts_rank_cd(to_tsvector('portuguese',item.title || ' ' || COALESCE(item.summary,'') || ' ' || COALESCE(item.body,'')),search.terms) rank
       FROM public.yux_strategy_pack_items item
       JOIN public.yux_strategy_packs pack ON pack.id=item.pack_id
       CROSS JOIN search
       WHERE pack.owner_organization_id=$1
         AND NOT (pack.status='published' AND item.status='approved' AND EXISTS (
           SELECT 1 FROM public.yux_strategy_release_items release_item
           WHERE release_item.release_id=pack.current_release_id AND release_item.item_id=item.id
         ))
     )
     SELECT namespace,id,document_id,title,content,lifecycle_status,review_status
     FROM candidates
     WHERE rank>0 OR LOWER(content) LIKE '%' || LOWER($3) || '%'
     ORDER BY rank DESC,id ASC
     LIMIT $4`,
    [input.organizationId, input.contractId, input.queryText, input.matchLimit],
  )).rows
  return {
    schemaVersion: 1,
    auditOnly: true,
    label: 'UNPUBLISHED_DRAFT_AUDIT',
    items: rows.map(row => ({
      namespace: row.namespace,
      id: row.id,
      documentId: row.document_id,
      title: row.title,
      content: row.content,
      lifecycleStatus: row.lifecycle_status,
      reviewStatus: row.review_status,
    })),
  }
}

export function knowledgeRetrievalCacheKey(
  input: KnowledgeQueryV1,
  candidates: Pick<AuthorizedKnowledgeCandidate, 'publicationId' | 'bindingFingerprint' | 'embeddingModel'>[],
  embeddingModel?: string,
) {
  return hashCanonical({
    schemaVersion: 1,
    organizationId: input.organizationId,
    contractId: input.contractId,
    profileKey: input.profileKey,
    audience: input.audience,
    moduleKey: input.moduleKey,
    workflowKey: input.workflowKey,
    channel: input.channel,
    knowledgePolicyVersion: 1,
    publications: [...new Set(candidates.map(item => item.publicationId))].sort(),
    bindings: [...new Set(candidates.map(item => item.bindingFingerprint))].sort(),
    embeddingModel: embeddingModel ?? candidates.find(item => item.embeddingModel)?.embeddingModel ?? null,
    queryHash: createHash('sha256').update(input.queryText.normalize('NFKC').replace(/\s+/g, ' ').trim()).digest('hex'),
  })
}

function mapCandidate(row: CandidateRow): AuthorizedKnowledgeCandidate {
  return {
    namespace: row.namespace,
    id: row.id,
    publicationId: row.publication_id,
    itemId: row.item_id,
    documentId: row.document_id,
    sourceLocator: row.source_locator,
    contentHash: hashCanonical({ id: row.id, version: row.publication_id, content: row.content }),
    knowledgePolicyVersion: 1,
    useMode: row.use_mode,
    content: row.content,
    lexicalScore: Number(row.lexical_score || 0),
    vectorScore: row.vector_score == null ? null : Number(row.vector_score),
    combinedScore: Number(row.combined_score || 0),
    embeddingModel: row.embedding_model,
    bindingFingerprint: row.binding_fingerprint,
  }
}
