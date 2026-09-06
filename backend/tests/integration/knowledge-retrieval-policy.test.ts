import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'

const themes = ['temaazul', 'temaverde', 'temadourado', 'temavioleta', 'temacoral', 'tematurquesa', 'temarubi', 'temasafira', 'temaambar', 'temagrafite']

it('filtra antes de ranquear dez mil trechos e preserva recall, escopo e latência', async () => {
  const rig = await createIntegrationRig()
  try {
    const corpus = await createLargePublishedCorpus(rig)
    const forbiddenIds = await createForbiddenCompanyRows(rig)
    const strategy = await createStrategyRows(rig)
    const base = {
      schemaVersion: 1,
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      profileKey: 'growth_strategist',
      audience: 'client_user',
      moduleKey: 'marketing_studio',
      workflowKey: null,
      channel: null,
      matchLimit: 5,
    } as const

    const ignoredNames = await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
      ...base, queryText: undefined, search_query: 'temaazul', match_count: 5,
    })
    expect(ignoredNames.statusCode).toBe(400)
    expect((await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
      ...base, audience: 'internal_operator', queryText: 'temaazul',
    })).statusCode).toBe(403)

    const draftAudit = {
      schemaVersion: 1,
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      queryText: 'temaazul',
      matchLimit: 20,
    }
    expect((await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/audit-query', draftAudit)).statusCode).toBe(403)
    const curatorAudit = await rig.request('client_admin_A', 'POST', '/api/company-intelligence/knowledge/audit-query', draftAudit)
    expect(curatorAudit.statusCode, JSON.stringify(curatorAudit.body)).toBe(200)
    expect(curatorAudit.body).toMatchObject({ auditOnly: true, label: 'UNPUBLISHED_DRAFT_AUDIT' })
    expect(curatorAudit.body).not.toHaveProperty('sources')
    expect(curatorAudit.body.items.length).toBeGreaterThan(0)

    let relevantReturned = 0
    let relevantExpected = 0
    const elapsed: number[] = []
    for (let index = 0; index < themes.length; index += 1) {
      const response = await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
        ...base, queryText: `${themes[index]} diagnóstico consultivo`,
      })
      expect(response.statusCode, JSON.stringify(response.body)).toBe(200)
      expect(response.body).toMatchObject({ schemaVersion: 1, status: 'degraded', retrievalMode: 'lexical', reasonCode: 'query_embedding_unavailable' })
      expect(response.body.sources.every((source: any) => source.publicationId && /^[a-f0-9]{64}$/.test(source.contentHash))).toBe(true)
      const returned = new Set(response.body.sources.map((source: any) => source.itemId))
      const expected = corpus.themeIds[index]
      relevantExpected += expected.length
      relevantReturned += expected.filter(id => returned.has(id)).length
      for (const forbidden of forbiddenIds) expect(returned.has(forbidden)).toBe(false)
      elapsed.push(Number(response.body.elapsedMs))
    }
    expect(relevantReturned / relevantExpected).toBeGreaterThanOrEqual(0.9)
    elapsed.sort((left, right) => left - right)
    expect(elapsed[Math.ceil(elapsed.length * 0.95) - 1]).toBeLessThanOrEqual(1_000)

    const exactThree = await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
      ...base, queryText: 'temaazul diagnóstico consultivo', matchLimit: 3,
    })
    expect(exactThree.body.sources).toHaveLength(3)
    expect(exactThree.body.sources.map((source: any) => source.itemId).sort()).toEqual([...corpus.themeIds[0]].sort())
    const library = await rig.request('client_member_A', 'GET', `/api/company-intelligence/organizations/${rig.ids.organizationA}/knowledge`)
    const usedDocument = library.body.find((document: { id: string }) => document.id === corpus.documentId)
    expect(usedDocument).toMatchObject({ lastUsedQueryId: exactThree.body.queryId })
    const usageTrace = await rig.request(
      'client_member_A', 'GET',
      `/api/company-intelligence/organizations/${rig.ids.organizationA}/knowledge/queries/${exactThree.body.queryId}`,
    )
    expect(usageTrace.statusCode).toBe(200)
    expect(usageTrace.body).toMatchObject({ id: exactThree.body.queryId, profileKey: 'growth_strategist', portalSafe: true })
    expect(usageTrace.body.resultChunkIds).toEqual(expect.arrayContaining(corpus.themeIds[0]))

    const external = await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
      ...base, audience: 'external_contact', queryText: 'temaazul diagnóstico consultivo',
    })
    for (const internalItemId of corpus.themeIds[0]) {
      expect(external.body.sources.map((source: any) => source.itemId)).not.toContain(internalItemId)
    }

    const strategyResult = await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
      ...base, queryText: 'estratégia foguete', matchLimit: 3,
    })
    expect(strategyResult.body.sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ namespace: 'strategy', id: strategy.cardId, publicationId: strategy.releaseId, itemId: strategy.itemId }),
    ]))
    await rig.sql(`UPDATE public.yux_strategy_pack_bindings SET status='archived' WHERE id=$1`, [strategy.bindingId])
    const revoked = await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
      ...base, queryText: 'estratégia foguete', matchLimit: 3,
    })
    expect(revoked.body.sources.map((source: any) => source.id)).not.toContain(strategy.cardId)

    const canonicalLegacySurface = await rig.request('client_member_A', 'POST', '/api/marketing-studio/rpc', {
      name: 'match_marketing_knowledge', args: { target_contract_id: rig.ids.contractA, query_text: 'temaazul', match_limit: 3 },
    })
    expect(canonicalLegacySurface.statusCode).toBe(200)
    expect(canonicalLegacySurface.body.data).toHaveLength(3)
    const knownLegacyNames = await rig.request('client_member_A', 'POST', '/api/marketing-studio/rpc', {
      name: 'match_marketing_knowledge', args: { target_contract_id: rig.ids.contractA, search_query: 'temaazul', match_count: 3 },
    })
    expect(knownLegacyNames.statusCode).toBe(200)
    expect((await rig.request('client_member_A', 'POST', '/api/marketing-studio/rpc', {
      name: 'match_marketing_knowledge', args: { target_contract_id: rig.ids.contractA, query_text: 'temaazul', search_query: 'temaverde' },
    })).statusCode).toBe(400)
  } finally {
    await rig.close()
  }
})

