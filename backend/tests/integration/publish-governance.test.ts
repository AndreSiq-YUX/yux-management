import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { strategyCurationItemSchema, strategyItemHash } from '../../src/modules/strategy-engine/curation.js'
import { createIntegrationRig } from './support/rig.js'

it('publica regras e itens aprovados atomicamente sem atalhos de conteúdo bruto', async () => {
  const rig = await createIntegrationRig()
  const packId = randomUUID()
  const itemId = randomUUID()
  const rejectedItemId = randomUUID()
  const documentId = randomUUID()
  let projectionTriggerInstalled = false
  try {
    const sourceText = 'Antes de oferecer, qualifique o problema real e confirme a necessidade.'
    const sourceHash = createHash('sha256').update(sourceText).digest('hex')
    const payload = strategyPayload(documentId, sourceHash)
    await rig.sql(
      `INSERT INTO public.yux_strategy_packs (id,pack_key,name,description,scope,visibility,status,owner_organization_id)
       VALUES ($1,$2,'Pack governado','Publicação atômica','client','internal_only','draft',$3)`,
      [packId, `publish-${packId}`, rig.ids.organizationA],
    )
    await rig.sql(
      `INSERT INTO public.yux_strategy_source_documents (
         id,organization_id,owner_organization_id,source_scope,visibility,document_type,source_title,source_hash,source_origin
       ) VALUES ($1,$2,$2,'client','internal_only','text','Guia governado',$3,'document_extracted')`,
      [documentId, rig.ids.organizationA, sourceHash],
    )
    await rig.sql(
      `INSERT INTO public.yux_strategy_source_chunks (
         document_id,section_key,chunk_index,chunk_hash,chunk_text,token_estimate,source_scope,visibility,human_review_status,metadata
       ) VALUES ($1,'section',0,$2,$3,20,'internal','internal_only','approved','{"sourceLocator":"section:1"}')`,
      [documentId, createHash('sha256').update(`chunk:${sourceText}`).digest('hex'), sourceText],
    )
    await rig.sql(
      `INSERT INTO public.yux_strategy_pack_items (
         id,pack_id,item_type,title,summary,body,status,priority,payload,source_origin,source_document_id,content_hash,confidence
       ) VALUES ($1,$2,'concept_card',$3,$4,$5,'approved',1,$6::jsonb,'document_extracted',$7,$8,0.94),
                ($9,$2,'concept_card','Item rejeitado','Não publicar','Não publicar','rejected',2,'{}','manual_authored',NULL,NULL,NULL)`,
      [itemId, packId, payload.title, payload.problem, payload.principle, JSON.stringify(payload), documentId,
        strategyItemHash(strategyCurationItemSchema.parse(payload)), rejectedItemId],
    )

    const command = strategyCommand(1, itemId)
    expect((await rig.request('client_admin_A', 'POST', `/api/strategy-engine/packs/${packId}/publications`, command)).statusCode).toBe(403)
    expect((await rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${packId}/publications`, { ...command, approvedItemIds: [rejectedItemId] })).statusCode).toBe(409)
    expect((await rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${packId}/releases`, command)).statusCode).toBe(404)

    await rig.sql(`CREATE OR REPLACE FUNCTION public.fail_publish_projection_test() RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced_projection_failure'; END $$`)
    await rig.sql(`CREATE TRIGGER fail_publish_projection_test BEFORE INSERT ON public.yux_strategy_concept_cards FOR EACH ROW EXECUTE FUNCTION public.fail_publish_projection_test()`)
    projectionTriggerInstalled = true
    expect((await rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${packId}/publications`, command)).statusCode).toBe(500)
    expect((await rig.sql(`SELECT count(*)::int AS count FROM public.yux_strategy_pack_releases WHERE pack_id=$1`, [packId])).rows[0].count).toBe(0)
    await rig.sql(`DROP TRIGGER fail_publish_projection_test ON public.yux_strategy_concept_cards`)
    await rig.sql(`DROP FUNCTION public.fail_publish_projection_test()`)
    projectionTriggerInstalled = false

    const concurrent = await Promise.all([
      rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${packId}/publications`, command),
      rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${packId}/publications`, command),
    ])
    expect(concurrent.map(response => response.statusCode).sort()).toEqual([200, 409])
    const published = concurrent.find(response => response.statusCode === 200)!
    expect(published.body.publicationId).toBeTruthy()
    expect(published.body.contentHash).toMatch(/^[a-f0-9]{64}$/)
    const reopened = await rig.request('yux_admin', 'GET', `/api/strategy-engine/publications/${published.body.publicationId}`)
    expect(reopened.body).toMatchObject({ visibility: 'internal_only', allowed_agent_profile_keys: ['growth_strategist'], blocked_agent_profile_keys: ['ai_sdr_comercial_1'] })
    const projected = await rig.sql(
      `SELECT card.visibility,card.allowed_agent_profile_keys,card.metadata,embedding.embedding_model
       FROM public.yux_strategy_concept_cards card JOIN public.yux_strategy_card_embeddings embedding ON embedding.card_id=card.id
       WHERE card.pack_release_id=$1`, [published.body.publicationId],
    )
    expect(projected.rows).toEqual([expect.objectContaining({ visibility: 'internal_only', allowed_agent_profile_keys: ['growth_strategist'], embedding_model: 'integration-embedding' })])

    await rig.request('yux_admin', 'PATCH', `/api/strategy-engine/pack-items/${itemId}/review`, {
      status: 'proposed', reason: 'Nova edição após a publicação', changes: { principle: 'Princípio editado depois.' },
    })
    const preserved = await rig.request('yux_admin', 'GET', `/api/strategy-engine/publications/${published.body.publicationId}`)
    expect(preserved.body.snapshot.items[0].body).toBe(payload.principle)

    await verifyCompanyPublication(rig)
  } finally {
    if (projectionTriggerInstalled) {
      await rig.sql(`DROP TRIGGER IF EXISTS fail_publish_projection_test ON public.yux_strategy_concept_cards`).catch(() => undefined)
      await rig.sql(`DROP FUNCTION IF EXISTS public.fail_publish_projection_test()`).catch(() => undefined)
    }
    await rig.close()
  }
})

async function verifyCompanyPublication(rig: Awaited<ReturnType<typeof createIntegrationRig>>) {
  const sourceId = randomUUID()
  const documentId = randomUUID()
  const entryId = randomUUID()
  const rawId = randomUUID()
  const approvedId = randomUUID()
  const rejectedId = randomUUID()
  const raw = 'A empresa atende todo o Brasil com suporte consultivo.'
  await rig.sql(
    `INSERT INTO public.knowledge_sources (id,organization_id,source_type,name,status,visibility)
     VALUES ($1,$2,'manual',$3,'review','both')`,
    [sourceId, rig.ids.organizationA, `Publicação ${sourceId}`],
  )
  await rig.sql(
    `INSERT INTO public.marketing_knowledge_documents
       (id,organization_id,client_id,contract_id,source_id,title,document_type,status,summary)
     SELECT $1,$2,contract.client_id,contract.id,$3,'Documento governado','other','indexed','Teste isolado'
       FROM public.contracts contract WHERE contract.id=$4`,
    [documentId, rig.ids.organizationA, sourceId, rig.ids.contractA],
  )
  await rig.sql(
    `INSERT INTO public.knowledge_entries (id,organization_id,source_id,title,body,status) VALUES ($1,$2,$3,'Documento governado',$4,'draft')`,
    [entryId, rig.ids.organizationA, sourceId, raw],
  )
  await rig.sql(
    `INSERT INTO public.marketing_knowledge_chunks (
       id,organization_id,client_id,contract_id,document_id,entry_id,chunk_index,body,token_count,chunk_kind,source_locator,evidence_excerpt,curation_status,content_hash
     ) VALUES ($1,$4,(SELECT client_id FROM public.contracts WHERE id=$5),$5,$6,$7,0,$8,20,'raw','section:1',NULL,'not_required',$9),
              ($2,$4,(SELECT client_id FROM public.contracts WHERE id=$5),$5,$6,$7,1,'Atendimento nacional.',10,'curated_fact','section:1','atende todo o Brasil','approved',$10),
              ($3,$4,(SELECT client_id FROM public.contracts WHERE id=$5),$5,$6,$7,2,'Promessa rejeitada.',10,'curated_fact','section:1','promessa inexistente','rejected',$11)`,
    [rawId, approvedId, rejectedId, rig.ids.organizationA, rig.ids.contractA, documentId, entryId, raw,
      createHash('sha256').update(raw).digest('hex'), createHash('sha256').update('Atendimento nacional.').digest('hex'), createHash('sha256').update('Promessa rejeitada.').digest('hex')],
  )
  const command = { expectedVersion: 1, visibility: 'internal', allowedAgentProfileKeys: ['growth_strategist'], blockedAgentProfileKeys: ['ai_sdr_comercial_1'], approvedItemIds: [approvedId] }
  expect((await rig.request('client_member_A', 'POST', `/api/company-intelligence/knowledge/${documentId}/publish`, command)).statusCode).toBe(403)
  expect((await rig.request('client_admin_A', 'POST', `/api/company-intelligence/knowledge/${documentId}/publish`, { ...command, approvedItemIds: [rejectedId] })).statusCode).toBe(409)
  expect((await rig.request('client_admin_A', 'POST', `/api/company-intelligence/knowledge/${documentId}/publish`, { ...command, approvedItemIds: [] })).statusCode).toBe(400)
  const published = await rig.request('client_admin_A', 'POST', `/api/company-intelligence/knowledge/${documentId}/publish`, command)
  expect(published.statusCode).toBe(200)
  expect(published.body).toMatchObject({ visibility: 'internal', allowedAgentProfileKeys: ['growth_strategist'], blockedAgentProfileKeys: ['ai_sdr_comercial_1'], governanceVersion: 2, version: 1 })
  expect(published.body.publicationId).toBeTruthy()
  expect((await rig.request('client_admin_A', 'POST', `/api/company-intelligence/knowledge/${documentId}/publish`, command)).statusCode).toBe(409)
  const stored = await rig.sql(`SELECT snapshot,approved_item_ids FROM public.knowledge_publications WHERE id=$1`, [published.body.publicationId])
  expect(stored.rows[0].snapshot.governance.visibility).toBe('internal')
  expect(stored.rows[0].approved_item_ids).toEqual([approvedId])
}

function strategyCommand(expectedVersion: number, itemId: string) {
  return { expectedVersion, visibility: 'internal_only', allowedAgentProfileKeys: ['growth_strategist'], blockedAgentProfileKeys: ['ai_sdr_comercial_1'], approvedItemIds: [itemId] }
}

function strategyPayload(documentId: string, documentHash: string) {
  return {
    kind: 'concept_card', title: 'Diagnosticar antes da oferta', principle: 'Qualifique o problema real', problem: 'Oferta prematura',
    diagnosticQuestions: ['Qual é o problema?'], applicability: ['Venda consultiva'], contraindications: ['Compra já decidida'],
    decisionRules: ['Diagnosticar primeiro'], recommendedActions: ['Perguntar'], successCriteria: ['Necessidade confirmada'],
    evidence: [{ documentId, documentHash, locator: 'section:1', section: 'section:1', excerpt: 'qualifique o problema real', claimType: 'literal' }],
    confidence: 0.94, conflicts: [], embedding: [1, 0], embeddingModel: 'integration-embedding', embeddingDimensions: 2, embeddingStatus: 'ready',
  }
}
