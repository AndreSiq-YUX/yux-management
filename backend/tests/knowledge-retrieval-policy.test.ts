import { describe, expect, it, vi } from 'vitest'
import {
  auditDraftKnowledge,
  knowledgeRetrievalCacheKey,
  parseLegacyKnowledgeArgs,
  retrieveAuthorizedKnowledge,
  type AuthorizedKnowledgeCandidate,
} from '../src/modules/company-intelligence/retrieval-policy.js'
import type { KnowledgeQueryV1 } from '../src/contracts/generated/knowledge.js'

const organizationId = '10000000-0000-4000-8000-000000000001'
const contractId = '30000000-0000-4000-8000-000000000001'
const publicationId = '40000000-0000-4000-8000-000000000001'
const itemId = '50000000-0000-4000-8000-000000000001'
const documentId = '60000000-0000-4000-8000-000000000001'
const query: KnowledgeQueryV1 = {
  schemaVersion: 1,
  organizationId,
  contractId,
  profileKey: 'growth_strategist',
  audience: 'client_user',
  moduleKey: 'marketing_studio',
  workflowKey: null,
  channel: null,
  queryText: 'diagnóstico comercial',
  matchLimit: 3,
}

describe('knowledge retrieval policy', () => {
  it('translates only known legacy parameter names and rejects conflicts or unknown fields', () => {
    expect(parseLegacyKnowledgeArgs({ target_contract_id: contractId, search_query: 'diagnóstico', match_count: 5 })).toMatchObject({
      success: true,
      data: { queryText: 'diagnóstico', matchLimit: 5, usedLegacyNames: true },
    })
    expect(parseLegacyKnowledgeArgs({ target_contract_id: contractId, query_text: 'novo', search_query: 'antigo' }).success).toBe(false)
    expect(parseLegacyKnowledgeArgs({ target_contract_id: contractId, query_text: 'novo', ignored_limit: 500 }).success).toBe(false)
    expect(parseLegacyKnowledgeArgs({ target_contract_id: contractId })).toMatchObject({
      success: true,
      data: { queryText: '', matchLimit: 8, usedLegacyNames: false },
    })
  })

  it('returns contract references and marks lexical fallback as explicitly degraded', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      namespace: 'company', id: itemId, publication_id: publicationId, item_id: itemId,
      document_id: documentId, source_locator: 'section:2', content: 'Diagnóstico antes da proposta.',
      source_content_hash: 'a'.repeat(64), use_mode: 'internal_reasoning', lexical_score: 0.8,
      vector_score: null, combined_score: 0.8, embedding_model: null, binding_fingerprint: 'b'.repeat(64),
    }] }) }
    const retrieval = await retrieveAuthorizedKnowledge(pool as never, query)

    expect(retrieval.result).toMatchObject({ status: 'degraded', reasonCode: 'query_embedding_unavailable', retrievalMode: 'lexical' })
    expect(retrieval.result.sources).toHaveLength(1)
    expect(retrieval.result.sources[0]).toMatchObject({ publicationId, itemId, documentId, knowledgePolicyVersion: 1 })
    expect(retrieval.result.sources[0].contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(retrieval.candidates[0].content).toBe('Diagnóstico antes da proposta.')
  })

  it('changes the unified cache identity when publication, binding, model, query, audience or profile changes', () => {
    const candidate = { publicationId, bindingFingerprint: 'b'.repeat(64), embeddingModel: 'jina-v3' } as AuthorizedKnowledgeCandidate
    const base = knowledgeRetrievalCacheKey(query, [candidate], 'jina-v3')
    expect(knowledgeRetrievalCacheKey({ ...query, queryText: 'outra busca' }, [candidate], 'jina-v3')).not.toBe(base)
    expect(knowledgeRetrievalCacheKey({ ...query, audience: 'external_contact' }, [candidate], 'jina-v3')).not.toBe(base)
    expect(knowledgeRetrievalCacheKey({ ...query, profileKey: 'ai_closer' }, [candidate], 'jina-v3')).not.toBe(base)
    expect(knowledgeRetrievalCacheKey(query, [{ ...candidate, publicationId: documentId }], 'jina-v3')).not.toBe(base)
    expect(knowledgeRetrievalCacheKey(query, [{ ...candidate, bindingFingerprint: 'c'.repeat(64) }], 'jina-v3')).not.toBe(base)
    expect(knowledgeRetrievalCacheKey(query, [candidate], 'jina-v4')).not.toBe(base)
  })

  it('keeps draft auditing clearly labeled and outside the agent retrieval contract', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [{
      namespace: 'company', id: itemId, document_id: documentId, title: 'Rascunho', content: 'Texto em revisão',
      lifecycle_status: 'draft', review_status: 'approved',
    }] }) }
    const audit = await auditDraftKnowledge(pool as never, {
      schemaVersion: 1,
      organizationId,
      contractId,
      queryText: 'revisão',
      matchLimit: 10,
    })

    expect(audit).toMatchObject({ schemaVersion: 1, auditOnly: true, label: 'UNPUBLISHED_DRAFT_AUDIT' })
    expect(audit.items[0]).toMatchObject({ id: itemId, lifecycleStatus: 'draft', reviewStatus: 'approved' })
    expect(audit).not.toHaveProperty('sources')
  })
})
