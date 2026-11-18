import type pg from 'pg'
import { z } from 'zod'
import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../http/errors.js'
import { invokeAgentRuntime } from '../../lib/agent-runtime-client.js'
import type { MissionSourceRefWire } from '../action-engine/generated/mission-wire.js'
import { verifyMissionKnowledgeContext } from '../action-engine/mission-source-verifier.js'
import { agentSourceRulesSchema, requiredSourcesMessage } from '../action-engine/agent-source-rules.js'
import { listPromptVersions, presalesPilotEnabled, promptInstructionSchema, promptSettings,
  stageInstructionMapSchema, strategistModeSchema } from './prompt-versions.js'
import { loadCommercialCatalog, loadPresalesLead, validateRecommendation } from './presales-context.js'

type Queryable = Pick<pg.Pool, 'query'>
type ChatRow = Record<string, unknown>

export const strategyAdminChatRequestSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().trim().min(1).max(20_000),
  mode: strategistModeSchema.default('general'),
  organizationId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  contractId: z.string().uuid().optional(),
  leadId: z.uuid().optional(),
})

export type StrategyAdminChatRequest = z.infer<typeof strategyAdminChatRequestSchema>

export const presalesJobSchema = z.object({
  version: z.number().int().positive(),
  instruction: promptInstructionSchema.nullable(),
  stageInstructions: stageInstructionMapSchema.optional(),
  sourceRules: agentSourceRulesSchema.optional(),
  userMessageId: z.uuid(),
})

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
    presales?: z.infer<typeof presalesJobSchema>
  }
}