async function createLargePublishedCorpus(rig: IntegrationRig) {
  const sourceId = randomUUID()
  const documentId = randomUUID()
  const entryId = randomUUID()
  const publicationId = randomUUID()
  await rig.sql(
    `INSERT INTO public.knowledge_sources (id,organization_id,source_type,name,status,visibility)
     VALUES ($1,$2,'manual',$3,'published','internal')`,
    [sourceId, rig.ids.organizationA, `Corpus ${sourceId}`],
  )
  await rig.sql(
    `INSERT INTO public.marketing_knowledge_documents
       (id,organization_id,client_id,contract_id,source_id,title,document_type,status,summary)
     SELECT $1,$2,contract.client_id,contract.id,$3,'Corpus de busca','other','published','10 mil trechos'
     FROM public.contracts contract WHERE contract.id=$4`,
    [documentId, rig.ids.organizationA, sourceId, rig.ids.contractA],
  )
  await rig.sql(
    `INSERT INTO public.knowledge_entries (id,organization_id,source_id,title,body,status)
     VALUES ($1,$2,$3,'Corpus de busca','Snapshot do corpus','published')`,
    [entryId, rig.ids.organizationA, sourceId],
  )
  await rig.sql(
    `WITH generated AS (
       SELECT series AS chunk_index,
              CASE WHEN series<=30
                THEN (($1::TEXT[])[((series-1)/3)+1]) || ' diagnóstico consultivo evidência publicada ' || series
                ELSE 'registro operacional neutro sem relação temática ' || series END AS body
       FROM generate_series(1,10000) series
     )
     INSERT INTO public.marketing_knowledge_chunks (
       id,organization_id,client_id,contract_id,document_id,entry_id,chunk_index,body,token_count,
       chunk_kind,source_locator,evidence_excerpt,curation_status,content_hash
     )
     SELECT gen_random_uuid(),$2,contract.client_id,contract.id,$3,$4,generated.chunk_index,generated.body,12,
            'curated_fact','section:' || generated.chunk_index,generated.body,'approved',encode(digest(generated.body,'sha256'),'hex')
     FROM generated JOIN public.contracts contract ON contract.id=$5`,
    [themes, rig.ids.organizationA, documentId, entryId, rig.ids.contractA],
  )
  await rig.sql(
    `INSERT INTO public.marketing_knowledge_chunks (
       id,organization_id,client_id,contract_id,document_id,entry_id,chunk_index,body,token_count,
       chunk_kind,source_locator,curation_status,content_hash
     )
     SELECT gen_random_uuid(),$1,contract.client_id,contract.id,$2,$3,10000+series,
            'temaazul diagnóstico consultivo conteúdo bruto proibido ' || series,10,'raw','raw:' || series,
            'not_required',encode(digest('raw:' || series,'sha256'),'hex')
     FROM generate_series(1,500) series JOIN public.contracts contract ON contract.id=$4`,
    [rig.ids.organizationA, documentId, entryId, rig.ids.contractA],
  )
  await rig.sql(
    `INSERT INTO public.knowledge_publications (
       id,organization_id,entry_id,body_snapshot,publisher_user_id,version,content_hash,snapshot,
       visibility,allowed_agent_profile_keys,blocked_agent_profile_keys,approved_item_ids
     ) SELECT $1,$2,$3,'Snapshot do corpus',NULL,1,$4,'{"schemaVersion":1}'::jsonb,'internal',
              ARRAY[]::TEXT[],ARRAY[]::TEXT[],array_agg(chunk.id ORDER BY chunk.chunk_index)
       FROM public.marketing_knowledge_chunks chunk WHERE chunk.document_id=$5 AND chunk.chunk_kind='curated_fact'`,
    [publicationId, rig.ids.organizationA, entryId, createHash('sha256').update(publicationId).digest('hex'), documentId],
  )
  await rig.sql(
    `INSERT INTO public.knowledge_publication_items(publication_id,item_id)
     SELECT $1,id FROM public.marketing_knowledge_chunks WHERE document_id=$2 AND chunk_kind='curated_fact'`,
    [publicationId, documentId],
  )
  await rig.sql(`UPDATE public.knowledge_sources SET current_publication_id=$2 WHERE id=$1`, [sourceId, publicationId])
  await rig.sql(`UPDATE public.marketing_knowledge_documents SET current_publication_id=$2 WHERE id=$1`, [documentId, publicationId])
  await rig.sql(`ANALYZE public.marketing_knowledge_chunks`)
  await rig.sql(`ANALYZE public.knowledge_publication_items`)
  const labeled = await rig.sql(
    `SELECT id,chunk_index FROM public.marketing_knowledge_chunks WHERE document_id=$1 AND chunk_index<=30 ORDER BY chunk_index`,
    [documentId],
  )
  return {
    documentId,
    publicationId,
    themeIds: themes.map((_, index) => labeled.rows.slice(index * 3, index * 3 + 3).map(row => row.id as string)),
  }
}

