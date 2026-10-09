import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import {
  addRadarCompanyToCampaign,
  approveRadarB2bProspect,
  assertRadarRegionalBatchAccess,
  batchAnalyzeRadarOpportunities,
  batchEnrichRadarOpportunities,
  checkRadarOsmCandidateSite,
  confirmRadarBraveSuggestion,
  convertRadarOpportunityToLead,
  createRadarCampaign,
  discardRadarCandidate,
  duplicateRadarCampaign,
  enrichRadarCandidateWithLicensedBrave,
  exportRadarB2bProspectsCsv,
  getRadarCampaignMetrics,
  getRadarB2bProgress,
  getRadarOsmReadiness,
  getRadarOsmPilotReport,
  importRadarCsvToCampaign,
  importRadarCandidate,
  importRadarUrlsToCampaign,
  inspectRadarCandidateBusinessSite,
  listRadarDataSources,
  listRadarAdminDataSources,
  listRadarCampaigns,
  listRadarB2bProspects,
  listRadarCandidates,
  listRadarDuplicateCandidates,
  listRadarOpportunities,
  listRadarRuns,
  optOutRadarOpportunity,
  reviewRadarOpportunity,
  runRadarCnpjaAdvancedSearch,
  runRadarPlacePreview,
  runRadarOpportunityAnalysis,
  runRadarAssistedSearch,
  runRadarOsmSearch,
  updateRadarDuplicateCandidate,
  updateRadarDataSource,
  updateRadarCampaign,
  type RadarAnalysisRequest,
} from './repository.js'
import { radarSearchConfigurationSchema, radarStateSchema } from './search-configuration.js'
import { getRadarCandidateResearch, startRadarCandidateResearch } from './research-service.js'
import { getRadarResearchAvailability } from './research-availability.js'

const uuid = z.string().uuid()

