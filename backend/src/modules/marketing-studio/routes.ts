import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { getContractOrganizationId } from '../../http/contract-organization.js'
import { requireAuth, requireMembership } from '../../http/guards.js'
import { requirePlatformOperation } from '../../http/operation-policy.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'
import { parseLegacyKnowledgeArgs } from '../company-intelligence/retrieval-policy.js'

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

const marketingStudioTableRules = createScopedTableRules(
  [
    'marketing_studio_settings',
    'content_items',
    'editorial_calendar_items',
    'marketing_brand_profiles',
    'marketing_products_services',
    'marketing_knowledge_documents',
    'marketing_knowledge_chunks',
    'marketing_sources',
    'marketing_ideas',
    'marketing_source_items',
  ],
  [
    'content_versions',
    'content_reviews',
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
  ],
)

const portalContractQuerySchema = z.object({ contractId: z.string().uuid() })

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
  app.get('/portal/contents', async (request, reply) => {
    const parsed = portalContractQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_portal_content_query' })

    const organizationId = await getContractOrganizationId(app.pg, parsed.data.contractId)
    if (!organizationId) return reply.code(404).send({ error: 'contract_not_found' })
    requireMembership(request, organizationId)

    const { rows } = await app.pg.query(
      `SELECT id, organization_id, client_id, contract_id, title, content_type, channel, status,
              brief, body, cta, campaign_id, landing_page_id, source_idea_id, created_by_agent_id,
              approved_by, scheduled_at, published_at, published_url, created_at, updated_at
       FROM public.content_items
       WHERE contract_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC`,
      [parsed.data.contractId, organizationId],
    )
    return rows
  })

  app.get('/portal/reviews', async (request, reply) => {
    const parsed = portalContractQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_portal_review_query' })
    const organizationId = await getContractOrganizationId(app.pg, parsed.data.contractId)
    if (!organizationId) return reply.code(404).send({ error: 'contract_not_found' })
    requireMembership(request, organizationId)
    const ctx = requireAuth(request)
    requirePlatformOperation(ctx, 'knowledge.read', 'marketing_studio')
    const { rows } = await app.pg.query(
      `SELECT review.id, review.content_item_id, review.reviewer_id, review.status,
              review.quality_score, review.comments, review.checklist, review.decided_at,
              review.created_at, review.updated_at
       FROM public.content_reviews review
       JOIN public.content_items content ON content.id = review.content_item_id
       WHERE content.contract_id = $1 AND content.organization_id = $2
       ORDER BY review.created_at DESC`,
      [parsed.data.contractId, organizationId],
    )
    return rows
  })

  app.post('/query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !allowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_marketing_studio_query' })
    }

    return executeScopedDataQuery(app, requireAuth(request), parsed.data, marketingStudioTableRules)
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
      const args = parseLegacyKnowledgeArgs(parsed.data.args)
      if (!args.success) return reply.code(400).send({ error: 'invalid_marketing_knowledge_query' })
      const organizationId = await getContractOrganizationId(app.pg, args.data.targetContractId)
      if (!organizationId) return reply.code(404).send({ error: 'contract_not_found' })
      requireMembership(request, organizationId)
      if (args.data.usedLegacyNames) request.log.info({ event: 'legacy_marketing_knowledge_query_names', contractId: args.data.targetContractId })
      const result = await app.pg.query(
        'SELECT * FROM public.match_marketing_knowledge($1, $2, $3)',
        [args.data.targetContractId, args.data.queryText, args.data.matchLimit],
      )
      return { data: result.rows, error: null, count: result.rows.length }
    }

    return reply.code(404).send({ error: 'marketing_studio_rpc_not_implemented' })
  })
}