async function createForbiddenCompanyRows(rig: IntegrationRig) {
  const configurations = [
    { organizationId: rig.ids.organizationA, contractId: rig.ids.contractA, documentStatus: 'draft', kind: 'curated_fact', curation: 'approved', blocked: [] },
    { organizationId: rig.ids.organizationA, contractId: rig.ids.contractA, documentStatus: 'archived', kind: 'curated_fact', curation: 'approved', blocked: [] },
    { organizationId: rig.ids.organizationA, contractId: rig.ids.contractA, documentStatus: 'published', kind: 'curated_fact', curation: 'rejected', blocked: [] },
    { organizationId: rig.ids.organizationA, contractId: rig.ids.contractA, documentStatus: 'published', kind: 'raw', curation: 'not_required', blocked: [] },
    { organizationId: rig.ids.organizationA, contractId: rig.ids.contractA, documentStatus: 'published', kind: 'curated_fact', curation: 'approved', blocked: ['growth_strategist'] },
    { organizationId: rig.ids.organizationB, contractId: rig.ids.contractB, documentStatus: 'published', kind: 'curated_fact', curation: 'approved', blocked: [] },
  ]
  const ids: string[] = []
  for (const config of configurations) ids.push(await createSmallPublication(rig, config))
  return ids
}

async function createSmallPublication(rig: IntegrationRig, config: {
  organizationId: string; contractId: string; documentStatus: string; kind: string; curation: string; blocked: string[]
}) {
  const sourceId = randomUUID()
  const documentId = randomUUID()
  const entryId = randomUUID()
  const itemId = randomUUID()
  const publicationId = randomUUID()
  await rig.sql(
    `INSERT INTO public.knowledge_sources (id,organization_id,source_type,name,status,visibility)
     VALUES ($1,$2,'manual',$3,'published','internal')`,
    [sourceId, config.organizationId, `Exclusão ${sourceId}`],
  )
  await rig.sql(
    `INSERT INTO public.marketing_knowledge_documents
       (id,organization_id,client_id,contract_id,source_id,title,document_type,status)
     SELECT $1,$2,contract.client_id,contract.id,$3,'Não elegível','other',$4 FROM public.contracts contract WHERE contract.id=$5`,
    [documentId, config.organizationId, sourceId, config.documentStatus, config.contractId],
  )
  await rig.sql(`INSERT INTO public.knowledge_entries (id,organization_id,source_id,title,body,status) VALUES ($1,$2,$3,'Não elegível','segredo proibido','published')`, [entryId, config.organizationId, sourceId])
  await rig.sql(
    `INSERT INTO public.marketing_knowledge_chunks (
       id,organization_id,client_id,contract_id,document_id,entry_id,chunk_index,body,token_count,chunk_kind,source_locator,curation_status,content_hash
     ) SELECT $1,$2,contract.client_id,contract.id,$3,$4,0,'temaazul diagnóstico consultivo segredo proibido',8,$5,'section:x',$6,$7
       FROM public.contracts contract WHERE contract.id=$8`,
    [itemId, config.organizationId, documentId, entryId, config.kind, config.curation, createHash('sha256').update(itemId).digest('hex'), config.contractId],
  )
  await rig.sql(
    `INSERT INTO public.knowledge_publications (
       id,organization_id,entry_id,body_snapshot,version,content_hash,snapshot,visibility,allowed_agent_profile_keys,blocked_agent_profile_keys,approved_item_ids
     ) VALUES ($1,$2,$3,'segredo proibido',1,$4,'{"schemaVersion":1}'::jsonb,'internal',ARRAY[]::TEXT[],$5,$6)`,
    [publicationId, config.organizationId, entryId, createHash('sha256').update(publicationId).digest('hex'), config.blocked, [itemId]],
  )
  await rig.sql(`INSERT INTO public.knowledge_publication_items(publication_id,item_id) VALUES ($1,$2)`, [publicationId, itemId])
  await rig.sql(`UPDATE public.knowledge_sources SET current_publication_id=$2 WHERE id=$1`, [sourceId, publicationId])
  await rig.sql(`UPDATE public.marketing_knowledge_documents SET current_publication_id=$2 WHERE id=$1`, [documentId, publicationId])
  return itemId
}