const campaignQuerySchema = z.object({ organizationId: uuid })
const dataSourceQuerySchema = z.object({ organizationId: uuid })
const createCampaignSchema = z.object({
  organizationId: uuid,
  name: z.string().min(1),
  campaignType: z.enum(['local_niche', 'recently_opened', 'regional_b2b']).optional(),
  targetSegment: z.string().min(1),
  targetCity: z.string().min(1).optional(),
  targetState: z.string().length(2).optional(),
  targetStates: z.array(radarStateSchema).min(1).max(27).optional(),
  productFocus: z.array(z.string().trim().min(1)).max(12).optional(),
  searchConfiguration: radarSearchConfigurationSchema.optional(),
  targetKeywords: z.array(z.string().trim().min(1).max(160)).max(50).optional(),
  targetCnaes: z.array(z.string().transform(value => value.replace(/\D/g, '')).pipe(z.string().regex(/^\d{7}$/))).max(50).optional(),
  offerType: z.string().min(1),
  budgetLimit: z.number().min(0).optional(),
  dailyLimit: z.number().int().min(1).max(1000).optional(),
}).superRefine((input, context) => {
  if (input.campaignType === 'regional_b2b') {
    if (!input.targetStates?.length || input.targetCity || input.targetState) {
      context.addIssue({ code: 'custom', message: 'regional_search_requires_states_without_single_city' })
    }
    if (input.targetStates && new Set(input.targetStates).size !== input.targetStates.length) {
      context.addIssue({ code: 'custom', message: 'regional_b2b_duplicate_state' })
    }
    if (input.searchConfiguration?.cities.some(city => !input.targetStates?.includes(city.state))) {
      context.addIssue({ code: 'custom', message: 'city_state_outside_campaign_states' })
    }
    if (input.searchConfiguration?.qualification.requireCnaeMatch && !input.targetCnaes?.length) {
      context.addIssue({ code: 'custom', message: 'required_cnae_rule_needs_cnaes' })
    }
  } else if (!input.targetCity || !input.targetState || input.targetStates?.length) {
    context.addIssue({ code: 'custom', message: 'local_campaign_requires_city_and_state' })
  }
})
const addCompanySchema = z.object({
  organizationId: uuid,
  legalName: z.string().optional(),
  tradeName: z.string().optional(),
  cnpj: z.string().optional(),
  cnaeMain: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  address: z.string().optional(),
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
const searchOsmSchema = z.object({ organizationId: uuid, limit: z.number().int().min(1).max(10).optional() })
const searchCnpjaSchema = z.object({
  organizationId: uuid,
  query: z.string().optional(),
  city: z.string().optional(),
  state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/).optional(),
  cnaes: z.array(z.string()).optional(),
  openingFrom: z.iso.date().optional(),
  openingTo: z.iso.date().optional(),
  limit: z.number().int().min(1).max(10).optional(),
}).refine(input => Boolean(input.query || input.city || input.state || input.cnaes?.length || input.openingFrom || input.openingTo), {
  message: 'radar_cnpja_search_requires_filter',
}).refine(input => !input.city?.trim() || Boolean(input.state), {
  message: 'radar_cnpja_city_requires_state',
})
const searchRegionalCnpjaSchema = z.object({
  organizationId: uuid,
  state: radarStateSchema,
  city: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(10).optional(),
})
const previewPlacesSchema = z.object({
  organizationId: uuid,
  sourceType: z.enum(['serper_places', 'brave_place_search']),
  query: z.string().trim().min(1).max(160),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().length(2).transform(value => value.toUpperCase()),
  limit: z.number().int().min(1).max(10),
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

async function enqueueRadarAnalysis(app: FastifyInstance, requests: RadarAnalysisRequest[]) {
  return Promise.all(requests.map(async analysis => {
    const job = await app.jobQueue.add('radar.analyzeOpportunity', {
      runId: analysis.runId,
      opportunityId: analysis.opportunityId,
    })
    return { ...analysis, jobId: job.id }
  }))
}

export async function registerRadarRoutes(app: FastifyInstance) {
  app.get('/admin/data-sources', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    return listRadarAdminDataSources(app.pg, user)
  })

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

  app.patch('/campaigns/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = createCampaignSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_campaign_payload' })
    return updateRadarCampaign(app.pg, user, params.data.id, parsed.data)
  })

  app.post('/campaigns/:id/duplicate', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = campaignQuerySchema.extend({ name: z.string().trim().min(1).max(200).optional() }).safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_campaign_duplicate_payload' })
    return reply.code(201).send(await duplicateRadarCampaign(app.pg, user, { campaignId: params.data.id, ...parsed.data }))
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
    const result = await importRadarCsvToCampaign(app.pg, user, { ...parsed.data, campaignId: params.data.id })
    const analysisRequests = await enqueueRadarAnalysis(app, result.analyzed)
    return reply.code(201).send({ ...result, analyzed: analysisRequests.map(item => item.opportunity), analysisRequests })
  })

  app.post('/campaigns/:id/import-urls', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = importUrlsSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_urls_payload' })
    const result = await importRadarUrlsToCampaign(app.pg, user, { ...parsed.data, campaignId: params.data.id })
    const analysisRequests = await enqueueRadarAnalysis(app, result.analyzed)
    return reply.code(201).send({ ...result, analyzed: analysisRequests.map(item => item.opportunity), analysisRequests })
  })

  app.post('/campaigns/:id/search-web', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = searchWebSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_search_payload' })
    return reply.code(201).send(await runRadarAssistedSearch(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
  })

  app.get('/campaigns/:id/osm-readiness', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const query = campaignQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_radar_osm_query' })
    return getRadarOsmReadiness(app.pg, user, query.data.organizationId, params.data.id)
  })

  app.post('/campaigns/:id/search-osm', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = searchOsmSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_osm_payload' })
    return reply.code(201).send(await runRadarOsmSearch(app.pg, user, { ...parsed.data, campaignId: params.data.id }))
  })

  app.get('/campaigns/:id/osm-report', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const query = campaignQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_radar_osm_query' })
    return getRadarOsmPilotReport(app.pg, user, query.data.organizationId, params.data.id)
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
      secretKeyMaterial: app.config.PROVIDER_SECRET_ENCRYPTION_KEY_B64
        ? `provider-key:${app.config.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : app.config.SESSION_SECRET,
    }))
  })

  app.post('/campaigns/:id/search-cnpja-regional', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = searchRegionalCnpjaSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_regional_search_payload' })
    return reply.code(201).send(await runRadarCnpjaAdvancedSearch(app.pg, user, {
      organizationId: parsed.data.organizationId,
      campaignId: params.data.id,
      regionalState: parsed.data.state,
      regionalCity: parsed.data.city,
      limit: parsed.data.limit,
      secretKeyMaterial: app.config.PROVIDER_SECRET_ENCRYPTION_KEY_B64
        ? `provider-key:${app.config.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : app.config.SESSION_SECRET,
    }))
  })

  for (const [path, jobName] of [
    ['/campaigns/:id/run-b2b-discovery', 'radar.runRegionalDiscovery'],
    ['/campaigns/:id/run-b2b-verification', 'radar.verifyRegionalCandidates'],
  ] as const) {
    app.post(path, async (request, reply) => {
      const user = await getAuthenticatedUser(request, reply)
      if (!user) return reply
      const params = z.object({ id: uuid }).safeParse(request.params)
      const parsed = campaignQuerySchema.safeParse(request.body)
      if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_b2b_batch_payload' })
      const configurationRevision = await assertRadarRegionalBatchAccess(app.pg, user, parsed.data.organizationId, params.data.id)
      const job = await app.jobQueue.add(jobName, { organizationId: parsed.data.organizationId,
        campaignId: params.data.id, requestedBy: user.id, configurationRevision },
      { jobId: `radar-${jobName.replaceAll('.', '-')}-${params.data.id}-v${configurationRevision}-${Math.floor(Date.now() / 60000)}` })
      return reply.code(202).send({ jobId: job.id, status: 'queued' })
    })
  }

  app.post('/campaigns/:id/preview-places', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = previewPlacesSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_place_preview_payload' })
    return runRadarPlacePreview(app.pg, user, { ...parsed.data, campaignId: params.data.id,
      secretKeyMaterial: app.config.PROVIDER_SECRET_ENCRYPTION_KEY_B64
        ? `provider-key:${app.config.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : app.config.SESSION_SECRET })
  })

  app.get('/campaigns/:id/candidates', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_campaign_id' })
    return listRadarCandidates(app.pg, user, params.data.id)
  })

  app.get('/campaigns/:id/research-availability', async (request,reply) => {
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params), query=campaignQuerySchema.safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    return getRadarResearchAvailability(app.pg,user,query.data.organizationId,params.data.id)
  })
  app.get('/candidates/:id/research',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=campaignQuerySchema.safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    return getRadarCandidateResearch(app.pg,user,query.data.organizationId,params.data.id)
  })
  app.post('/candidates/:id/research',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),body=z.object({organizationId:uuid,configurationRevision:z.number().int().positive(),requestId:uuid.optional()}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    const result=await startRadarCandidateResearch(app.pg,user,{...body.data,candidateId:params.data.id})
    if(result.status!=='succeeded') {
      try {await app.jobQueue.add('radar.researchCandidate',{runId:result.runId,organizationId:body.data.organizationId},{jobId:`radar-research-${result.runId}-${Date.now()}`})}
      catch {await app.pg.query(`UPDATE public.radar_candidate_research_runs SET status='failed',error_code='queue_unavailable',updated_at=NOW() WHERE id=$1 AND status='queued'`,[result.runId]);return reply.code(503).send({error:'queue_unavailable'})}
    }
    return reply.code(202).send(result)
  })

  app.get('/campaigns/:id/b2b-prospects', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const query = campaignQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_radar_b2b_query' })
    return listRadarB2bProspects(app.pg, user, query.data.organizationId, params.data.id)
  })

  app.get('/campaigns/:id/b2b-progress', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const query = campaignQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_radar_b2b_progress_query' })
    return getRadarB2bProgress(app.pg, user, query.data.organizationId, params.data.id)
  })

  app.post('/candidates/:id/approve-b2b', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = campaignQuerySchema.extend({
      manualEvidenceUrl: z.string().url().max(1000).optional(),
      manualReviewNote: z.string().max(1000).optional(),
    }).safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_b2b_approval_payload' })
    return approveRadarB2bProspect(app.pg, user, { candidateId: params.data.id,
      organizationId: parsed.data.organizationId,
      manualEvidenceUrl: parsed.data.manualEvidenceUrl,
      manualReviewNote: parsed.data.manualReviewNote })
  })

  app.get('/campaigns/:id/b2b-export.csv', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const query = campaignQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_radar_b2b_export_query' })
    const csv = await exportRadarB2bProspectsCsv(app.pg, user, query.data.organizationId, params.data.id)
    return reply.header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="radar-prospectos-${params.data.id}.csv"`)
      .send(csv)
  })

  app.post('/candidates/:id/check-osm-site', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_radar_candidate_id' })
    return checkRadarOsmCandidateSite(app.pg, user, params.data.id)
  })

  app.post('/candidates/:id/enrich-brave', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = campaignQuerySchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_brave_enrichment_payload' })
    return enrichRadarCandidateWithLicensedBrave(app.pg, user, {
      candidateId: params.data.id,
      organizationId: parsed.data.organizationId,
      secretKeyMaterial: app.config.PROVIDER_SECRET_ENCRYPTION_KEY_B64
        ? `provider-key:${app.config.PROVIDER_SECRET_ENCRYPTION_KEY_B64}` : app.config.SESSION_SECRET,
    })
  })

  app.post('/candidates/:id/confirm-brave-suggestion', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = campaignQuerySchema.extend({ sourceUrl: z.string().url().max(1000) }).safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_brave_suggestion_payload' })
    return confirmRadarBraveSuggestion(app.pg, user, {
      candidateId: params.data.id, organizationId: parsed.data.organizationId,
      sourceUrl: parsed.data.sourceUrl,
    })
  })

  app.post('/candidates/:id/inspect-business-site', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = campaignQuerySchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_site_inspection_payload' })
    return inspectRadarCandidateBusinessSite(app.pg, user, {
      candidateId: params.data.id, organizationId: parsed.data.organizationId,
    })
  })

  app.post('/candidates/:id/import', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = importCandidateSchema.safeParse(request.body ?? {})
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_candidate_payload' })
    const result = await importRadarCandidate(app.pg, user, params.data.id, parsed.data ?? {})
    const analysisRequests = await enqueueRadarAnalysis(app, result.analyzed)
    return { ...result, analyzed: analysisRequests.map(item => item.opportunity), analysisRequests }
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
    const analysis = await runRadarOpportunityAnalysis(app.pg, user, params.data.id)
    const [queued] = await enqueueRadarAnalysis(app, [analysis])
    return reply.code(202).send(queued)
  })

  app.post('/opportunities/batch/analyze', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = batchOpportunitySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_radar_batch_payload' })
    const result = await batchAnalyzeRadarOpportunities(app.pg, user, parsed.data.opportunityIds)
    const requests = await enqueueRadarAnalysis(app, result.requests)
    return reply.code(202).send({ requests, analyzed: requests.map(item => item.opportunity) })
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
