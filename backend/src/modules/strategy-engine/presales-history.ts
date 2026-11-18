import type { Queryable } from '../action-engine/repository.js'
import { providerAttempts, summarizeCreditHold, summarizeProviderAttempts, type CreditHoldUsage } from './provider-attempts.js'

type PresalesRow = CreditHoldUsage & {
  id: string
  started_at: string | Date
  state: 'queued' | 'running' | 'completed' | 'failed'
  attempts: unknown
}

export async function loadPresalesHistory(pool: Queryable, scope: { organizationId: string; contractId?: string }) {
  const { rows } = await pool.query<PresalesRow>(
    `SELECT msg.id, msg.created_at AS started_at, msg.status AS state,
            COALESCE(hold.attempts, receipt.attempts, msg.safe_context#>'{generationUsage,providerAttempts}') AS attempts,
            hold.state AS credit_state, hold.reserved_credits AS reserved, hold.charged_credits AS charged, hold.unlimited,
            COALESCE(run.unbilled, FALSE) AS unbilled
     FROM public.yux_strategy_chat_sessions session
     JOIN public.yux_strategy_chat_messages msg ON msg.session_id = session.id AND msg.role = 'assistant'
     LEFT JOIN private.strategy_workflow_credit_holds hold
       ON hold.organization_id = session.organization_id AND hold.contract_id = session.contract_id
       AND hold.operation_id = msg.id AND hold.action = 'agent_runtime_workflow' AND hold.audience = 'internal_operator'
     LEFT JOIN LATERAL (
       SELECT execution.id, execution.client_id IS NULL OR execution.contract_id IS NULL AS unbilled
       FROM public.agent_execution_runs execution
       WHERE execution.organization_id = session.organization_id
         AND execution.contract_id IS NOT DISTINCT FROM session.contract_id
         AND execution.run_source = 'strategy_admin' AND execution.profile_key = 'growth_strategist'
         AND execution.input_payload ? 'strategy_operation_id'
         AND execution.input_payload->>'strategy_operation_id' = msg.id::text
       ORDER BY execution.created_at DESC, execution.id DESC LIMIT 1
     ) run ON hold.operation_id IS NULL
     LEFT JOIN LATERAL (
       SELECT snapshot.safe_context->'attempts' AS attempts
       FROM public.agent_context_snapshots snapshot
       WHERE snapshot.run_id = run.id AND snapshot.context_kind = 'runtime'
         AND snapshot.profile_key = 'growth_strategist'
         AND snapshot.safe_context->>'measurement' = 'presales_provider_attempts'
         AND snapshot.safe_context->>'audience' = 'internal_operator'
       ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
     ) receipt ON TRUE
     WHERE session.organization_id = $1 AND session.contract_id IS NOT DISTINCT FROM $2::uuid
       AND session.profile_key = 'growth_strategist'
       AND (msg.safe_context ? 'promptVersion' OR run.id IS NOT NULL OR hold.operation_id IS NOT NULL)
     ORDER BY msg.created_at DESC, msg.id DESC LIMIT 10`,
    [scope.organizationId, scope.contractId ?? null],
  )
  return rows.map(row => {
    const attempts = providerAttempts(row.attempts)
    const stages = new Map<string, typeof attempts>()
    for (const attempt of attempts) {
      const { stage } = attempt
      const name = typeof stage === 'string' && /^[a-z0-9_.-]{1,96}$/i.test(stage) ? stage : 'unidentified'
      const group = stages.get(name) ?? []
      group.push(attempt)
      stages.set(name, group)
    }
    return {
      id: row.id, startedAt: new Date(row.started_at).toISOString(), state: row.state,
      provider: summarizeProviderAttempts(attempts), credits: summarizeCreditHold(row),
      stages: [...stages].map(([name, values]) => ({ name, ...summarizeProviderAttempts(values) })),
    }
  })
}
