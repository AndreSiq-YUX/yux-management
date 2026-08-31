import { describe, expect, it, vi } from 'vitest'
import type { MissionSourceRefWire } from '../src/modules/action-engine/generated/mission-wire.js'
import type { BuiltMissionOperationalContext } from '../src/modules/action-engine/context-builder.js'
import {
  composeVerifiedMissionContext,
  mapMissionCorrectionAction,
  verifyMissionKnowledgeContext,
} from '../src/modules/action-engine/mission-source-verifier.js'
import { hashCanonical } from '../src/modules/action-engine/repository.js'

const updatedAt = '2026-08-31T12:00:00.000Z'
const version = String(Date.parse(updatedAt) / 1_000)

function source(input: Partial<MissionSourceRefWire> & Pick<MissionSourceRefWire, 'ref' | 'id' | 'kind'>): MissionSourceRefWire {
  const content = input.kind === 'strategy_card' ? 'Diagnóstico antes do canal' : 'Oferta validada para PMEs'
  return {
    ...input,
    ref: input.ref, id: input.id, kind: input.kind, version: input.version ?? version,
    contentHash: hashCanonical({ id: input.id, version, content }),
    visibility: input.visibility ?? (input.kind === 'strategy_card' ? 'internal_only' : 'both'),
    title: input.title ?? (input.kind === 'strategy_card' ? 'Metodologia YUX' : 'Oferta'),
    displayMode: input.displayMode ?? (input.kind === 'strategy_card' ? 'generic' : 'named'),
  }
}

function database(change: { cardStatus?: string; customerOrg?: string; blocked?: boolean; customerStatus?: string } = {}) {
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes('yux_strategy_concept_cards')) return { rows: change.cardStatus === 'draft' ? [] : [{
      id: 'card-1', updated_at: updatedAt, visibility: 'internal_only',
      allowed_agent_profile_keys: ['growth_strategist'], human_review_status: change.cardStatus ?? 'approved',
      concept: 'Diagnóstico antes do canal',
    }] }
    if (sql.includes('yux_strategy_source_chunks')) return { rows: [] }
    if (sql.includes('marketing_knowledge_chunks')) return {
      rows: change.customerOrg === 'foreign' || change.customerStatus === 'draft' ? [] : [{
        id: 'chunk-1', updated_at: updatedAt, body: 'Oferta validada para PMEs', title: 'Oferta',
        chunk_kind: 'curated_fact', curation_status: 'approved', document_status: 'published',
        source_id: 'source-1', source_status: 'published', source_visibility: 'both',
        allowed_agent_profile_keys: [], blocked_agent_profile_keys: change.blocked ? ['growth_strategist'] : [],
      }],
    }
    if (sql.includes('knowledge_entries')) return { rows: [] }
    throw new Error(`unexpected query: ${sql}; ${JSON.stringify(params)}`)
  })
  return { query }
}

const refs = [
  source({ ref: 'yux:card-1', id: 'card-1', kind: 'strategy_card' }),
  source({ ref: 'customer:chunk-1', id: 'chunk-1', kind: 'knowledge_chunk' }),
]

describe('Harness-selected Mission source verification', () => {
  it('verifies the exact selected sources without reranking or adding records', async () => {
    const db = database()
    const result = await verifyMissionKnowledgeContext(db as never, {
      organizationId: 'org-1', audience: 'client_user', sourceRefs: [...refs].reverse(),
    })

    expect(result.sources.map((item) => item.ref)).toEqual(['customer:chunk-1', 'yux:card-1'])
    expect(result.strategyItems[0]).toMatchObject({ title: 'Metodologia YUX', displayMode: 'generic' })
    expect(result.knowledgeItems[0]).toMatchObject({ sourceId: 'source-1', content: 'Oferta validada para PMEs' })
    expect(result.sourceIds).toEqual(['source-1'])
    expect(result.contextHash).toMatch(/^[a-f0-9]{64}$/)
    expect(db.query.mock.calls.find(([sql]) => String(sql).includes('marketing_knowledge_chunks'))?.[1]?.[0]).toBe('org-1')
  })

  it.each([
    [{ cardStatus: 'draft' }, 'yux:card-1'],
    [{ customerOrg: 'foreign' }, 'customer:chunk-1'],
    [{ blocked: true }, 'customer:chunk-1'],
    [{ customerStatus: 'draft' }, 'customer:chunk-1'],
  ])('rejects changed publication, tenant or profile visibility %#', async (change, failedRef) => {
    await expect(verifyMissionKnowledgeContext(database(change) as never, {
      organizationId: 'org-1', audience: 'client_user', sourceRefs: refs,
    })).rejects.toThrow(`mission_source_verification_failed:${failedRef}`)
  })

  it('rejects content and version drift', async () => {
    await expect(verifyMissionKnowledgeContext(database() as never, {
      organizationId: 'org-1', audience: 'client_user',
      sourceRefs: [{ ...refs[0]!, contentHash: 'f'.repeat(64) }],
    })).rejects.toThrow('mission_source_verification_failed:yux:card-1')
  })

  it('maps correction links from a server allowlist and ignores arbitrary model URLs', () => {
    expect(mapMissionCorrectionAction({
      category: 'integration', key: 'meta_connection', audience: 'client_user',
      modelUrl: 'https://evil.example/steal',
    })).toEqual({
      key: 'meta_connection', label: 'Conectar ferramenta', routeTemplate: '/portal/empresa/integracoes',
    })
    expect(mapMissionCorrectionAction({
      category: 'unknown', key: 'forged', audience: 'client_user', modelUrl: 'https://evil.example',
    })).toBeNull()
  })

  it('binds verified knowledge and authoritative operational state into the final hash', async () => {
    const knowledge = await verifyMissionKnowledgeContext(database() as never, {
      organizationId: 'org-1', audience: 'client_user', sourceRefs: refs,
    })
    const operational = {
      query: 'Campanha', learningMemoryItems: [], liveState: { crm: { total: 10 } },
      providerHealth: { channels: [], advertising: [] }, capabilityManifest: [],
      capabilityCatalogHash: 'a'.repeat(64), contextHash: 'b'.repeat(64), allowedModules: ['crm'],
      companyContext: {}, strategyItems: [], knowledgeItems: [], sourceIds: [],
    } satisfies BuiltMissionOperationalContext
    const first = composeVerifiedMissionContext({
      organizationId: 'org-1', companyContext: { tradeName: 'Cliente' }, operational, knowledge,
      harnessRetrievalTraceId: 'run-1', harnessKnowledgeContextHash: 'c'.repeat(64),
    })
    const changed = composeVerifiedMissionContext({
      organizationId: 'org-1', companyContext: { tradeName: 'Cliente' },
      operational: { ...operational, liveState: { crm: { total: 11 } } }, knowledge,
      harnessRetrievalTraceId: 'run-1', harnessKnowledgeContextHash: 'c'.repeat(64),
    })
    expect(first.contextHash).not.toBe(changed.contextHash)
    expect(first.strategyItems).toHaveLength(1)
    expect(first.knowledgeItems).toHaveLength(1)
  })
})
