import { createHash, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { strategyCurationItemSchema, strategyItemHash } from '../../src/modules/strategy-engine/curation.js'
import pg from 'pg'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { retrieveAuthorizedKnowledge } from '../../src/modules/company-intelligence/retrieval-policy.js'
import { verifyMissionKnowledgeContext } from '../../src/modules/action-engine/mission-source-verifier.js'

it('shares published doctrine across accounts and keeps each company knowledge private', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const worker = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker') }), 'worker')
  const runtime = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_runtime') }), 'runtime')
  try {
    const doctrine = await seedDoctrine(rig)
    const privateA = await seedCompany(rig, rig.ids.organizationA, rig.ids.contractA, 'SEGREDO_EMPRESA_A')
    const privateB = await seedCompany(rig, rig.ids.organizationB, rig.ids.contractB, 'SEGREDO_EMPRESA_B')
    for (const role of ['yux_operator', 'client_admin_A', 'client_member_A'] as const) {
      const denied = await rig.request(role, 'POST', `/api/strategy-engine/packs/${doctrine.packId}/publications`, doctrine.command)
      expect(denied.statusCode, role).toBe(403)
    }
    const published = await rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${doctrine.packId}/publications`, doctrine.command)
    expect(published.statusCode, JSON.stringify(published.body)).toBe(200)
    const pack = (await rig.sql('SELECT owner_organization_id,metadata FROM yux_strategy_packs WHERE id=$1', [doctrine.packId])).rows[0]
    expect(pack.owner_organization_id).toBeNull()
    expect(pack.metadata.knowledgePlane).toBe('shared_strategy')
    expect((await rig.sql("SELECT organization_id FROM yux_strategy_pack_bindings WHERE pack_id=$1 AND status='active'", [doctrine.packId])).rows).toEqual([{ organization_id: null }])

    for (const [organizationId, contractId] of [[rig.ids.organizationA, rig.ids.contractA], [rig.ids.organizationB, rig.ids.contractB]] as const) {
      const scope = { organizationId, contractId, audience: 'client_user' as const, agentProfileKey: 'growth_strategist', moduleKey: 'marketing_studio', workflowKey: 'mission_intake_conversation' }
      const retrieved = await runWithDatabaseRequestContext({ role: 'client_member', organizationIds: [organizationId], serviceRole: 'runtime' }, async () => {
        const connection = await runtime.connect()
        try {
          await connection.query('BEGIN')
          await connection.query("SELECT set_config('app.current_profile_key','growth_strategist',true),set_config('app.current_audience','client_user',true),set_config('app.current_contract_id',$1,true)", [contractId])
          const result = await retrieveAuthorizedKnowledge(connection, { ...query(organizationId, contractId), schemaVersion: 1, audience: 'client_user' })
          await connection.query('COMMIT')
          return result
        } catch (error) { await connection.query('ROLLBACK'); throw error }
        finally { connection.release() }
      })
      const candidate = retrieved.candidates.find(item => item.publicationId === published.body.publicationId)!
      expect(candidate).toBeDefined()
      const source = { ref: `yux:${candidate.id}`, kind: 'strategy_card' as const, id: candidate.id, version: candidate.publicationId,
        contentHash: candidate.contentHash, visibility: 'internal_only' as const, title: 'Metodologia YUX', displayMode: 'generic' as const,
        publicationId: candidate.publicationId, itemId: candidate.itemId, knowledgePolicyVersion: 1 as const, useMode: candidate.useMode, bindingFingerprint: candidate.bindingFingerprint }
      const verified = await runWithDatabaseRequestContext({ role: 'yux_operator', organizationIds: [organizationId], serviceRole: 'worker' }, () => verifyMissionKnowledgeContext(worker, { ...scope, sourceRefs: [source] }))
      expect(verified.strategyItems).toEqual([expect.objectContaining({ title: 'Metodologia YUX', useMode: 'internal_reasoning', displayMode: 'generic' })])
    }

    for (const [role, organizationId, contractId, own, other] of [
      ['client_admin_A', rig.ids.organizationA, rig.ids.contractA, privateA, privateB],
      ['client_member_A', rig.ids.organizationA, rig.ids.contractA, privateA, privateB],
      ['client_admin_B', rig.ids.organizationB, rig.ids.contractB, privateB, privateA],
    ] as const) {
      const result = await rig.request(role, 'POST', '/api/company-intelligence/knowledge/query', query(organizationId, contractId))
      expect(result.statusCode, JSON.stringify(result.body)).toBe(200)
      expect(result.body.sources).toEqual(expect.arrayContaining([
        expect.objectContaining({ namespace: 'strategy', publicationId: published.body.publicationId, useMode: 'internal_reasoning' }),
        expect.objectContaining({ namespace: 'company', itemId: own }),
      ]))
      expect(result.body.sources.some((source: { itemId: string }) => source.itemId === other)).toBe(false)
      expect(JSON.stringify(result.body)).not.toContain('SEGREDO_EMPRESA_')
      expect(JSON.stringify(result.body)).not.toContain('Conteúdo privado do livro')
    }
    const external = await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', {
      ...query(rig.ids.organizationA, rig.ids.contractA), audience: 'external_contact',
    })
    expect(external.body.sources.some((source: { publicationId: string }) => source.publicationId === published.body.publicationId)).toBe(false)
    await expect(rig.sql('UPDATE yux_strategy_packs SET owner_organization_id=$2 WHERE id=$1', [doctrine.packId, rig.ids.organizationA])).rejects.toThrow()
    await expect(rig.sql("INSERT INTO yux_strategy_pack_bindings(pack_id,organization_id,status) VALUES($1,$2,'active')", [doctrine.packId, rig.ids.organizationA])).rejects.toThrow()
    await rig.sql("UPDATE yux_strategy_pack_bindings SET status='archived' WHERE pack_id=$1", [doctrine.packId])
    const revoked = await rig.request('client_member_A', 'POST', '/api/company-intelligence/knowledge/query', query(rig.ids.organizationA, rig.ids.contractA))
    expect(revoked.body.sources.some((source: { publicationId: string }) => source.publicationId === published.body.publicationId)).toBe(false)
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally { await runtime.end(); await worker.end(); await rig.close() }
})

it('refuses company material in the shared doctrine publication', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  try {
    const doctrine = await seedDoctrine(rig, 'client')
    const ingestion = await rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${doctrine.packId}/ingestions`, {
      fileName: 'empresa.txt', mimeType: 'text/plain', byteSize: 25, sourceKind: 'client_material',
    })
    expect(ingestion.statusCode, JSON.stringify(ingestion.body)).toBe(409)
    expect(ingestion.body.error).toBe('strategy_shared_doctrine_private_source')
    const result = await rig.request('yux_admin', 'POST', `/api/strategy-engine/packs/${doctrine.packId}/publications`, doctrine.command)
    expect(result.statusCode, JSON.stringify(result.body)).toBe(409)
    expect(result.body.error).toBe('strategy_shared_doctrine_private_source')
    expect((await rig.sql('SELECT current_release_id FROM yux_strategy_packs WHERE id=$1', [doctrine.packId])).rows[0].current_release_id).toBeNull()
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally { await rig.close() }
})

