import type pg from 'pg'
import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'

type Queryable = Pick<pg.Pool, 'query'>
type ChatRow = Record<string, unknown>

const strategyChatModes = [
  'general',
  'initial_analysis',
  'diagnostic_48h',
  'service_plan',
  'proposal',
  'roadmap_30_60_90',
  'do_not_do',
] as const

export const strategyAdminChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(20_000),
  mode: z.enum(strategyChatModes).default('general'),
  organizationId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
})

export type StrategyAdminChatRequest = z.infer<typeof strategyAdminChatRequestSchema>

const modeLabels: Record<StrategyAdminChatRequest['mode'], string> = {
  general: 'Conversa estrategica geral',
  initial_analysis: 'Analise inicial',
  diagnostic_48h: 'Diagnostico 48h',
  service_plan: 'Plano de servicos ideal',
  proposal: 'Proposta comercial',
  roadmap_30_60_90: 'Roadmap 30/60/90',
  do_not_do: 'O que nao fazer agora',
}

export type PreparedStrategyAdminChat = {
  session: ChatRow
  userMessage: ChatRow
  assistantMessage: ChatRow
  jobBody: StrategyAdminChatRequest & {
    sessionId: string
    assistantMessageId: string
    actorUserId: string
  }
}

export async function prepareStrategyAdminChat(
  pool: Queryable,
  actorUserId: string,
  request: StrategyAdminChatRequest,
): Promise<PreparedStrategyAdminChat> {
  const profile = await pool.query<{ id: string }>(
    `SELECT id
      FROM public.yux_strategy_agent_profiles
      WHERE profile_key='growth_strategist' AND status='active'
      LIMIT 1`,
  )
  if (!profile.rows[0]) throw new ApiError(409, 'growth_strategist_not_active')

  let session: ChatRow
  if (request.sessionId) {
    const existing = await pool.query<ChatRow>(
      `SELECT *
         FROM public.yux_strategy_chat_sessions
        WHERE id=$1 AND status='active'
        LIMIT 1`,
      [request.sessionId],
    )
    if (!existing.rows[0]) throw new ApiError(404, 'strategy_chat_session_not_found')
    session = existing.rows[0]
  } else {
    const inserted = await pool.query<ChatRow>(
      `INSERT INTO public.yux_strategy_chat_sessions (
         actor_user_id,organization_id,client_id,contract_id,profile_id,profile_key,mode,title
       ) VALUES ($1,$2,$3,$4,$5,'growth_strategist',$6,$7)
       RETURNING *`,
      [
        actorUserId,
        request.organizationId ?? null,
        request.clientId ?? null,
        request.contractId ?? null,
        profile.rows[0].id,
        request.mode,
        modeLabels[request.mode],
      ],
    )
    session = inserted.rows[0]
  }

  const sessionId = String(session.id)
  const route = await pool.query<{ id: string; provider: string; model_name: string }>(
    `SELECT id,provider,model_name
       FROM public.model_routing_rules
      WHERE agent_type='growth_strategist'
        AND routing_tier='default'
        AND status='active'
        AND (organization_id IS NULL OR organization_id=$1)
        AND (client_id IS NULL OR client_id=$2)
        AND (contract_id IS NULL OR contract_id=$3)
      ORDER BY (contract_id IS NOT NULL) DESC,
               (client_id IS NOT NULL) DESC,
               (organization_id IS NOT NULL) DESC,
               updated_at DESC
      LIMIT 1`,
    [session.organization_id ?? null, session.client_id ?? null, session.contract_id ?? null],
  )
  if (!route.rows[0]) throw new ApiError(409, 'growth_strategist_route_not_active')

  const userMessage = (await pool.query<ChatRow>(
    `INSERT INTO public.yux_strategy_chat_messages (
       session_id,actor_user_id,role,content,status
     ) VALUES ($1,$2,'user',$3,'completed')
     RETURNING *`,
    [sessionId, actorUserId, request.message],
  )).rows[0]

  const assistantMessage = (await pool.query<ChatRow>(
    `INSERT INTO public.yux_strategy_chat_messages (
       session_id,actor_user_id,role,content,status,model_provider,model_name,routing_rule_id
     ) VALUES ($1,$2,'assistant','Estrategista analisando contexto...','queued',$3,$4,$5)
     RETURNING *`,
    [sessionId, actorUserId, route.rows[0].provider, route.rows[0].model_name, route.rows[0].id],
  )).rows[0]

  await pool.query(
    `UPDATE public.yux_strategy_chat_sessions
        SET last_message_at=NOW(),updated_at=NOW()
      WHERE id=$1`,
    [sessionId],
  )

  return {
    session,
    userMessage,
    assistantMessage,
    jobBody: {
      ...request,
      organizationId: optionalString(session.organization_id),
      clientId: optionalString(session.client_id),
      contractId: optionalString(session.contract_id),
      sessionId,
      assistantMessageId: String(assistantMessage.id),
      actorUserId,
    },
  }
}

