import type pg from "pg";

export type StrategyPackItemForProjection = {
  id: string;
  item_type: string;
  title: string;
  summary: string;
  body: string;
  profile_keys: string[];
  stage_tags: string[];
  retrieval_tags: string[];
  payload: Record<string, unknown>;
  source_origin: string;
  content_hash: string;
};

export async function projectStrategyRelease(
  client: Pick<pg.PoolClient, "query">,
  input: {
    releaseId: string;
    ownerOrganizationId: string | null;
    items: StrategyPackItemForProjection[];
    visibility: string;
    allowedAgentProfileKeys: string[];
    blockedAgentProfileKeys: string[];
  },
) {
  const projected: string[] = [];
  for (const item of input.items) {
    if (!["concept_card", "playbook", "rubric"].includes(item.item_type))
      continue;
    const payload = item.payload || {};
    const effectiveProfiles = effectiveAllowedProfiles(item.profile_keys, input.allowedAgentProfileKeys, input.blockedAgentProfileKeys);
    const result = await client.query<{ id: string }>(
      `INSERT INTO public.yux_strategy_concept_cards (
         pack_release_id,pack_item_id,concept,category,source_scope,visibility,
         problem_solved,trigger_signals,diagnosis_questions,decision_rules,anti_patterns,
         recommended_actions,allowed_agent_profile_keys,stage_tags,retrieval_tags,
         requires_human_review,human_review_status,metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,FALSE,'approved',$16::jsonb)
       ON CONFLICT (pack_release_id,pack_item_id) WHERE pack_release_id IS NOT NULL
       DO UPDATE SET pack_release_id=EXCLUDED.pack_release_id RETURNING id`,
      [
        input.releaseId,
        item.id,
        item.title,
        item.item_type,
        input.ownerOrganizationId ? "client" : "internal",
        input.visibility === 'client_safe' ? 'client_safe' : 'internal_only',
        item.summary || stringValue(payload.problem),
        stringArray(payload.triggerSignals),
        stringArray(payload.diagnosticQuestions),
        stringArray(payload.decisionRules),
        stringArray(payload.contraindications ?? payload.antiPatterns),
        stringArray(payload.recommendedActions),
        effectiveProfiles,
        item.stage_tags,
        item.retrieval_tags,
        JSON.stringify({
          sourceOrigin: item.source_origin,
          principle: item.body,
          applicability: payload.applicability ?? null,
          successCriteria: payload.successCriteria ?? [],
          evidence: payload.evidence ?? [],
          blockedAgentProfileKeys: input.blockedAgentProfileKeys,
          publicationVisibility: input.visibility,
          structured: payload,
        }),
      ],
    );
    if (result.rows[0]) {
      const cardId = result.rows[0].id;
      const embedding = embeddingPayload(payload);
      await client.query(
        `INSERT INTO public.yux_strategy_card_embeddings (
           card_id,embedding_model,embedding_dimensions,embedding,embedding_values,content_hash,metadata
         ) VALUES ($1,$2,$3,$4::jsonb,$4::jsonb,$5,$6::jsonb)
         ON CONFLICT (card_id,embedding_model,content_hash) DO NOTHING`,
        [cardId, embedding.model, embedding.dimensions, JSON.stringify(embedding.vector), item.content_hash,
          JSON.stringify({ packReleaseId: input.releaseId, packItemId: item.id, source: 'curated_item_checkpoint' })],
      );
      projected.push(cardId);
    }
  }
  return projected;
}

function effectiveAllowedProfiles(itemProfiles: string[], allowed: string[], blocked: string[]) {
  const candidates = allowed.length && itemProfiles.length ? itemProfiles.filter(profile => allowed.includes(profile))
    : allowed.length ? allowed : itemProfiles;
  return candidates.filter(profile => !blocked.includes(profile));
}

function embeddingPayload(payload: Record<string, unknown>) {
  const vector = payload.embedding;
  const model = payload.embeddingModel;
  const dimensions = payload.embeddingDimensions;
  if (!Array.isArray(vector) || vector.some(value => typeof value !== 'number') || typeof model !== 'string'
    || !Number.isInteger(dimensions) || vector.length !== dimensions || payload.embeddingStatus !== 'ready') {
    throw publicationProjectionError('strategy_item_embedding_required');
  }
  return { vector: vector as number[], model, dimensions: dimensions as number };
}

function publicationProjectionError(message: string) {
  return Object.assign(new Error(message), { statusCode: 409 });
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
