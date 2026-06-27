import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import {
  createDraft,
  generateDraft,
  getDiagnostic,
  getProposalById,
  getPublicReview,
  listConversionRuns,
  listDecisions,
  listGenerationRuns,
  listPriceRules,
  listProposals,
  listProposalVersions,
  replaceItems,
  saveDiagnostic,
  sendProposal,
  submitPortalDecision,
  submitPublicDecision,
  updateDraft,
} from './repository.js'

const optionalUuid = z.string().uuid().optional()
const idParams = z.object({ id: z.string().uuid() })
const tokenParams = z.object({ token: z.string().min(1) })

const proposalQuerySchema = z.object({
  organizationId: optionalUuid,
  status: z.string().optional(),
  leadId: optionalUuid,
  packageId: optionalUuid,
  assignedTo: optionalUuid,
})

const priceRulesQuerySchema = z.object({
  organizationId: z.string().uuid(),
  packageId: z.string().uuid(),
})

const decisionsQuerySchema = z.object({
  versionIds: z.string().optional(),
})

const createDraftSchema = z.object({
  organizationId: z.string().uuid(),
  leadId: z.string().uuid(),
  packageId: z.string().uuid(),
  crmInstanceId: optionalUuid,
  recommendedPackageId: optionalUuid,
  blueprintId: optionalUuid,
  title: z.string().min(1),
  billingCycle: z.enum(['one_time', 'monthly', 'quarterly', 'yearly']).optional(),
  selectedModuleKeys: z.array(z.string()).optional(),
})

const updateDraftSchema = z.object({
  title: z.string().optional(),
  scope: z.string().optional(),
  whatsappMessage: z.string().optional(),
  emailSubject: z.string().optional(),
  emailBody: z.string().optional(),
  packageId: optionalUuid,
  blueprintId: z.string().uuid().nullable().optional(),
  billingCycle: z.enum(['one_time', 'monthly', 'quarterly', 'yearly']).optional(),
  selectedModuleKeys: z.array(z.string()).optional(),
  finalValue: z.number().min(0).optional(),
  overrideReason: z.string().nullable().optional(),
})

const itemSchema = z.object({
  itemKey: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
  quantity: z.number().positive(),
  unitValue: z.number().min(0),
  orderIndex: z.number().int().min(0),
})

const diagnosticSchema = z.object({
  organizationId: z.string().uuid(),
  leadId: z.string().uuid(),
  summary: z.string(),
  painPoints: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
  budgetRange: z.string().optional(),
  timeline: z.string().optional(),
  decisionProcess: z.string().optional(),
  notes: z.string().optional(),
  createdBy: optionalUuid,
})

const portalDecisionSchema = z.object({
  proposalVersionId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected', 'adjustments_requested']),
  comment: z.string().optional(),
  decidedBy: optionalUuid,
})

const publicDecisionSchema = z.object({
  decision: z.enum(['approved', 'rejected', 'adjustments_requested']),
  comment: z.string().optional(),
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

function validateDecision(decision: string, comment?: string) {
  if (!['approved', 'rejected', 'adjustments_requested'].includes(decision)) return 'Decisao invalida.'
  if (decision === 'adjustments_requested' && !comment?.trim()) return 'Descreva os ajustes solicitados.'
  return null
}

function publicBaseUrl(app: FastifyInstance) {
  return app.config.CORS_ORIGIN || 'https://hub.yux.com.br'
}

export async function registerProposalRoutes(app: FastifyInstance) {
  app.get('/', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = proposalQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_proposal_query' })

    return listProposals(app.pg, user, parsed.data)
  })

  app.get('/portal', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    return listProposals(app.pg, user, {})
  })

  app.get('/by-lead/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_lead_id' })

    return listProposals(app.pg, user, { leadId: params.data.id })
  })

  app.get('/price-rules', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = priceRulesQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_price_rules_query' })

    return listPriceRules(app.pg, user, parsed.data.organizationId, parsed.data.packageId)
  })

  app.get('/decisions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = decisionsQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_decisions_query' })
    const versionIds = parsed.data.versionIds?.split(',').filter(Boolean) ?? []

    return listDecisions(app.pg, user, versionIds)
  })

  app.get('/diagnostics/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_lead_id' })

    return getDiagnostic(app.pg, user, params.data.id)
  })

  app.put('/diagnostics', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = diagnosticSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_diagnostic_payload' })

    return saveDiagnostic(app.pg, user, parsed.data)
  })

  app.post('/', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = createDraftSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_proposal_payload' })

    return reply.code(201).send(await createDraft(app.pg, user, parsed.data))
  })

  app.get('/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_proposal_id' })

    return getProposalById(app.pg, user, params.data.id)
  })

  app.patch('/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    const parsed = updateDraftSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_proposal_patch' })

    return updateDraft(app.pg, user, params.data.id, parsed.data)
  })

  app.put('/:id/items', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    const parsed = z.array(itemSchema).safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_proposal_items' })

    return replaceItems(app.pg, user, params.data.id, parsed.data)
  })

  app.get('/:id/versions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_proposal_id' })

    return listProposalVersions(app.pg, user, params.data.id)
  })

  app.post('/decisions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = portalDecisionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_decision_payload' })
    const validationError = validateDecision(parsed.data.decision, parsed.data.comment)
    if (validationError) return reply.code(400).send({ error: validationError })

    return reply.code(201).send(await submitPortalDecision(app.pg, user, parsed.data))
  })

  app.get('/:id/generation-runs', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_proposal_id' })

    return listGenerationRuns(app.pg, user, params.data.id)
  })

  app.get('/:id/conversion-runs', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_proposal_id' })

    return listConversionRuns(app.pg, user, params.data.id)
  })

  app.post('/:id/generate-draft', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_proposal_id' })

    return generateDraft(app.pg, user, params.data.id)
  })

  app.post('/:id/send', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_proposal_id' })

    return sendProposal(app.pg, user, params.data.id, publicBaseUrl(app))
  })

  app.post('/:id/retry-conversion', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_proposal_id' })
    await getProposalById(app.pg, user, params.data.id)

    const job = await app.jobQueue.add('proposal.convert', { proposalId: params.data.id, requestedBy: user.id })
    return reply.code(202).send({ success: true, conversion: { pending: true, jobId: job.id } })
  })
}

export async function registerPublicProposalRoutes(app: FastifyInstance) {
  app.get('/:token/decision', async (request, reply) => {
    const params = tokenParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'Link invalido.' })

    try {
      return await getPublicReview(app.pg, params.data.token)
    } catch {
      return reply.code(404).send({ error: 'Link invalido ou expirado.' })
    }
  })

  app.post('/:token/decision', async (request, reply) => {
    const params = tokenParams.safeParse(request.params)
    const parsed = publicDecisionSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'Decisao invalida.' })
    const validationError = validateDecision(parsed.data.decision, parsed.data.comment)
    if (validationError) return reply.code(400).send({ error: validationError })

    try {
      const result = await submitPublicDecision(app.pg, params.data.token, parsed.data)
      let conversion: unknown
      if (parsed.data.decision === 'approved') {
        const job = await app.jobQueue.add('proposal.convert', { proposalId: result.proposalId, source: 'public_token' })
        conversion = { pending: true, jobId: job.id }
      }
      return { success: true, decision: result.decision.decision, conversion }
    } catch {
      return reply.code(500).send({ error: 'Nao foi possivel registrar a decisao.' })
    }
  })
}
