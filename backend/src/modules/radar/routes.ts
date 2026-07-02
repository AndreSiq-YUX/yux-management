import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import {
  addRadarCompanyToCampaign,
  convertRadarOpportunityToLead,
  createRadarCampaign,
  getRadarCampaignMetrics,
  listRadarCampaigns,
  listRadarOpportunities,
  optOutRadarOpportunity,
  reviewRadarOpportunity,
  runRadarOpportunityAnalysis,
} from './repository.js'

const uuid = z.string().uuid()

const campaignQuerySchema = z.object({ organizationId: uuid })
const createCampaignSchema = z.object({
  organizationId: uuid,
  name: z.string().min(1),
  targetSegment: z.string().min(1),
  targetCity: z.string().min(1),
  targetState: z.string().min(2).max(2),
  targetKeywords: z.array(z.string()).optional(),
  targetCnaes: z.array(z.string()).optional(),
  offerType: z.string().min(1),
  budgetLimit: z.number().optional(),
  dailyLimit: z.number().int().min(1).max(10).optional(),
})
const addCompanySchema = z.object({
  organizationId: uuid,
  legalName: z.string().optional(),
  tradeName: z.string().optional(),
  cnpj: z.string().optional(),
  cnaeMain: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  phoneRaw: z.string().optional(),
  emailRaw: z.string().email().optional(),
  websiteUrl: z.string().optional(),
  sourceType: z.string().optional(),
  sourceUrl: z.string().optional(),
})
const reviewSchema = z.object({ status: z.enum(['approved', 'rejected']) })

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

export async function registerRadarRoutes(app: FastifyInstance) {
  app.get('/campaigns', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = campaignQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_campaign_query' })
    return listRadarCampaigns(app.pg, user, parsed.data.organizationId)
  })

  app.post('/campaigns', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = createCampaignSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_campaign_payload' })
    return reply.code(201).send(await createRadarCampaign(app.pg, user, parsed.data))
  })

  app.post('/campaigns/:id/companies', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = addCompanySchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_company_payload' })
    return reply.code(201).send(await addRadarCompanyToCampaign(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
  })

  app.get('/campaigns/:id/opportunities', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
    return listRadarOpportunities(app.pg, user, params.data.id)
  })

  app.get('/campaigns/:id/metrics', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
    return getRadarCampaignMetrics(app.pg, user, params.data.id)
  })

  app.patch('/opportunities/:id/review', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = reviewSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_review_payload' })
    return reviewRadarOpportunity(app.pg, user, params.data.id, parsed.data.status)
  })

  app.post('/opportunities/:id/opt-out', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_opportunity_id' })
    return optOutRadarOpportunity(app.pg, user, params.data.id)
  })

  app.post('/opportunities/:id/run-analysis', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_opportunity_id' })
    return runRadarOpportunityAnalysis(app.pg, user, params.data.id)
  })

  app.post('/opportunities/:id/convert-to-lead', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_opportunity_id' })
    return reply.code(201).send(await convertRadarOpportunityToLead(app.pg, user, params.data.id))
  })
}
