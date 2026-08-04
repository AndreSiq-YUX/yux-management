import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { getProspectingPolicy, recordChannelPermission } from './repository.js'
import { approveProspectingPlan, createProspectingPlan, listProspectingPlans, saveProspectingPolicy, startProspectingPlan } from './service.js'

const uuid = z.string().uuid()
const channel = z.enum(['email', 'whatsapp', 'phone', 'task'])
const policySchema = z.object({
  organizationId: uuid,
  crmInstanceId: uuid.nullable().optional(),
  defaultSequenceId: uuid.nullable().optional(),
  whatsappConnectionId: uuid.nullable().optional(),
  enabled: z.boolean(),
  killSwitch: z.boolean(),
  dailyLimit: z.number().int().min(1).max(10_000),
  maxAttemptsPerLead: z.number().int().min(1).max(100),
  quietHours: z.object({ timezone: z.string().min(1), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) }),
  legalReviewed: z.boolean(),
})
const permissionSchema = z.object({
  organizationId: uuid,
  leadId: uuid.nullable().optional(),
  channel: z.enum(['email', 'whatsapp', 'phone']),
  address: z.string().min(1),
  status: z.enum(['unknown', 'granted', 'revoked']),
  source: z.string().min(1),
  noticeCode: z.string().optional(),
  noticeVersion: z.string().optional(),
  evidence: z.record(z.string(), z.unknown()).optional(),
})
const planSchema = z.object({
  organizationId: uuid,
  radarOpportunityId: uuid,
  sequenceId: uuid.optional(),
  primaryChannel: channel,
  fallbackChannel: channel.optional(),
})

async function user(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies[request.server.config.SESSION_COOKIE_NAME]
  if (!token) return null
  return request.server.authStore.findUserBySession(hashSessionToken(token), new Date())
}

export async function registerProspectingRoutes(app: FastifyInstance) {
  app.get('/policy', async (request, reply) => {
    const auth = await user(request, reply)
    if (!auth) return reply.code(401).send({ error: 'not_authenticated' })
    if (auth.role !== 'yux_admin' && auth.role !== 'yux_operator') return reply.code(403).send({ error: 'prospecting_forbidden' })
    const parsed = z.object({ organizationId: uuid }).safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_prospecting_policy_query' })
    return getProspectingPolicy(app.pg, parsed.data.organizationId)
  })

  app.put('/policy', async (request, reply) => {
    const auth = await user(request, reply)
    if (!auth) return reply.code(401).send({ error: 'not_authenticated' })
    const parsed = policySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_prospecting_policy' })
    return saveProspectingPolicy(app.pg, auth, parsed.data)
  })

  app.post('/permissions', async (request, reply) => {
    const auth = await user(request, reply)
    if (!auth) return reply.code(401).send({ error: 'not_authenticated' })
    if (auth.role !== 'yux_admin' && auth.role !== 'yux_operator') return reply.code(403).send({ error: 'prospecting_forbidden' })
    const parsed = permissionSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_channel_permission' })
    return reply.code(201).send(await recordChannelPermission(app.pg, { ...parsed.data, recordedBy: auth.id }))
  })

  app.post('/plans', async (request, reply) => {
    const auth = await user(request, reply)
    if (!auth) return reply.code(401).send({ error: 'not_authenticated' })
    const parsed = planSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_prospecting_plan' })
    return reply.code(201).send(await createProspectingPlan(app.pg, auth, parsed.data))
  })

  app.get('/plans', async (request, reply) => {
    const auth = await user(request, reply)
    if (!auth) return reply.code(401).send({ error: 'not_authenticated' })
    const parsed = z.object({ organizationId: uuid, radarOpportunityId: uuid.optional() }).safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_prospecting_plan_query' })
    return listProspectingPlans(app.pg, auth, parsed.data.organizationId, parsed.data.radarOpportunityId)
  })

  app.post('/plans/:id/approve', async (request, reply) => {
    const auth = await user(request, reply)
    if (!auth) return reply.code(401).send({ error: 'not_authenticated' })
    const parsed = z.object({ id: uuid }).safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_prospecting_plan_id' })
    return approveProspectingPlan(app.pg, auth, parsed.data.id)
  })

  app.post('/plans/:id/start', async (request, reply) => {
    const auth = await user(request, reply)
    if (!auth) return reply.code(401).send({ error: 'not_authenticated' })
    const parsed = z.object({ id: uuid }).safeParse(request.params)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_prospecting_plan_id' })
    return startProspectingPlan(app.pg, auth, parsed.data.id)
  })
}
