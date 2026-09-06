import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { getContractOrganizationId } from '../../http/contract-organization.js'
import { requireAuth, requireMembership } from '../../http/guards.js'
import { requirePlatformOperation } from '../../http/operation-policy.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'
import { parseLegacyKnowledgeArgs } from '../company-intelligence/retrieval-policy.js'
import { requireAccess } from '../../policies/authorization.js'
import {
  createStudioCampaignPlan,
  createStudioContentVersion,
  createStudioPublishingIntent,
  decideStudioContentReview,
  getStudioJourneySummary,
  submitStudioContentForReview,
} from './journey.js'

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
const journeyContextSchema = z.object({
  organizationId: z.string().uuid(),
  contractId: z.string().uuid(),
})
const studioPlanSchema = journeyContextSchema.extend({
  idempotencyKey: z.string().trim().min(8).max(200),
  name: z.string().trim().min(2).max(160),
  objective: z.enum(['lead_generation', 'traffic', 'conversions', 'awareness']),
  audience: z.string().trim().min(2).max(2_000),
  offer: z.string().trim().min(2).max(2_000),
  channel: z.string().trim().min(2).max(80),
  constraints: z.string().trim().max(4_000).default(''),
  sourceIds: z.array(z.string().uuid()).max(100).default([]),
  provider: z.enum(['meta', 'google']).default('meta'),
})
const contentParamsSchema = z.object({ contentId: z.string().uuid() })
const contentVersionSchema = journeyContextSchema.extend({
  title: z.string().trim().min(1).max(240),
  body: z.string().max(200_000),
  changeSummary: z.string().trim().min(1).max(2_000),
})
const versionReferenceSchema = journeyContextSchema.extend({ contentVersionId: z.string().uuid() })
const reviewDecisionSchema = versionReferenceSchema.extend({
  status: z.enum(['approved', 'changes_requested', 'rejected']),
  comments: z.string().trim().max(4_000).optional(),
})
const publishingIntentSchema = journeyContextSchema.extend({
  approvedContentVersionId: z.string().uuid(),
  connectionId: z.string().uuid(),
  action: z.enum(['create_draft', 'update_draft', 'publish']),
  idempotencyKey: z.string().trim().min(8).max(200),
})

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
  app.get('/journey/summary', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = journeyContextSchema.extend({ since: z.string().datetime().optional() }).safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_studio_journey_query' })
    requireAccess(ctx, 'marketing_studio.read', { organizationId: parsed.data.organizationId })
    return getStudioJourneySummary(app.pg, parsed.data)
  })

  app.post('/journey/plans', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = studioPlanSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_studio_plan' })
    requireAccess(ctx, 'marketing_studio.write', { organizationId: parsed.data.organizationId })
    return reply.code(201).send(await createStudioCampaignPlan(app.pg, ctx.userId, parsed.data))
  })

  app.post('/journey/contents/:contentId/versions', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = contentParamsSchema.safeParse(request.params)
    const body = contentVersionSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_studio_content_version' })
    requireAccess(ctx, 'marketing_studio.write', { organizationId: body.data.organizationId })
    return reply.code(201).send(await createStudioContentVersion(app.pg, ctx.userId, {
      ...body.data, contentId: params.data.contentId,
    }))
  })

  app.post('/journey/contents/:contentId/submit-review', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = contentParamsSchema.safeParse(request.params)
    const body = versionReferenceSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_studio_review_submission' })
    requireAccess(ctx, 'marketing_studio.write', { organizationId: body.data.organizationId })
    return reply.code(201).send(await submitStudioContentForReview(app.pg, ctx.userId, {
      ...body.data, contentId: params.data.contentId,
    }))
  })

  app.post('/journey/contents/:contentId/review', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = contentParamsSchema.safeParse(request.params)
    const body = reviewDecisionSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_studio_review_decision' })
    requireAccess(ctx, 'marketing_studio.write', { organizationId: body.data.organizationId })
    return decideStudioContentReview(app.pg, ctx.userId, { ...body.data, contentId: params.data.contentId })
  })

  app.post('/journey/contents/:contentId/publish', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = contentParamsSchema.safeParse(request.params)
    const body = publishingIntentSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_studio_publishing_intent' })
    requireAccess(ctx, 'marketing_studio.write', { organizationId: body.data.organizationId })
    const run = await createStudioPublishingIntent(app.pg, ctx.userId, {
      ...body.data, contentId: params.data.contentId,
    })
    if ((!run.duplicate || run.retry) && run.status === 'queued') {
      await app.jobQueue.add('provider.functionInvoke', {
        requestedBy: ctx.userId,
        functionName: 'execute-marketing-publishing',
        organizationId: body.data.organizationId,
        body: { publishingRunId: run.id },
      })
    }
    return reply.code(run.duplicate ? 200 : 202).send(run)
  })

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
      `SELECT review.id, review.content_item_id, review.content_version_id, review.reviewer_id, review.status,
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
