import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { hashSessionToken } from '../../auth/session.js'
import { requireAuth } from '../../http/guards.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'

const allowedTables = new Set([
  'ad_provider_connections',
  'campaigns',
  'campaign_creatives',
  'campaign_recommendations',
  'campaign_alerts',
  'ad_provider_mutation_runs',
])

const campaignTableRules = createScopedTableRules(
  ['ad_provider_connections', 'campaigns', 'ad_provider_mutation_runs'],
  ['campaign_creatives', 'campaign_recommendations', 'campaign_alerts'],
)

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