export async function prepareStrategyAdminChat(
  pool: Queryable,
  actorUserId: string,
  request: StrategyAdminChatRequest,
  pilotEnv?: AppEnv,
): Promise<PreparedStrategyAdminChat> {
  const isPilot = (id: unknown, contractId: unknown) => typeof id === 'string' && pilotEnv
    && presalesPilotEnabled(pilotEnv, id, optionalString(contractId))
  const profile = await pool.query<{ id: string }>(
    `SELECT id
      FROM public.yux_strategy_agent_profiles
      WHERE profile_key='growth_strategist' AND status='active'
      LIMIT 1`,
  )
  if (!profile.rows[0]) throw new ApiError(409, 'growth_strategist_not_active')

  let session: ChatRow
  let version: Awaited<ReturnType<typeof listPromptVersions>>[number] | undefined
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
    const suppliedScope = [
      [request.organizationId, session.organization_id],
      [request.clientId, session.client_id],
      [request.contractId, session.contract_id],
      [request.leadId, session.presales_lead_id],
    ]
    if (suppliedScope.some(([requested, stored]) => requested !== undefined && requested !== stored)) {
      throw new ApiError(409, 'strategy_chat_session_scope_mismatch')
    }
    if (isPilot(session.organization_id, session.contract_id)) {
      version = (await listPromptVersions(pool, String(session.organization_id), 1))[0]
      if (promptSettings(version, request.mode).active && session.presales_lead_id) {
        await loadPresalesLead(pool, String(session.organization_id), String(session.presales_lead_id), optionalString(session.contract_id))
      }
    }
  } else {
    if (isPilot(request.organizationId, request.contractId)) {
      version = (await listPromptVersions(pool, request.organizationId!, 1))[0]
    }
    const active = promptSettings(version, request.mode).active
    if (request.leadId && (!request.organizationId || !active)) {
      throw new ApiError(409, 'strategy_presales_pilot_inactive')
    }
    if (request.organizationId && (request.clientId || request.contractId || active)) {
      await assertScope(pool, request.organizationId, request.clientId, request.contractId)
    }
    if (request.organizationId && request.leadId) {
      await loadPresalesLead(pool, request.organizationId, request.leadId, request.contractId)
    }
    const inserted = await pool.query<ChatRow>(
      `INSERT INTO public.yux_strategy_chat_sessions (
         actor_user_id,organization_id,client_id,contract_id,profile_id,profile_key,mode,title${request.leadId ? ',presales_lead_id' : ''}
       ) VALUES ($1,$2,$3,$4,$5,'growth_strategist',$6,$7${request.leadId ? ',$8' : ''})
       RETURNING *`,
      [
        actorUserId,
        request.organizationId ?? null,
        request.clientId ?? null,
        request.contractId ?? null,
        profile.rows[0].id,
        request.mode,
        modeLabels[request.mode],
        ...(request.leadId ? [request.leadId] : []),
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

  const settings = promptSettings(version, request.mode)
  const versionContext = version && settings.active ? { promptVersion: version.version } : {}
  const assistantMessage = (await pool.query<ChatRow>(
    `INSERT INTO public.yux_strategy_chat_messages (
       session_id,actor_user_id,role,content,status,model_provider,model_name,routing_rule_id,safe_context
     ) VALUES ($1,$2,'assistant','Estrategista analisando contexto...','queued',$3,$4,$5,$6::jsonb)
     RETURNING *`,
    [sessionId, actorUserId, route.rows[0].provider, route.rows[0].model_name, route.rows[0].id, JSON.stringify(versionContext)],
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
      leadId: optionalString(session.presales_lead_id),
      ...(version && settings.active ? {
        presales: { version: version.version, instruction: settings.instruction, userMessageId: String(userMessage.id),
          stageInstructions: settings.stageInstructions, sourceRules: settings.sourceRules },
      } : {}),
    },
  }
}

type RuntimeStrategyResult = {
  run?: Record<string, unknown>
  synthesis?: Record<string, unknown>
  policy?: Record<string, unknown>
  credits?: Record<string, unknown>
  usage?: { stages?: unknown; reportedGenerationCostUsd?: number | null; reportedProviderCostUsd?: number | null }
}

export async function processStrategyAdminChat(
  pool: Queryable,
  env: AppEnv,
  request: PreparedStrategyAdminChat['jobBody'],
) {
  const claimed = await pool.query(
    `UPDATE public.yux_strategy_chat_messages
        SET status='running',error_message=NULL
      WHERE id=$1 AND session_id=$2 AND role='assistant'${request.presales ? " AND status='queued'" : ''}`,
    [request.assistantMessageId, request.sessionId],
  )
  if (request.presales && claimed.rowCount !== 1) return { skipped: true }

  try {
    const presales = request.presales && request.organizationId ? request.presales : null
    let runtimeClientId = request.clientId
    if (presales && request.organizationId) {
      const scopedClientId = await assertScope(pool, request.organizationId, request.clientId, request.contractId)
      const billableContracts = (env.STRATEGY_PRESALES_BILLABLE_CONTRACT_IDS ?? '').split(',').map(id => id.trim())
      if (!runtimeClientId && request.contractId && billableContracts.includes(request.contractId)) {
        runtimeClientId = scopedClientId ?? undefined
      }
    }
    const organizationId = request.organizationId
    const [catalog, prospect, history] = presales && organizationId ? await Promise.all([
      loadCommercialCatalog(pool, organizationId),
      request.leadId ? loadPresalesLead(pool, organizationId, request.leadId, request.contractId) : null,
      loadUserHistory(pool, request.sessionId, presales.userMessageId),
    ]) : [null, null, []] as const
    const runtime = await invokeAgentRuntime<RuntimeStrategyResult>(env, '/workflows/execute', {
      message: request.message,
      profile_key: 'growth_strategist',
      source: 'strategy_admin',
      organization_id: request.organizationId ?? null,
      client_id: runtimeClientId ?? null,
      contract_id: request.contractId ?? null,
      mode: request.mode,
      ...(presales ? {
        presales_candidate: true,
        presales_instruction: presales.instruction,
        presales_stage_instructions: presales.stageInstructions,
        presales_prompt_version: presales.version,
        ...(presales.sourceRules ? { presales_source_rules: presales.sourceRules } : {}),
        strategy_operation_id: request.assistantMessageId,
        retrieval_context: {
          conversation_history: history,
          opportunity: prospect,
          commercial_catalog: catalog,
        },
      } : {}),
    }, { timeoutMs: 170_000 })
    const synthesis = runtime.synthesis ?? {}
    const answer = String(synthesis.answer ?? synthesis.summary ?? '').trim()
    if (!answer) throw new Error('strategy_admin_chat_empty_answer')
    const supportingCards = Array.isArray(synthesis.supporting_cards) ? synthesis.supporting_cards : []
    if (presales && organizationId && supportingCards.length) {
      const sources = Array.isArray(synthesis.supporting_sources) ? synthesis.supporting_sources as MissionSourceRefWire[] : []
      if (!supportingCards.every(id => sources.some(source => source.id === id))) {
        throw new Error('strategy_presales_references_unverifiable')
      }
      await verifyMissionKnowledgeContext(pool, {
        organizationId, audience: 'internal_operator', sourceRefs: sources,
        restrictDocumentScope: true,
        contractId: request.contractId, workflowKey: typeof synthesis.workflow_key === 'string' ? synthesis.workflow_key : undefined,
      })
    }
    const recommendation = catalog ? validateRecommendation(synthesis.recommendation, catalog) : null
    const content = recommendation
      ? [recommendation.rationale, ...recommendation.missingInformation.map(item => `• ${item}`)].join('\n')
      : answer

    const safeContext = {
      runId: runtime.run?.id ?? null,
      workflowKey: synthesis.workflow_key ?? null,
      supportingCards,
      policy: runtime.policy ?? {},
      ...(presales && catalog ? {
        promptVersion: presales.version,
        catalogVersion: catalog.version,
        leadId: request.leadId ?? null,
        opportunityVersion: prospect?.version ?? null,
        recommendation,
        generationUsage: runtime.usage ?? null,
        commercialCredits: runtime.credits?.charged ?? runtime.credits?.reserved ?? null,
      } : {}),
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
        content,
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
    const content = protectedMessage === 'agent_runtime_409:agent_required_sources_missing'
      ? requiredSourcesMessage : 'Nao foi possivel concluir a analise estrategica.'
    await pool.query(
      `UPDATE public.yux_strategy_chat_messages
          SET content=$4,status='failed',error_message=$3
        WHERE id=$1 AND session_id=$2 AND role='assistant'`,
      [request.assistantMessageId, request.sessionId, protectedMessage, content],
    )
    throw error
  }
}

async function assertScope(pool: Queryable, organizationId: string, clientId?: string, contractId?: string) {
  const result = await pool.query<{ client_id: string | null }>(
    `SELECT org.client_id FROM public.organizations org WHERE org.id = $1
      AND ($2::uuid IS NULL OR org.client_id = $2)
      AND ($3::uuid IS NULL OR EXISTS (SELECT 1 FROM public.contracts c
        WHERE c.id = $3 AND c.client_id = org.client_id AND c.status = 'active'))`,
    [organizationId, clientId ?? null, contractId ?? null],
  )
  if (!result.rows.length) throw new ApiError(409, 'strategy_chat_scope_invalid')
  return result.rows[0].client_id
}

async function loadUserHistory(pool: Queryable, sessionId: string, currentMessageId: string) {
  const { rows } = await pool.query<{ content: string; created_at: string }>(
    `SELECT left(previous.content, 1800) AS content, previous.created_at
     FROM public.yux_strategy_chat_messages previous
     JOIN public.yux_strategy_chat_messages current ON current.id = $2 AND current.session_id = previous.session_id
     WHERE previous.session_id = $1 AND previous.role = 'user' AND previous.status = 'completed'
       AND (previous.created_at, previous.id) < (current.created_at, current.id)
     ORDER BY previous.created_at DESC, previous.id DESC LIMIT 8`,
    [sessionId, currentMessageId],
  )
  return rows.reverse()
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
