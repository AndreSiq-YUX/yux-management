import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { getContractOrganizationId } from '../../http/contract-organization.js'
import { requireAuth, requireMembership } from '../../http/guards.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'
import { requireAccess } from '../../policies/authorization.js'
import { inspectCampaignState } from './repository.js'

const allowedTables = new Set([
  'ad_provider_connections',
  'campaigns',
  'campaign_creatives',
  'campaign_recommendations',
  'campaign_alerts',
  'ad_provider_mutation_runs',
])

// ad_provider_* expose provider credentials references and mutation controls;
// clients only consume campaigns through /portal/campaigns.
const campaignTableRules = createScopedTableRules(
  ['campaigns'],
  ['ad_provider_connections', 'ad_provider_mutation_runs', 'campaign_creatives', 'campaign_recommendations', 'campaign_alerts'],
)

const portalContractQuerySchema = z.object({ contractId: z.string().uuid() })
const missionStateQuerySchema = z.object({ organizationId: z.string().uuid(), missionId: z.string().uuid().optional() })

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

export async function registerCampaignRoutes(app: FastifyInstance) {
  app.get('/mission-state', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = missionStateQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_campaign_mission_state_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: parsed.data.organizationId })
    return inspectCampaignState(app.pg, parsed.data.organizationId, parsed.data.missionId)
  })

  app.get('/portal/campaigns', async (request, reply) => {
    const parsed = portalContractQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_portal_campaign_query' })

    const organizationId = await getContractOrganizationId(app.pg, parsed.data.contractId)
    if (!organizationId) return reply.code(404).send({ error: 'contract_not_found' })
    requireMembership(request, organizationId)

    const { rows } = await app.pg.query(
      `SELECT id, organization_id, client_id, contract_id, provider_connection_id, ad_account_id,
              landing_page_id, pipeline_id, initial_stage_id, name, platform, status, budget,
              spent, impressions, clicks, conversions, start_date, end_date, provider, objective,
              lifecycle_status, daily_budget, total_budget, starts_at, ends_at, attributed_revenue,
              leads, cpl, mroi, utm_source, utm_medium, utm_campaign, created_at, updated_at
       FROM public.campaigns
       WHERE contract_id = $1 AND organization_id = $2
       ORDER BY updated_at DESC`,
      [parsed.data.contractId, organizationId],
    )
    return rows
  })

  app.post('/query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !allowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_campaign_query' })
    }

    return executeScopedDataQuery(app, requireAuth(request), parsed.data, campaignTableRules)
  })
}
