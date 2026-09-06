import { createHash, randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { createIntegrationRig } from "./support/rig.js";

it("publica versões imutáveis sem colidir títulos ou hashes entre clientes", async () => {
  const rig = await createIntegrationRig();
  const packId = randomUUID();
  const itemId = randomUUID();
  try {
    await rig.sql(
      `INSERT INTO public.yux_strategy_packs (id,pack_key,name,description,scope,visibility,status,owner_organization_id)
       VALUES ($1,$2,'Pack integração','Publicação governada','client','internal_only','draft',$3)`,
      [packId, `integration-${packId}`, rig.ids.organizationA],
    );
    await rig.sql(
      `INSERT INTO public.yux_strategy_pack_items (
         id,pack_id,item_type,title,summary,body,status,priority,payload,source_origin
       ) VALUES ($1,$2,'concept_card','Mesmo título','Diagnóstico inicial','Regra versão um','approved',1,
         '{"diagnosticQuestions":["Qual é o problema?"],"decisionRules":["Validar antes de agir"]}','manual_authored')`,
      [itemId, packId],
    );
    const bindingId = randomUUID();
    await rig.sql(
      `INSERT INTO public.yux_strategy_pack_bindings (id,pack_id,organization_id,status) VALUES ($1,$2,$3,'active')`,
      [bindingId, packId, rig.ids.organizationA],
    );

    const denied = await rig.request(
      "client_admin_A",
      "POST",
      `/api/strategy-engine/packs/${packId}/releases`,
      { policyVersion: "strategy:v1" },
    );
    expect(denied.statusCode).toBe(403);
    const first = await rig.request(
      "yux_admin",
      "POST",
      `/api/strategy-engine/packs/${packId}/releases`,
      { policyVersion: "strategy:v1" },
    );
    expect(first.statusCode).toBe(201);
    expect(first.body).toMatchObject({ version: 1, duplicate: false });
    expect(first.body.contentHash).toMatch(/^[a-f0-9]{64}$/);

    await rig.sql(
      `UPDATE public.yux_strategy_pack_items SET body='Regra versão dois',updated_at=NOW() WHERE id=$1`,
      [itemId],
    );
    const second = await rig.request(
      "yux_admin",
      "POST",
      `/api/strategy-engine/packs/${packId}/releases`,
      { policyVersion: "strategy:v1" },
    );
    expect(second.statusCode).toBe(201);
    expect(second.body).toMatchObject({ version: 2, duplicate: false });
    expect(second.body.releaseId).not.toBe(first.body.releaseId);

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
      `/api/strategy-engine/releases/${first.body.releaseId}`,
    );
    expect(preserved.statusCode).toBe(200);
    expect(preserved.body.snapshot.items[0].body).toBe("Regra versão um");
    await expect(
      rig.sql(
        `UPDATE public.yux_strategy_pack_releases SET policy_version='tampered' WHERE id=$1`,
        [first.body.releaseId],
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
