import type pg from 'pg'
import { withDatabaseTransaction } from '../../db/client.js'
import { ApiError } from '../../http/errors.js'
import { loadCommercialCatalog, loadPresalesLead, recommendationSchema, validateRecommendation } from '../strategy-engine/presales-context.js'

type Queryable = Pick<pg.Pool, 'query'>
type Scope = { organizationId: string; leadId: string }

export async function listStrategyRecommendations(pool: Queryable, input: Scope) {
  const { rows } = await pool.query<{ id: string; created_at: string; recommendation: unknown; catalog_version: string }>(
    `SELECT m.id, m.created_at, m.safe_context->'recommendation' AS recommendation,
        m.safe_context->>'catalogVersion' AS catalog_version
     FROM public.yux_strategy_chat_messages m
     JOIN public.yux_strategy_chat_sessions s ON s.id = m.session_id
     JOIN public.leads lead ON lead.id = s.presales_lead_id AND lead.organization_id = s.organization_id
     WHERE s.organization_id = $1 AND s.presales_lead_id = $2
       AND lead.deleted_at IS NULL
       AND m.role = 'assistant' AND m.status = 'completed'
       AND m.safe_context->'recommendation'->>'decision' = 'recommend'
     ORDER BY m.created_at DESC, m.id LIMIT 10`,
    [input.organizationId, input.leadId],
  )
  return rows.flatMap(row => {
    const decision = recommendationSchema.safeParse(row.recommendation)
    return decision.success && decision.data.decision === 'recommend' ? [{
      id: row.id, createdAt: row.created_at, catalogVersion: row.catalog_version, ...decision.data,
    }] : []
  })
}

export async function importStrategyRecommendation(pool: pg.Pool, input: Scope & {
  messageId: string
  expectedCatalogVersion: string
  approvedBy: string
}) {
  return withDatabaseTransaction(pool, async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('strategy-proposal:' || $1::text, 0))", [input.messageId])
    const { rows: [message] } = await client.query<{ scope: Record<string, unknown>; contract_id: string | null }>(
      `SELECT m.safe_context AS scope, s.contract_id
       FROM public.yux_strategy_chat_messages m
       JOIN public.yux_strategy_chat_sessions s ON s.id = m.session_id
       WHERE m.id = $1 AND m.role = 'assistant' AND m.status = 'completed'
         AND s.organization_id = $2 AND s.presales_lead_id = $3`,
      [input.messageId, input.organizationId, input.leadId],
    )
    if (!message) throw new ApiError(404, 'strategy_recommendation_not_found')

    const prior = await client.query<{ id: string }>(
      `SELECT id FROM public.proposals
       WHERE organization_id = $1 AND lead_id = $2 AND strategy_recommendation_message_id = $3`,
      [input.organizationId, input.leadId, input.messageId],
    )
    if (prior.rows[0]) return { ...prior.rows[0], duplicate: true }

    if (message.contract_id) {
      const contract = await client.query(
        `SELECT 1 FROM public.contracts c JOIN public.organizations o ON o.client_id = c.client_id
         WHERE o.id = $1 AND c.id = $2 AND c.status = 'active'`,
        [input.organizationId, message.contract_id],
      )
      if (!contract.rows.length) throw new ApiError(409, 'strategy_recommendation_contract_inactive')
    }
    const prospect = await loadPresalesLead(
      client, input.organizationId, input.leadId, message.contract_id ?? undefined, { lock: true },
    )
    const catalog = await loadCommercialCatalog(client, input.organizationId)
    if (catalog.version !== input.expectedCatalogVersion || message.scope.catalogVersion !== catalog.version) {
      throw new ApiError(409, 'strategy_recommendation_catalog_changed')
    }
    if (message.scope.opportunityVersion !== prospect.version) throw new ApiError(409, 'strategy_recommendation_opportunity_changed')
    const recommendation = validateRecommendation(message.scope.recommendation, catalog)
    if (recommendation.decision !== 'recommend') throw new ApiError(409, 'strategy_recommendation_ineligible')
    const offer = catalog.offers.find(item => item.packageId === recommendation.packageId)!
    const items = offer.items.filter(item => recommendation.itemKeys.includes(item.key))
    const { rows: [draft] } = await client.query<{ id: string }>(
      `INSERT INTO public.proposals (
         organization_id, lead_id, crm_instance_id, package_id, recommended_package_id, blueprint_id, title, scope,
         assigned_to, strategy_recommendation_message_id, strategy_catalog_version, selected_module_keys
       ) VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [input.organizationId, prospect.id, prospect.crmInstanceId, offer.packageId, offer.blueprintId,
        `Proposta comercial · ${offer.name}`, offer.scope, input.approvedBy, input.messageId, catalog.version, offer.moduleKeys],
    )
    await client.query(
      `INSERT INTO public.proposal_items (proposal_id, item_key, label, quantity, unit_value, order_index)
       SELECT $1, item.key, item.label, 1, item.recommended, ordinality - 1
       FROM ROWS FROM (jsonb_to_recordset($2::jsonb) AS (key TEXT, label TEXT, recommended NUMERIC))
       WITH ORDINALITY AS item`,
      [draft.id, JSON.stringify(items)],
    )
    await client.query(
      `UPDATE public.proposals SET final_value = (
        SELECT COALESCE(SUM(total_value),0) FROM public.proposal_items WHERE proposal_id = $1
       ) WHERE id = $1`,
      [draft.id],
    )
    return { ...draft, duplicate: false }
  })
}