function query(organizationId: string, contractId: string) {
  return { schemaVersion: 1, organizationId, contractId, profileKey: 'growth_strategist', audience: 'client_user', moduleKey: 'marketing_studio', workflowKey: 'mission_intake_conversation', channel: null, queryText: 'doutrina compartilhada', matchLimit: 20 }
}

async function seedDoctrine(rig: IntegrationRig, sourceScope = 'internal') {
  const packId = randomUUID(), documentId = randomUUID(), itemId = randomUUID()
  const text = `Conteúdo privado do livro: doutrina compartilhada orienta diagnóstico antes da oferta. Fonte ${documentId}.`
  const hash = createHash('sha256').update(text).digest('hex')
  await rig.sql("INSERT INTO yux_strategy_packs(id,pack_key,name,scope,visibility,status) VALUES($1,$2,'Doutrina compartilhada','internal','internal_only','draft')", [packId, `shared-${packId}`])
  await rig.sql(`INSERT INTO yux_strategy_source_documents(id,organization_id,owner_organization_id,source_scope,visibility,document_type,source_title,source_hash,source_origin)
    VALUES($1,$2,$2,$3,'internal_only','text','Fonte governada',$4,'document_extracted')`, [documentId, rig.ids.organizationA, sourceScope, hash])
  await rig.sql(`INSERT INTO yux_strategy_source_chunks(document_id,section_key,chunk_index,chunk_hash,chunk_text,token_estimate,source_scope,visibility,human_review_status,metadata)
    VALUES($1,'section:1',0,$2,$3,20,'internal','internal_only','approved','{"sourceLocator":"section:1"}')`, [documentId, hash, text])
  const payload = strategyCurationItemSchema.parse({ kind: 'concept_card', title: 'Doutrina compartilhada', principle: text, problem: 'Diagnosticar antes da oferta',
    diagnosticQuestions: ['Qual problema?'], applicability: ['Diagnóstico'], contraindications: [], decisionRules: ['Doutrina compartilhada: diagnosticar'], recommendedActions: ['Diagnosticar'], successCriteria: ['Problema validado'],
    evidence: [{ documentId, documentHash: hash, locator: 'section:1', section: 'section:1', excerpt: text, claimType: 'literal' }], confidence: 0.9, conflicts: [],
  })
  const embeddedPayload = { ...payload, embedding: [1, 0], embeddingModel: 'integration', embeddingDimensions: 2, embeddingStatus: 'ready' }
  await rig.sql(`INSERT INTO yux_strategy_pack_items(id,pack_id,item_type,title,summary,body,status,payload,source_origin,source_document_id,content_hash)
    VALUES($1,$2,'concept_card','Doutrina compartilhada','Doutrina compartilhada',$3,'approved',$4::jsonb,'document_extracted',$5,$6)`, [itemId, packId, text, JSON.stringify(embeddedPayload), documentId, strategyItemHash(payload)])
  return { packId, command: { expectedVersion: 1, visibility: 'internal_only', allowedAgentProfileKeys: ['growth_strategist'], blockedAgentProfileKeys: [], approvedItemIds: [itemId] } }
}

