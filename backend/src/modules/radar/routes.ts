import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import {
  addRadarCompanyToCampaign,
  batchAnalyzeRadarOpportunities,
  batchEnrichRadarOpportunities,
  convertRadarOpportunityToLead,
  createRadarCampaign,
  discardRadarCandidate,
  getRadarCampaignMetrics,
  importRadarCsvToCampaign,
  importRadarCandidate,
  importRadarUrlsToCampaign,
  listRadarDataSources,
  listRadarCampaigns,
  listRadarCandidates,
  listRadarDuplicateCandidates,
  listRadarOpportunities,
  listRadarRuns,
  optOutRadarOpportunity,
  reviewRadarOpportunity,
  runRadarCnpjaAdvancedSearch,
  runRadarOpportunityAnalysis,
  runRadarAssistedSearch,
  updateRadarDuplicateCandidate,
  updateRadarDataSource,
} from './repository.js'

const uuid = z.string().uuid()

const campaignQuerySchema = z.object({ organizationId: uuid })
const dataSourceQuerySchema = z.object({ organizationId: uuid })
const createCampaignSchema = z.object({
  organizationId: uuid,
  name: z.string().min(1),
  campaignType: z.enum(['local_niche', 'recently_opened']).optional(),
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
  notes: z.string().optional(),
}).refine(input => Boolean(input.tradeName || input.legalName || input.websiteUrl), {
  message: 'radar_company_requires_name_or_site',
})
const reviewSchema = z.object({ status: z.enum(['approved', 'rejected']) })
const updateDataSourceSchema = z.object({
  enabled: z.boolean().optional(),
  rateLimitPerDay: z.number().int().min(1).max(1000).optional(),
  defaultCostPerUnit: z.number().min(0).optional(),
  termsNotes: z.string().optional(),
})
const importCsvSchema = z.object({
  organizationId: uuid,
  csv: z.string().min(1),
  analyzeAfterImport: z.boolean().optional(),
})
const importUrlsSchema = z.object({
  organizationId: uuid,
  urls: z.array(z.string().min(1)).min(1).max(10),
  analyzeAfterImport: z.boolean().optional(),
})
const importCandidateSchema = z.object({
  analyzeAfterImport: z.boolean().optional(),
}).optional()
const searchWebSchema = z.object({
  organizationId: uuid,
  query: z.string().min(1),
  city: z.string().optional(),
  state: z.string().optional(),
  sourceType: z.enum(['jina_search', 'web_search']),
  limit: z.number().int().min(1).max(10).optional(),
})
const searchCnpjaSchema = z.object({
  organizationId: uuid,
  query: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  cnaes: z.array(z.string()).optional(),
  openingFrom: z.string().optional(),
  openingTo: z.string().optional(),
  limit: z.number().int().min(1).max(10).optional(),
}).refine(input => Boolean(input.query || input.city || input.state || input.cnaes?.length || input.openingFrom || input.openingTo), {
  message: 'radar_cnpja_search_requires_filter',
})
const duplicateUpdateSchema = z.object({ status: z.enum(['confirmed', 'dismissed', 'merged']) })
const batchOpportunitySchema = z.object({
  opportunityIds: z.array(uuid).min(1).max(10),
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

export async function registerRadarRoutes(app: FastifyInstance) {
  app.get('/data-sources', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = dataSourceQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_data_source_query' })
    return listRadarDataSources(app.pg, user, parsed.data.organizationId)
  })

  app.patch('/data-sources/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = updateDataSourceSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_data_source_payload' })
    return updateRadarDataSource(app.pg, user, params.data.id, parsed.data)
  })

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

  app.post('/campaigns/:id/import-csv', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = importCsvSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_csv_payload' })
    return reply.code(201).send(await importRadarCsvToCampaign(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
  })

  app.post('/campaigns/:id/import-urls', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = importUrlsSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_urls_payload' })
    return reply.code(201).send(await importRadarUrlsToCampaign(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
  })

  app.post('/campaigns/:id/search-web', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = searchWebSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_search_payload' })
    return reply.code(201).send(await runRadarAssistedSearch(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
  })

  app.post('/campaigns/:id/search-cnpja', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = searchCnpjaSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_cnpja_payload' })
    return reply.code(201).send(await runRadarCnpjaAdvancedSearch(app.pg, user, {
      ...parsed.data,
      campaignId: params.data.id,
      secretKeyMaterial: app.config.SESSION_SECRET,
    }))
  })

  app.get('/campaigns/:id/candidates', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
    return listRadarCandidates(app.pg, user, params.data.id)
  })

  app.post('/candidates/:id/import', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = importCandidateSchema.safeParse(request.body ?? {})
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_candidate_payload' })
    return importRadarCandidate(app.pg, user, params.data.id, parsed.data ?? {})
  })

  app.post('/candidates/:id/discard', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_candidate_id' })
    return discardRadarCandidate(app.pg, user, params.data.id)
  })

  app.get('/campaigns/:id/duplicates', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
    return listRadarDuplicateCandidates(app.pg, user, params.data.id)
  })

  app.patch('/duplicates/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = duplicateUpdateSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_duplicate_payload' })
    return updateRadarDuplicateCandidate(app.pg, user, params.data.id, parsed.data.status)
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

  app.get('/campaigns/:id/runs', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
    return listRadarRuns(app.pg, user, params.data.id)
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

  app.post('/opportunities/batch/analyze', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = batchOpportunitySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_batch_payload' })
    return batchAnalyzeRadarOpportunities(app.pg, user, parsed.data.opportunityIds)
  })

  app.post('/opportunities/batch/enrich', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = batchOpportunitySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_batch_payload' })
    return batchEnrichRadarOpportunities(app.pg, user, parsed.data.opportunityIds)
  })

  app.post('/opportunities/:id/convert-to-lead', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_opportunity_id' })
    return reply.code(201).send(await convertRadarOpportunityToLead(app.pg, user, params.data.id))
  })
}