type RuntimeStrategyResult = {
  run?: Record<string, unknown>
  synthesis?: Record<string, unknown>
  policy?: Record<string, unknown>
  credits?: Record<string, unknown>
}

export async function processStrategyAdminChat(
  pool: Queryable,
  env: AppEnv,
  request: PreparedStrategyAdminChat['jobBody'],
) {
  await pool.query(
    `UPDATE public.yux_strategy_chat_messages
        SET status='running',error_message=NULL
      WHERE id=$1 AND session_id=$2 AND role='assistant'`,
    [request.assistantMessageId, request.sessionId],
  )

  try {
    const runtime = await invokeAgentRuntime<RuntimeStrategyResult>(env, '/workflows/execute', {
      message: request.message,
      profile_key: 'growth_strategist',
      source: 'strategy_admin',
      organization_id: request.organizationId ?? null,
      client_id: request.clientId ?? null,
      contract_id: request.contractId ?? null,
      mode: request.mode,
    }, { timeoutMs: 170_000 })
    const synthesis = runtime.synthesis ?? {}
    const answer = String(synthesis.answer ?? synthesis.summary ?? '').trim()
    if (!answer) throw new Error('strategy_admin_chat_empty_answer')

    const safeContext = {
      runId: runtime.run?.id ?? null,
      workflowKey: synthesis.workflow_key ?? null,
      supportingCards: Array.isArray(synthesis.supporting_cards) ? synthesis.supporting_cards : [],
      policy: runtime.policy ?? {},
    }
    const completed = (await pool.query<ChatRow>(
      `UPDATE public.yux_strategy_chat_messages
          SET content=$3,status='completed',model_provider=$4,model_name=$5,
              safe_context=$6::jsonb,tool_results=$7::jsonb,error_message=NULL
        WHERE id=$1 AND session_id=$2 AND role='assistant'
        RETURNING *`,
      [
        request.assistantMessageId,
        request.sessionId,
        answer,
        String(synthesis.provider ?? 'openrouter'),
        String(synthesis.model ?? 'yux-agent-harness-runtime'),
        JSON.stringify(safeContext),
        JSON.stringify([{ tool: 'strategy_retrieval', supportingCards: safeContext.supportingCards }]),
      ],
    )).rows[0]

    const title = buildTitle(request.message)
    const updatedSession = (await pool.query<ChatRow>(
      `UPDATE public.yux_strategy_chat_sessions
          SET title=CASE WHEN title IN ('Nova conversa estrategica',$2) THEN $3 ELSE title END,
              context_snapshot=$4::jsonb,last_message_at=NOW(),updated_at=NOW()
        WHERE id=$1
        RETURNING *`,
      [request.sessionId, modeLabels[request.mode], title, JSON.stringify(safeContext)],
    )).rows[0]

    return { session: updatedSession, assistantMessage: completed }
  } catch (error) {
    const protectedMessage = protectRuntimeError(error)
    await pool.query(
      `UPDATE public.yux_strategy_chat_messages
          SET content='Nao foi possivel concluir a analise estrategica.',status='failed',error_message=$3
        WHERE id=$1 AND session_id=$2 AND role='assistant'`,
      [request.assistantMessageId, request.sessionId, protectedMessage],
    )
    throw error
  }
}

export async function markStrategyAdminChatQueueFailure(
  pool: Queryable,
  assistantMessageId: string,
  sessionId: string,
) {
  await pool.query(
    `UPDATE public.yux_strategy_chat_messages
        SET content='Nao foi possivel iniciar a analise estrategica.',status='failed',error_message='strategy_chat_queue_unavailable'
      WHERE id=$1 AND session_id=$2 AND role='assistant'`,
    [assistantMessageId, sessionId],
  )
}

function buildTitle(message: string) {
  return message.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Nova conversa estrategica'
}

function optionalString(value: unknown) {
  const text = typeof value === 'string' ? value.trim() : ''
  return text || undefined
}

function protectRuntimeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'strategy_admin_chat_failed'
  if (message.startsWith('agent_runtime_')) return message.slice(0, 240)
  return 'strategy_admin_chat_failed'
}
