import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { ApiError } from '../../http/errors.js'
import { requireOrganizationScope } from '../../http/guards.js'
import { readKnowledgeFile, writeKnowledgeFile } from './file-storage.js'
import {
  archiveKnowledgeDocument,
  applyCompanyIntelligenceSuggestions,
  attachKnowledgeFile,
  completeKnowledgeIngestion,
  createKnowledgeShell,
  createWebsiteOnboardingRun,
  getBrandProfile,
  getCompanyContextPreview,
  getCompanyProfile,
  getKnowledgeDocument,
  getKnowledgeProcessing,
  getKnowledgeUploadLimitMb,
  getWebsiteOnboardingRun,
  listKnowledgeDocuments,
  markKnowledgeIngestionFailed,
  markKnowledgeProcessingState,
  publishKnowledgeDocument,
  reviewCuratedKnowledgeChunk,
  updateKnowledgeGovernance,
  upsertBrandProfile,
  upsertCompanyProfile,
} from './repository.js'
import { extractManualKnowledge } from './text-extraction.js'

const organizationParams = z.object({ organizationId: z.string().uuid() })
const text = z.string().trim().max(20_000).default('')
const optionalText = z.string().trim().max(20_000).nullable().optional()
const stringList = z.array(z.string().trim().min(1).max(300)).max(100).default([])
const record = z.record(z.string(), z.unknown()).default({})
const visualIdentitySchema = z.object({
  logoUrl: z.union([z.string().trim().url(), z.literal('')]).optional(),
  colors: stringList,
  typography: stringList,
  designStyle: text,
  imageryStyle: text,
  graphicElements: stringList,
}).default({ colors: [], typography: [], designStyle: '', imageryStyle: '', graphicElements: [] })

const profileSchema = z.object({
  legalName: text,
  tradeName: text,
  description: text,
  websiteUrl: z.union([z.string().trim().url(), z.literal(''), z.null()]).optional(),
  industry: text,
  positioning: text,
  differentiators: stringList,
  emails: z.array(z.string().trim().email()).max(20).default([]),
  phones: stringList,
  address: record,
  businessHours: record,
  serviceRegions: stringList,
  socialLinks: record,
  internalNotes: optionalText,
})

const brandSchema = z.object({
  contractId: z.string().uuid().optional(),
  toneOfVoice: text,
  persona: text,
  brandVoiceSummary: text,
  vocabularyDo: stringList,
  vocabularyDont: stringList,
  forbiddenTopics: stringList,
  priorityTopics: stringList,
  visualIdentity: visualIdentitySchema,
  visualGuidelines: optionalText,
  complianceNotes: optionalText,
  status: z.enum(['draft', 'active', 'archived']).default('draft'),
})

const previewQuery = z.object({
  q: z.string().trim().max(500).default(''),
  includeDrafts: z.enum(['true', 'false']).optional(),
})

const documentType = z.enum(['brand', 'product', 'service', 'faq', 'case', 'campaign', 'policy', 'other'])
const visibility = z.enum(['internal', 'external', 'both'])
const knowledgeBase = z.object({
  contractId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(300),
  documentType: documentType.default('other'),
  visibility: visibility.default('both'),
  allowedAgentProfileKeys: stringList,
  blockedAgentProfileKeys: stringList,
})
const manualKnowledgeSchema = knowledgeBase.extend({ body: z.string().trim().min(10).max(2_000_000) })
const urlKnowledgeSchema = knowledgeBase.extend({ sourceUrl: z.string().trim().url() })
const fileKnowledgeSchema = knowledgeBase.extend({
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.enum([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown',
  ]),
  byteSize: z.number().int().positive(),
  contentBase64: z.string().min(1),
})
const documentParams = z.object({ documentId: z.string().uuid() })
const chunkParams = z.object({ documentId: z.string().uuid(), chunkId: z.string().uuid() })
const reviewChunkSchema = z.object({ status: z.enum(['approved', 'rejected']) })
const publishKnowledgeSchema = z.object({ allowDegradedRaw: z.boolean().default(false) }).default({ allowDegradedRaw: false })
const knowledgePatchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  documentType: documentType.optional(),
  visibility: visibility.optional(),
  allowedAgentProfileKeys: stringList.optional(),
  blockedAgentProfileKeys: stringList.optional(),
})
const websiteOnboardingSchema = z.object({
  websiteUrl: z.string().trim().min(3).max(2_000),
  contractId: z.string().uuid().optional(),
  maxPages: z.number().int().min(1).max(50).default(30),
})
const websiteRunParams = z.object({ organizationId: z.string().uuid(), runId: z.string().uuid() })
const applyWebsiteSuggestionsSchema = z.object({
  suggestionIds: z.array(z.string().uuid()).min(1).max(100),
  suggestionEdits: z.array(z.object({ id: z.string().uuid(), suggestedValue: z.unknown() })).max(100).default([]),
})

