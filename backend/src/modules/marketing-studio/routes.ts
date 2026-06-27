import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { dataQuerySchema, executeDataQuery } from '../data/routes.js'

const allowedTables = new Set([
  'marketing_studio_settings',
  'content_items',
  'content_versions',
  'content_reviews',
  'editorial_calendar_items',
  'marketing_brand_profiles',
  'marketing_products_services',
  'marketing_knowledge_documents',
  'marketing_knowledge_chunks',
  'marketing_sources',
  'marketing_ideas',
  'marketing_source_items',
  'marketing_research_cache',
  'publishing_connections',
  'publishing_runs',
  'marketing_campaign_creative_suggestions',
  'marketing_campaign_draft_runs',
  'marketing_radar_runs',
  'marketing_content_generation_runs',
  'marketing_content_quality_checks',
  'marketing_agent_templates',
  'marketing_agents',
  'marketing_agent_global_prompts',
  'marketing_workflows',
  'marketing_workflow_nodes',
  'marketing_workflow_edges',
  'marketing_workflow_runs',
  'marketing_agent_runs',
  'marketing_tool_runs',
  'agent_budget_policies',
  'model_routing_rules',
  'marketing_agent_tool_policies',
  'ai_usage_ledger',
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

export async function registerMarketingStudioRoutes(app: FastifyInstance) {
  app.post('/query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !allowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_marketing_studio_query' })
    }

    return executeDataQuery(app, parsed.data)
  })

  app.post('/rpc', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = z.object({
      name: z.string().min(1),
      args: z.record(z.string(), z.unknown()).default({}),
    }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_marketing_studio_rpc' })

    if (parsed.data.name === 'match_marketing_knowledge') {
      return { data: [], error: null, count: 0 }
    }

    return reply.code(404).send({ error: 'marketing_studio_rpc_not_implemented' })
  })
}
