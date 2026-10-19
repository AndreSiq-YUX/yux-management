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
  getRadarBraveCandidateAvailability,
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
import { getRadarCandidateResearch,reopenRadarResearchReview,listRadarResearchHistory } from './research-service.js'
import {queueRadarResearchRequest,radarResearchRequestSchema,getRadarResearchRequest,getLatestRadarResearchRequest,enqueueRadarResearchRequest,authorizeRadarResearchBudget,radarResearchBudgetAuthorizationSchema} from './research-requests.js'
import {randomUUID} from 'node:crypto'
import {authorizeRadarAnalysisRetries,radarAnalysisRetryAuthorizationSchema} from './analysis-retry-authorizations.js'
import { getRadarResearchAvailability } from './research-availability.js'
import {deliverRadarCompaniesToCrm,listRadarCrmDestinations} from './crm-delivery.js'
import {authorizeRadarTlsException,revokeRadarTlsException} from './tls-exception-service.js'
import {recordRadarResearchFeedback,listRadarResearchFeedback} from './research-feedback.js'
import {getRadarResearchMetrics} from './research-metrics.js'
import {startRadarCaptureOperation,getRadarCaptureOperation,getLatestRadarCaptureOperation} from './capture-operation.js'
import {resumeRadarCaptureOperation} from './capture-dispatch.js'
import {RadarCaptureContinuationConsentRequired} from './capture-continuation.js'
import {getRadarCapturePreflight} from './capture-preflight.js'
const continuationAuthorizationsSchema=z.array(z.object({scopeKey:z.string().min(1).max(256),expectedStateId:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).optional()
import {radarCaptureLimitsSchema} from './capture-limit-authorization.js'
import {getRadarOperationalLimits,updateRadarOperationalLimits,radarOperationalLimitsSchema} from './operational-limits.js'
import {getRadarAdministrativeResearch,revalidateRadarAdministrativeResearch,radarAdministrativeScopeSchema,radarAdministrativeRevalidationSchema} from './administrative-research.js'
import {radarCostPolicySchema} from './cost-conversion.js'
import type {AuthUser} from '../../auth/routes.js'
import {canViewRadarInternals,projectRadarCommercialResponse,radarCommercialSurface} from './commercial-view.js'
import {getRadarStalledResearch} from './stalled-research.js'

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
  dailyLimit: z.number().int().positive().safe().optional(),
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
  rateLimitPerDay: z.number().int().positive().safe().optional(),
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
  limit: z.number().int().positive().safe().optional(),
}).refine(input => Boolean(input.query || input.city || input.state || input.cnaes?.length || input.openingFrom || input.openingTo), {
  message: 'radar_cnpja_search_requires_filter',
}).refine(input => !input.city?.trim() || Boolean(input.state), {
  message: 'radar_cnpja_city_requires_state',
})
const searchRegionalCnpjaSchema = z.object({
  organizationId: uuid,
  state: radarStateSchema,
  city: z.string().trim().min(1).max(100).optional(),
  limit: z.number().int().positive().safe().optional(),
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

const radarUsers=new WeakMap<FastifyRequest,AuthUser>()
async function getAuthenticatedUser(request: FastifyRequest, reply: FastifyReply) {
  const cached=radarUsers.get(request)
  if(cached)return cached
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
  radarUsers.set(request,user)
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
  app.addHook('preHandler',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply)
    if(!user)return reply
    if(!canViewRadarInternals(user)&&!radarCommercialSurface(request.method,request.routeOptions.url??'')){
      return reply.code(403).send({error:'radar_internal_access_required'})
    }
  })
  // This hook covers both returned objects and explicit reply.send(), including errors.
  // Tenant checks stay in the existing services; no internal JSON reaches a commercial caller.
  app.addHook('onSend',async(request,reply,payload)=>{
    const user=radarUsers.get(request)
    if(!user||canViewRadarInternals(user))return payload
    reply.removeHeader('content-length')
    if(reply.statusCode>=400){
      const code=typeof payload==='string'?JSON.parse(payload).error:undefined
      const safe=['radar_forbidden','radar_campaign_not_found','radar_candidate_not_found','radar_campaign_configuration_changed'].includes(code)
      return JSON.stringify({error:safe?code:'radar_request_unavailable',message:reply.statusCode===403?'Acesso indisponível para este usuário.':'Não foi possível concluir. Procure a equipe responsável.'})
    }
    const surface=radarCommercialSurface(request.method,request.routeOptions.url??'')
    if(!surface||typeof payload!=='string')return JSON.stringify({})
    return JSON.stringify(projectRadarCommercialResponse(surface,JSON.parse(payload)))
  })
  app.get('/admin/stalled-research',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    return getRadarStalledResearch(app.pg,user)
  })
  app.get('/admin/research-operations',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    if(user.role!=='yux_admin')return reply.code(403).send({error:'radar_source_admin_required'})
    const input=radarAdministrativeScopeSchema.safeParse(request.query)
    if(!input.success)return reply.code(400).send({error:'invalid_radar_research_scope'})
    return getRadarAdministrativeResearch(app.pg,user,input.data)
  })
  app.post('/admin/research-operations/revalidate',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    if(user.role!=='yux_admin')return reply.code(403).send({error:'radar_source_admin_required'})
    const input=radarAdministrativeRevalidationSchema.safeParse(request.body)
    if(!input.success)return reply.code(400).send({error:'invalid_radar_revalidation_payload'})
    return revalidateRadarAdministrativeResearch(app.pg,user,app.config,input.data)
  })
  app.get('/admin/operational-limits',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    return getRadarOperationalLimits(app.pg,user)
  })
  app.put('/admin/operational-limits',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const body=z.object({expectedVersion:z.number().int().positive(),limits:radarOperationalLimitsSchema,costPolicy:radarCostPolicySchema.optional()}).strict().safeParse(request.body)
    if(!body.success)return reply.code(400).send({error:'invalid_radar_operational_policy'})
    return updateRadarOperationalLimits(app.pg,user,body.data)
  })
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

  app.post('/campaigns/:id/capture-preflight',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params)
    const body=z.object({organizationId:uuid,configurationRevision:z.number().int().positive(),requestedCount:z.number().int().positive().safe(),operationId:uuid.optional()}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_capture_payload'})
    return getRadarCapturePreflight(app.pg,user,{...body.data,campaignId:params.data.id})
  })
  app.post('/campaigns/:id/capture-operations',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params)
    const body=z.object({organizationId:uuid,configurationRevision:z.number().int().positive(),requestId:uuid,requestedCount:z.number().int().positive().safe(),continuationAuthorizations:continuationAuthorizationsSchema}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_capture_payload'})
    const result=await startRadarCaptureOperation(app.pg,user,{...body.data,campaignId:params.data.id})
    // Durable outbox is committed first; lost HTTP/queue acknowledgements are safe.
    try{await app.jobQueue.add('radar.advanceCaptureOperation',{organizationId:body.data.organizationId,operationId:result.operationId},{jobId:`radar-capture-start-${result.operationId}`})}catch{ /* Reconciler dispatches later. */ }
    return reply.code(202).send(result)
  })
  app.get('/campaigns/:id/capture-operations/latest',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=campaignQuerySchema.safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_capture_query'})
    return {operation:await getLatestRadarCaptureOperation(app.pg,user,query.data.organizationId,params.data.id)}
  })
  app.get('/capture-operations/:id',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=campaignQuerySchema.safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_capture_query'})
    return getRadarCaptureOperation(app.pg,user,query.data.organizationId,params.data.id)
  })
  app.post('/campaigns/:id/analysis-retries',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    if(user.role!=='yux_admin')return reply.code(403).send({error:'radar_forbidden'})
    const params=z.object({id:uuid}).safeParse(request.params)
    const body=radarAnalysisRetryAuthorizationSchema.omit({campaignId:true}).safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_analysis_retry_payload'})
    // Approval only: request orchestration must separately consume the grant.
    return authorizeRadarAnalysisRetries(app.pg,user,{...body.data,campaignId:params.data.id})
  })
  app.post('/capture-operations/:id/resume',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params)
    const body=z.object({organizationId:uuid,configurationRevision:z.number().int().positive(),requestId:uuid,allowSemanticRefresh:z.boolean().optional(),restartExpiredContinuation:z.boolean().optional(),continuationReceiptId:uuid.optional(),continuationStateId:z.string().regex(/^[a-f0-9]{64}$/).optional(),continuationAuthorizations:continuationAuthorizationsSchema,limitsAuthorization:z.object({expectedStateId:z.string().regex(/^[a-f0-9]{64}$/),limits:radarCaptureLimitsSchema}).strict().optional()}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_capture_payload'})
    let operation:Awaited<ReturnType<typeof resumeRadarCaptureOperation>>
    try{operation=await resumeRadarCaptureOperation(app.pg,user,{...body.data,operationId:params.data.id})}
    catch(cause){
      // Only this authorized Admin operation exposes the opaque consent receipt.
      if(cause instanceof RadarCaptureContinuationConsentRequired)return reply.code(409).send({error:cause.message,continuationReceiptId:cause.continuationReceiptId,continuationStateId:cause.continuationStateId})
      throw cause
    }
    try{await app.jobQueue.add('radar.advanceCaptureOperation',{organizationId:body.data.organizationId,operationId:operation.id},{jobId:`radar-capture-resume-${operation.id}-${body.data.requestId}`})}catch{ /* Durable outbox survives. */ }
    return reply.code(202).send(operation)
  })

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
  app.get('/campaigns/:id/research-metrics',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=z.object({organizationId:uuid,from:z.iso.date(),to:z.iso.date()}).strict().safeParse(request.query)
    if(!params.success||!query.success||query.data.from>query.data.to||Date.parse(query.data.to)-Date.parse(query.data.from)>366*86400000)return reply.code(400).send({error:'invalid_radar_metrics_period'})
    return getRadarResearchMetrics(app.pg,user,{...query.data,campaignId:params.data.id})
  })
  app.get('/candidates/:id/feedback',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=campaignQuerySchema.safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_feedback_payload'})
    return listRadarResearchFeedback(app.pg,user,query.data.organizationId,params.data.id)
  })
  app.post('/candidates/:id/feedback',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),body=z.object({organizationId:uuid,requestId:uuid,configurationRevision:z.number().int().positive(),
      kind:z.enum(['identity_confirmed','identity_wrong','contact_valid','contact_invalid','segment_confirmed','segment_wrong']),contact:z.object({kind:z.string().min(1).max(30),value:z.string().min(1).max(1000)}).strict().optional(),note:z.string().trim().max(2000).optional()}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_feedback_payload'})
    return recordRadarResearchFeedback(app.pg,user,{...body.data,candidateId:params.data.id})
  })
  app.get('/crm-destinations',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const query=z.object({organizationId:uuid}).safeParse(request.query)
    if(!query.success)return reply.code(400).send({error:'invalid_radar_crm_payload'})
    return listRadarCrmDestinations(app.pg,user,query.data.organizationId)
  })
  app.get('/campaigns/:id/research-history',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=campaignQuerySchema.safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    return listRadarResearchHistory(app.pg,user,query.data.organizationId,params.data.id)
  })
  app.post('/candidates/:id/reopen-review',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),body=z.object({organizationId:uuid,configurationRevision:z.number().int().positive()}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    return reopenRadarResearchReview(app.pg,user,{...body.data,candidateId:params.data.id})
  })
  app.post('/campaigns/:id/deliver-to-crm',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params)
    const body=z.object({organizationId:uuid,configurationRevision:z.number().int().positive(),candidateIds:z.array(uuid).min(1).max(25),
      destination:z.object({crmInstanceId:uuid,pipelineId:uuid,stageId:uuid}).strict(),requestId:uuid}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_crm_payload'})
    return deliverRadarCompaniesToCrm(app.pg,user,{...body.data,campaignId:params.data.id})
  })
  app.get('/candidates/:id/research',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=campaignQuerySchema.safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    return getRadarCandidateResearch(app.pg,user,query.data.organizationId,params.data.id)
  })
  app.post('/candidates/:id/research/tls-exceptions',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params)
    const body=z.object({organizationId:uuid,runId:uuid,configurationRevision:z.number().int().positive(),diagnosticId:z.string().regex(/^[a-f0-9]{64}$/),confirmed:z.literal(true)}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_tls_payload'})
    return authorizeRadarTlsException(app.pg,user,{...body.data,candidateId:params.data.id})
  })
  app.post('/candidates/:id/research/tls-exceptions/:grantId/revoke',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid,grantId:uuid}).safeParse(request.params),body=z.object({organizationId:uuid}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_tls_payload'})
    await revokeRadarTlsException(app.pg,user,{organizationId:body.data.organizationId,candidateId:params.data.id,grantId:params.data.grantId})
    return {revoked:true}
  })
  app.post('/candidates/:id/research',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),body=z.object({organizationId:uuid,configurationRevision:z.number().int().positive(),requestId:uuid.optional(),allowSemanticRefresh:z.boolean().optional(),operation:z.enum(['complete','resume','refresh','reanalyze']).optional()}).strict().safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    const campaign=(await app.pg.query(`SELECT campaign.id,campaign.configuration_revision,campaign.commercial_criteria_revision FROM public.radar_candidate_records candidate JOIN public.radar_campaigns campaign ON campaign.id=candidate.campaign_id AND campaign.organization_id=candidate.organization_id WHERE candidate.id=$1 AND candidate.organization_id=$2`,[params.data.id,body.data.organizationId])).rows[0]
    if(!campaign||campaign.configuration_revision!==body.data.configurationRevision)return reply.code(409).send({error:'radar_campaign_configuration_changed'})
    const result=await queueRadarResearchRequest(app.pg,user,{organizationId:body.data.organizationId,campaignId:campaign.id,candidateIds:[params.data.id],criteriaRevision:campaign.commercial_criteria_revision,requestId:body.data.requestId??randomUUID(),intent:body.data.operation==='refresh'?'refresh':body.data.operation==='reanalyze'?'reanalyze':'resume',allowSemanticRefresh:body.data.allowSemanticRefresh})
    await enqueueRadarResearchRequest(app.pg,app.jobQueue,body.data.organizationId,result.requestId as string)
    return reply.code(202).send({...result,campaignId:campaign.id,status:result.state==='unchanged'?'succeeded':'queued',reused:result.state==='unchanged'})
  })
  app.post('/admin/research-requests/:requestId/authorize-budget',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    if(user.role!=='yux_admin')return reply.code(403).send({error:'radar_source_admin_required'})
    const params=z.object({requestId:uuid}).safeParse(request.params),body=radarResearchBudgetAuthorizationSchema.omit({requestId:true}).safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    const result=await authorizeRadarResearchBudget(app.pg,user,{...body.data,requestId:params.data.requestId})
    await enqueueRadarResearchRequest(app.pg,app.jobQueue,body.data.organizationId,params.data.requestId)
    return reply.code(202).send(result)
  })
  app.post('/campaigns/:id/research-requests',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),body=radarResearchRequestSchema.omit({campaignId:true}).safeParse(request.body)
    if(!params.success||!body.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    const result=await queueRadarResearchRequest(app.pg,user,{...body.data,campaignId:params.data.id})
    await enqueueRadarResearchRequest(app.pg,app.jobQueue,body.data.organizationId,result.requestId as string)
    return reply.code(202).send(result)
  })
  app.get('/campaigns/:id/research-requests/latest',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=z.object({organizationId:uuid}).safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    return getLatestRadarResearchRequest(app.pg,user,query.data.organizationId,params.data.id)
  })
  app.get('/campaigns/:id/research-requests/:requestId',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid,requestId:uuid}).safeParse(request.params),query=z.object({organizationId:uuid}).safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_research_payload'})
    const row=(await app.pg.query('SELECT id FROM public.radar_research_requests WHERE request_id=$1 AND campaign_id=$2 AND organization_id=$3',[params.data.requestId,params.data.id,query.data.organizationId])).rows[0]
    if(!row)return reply.code(404).send({error:'radar_research_request_not_found'})
    return getRadarResearchRequest(app.pg,user,query.data.organizationId,params.data.requestId)
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

  app.get('/candidates/:id/brave-availability',async(request,reply)=>{
    const user=await getAuthenticatedUser(request,reply);if(!user)return reply
    const params=z.object({id:uuid}).safeParse(request.params),query=campaignQuerySchema.safeParse(request.query)
    if(!params.success||!query.success)return reply.code(400).send({error:'invalid_radar_candidate_query'})
    return getRadarBraveCandidateAvailability(app.pg,user,{candidateId:params.data.id,organizationId:query.data.organizationId})
  })
  app.post('/candidates/:id/enrich-brave', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: uuid }).safeParse(request.params)
    const parsed = campaignQuerySchema.extend({expectedRevision:z.number().int().positive().optional()}).safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_radar_brave_enrichment_payload' })
    return enrichRadarCandidateWithLicensedBrave(app.pg, user, {
      candidateId: params.data.id,
      organizationId: parsed.data.organizationId,
      expectedRevision:parsed.data.expectedRevision,
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