export async function registerCompanyIntelligenceRoutes(app: FastifyInstance) {
  app.get('/organizations/:organizationId/profile', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_organization_id' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    return getCompanyProfile(app.pg, params.data.organizationId, canConfigure(ctx.role))
  })

  app.put('/organizations/:organizationId/profile', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    const body = profileSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_company_profile_payload' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    assertCanConfigure(ctx.role)
    return upsertCompanyProfile(app.pg, params.data.organizationId, normalizeProfile(body.data))
  })

  app.get('/organizations/:organizationId/brand', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_organization_id' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    return getBrandProfile(app.pg, params.data.organizationId, canConfigure(ctx.role))
  })

  app.put('/organizations/:organizationId/brand', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    const body = brandSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_brand_profile_payload' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    assertCanConfigure(ctx.role)
    return upsertBrandProfile(app.pg, params.data.organizationId, normalizeBrand(body.data))
  })

  app.get('/organizations/:organizationId/context-preview', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    const query = previewQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_context_preview_query' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    const includeDrafts = query.data.includeDrafts === 'true' && canConfigure(ctx.role)
    return getCompanyContextPreview(app.pg, params.data.organizationId, query.data.q, includeDrafts)
  })

  app.get('/organizations/:organizationId/knowledge', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_organization_id' })
    requireOrganizationScope(request, params.data.organizationId)
    return listKnowledgeDocuments(app.pg, params.data.organizationId)
  })

  app.get('/organizations/:organizationId/knowledge/upload-limit', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_organization_id' })
    requireOrganizationScope(request, params.data.organizationId)
    return { limitMb: await getKnowledgeUploadLimitMb(app.pg, params.data.organizationId) }
  })

  app.post('/organizations/:organizationId/website-onboarding', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    const body = websiteOnboardingSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_website_onboarding_payload' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    assertCanConfigure(ctx.role)
    const run = await createWebsiteOnboardingRun(app.pg, {
      organizationId: params.data.organizationId,
      contractId: body.data.contractId,
      websiteUrl: body.data.websiteUrl,
      maxPages: body.data.maxPages,
      createdBy: ctx.userId,
    })
    const job = await app.jobQueue.add('company-intelligence.discoverWebsite', {
      runId: run.id,
      organizationId: params.data.organizationId,
      clientId: run.clientId,
      contractId: run.contractId,
      websiteUrl: body.data.websiteUrl,
      maxPages: body.data.maxPages,
    })
    return reply.code(202).send({ run, suggestions: [], jobId: job.id })
  })

  app.get('/organizations/:organizationId/website-onboarding/:runId', async (request, reply) => {
    const params = websiteRunParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_website_onboarding_run' })
    requireOrganizationScope(request, params.data.organizationId)
    return getWebsiteOnboardingRun(app.pg, params.data.organizationId, params.data.runId)
  })

  app.post('/organizations/:organizationId/website-onboarding/:runId/apply', async (request, reply) => {
    const params = websiteRunParams.safeParse(request.params)
    const body = applyWebsiteSuggestionsSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_website_onboarding_apply_payload' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    assertCanConfigure(ctx.role)
    return applyCompanyIntelligenceSuggestions(app.pg, {
      organizationId: params.data.organizationId,
      runId: params.data.runId,
      suggestionIds: body.data.suggestionIds,
      suggestionEdits: body.data.suggestionEdits,
      userId: ctx.userId,
    })
  })

  app.post('/organizations/:organizationId/knowledge/text', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    const body = manualKnowledgeSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_manual_knowledge_payload' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    assertCanConfigure(ctx.role)
    const shell = await createKnowledgeShell(app.pg, {
      organizationId: params.data.organizationId,
      ...body.data,
      sourceType: 'manual',
      checksumSha256: createHash('sha256').update(body.data.body).digest('hex'),
    })
    try {
      await completeKnowledgeIngestion(app.pg, {
        sourceId: shell.sourceId,
        documentId: shell.documentId,
        extracted: extractManualKnowledge(body.data.title, body.data.body),
      })
      const job = await app.jobQueue.add('company-intelligence.indexKnowledge', {
        sourceId: shell.sourceId,
        documentId: shell.documentId,
        sourceType: 'manual',
      })
      await markKnowledgeProcessingState(app.pg, shell.documentId, 'indexing')
      return reply.code(202).send({ ...(await getKnowledgeDocument(app.pg, shell.documentId)), jobId: job.id })
    } catch (error) {
      await markKnowledgeIngestionFailed(app.pg, shell.sourceId, shell.documentId, error)
      throw error
    }
  })

  app.post('/organizations/:organizationId/knowledge/url', async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    const body = urlKnowledgeSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_url_knowledge_payload' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    assertCanConfigure(ctx.role)
    const shell = await createKnowledgeShell(app.pg, {
      organizationId: params.data.organizationId,
      ...body.data,
      sourceType: 'url',
    })
    const job = await app.jobQueue.add('company-intelligence.indexKnowledge', {
      sourceId: shell.sourceId,
      documentId: shell.documentId,
      sourceType: 'url',
    })
    return reply.code(202).send({ ...(await getKnowledgeDocument(app.pg, shell.documentId)), jobId: job.id })
  })

  app.post('/organizations/:organizationId/knowledge/files', { bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
    const params = organizationParams.safeParse(request.params)
    const body = fileKnowledgeSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_file_knowledge_payload' })
    const ctx = requireOrganizationScope(request, params.data.organizationId)
    assertCanConfigure(ctx.role)
    const content = Buffer.from(body.data.contentBase64, 'base64')
    if (content.byteLength !== body.data.byteSize) return reply.code(400).send({ error: 'invalid_knowledge_file_size' })
    const limitMb = await getKnowledgeUploadLimitMb(app.pg, params.data.organizationId)
    if (content.byteLength > limitMb * 1024 * 1024) return reply.code(413).send({ error: 'knowledge_file_too_large' })
    const checksumSha256 = createHash('sha256').update(content).digest('hex')
    const shell = await createKnowledgeShell(app.pg, {
      organizationId: params.data.organizationId,
      ...body.data,
      sourceType: 'file',
      mimeType: body.data.mimeType,
      byteSize: content.byteLength,
      checksumSha256,
      metadata: { originalFileName: body.data.fileName },
    })
    try {
      const stored = await writeKnowledgeFile({
        organizationId: params.data.organizationId,
        documentId: shell.documentId,
        fileName: body.data.fileName,
        mimeType: body.data.mimeType,
        content,
      })
      await attachKnowledgeFile(app.pg, {
        sourceId: shell.sourceId,
        documentId: shell.documentId,
        storagePath: stored.relativePath,
        checksumSha256: stored.checksumSha256,
        byteSize: stored.byteSize,
        mimeType: body.data.mimeType,
      })
      const job = await app.jobQueue.add('company-intelligence.indexKnowledge', {
        sourceId: shell.sourceId,
        documentId: shell.documentId,
        sourceType: 'file',
      })
      return reply.code(202).send({ ...(await getKnowledgeDocument(app.pg, shell.documentId)), jobId: job.id })
    } catch (error) {
      await markKnowledgeIngestionFailed(app.pg, shell.sourceId, shell.documentId, error)
      throw error
    }
  })

  app.patch('/knowledge/:documentId', async (request, reply) => {
    const params = documentParams.safeParse(request.params)
    const body = knowledgePatchSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_knowledge_update_payload' })
    const current = await getKnowledgeDocument(app.pg, params.data.documentId)
    const ctx = requireOrganizationScope(request, current.organizationId)
    assertCanConfigure(ctx.role)
    return updateKnowledgeGovernance(app.pg, params.data.documentId, normalizeKnowledgePatch(body.data))
  })

  app.get('/knowledge/:documentId/processing', async (request, reply) => {
    const params = documentParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_knowledge_document_id' })
    const current = await getKnowledgeDocument(app.pg, params.data.documentId)
    requireOrganizationScope(request, current.organizationId)
    return getKnowledgeProcessing(app.pg, params.data.documentId)
  })

  app.patch('/knowledge/:documentId/chunks/:chunkId/review', async (request, reply) => {
    const params = chunkParams.safeParse(request.params)
    const body = reviewChunkSchema.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_knowledge_review_payload' })
    const current = await getKnowledgeDocument(app.pg, params.data.documentId)
    const ctx = requireOrganizationScope(request, current.organizationId)
    assertCanConfigure(ctx.role)
    return reviewCuratedKnowledgeChunk(app.pg, params.data.documentId, params.data.chunkId, body.data.status)
  })

  app.post('/knowledge/:documentId/publish', async (request, reply) => {
    const params = documentParams.safeParse(request.params)
    const body = publishKnowledgeSchema.safeParse(request.body || {})
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_knowledge_publish_payload' })
    const current = await getKnowledgeDocument(app.pg, params.data.documentId)
    const ctx = requireOrganizationScope(request, current.organizationId)
    assertCanConfigure(ctx.role)
    return publishKnowledgeDocument(app.pg, params.data.documentId, ctx.userId, body.data.allowDegradedRaw)
  })

  app.post('/knowledge/:documentId/archive', async (request, reply) => {
    const params = documentParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_knowledge_document_id' })
    const current = await getKnowledgeDocument(app.pg, params.data.documentId)
    const ctx = requireOrganizationScope(request, current.organizationId)
    assertCanConfigure(ctx.role)
    return archiveKnowledgeDocument(app.pg, params.data.documentId)
  })

  app.get('/knowledge/:documentId/file', async (request, reply) => {
    const params = documentParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_knowledge_document_id' })
    const current = await getKnowledgeDocument(app.pg, params.data.documentId)
    requireOrganizationScope(request, current.organizationId)
    if (!current.storagePath || !current.mimeType) return reply.code(404).send({ error: 'knowledge_file_not_found' })
    reply.header('Content-Type', current.mimeType)
    reply.header('Content-Disposition', `inline; filename="${current.title.replace(/"/g, '')}"`)
    return reply.send(await readKnowledgeFile(current.storagePath))
  })
}

