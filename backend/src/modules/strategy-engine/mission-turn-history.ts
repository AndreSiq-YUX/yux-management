import type { Queryable } from '../action-engine/repository.js'

type ConversationScope = { organizationId: string; contractId?: string }
type TurnRow = {
  id: string
  started_at: string | Date
  attempts: unknown
  credit_state: 'held' | 'executing' | 'released' | 'settled' | 'uncertain' | null
  reserved: number | null
  charged: number | null
  unlimited: boolean | null
  unbilled: boolean
}

export async function listMissionUsageConversations(pool: Queryable, scope: ConversationScope) {
  const result = await pool.query<{ id: string; title: string }>(
    `SELECT id, title FROM public.action_mission_conversations
     WHERE organization_id = $1 AND contract_id IS NOT DISTINCT FROM $2::uuid
     ORDER BY updated_at DESC, id LIMIT 50`,
    [scope.organizationId, scope.contractId ?? null],
  )
  return result.rows
}

export async function loadMissionTurnHistory(pool: Queryable, scope: ConversationScope & {
  conversationId: string; audience: 'internal_operator' | 'client_user'
}) {
  const { rows } = await pool.query<TurnRow>(
    `WITH target AS (
       SELECT id, organization_id, contract_id FROM public.action_mission_conversations
       WHERE organization_id = $1 AND contract_id IS NOT DISTINCT FROM $2::uuid AND id = $3
     ), billed AS (
       SELECT msg.id, msg.created_at AS started_at, hold.attempts, hold.state AS credit_state,
              hold.reserved_credits AS reserved, hold.charged_credits AS charged, hold.unlimited,
              FALSE AS unbilled, hold.agent_run_id
       FROM target
       JOIN public.action_mission_conversation_messages msg
         ON msg.conversation_id = target.id AND msg.organization_id = target.organization_id AND msg.actor_type = 'user'
       JOIN private.strategy_workflow_credit_holds hold
         ON hold.organization_id = target.organization_id AND hold.contract_id = target.contract_id
         AND hold.operation_id = msg.id AND hold.action = 'agent_runtime_mission_conversation_turn' AND hold.audience = $4
     )
     SELECT id, started_at, attempts, credit_state, reserved, charged, unlimited, unbilled FROM billed
     UNION ALL
     SELECT run.id, COALESCE(run.started_at, run.created_at), receipt.attempts, NULL, NULL, NULL, NULL,
            run.client_id IS NULL OR run.contract_id IS NULL
     FROM target
     JOIN public.agent_execution_runs run
       ON run.mission_conversation_id = target.id AND run.organization_id = target.organization_id
       AND run.contract_id IS NOT DISTINCT FROM target.contract_id AND run.run_source = 'mission_intake'
       AND run.profile_key = 'growth_strategist' AND run.workflow_key = 'mission_intake_conversation'
     JOIN LATERAL (
       SELECT context.safe_context->'attempts' AS attempts
       FROM public.agent_context_snapshots context
       WHERE context.run_id = run.id AND context.context_kind = 'runtime'
         AND context.safe_context->>'measurement' = 'mission_turn_provider_attempts'
         AND (
           context.safe_context->>'audience' = $4 OR (
             NOT (context.safe_context ? 'audience') AND EXISTS (
               SELECT 1 FROM public.agent_context_snapshots rag WHERE rag.run_id = run.id
                 AND rag.context_kind = 'rag' AND rag.safe_context->>'audience' = $4
             )
           )
         )
       ORDER BY context.created_at DESC, context.id DESC LIMIT 1
     ) receipt ON TRUE
     WHERE NOT EXISTS (SELECT 1 FROM billed WHERE billed.agent_run_id = run.id)
     ORDER BY started_at DESC, id DESC LIMIT 10`,
    [scope.organizationId, scope.contractId ?? null, scope.conversationId, scope.audience],
  )
  return rows.map(row => {
    const attempts: Array<{ status?: unknown; costUsd?: unknown; tokens?: Record<string, unknown> }> = Array.isArray(row.attempts)
      ? row.attempts.map(attempt => attempt && typeof attempt === 'object' ? attempt : {}) : []
    const costs = attempts.flatMap(attempt => attempt.status === 'received' && typeof attempt.costUsd === 'number'
      && Number.isFinite(attempt.costUsd) && attempt.costUsd >= 0 ? [attempt.costUsd] : [])
    const knownSubtotalUsd = costs.length ? costs.reduce((total, cost) => total + cost, 0) : null
    function observedTokens(key: 'input' | 'output' | 'reasoning') {
      const values = attempts.flatMap(attempt => {
        const value = attempt.tokens?.[key]
        return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? [value] : []
      })
      return values.length ? values.reduce((total, value) => total + value, 0) : null
    }
    return {
      id: row.id, startedAt: new Date(row.started_at).toISOString(),
      provider: {
        attempts: attempts.length || null, knownSubtotalUsd,
        totalUsd: costs.length === attempts.length ? knownSubtotalUsd : null,
        inputTokens: observedTokens('input'), outputTokens: observedTokens('output'), reasoningTokens: observedTokens('reasoning'),
      },
      credits: {
        state: row.credit_state ?? (row.unbilled ? 'unbilled' as const : 'unmeasured' as const),
        unlimited: row.unlimited, reserved: row.unlimited ? null : row.reserved, charged: row.charged,
        released: !row.unlimited && row.reserved !== null && row.charged !== null ? row.reserved - row.charged : null,
      },
    }
  })
}
