import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hashSessionToken } from '../../auth/session.js'
import { dataQuerySchema, executeDataQuery } from '../data/routes.js'

const allowedTables = new Set([
  'yux_strategy_agent_profiles',
  'yux_strategy_skills',
  'yux_strategy_concept_cards',
  'yux_strategy_source_documents',
  'yux_strategy_source_chunks',
  'yux_strategy_source_assets',
  'yux_strategy_retrieval_queries',
  'yux_strategy_agent_bindings',
  'platform_provider_connections',
  'model_routing_rules',
  'organizations',
  'ai_assistants',
  'ai_assistant_routing_rules',
  'yux_strategy_agent_recommendations',
  'yux_strategy_agent_handoffs',
  'yux_strategy_outcome_events',
  'yux_objection_playbook_items',
  'yux_metrics_cash_snapshots',
  'agent_execution_runs',
  'agent_execution_steps',
  'agent_autonomy_policies',
  'strategy_workflow_specs',
  'agent_learning_signals',
  'agent_improvement_recommendations',
  'agent_shadow_experiments',
  'yux_strategy_chat_sessions',
  'yux_strategy_chat_messages',
])

async function getAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[request.server.config.SESSION_COOKIE_NAME]
  if (!token) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }

  const user = await request.server.authStore.findUserBySession(hashSessionToken(token), new Date())
  if (!user) {
    void reply.code(401).send({ error: 'not_authenticated' })
    return null
  }

  return user
}

export async function registerStrategyEngineRoutes(app: FastifyInstance) {
  app.post('/query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !allowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_strategy_engine_query' })
    }

    return executeDataQuery(app, parsed.data)
  })
}