function canConfigure(role: string) {
  return role === 'yux_admin' || role === 'yux_operator' || role === 'client_admin'
}

function assertCanConfigure(role: string) {
  if (!canConfigure(role)) throw new ApiError(403, 'company_intelligence_write_forbidden')
}

function normalizeList(values: string[]) {
  const seen = new Set<string>()
  return values.map(value => value.trim()).filter(value => {
    const key = value.toLocaleLowerCase('pt-BR')
    if (!value || seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function normalizeProfile(input: z.infer<typeof profileSchema>) {
  return {
    ...input,
    websiteUrl: input.websiteUrl || null,
    differentiators: normalizeList(input.differentiators),
    emails: normalizeList(input.emails),
    phones: normalizeList(input.phones),
    serviceRegions: normalizeList(input.serviceRegions),
  }
}

function normalizeBrand(input: z.infer<typeof brandSchema>) {
  return {
    ...input,
    vocabularyDo: normalizeList(input.vocabularyDo),
    vocabularyDont: normalizeList(input.vocabularyDont),
    forbiddenTopics: normalizeList(input.forbiddenTopics),
    priorityTopics: normalizeList(input.priorityTopics),
  }
}

function normalizeKnowledgePatch(input: z.infer<typeof knowledgePatchSchema>) {
  return {
    ...input,
    allowedAgentProfileKeys: input.allowedAgentProfileKeys ? normalizeList(input.allowedAgentProfileKeys) : undefined,
    blockedAgentProfileKeys: input.blockedAgentProfileKeys ? normalizeList(input.blockedAgentProfileKeys) : undefined,
  }
}
