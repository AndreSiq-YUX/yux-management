import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createIntegrationRig } from "./support/rig.js";
import { strategyCurationItemSchema, strategyItemHash } from '../../src/modules/strategy-engine/curation.js'

it("publica versões imutáveis sem colidir títulos ou hashes entre clientes", async () => {
  const rig = await createIntegrationRig();
  const packId = randomUUID();
  const itemId = randomUUID();
  const documentId = randomUUID();
  try {
    await rig.sql(
      `INSERT INTO public.yux_strategy_packs (id,pack_key,name,description,scope,visibility,status,owner_organization_id)
       VALUES ($1,$2,'Pack integração','Publicação governada','client','internal_only','draft',$3)`,
      [packId, `integration-${packId}`, rig.ids.organizationA],
    );
    const sourceText = 'Regra versão um e Regra versão dois possuem evidência rastreável.'
    const sourceHash = createHash('sha256').update(sourceText).digest('hex')
    await rig.sql(
      `INSERT INTO public.yux_strategy_source_documents (
         id,organization_id,owner_organization_id,source_scope,visibility,document_type,source_title,source_hash,source_origin
       ) VALUES ($1,$2,$2,'client','internal_only','text','Fonte integração',$3,'document_extracted')`,
      [documentId, rig.ids.organizationA, sourceHash],
    )
    await rig.sql(
      `INSERT INTO public.yux_strategy_source_chunks (
         document_id,section_key,chunk_index,chunk_hash,chunk_text,token_estimate,source_scope,visibility,human_review_status,metadata
       ) VALUES ($1,'section',0,$2,$3,20,'internal','internal_only','approved','{"sourceLocator":"section:1"}')`,
      [documentId, createHash('sha256').update(sourceText).digest('hex'), sourceText],
    )
    const firstPayload = publicationItemPayload(documentId, sourceHash, 'Regra versão um')
    await rig.sql(
      `INSERT INTO public.yux_strategy_pack_items (
         id,pack_id,item_type,title,summary,body,status,priority,payload,source_origin,source_document_id,content_hash,confidence
       ) VALUES ($1,$2,'concept_card','Mesmo título','Diagnóstico inicial','Regra versão um','approved',1,$3::jsonb,'document_extracted',$4,$5,0.9)`,
      [itemId, packId, JSON.stringify(firstPayload), documentId, strategyItemHash(strategyCurationItemSchema.parse(firstPayload))],
    );
    const bindingId = randomUUID();
    await rig.sql(
      `INSERT INTO public.yux_strategy_pack_bindings (id,pack_id,organization_id,status) VALUES ($1,$2,$3,'active')`,
      [bindingId, packId, rig.ids.organizationA],
    );

    const denied = await rig.request(
      "client_admin_A",
      "POST",
      `/api/strategy-engine/packs/${packId}/publications`,
      publicationCommand(1, itemId),
    );
    expect(denied.statusCode).toBe(403);
    const first = await rig.request(
      "yux_admin",
      "POST",
      `/api/strategy-engine/packs/${packId}/publications`,
      publicationCommand(1, itemId),
    );
    expect(first.statusCode).toBe(200);
    expect(first.body).toMatchObject({ version: 1 });
    expect(first.body.contentHash).toMatch(/^[a-f0-9]{64}$/);

    const secondPayload = publicationItemPayload(documentId, sourceHash, 'Regra versão dois')
    await rig.sql(
      `UPDATE public.yux_strategy_pack_items SET body='Regra versão dois',payload=$2::jsonb,content_hash=$3,updated_at=NOW() WHERE id=$1`,
      [itemId, JSON.stringify(secondPayload), strategyItemHash(strategyCurationItemSchema.parse(secondPayload))],
    );
    const second = await rig.request(
      "yux_admin",
      "POST",
      `/api/strategy-engine/packs/${packId}/publications`,
      publicationCommand(2, itemId),
    );
    expect(second.statusCode).toBe(200);
    expect(second.body).toMatchObject({ version: 2 });
    expect(second.body.publicationId).not.toBe(first.body.publicationId);

    const cards = await rig.sql(
      `SELECT concept,category,pack_release_id,metadata FROM public.yux_strategy_concept_cards
       WHERE pack_item_id=$1 ORDER BY created_at`,
      [itemId],
    );
    expect(cards.rows).toHaveLength(2);
    expect(
      cards.rows.every(
        (row) =>
          row.concept === "Mesmo título" && row.category === "concept_card",
      ),
    ).toBe(true);
    expect(cards.rows[0].metadata.principle).toBe("Regra versão um");
    expect(cards.rows[1].metadata.principle).toBe("Regra versão dois");

    await rig.sql(`DELETE FROM public.yux_strategy_pack_bindings WHERE id=$1`, [
      bindingId,
    ]);
    await rig.sql(
      `UPDATE public.yux_strategy_packs SET status='archived' WHERE id=$1`,
      [packId],
    );
    const preserved = await rig.request(
      "yux_admin",
      "GET",
      `/api/strategy-engine/publications/${first.body.publicationId}`,
    );
    expect(preserved.statusCode).toBe(200);
    expect(preserved.body.snapshot.items[0].body).toBe("Regra versão um");
    await expect(
      rig.sql(
        `UPDATE public.yux_strategy_pack_releases SET policy_version='tampered' WHERE id=$1`,
        [first.body.publicationId],
      ),
    ).rejects.toThrow(/strategy_release_is_immutable/);

    const sharedHash = createHash("sha256")
      .update("mesmos bytes privados")
      .digest("hex");
    await rig.sql(
      `INSERT INTO public.yux_strategy_source_documents (
         organization_id,owner_organization_id,source_scope,visibility,document_type,source_title,source_hash,source_origin
       ) VALUES ($1,$1,'client','internal_only','text','Cliente A',$3,'document_extracted'),
                ($2,$2,'client','internal_only','text','Cliente B',$3,'document_extracted')`,
      [rig.ids.organizationA, rig.ids.organizationB, sharedHash],
    );
    const privateCopies = await rig.sql(
      `SELECT count(*)::int AS count FROM public.yux_strategy_source_documents WHERE source_hash=$1`,
      [sharedHash],
    );
    expect(privateCopies.rows[0].count).toBe(2);
  } finally {
    await rig.close();
  }
});

function publicationCommand(expectedVersion: number, itemId: string) {
  return { expectedVersion, visibility: 'internal_only', allowedAgentProfileKeys: ['growth_strategist'], blockedAgentProfileKeys: [], approvedItemIds: [itemId] }
}

function publicationItemPayload(documentId: string, documentHash: string, principle: string) {
  return {
    kind: 'concept_card', title: 'Mesmo título', principle, problem: 'Diagnóstico inicial',
    diagnosticQuestions: ['Qual é o problema?'], applicability: ['Diagnóstico'], contraindications: [],
    decisionRules: ['Validar antes de agir'], recommendedActions: ['Diagnosticar'], successCriteria: ['Problema validado'],
    evidence: [{ documentId, documentHash, locator: 'section:1', section: 'section:1', excerpt: principle, claimType: 'literal' }],
    confidence: 0.9, conflicts: [], embedding: [1, 0], embeddingModel: 'integration', embeddingDimensions: 2, embeddingStatus: 'ready',
  }
}
