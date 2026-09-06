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
};

export async function projectStrategyRelease(
  client: Pick<pg.PoolClient, "query">,
  input: {
    releaseId: string;
    ownerOrganizationId: string | null;
    items: StrategyPackItemForProjection[];
  },
) {
  const projected: string[] = [];
  for (const item of input.items) {
    if (!["concept_card", "playbook", "rubric"].includes(item.item_type))
      continue;
    const payload = item.payload || {};
    const result = await client.query<{ id: string }>(
      `INSERT INTO public.yux_strategy_concept_cards (
         pack_release_id,pack_item_id,concept,category,source_scope,visibility,
         problem_solved,trigger_signals,diagnosis_questions,decision_rules,anti_patterns,
         recommended_actions,allowed_agent_profile_keys,stage_tags,retrieval_tags,
         requires_human_review,human_review_status,metadata
       ) VALUES ($1,$2,$3,$4,$5,'internal_only',$6,$7,$8,$9,$10,$11,$12,$13,$14,FALSE,'approved',$15::jsonb)
       ON CONFLICT (pack_release_id,pack_item_id) WHERE pack_release_id IS NOT NULL
       DO NOTHING RETURNING id`,
      [
        input.releaseId,
        item.id,
        item.title,
        item.item_type,
        input.ownerOrganizationId ? "client" : "internal",
        item.summary || stringValue(payload.problem),
        stringArray(payload.triggerSignals),
        stringArray(payload.diagnosticQuestions),
        stringArray(payload.decisionRules),
        stringArray(payload.contraindications ?? payload.antiPatterns),
        stringArray(payload.recommendedActions),
        item.profile_keys,
        item.stage_tags,
        item.retrieval_tags,
        JSON.stringify({
          sourceOrigin: item.source_origin,
          principle: item.body,
          applicability: payload.applicability ?? null,
          successCriteria: payload.successCriteria ?? [],
          evidence: payload.evidence ?? [],
          structured: payload,
        }),
      ],
    );
    if (result.rows[0]) projected.push(result.rows[0].id);
  }
  return projected;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}
function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}