async function seedCompany(rig: IntegrationRig, organizationId: string, contractId: string, secret: string) {
  const sourceId = randomUUID(), entryId = randomUUID(), documentId = randomUUID(), itemId = randomUUID(), publicationId = randomUUID()
  const text = `doutrina compartilhada: contexto privado ${secret}`, hash = createHash('sha256').update(text).digest('hex')
  await rig.sql("INSERT INTO knowledge_sources(id,organization_id,source_type,name,status,visibility) VALUES($1,$2,'manual',$3,'published','internal')", [sourceId, organizationId, `Dados da empresa ${sourceId}`])
  await rig.sql("INSERT INTO knowledge_entries(id,organization_id,source_id,title,body,status) VALUES($1,$2,$3,'Dados privados',$4,'published')", [entryId, organizationId, sourceId, text])
  await rig.sql(`INSERT INTO marketing_knowledge_documents(id,organization_id,client_id,contract_id,source_id,title,document_type,status)
    SELECT $1,$2,client_id,id,$3,'Dados privados','other','published' FROM contracts WHERE id=$4`, [documentId, organizationId, sourceId, contractId])
  await rig.sql(`INSERT INTO marketing_knowledge_chunks(id,organization_id,client_id,contract_id,document_id,entry_id,chunk_index,body,token_count,chunk_kind,source_locator,evidence_excerpt,curation_status,content_hash)
    SELECT $1,$2,client_id,id,$3,$4,0,$5,10,'curated_fact','section:1',$5,'approved',$6 FROM contracts WHERE id=$7`, [itemId, organizationId, documentId, entryId, text, hash, contractId])
  await rig.sql(`INSERT INTO knowledge_publications(id,organization_id,entry_id,body_snapshot,version,content_hash,snapshot,visibility,approved_item_ids)
    VALUES($1,$2,$3,$4,1,$5,'{}','internal',$6)`, [publicationId, organizationId, entryId, text, hash, [itemId]])
  await rig.sql('INSERT INTO knowledge_publication_items(publication_id,item_id) VALUES($1,$2)', [publicationId, itemId])
  await rig.sql('UPDATE knowledge_sources SET current_publication_id=$2 WHERE id=$1', [sourceId, publicationId])
  await rig.sql('UPDATE marketing_knowledge_documents SET current_publication_id=$2 WHERE id=$1', [documentId, publicationId])
  return itemId
}
