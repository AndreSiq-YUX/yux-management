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

const governedIds = {
  strategyCard: '11111111-1111-4111-8111-111111111111',
  strategyPublication: '22222222-2222-4222-8222-222222222222',
  strategyItem: '33333333-3333-4333-8333-333333333333',
  customerChunk: '44444444-4444-4444-8444-444444444444',
  customerPublication: '55555555-5555-4555-8555-555555555555',
}
const governedContent = {
  strategy: 'Diagnóstico publicado\nEvita campanha prematura\nvalidar oferta\nmapear público',
  customer: 'Oferta publicada e aprovada para PMEs.',
}
const governedFingerprints = { strategy: 'a'.repeat(64), customer: 'b'.repeat(64) }

function governedSourceRefs(): MissionSourceRefWire[] {
  return [{
    ref: `yux:${governedIds.strategyCard}`,
    kind: 'strategy_card',
    id: governedIds.strategyCard,
    version: governedIds.strategyPublication,
    contentHash: hashCanonical({
      id: governedIds.strategyCard,
      version: governedIds.strategyPublication,
      content: governedContent.strategy,
    }),
    visibility: 'client_safe', title: 'Diagnóstico publicado', displayMode: 'named',
    publicationId: governedIds.strategyPublication, itemId: governedIds.strategyItem,
    knowledgePolicyVersion: 1, useMode: 'quotable', bindingFingerprint: governedFingerprints.strategy,
  }, {
    ref: `customer:${governedIds.customerChunk}`,
    kind: 'knowledge_chunk',
    id: governedIds.customerChunk,
    version: governedIds.customerPublication,
    contentHash: hashCanonical({
      id: governedIds.customerChunk,
      version: governedIds.customerPublication,
      content: governedContent.customer,
    }),
    visibility: 'internal', title: 'Oferta publicada', displayMode: 'named',
    publicationId: governedIds.customerPublication, itemId: governedIds.customerChunk,
    knowledgePolicyVersion: 1, useMode: 'internal_reasoning', bindingFingerprint: governedFingerprints.customer,
  }]
}

function governedDatabase(change: { bindingRemoved?: boolean } = {}) {
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('yux_strategy_pack_releases')) return { rows: change.bindingRemoved ? [] : [{
      id: governedIds.strategyCard,
      publication_id: governedIds.strategyPublication,
      item_id: governedIds.strategyItem,
      content: governedContent.strategy,
      visibility: 'client_safe',
      title: 'Diagnóstico publicado',
      use_mode: 'quotable',
      binding_fingerprint: governedFingerprints.strategy,
    }] }
    if (sql.includes('knowledge_publications')) return { rows: [{
      id: governedIds.customerChunk,
      publication_id: governedIds.customerPublication,
      item_id: governedIds.customerChunk,
      document_id: '66666666-6666-4666-8666-666666666666',
      contract_id: '77777777-7777-4777-8777-777777777777',
      content: governedContent.customer,
      title: 'Oferta publicada',
      source_id: '88888888-8888-4888-8888-888888888888',
      visibility: 'both',
      use_mode: 'internal_reasoning',
      binding_fingerprint: governedFingerprints.customer,
    }] }
    throw new Error(`unexpected query: ${sql}`)
  })
  return { query }
}

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

  it('verifies the immutable publication, item, policy and effective binding selected by the harness', async () => {
    const db = governedDatabase()
    const result = await verifyMissionKnowledgeContext(db as never, {
      organizationId: '99999999-9999-4999-8999-999999999999',
      contractId: '77777777-7777-4777-8777-777777777777',
      audience: 'client_user',
      workflowKey: 'mission_intake_conversation',
      sourceRefs: governedSourceRefs(),
    })

    expect(result.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({
        ref: `yux:${governedIds.strategyCard}`,
        publicationId: governedIds.strategyPublication,
        itemId: governedIds.strategyItem,
        bindingFingerprint: governedFingerprints.strategy,
      }),
      expect.objectContaining({
        ref: `customer:${governedIds.customerChunk}`,
        publicationId: governedIds.customerPublication,
        itemId: governedIds.customerChunk,
        bindingFingerprint: governedFingerprints.customer,
      }),
    ]))
    expect(db.query).toHaveBeenCalledTimes(2)
  })

  it('rejects a governed rule when its effective binding no longer exists', async () => {
    await expect(verifyMissionKnowledgeContext(governedDatabase({ bindingRemoved: true }) as never, {
      organizationId: '99999999-9999-4999-8999-999999999999',
      contractId: '77777777-7777-4777-8777-777777777777',
      audience: 'client_user',
      workflowKey: 'mission_intake_conversation',
      sourceRefs: governedSourceRefs(),
    })).rejects.toThrow(`mission_source_verification_failed:yux:${governedIds.strategyCard}`)
  })

  it('rejects a governed source when its content hash diverges from the publication projection', async () => {
    const [strategy] = governedSourceRefs()
    await expect(verifyMissionKnowledgeContext(governedDatabase() as never, {
      organizationId: '99999999-9999-4999-8999-999999999999',
      audience: 'client_user',
      workflowKey: 'mission_intake_conversation',
      sourceRefs: [{ ...strategy!, contentHash: 'f'.repeat(64) }],
    })).rejects.toThrow(`mission_source_verification_failed:yux:${governedIds.strategyCard}`)
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