async function createStrategyRows(rig: IntegrationRig) {
  const packId = randomUUID()
  const itemId = randomUUID()
  const releaseId = randomUUID()
  const cardId = randomUUID()
  const bindingId = randomUUID()
  const contentHash = createHash('sha256').update(itemId).digest('hex')
  await rig.sql(
    `INSERT INTO public.yux_strategy_packs (id,pack_key,name,description,scope,visibility,status,owner_organization_id)
     VALUES ($1,$2,'Busca estratégica','Teste de binding','client','client_safe','draft',$3)`,
    [packId, `retrieval-${packId}`, rig.ids.organizationA],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_pack_items (id,pack_id,item_type,title,summary,body,status,content_hash)
     VALUES ($1,$2,'concept_card','Estratégia foguete','Diagnóstico orbital','Estratégia foguete publicada','approved',$3)`,
    [itemId, packId, contentHash],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_pack_releases (
       id,pack_id,version,content_hash,policy_version,snapshot,visibility,allowed_agent_profile_keys,blocked_agent_profile_keys,approved_item_ids
     ) VALUES ($1,$2,1,$3,'strategy:v1','{"schemaVersion":1}'::jsonb,'client_safe',ARRAY['growth_strategist']::TEXT[],ARRAY[]::TEXT[],$4)`,
    [releaseId, packId, createHash('sha256').update(releaseId).digest('hex'), [itemId]],
  )
  await rig.sql(`INSERT INTO public.yux_strategy_release_items(release_id,item_id) VALUES ($1,$2)`, [releaseId, itemId])
  await rig.sql(
    `INSERT INTO public.yux_strategy_concept_cards (
       id,pack_release_id,pack_item_id,concept,category,source_scope,visibility,problem_solved,decision_rules,recommended_actions,
       allowed_agent_profile_keys,human_review_status,metadata
     ) VALUES ($1,$2,$3,'Estratégia foguete','diagnóstico','client','client_safe','Diagnóstico orbital',
       ARRAY['Validar trajetória']::TEXT[],ARRAY['Executar correção']::TEXT[],ARRAY['growth_strategist']::TEXT[],'approved','{}')`,
    [cardId, releaseId, itemId],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_card_embeddings (card_id,embedding_model,embedding_dimensions,embedding_values,content_hash)
     VALUES ($1,'integration-embedding',2,'[1,0]'::jsonb,$2)`,
    [cardId, contentHash],
  )
  await rig.sql(
    `INSERT INTO public.yux_strategy_pack_bindings (id,pack_id,organization_id,profile_key,module_key,status,priority)
     VALUES ($1,$2,$3,'growth_strategist','marketing_studio','active',1)`,
    [bindingId, packId, rig.ids.organizationA],
  )
  await rig.sql(`UPDATE public.yux_strategy_packs SET current_release_id=$2,status='published' WHERE id=$1`, [packId, releaseId])
  return { itemId, releaseId, cardId, bindingId }
}
