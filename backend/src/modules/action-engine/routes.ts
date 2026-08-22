import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../http/guards.js'
import { requireAccess } from '../../policies/authorization.js'
import { validatePackParameters } from './action-pack.js'
import { createActionEngineCapabilityRegistry } from './capabilities/index.js'
import { REVENUE_RECOVERY_PACK_V0 } from './packs/revenue-recovery-v0.js'
import { evaluateMissionReadiness } from './readiness.js'
import {
  approvePlanRevision, createMission, decideActionApproval, getMission, getPlan, listMissionApprovals, listMissionPlans, listMissions,
  publishActionPackVersion, transitionMission, updateMissionDraft,
  type Queryable,
} from './repository.js'
import type { MissionStatus } from './types.js'
import { getAction, listMissionActions, resolveHumanTask, retryAction, skipAction, startMission } from './executor.js'
import { collectMissionMetrics } from './evaluator.js'
import { collectMissionEconomics } from './economics.js'

const uuid = z.string().uuid()
const decimal = z.string().regex(/^\d+(\.\d{1,6})?$/)
const status = z.enum(['draft','qualifying','planning','pending_plan_approval','ready','active','paused','blocked','evaluating','pending_replan_approval','succeeded','failed','expired','cancelled'])
const organizationQuery = z.object({ organizationId: uuid })
const missionParams = z.object({ missionId: uuid })
const versionCommand = z.object({ organizationId: uuid, expectedVersion: z.number().int().positive(), reason: z.string().min(3).max(1000) })
const missionCreate = z.object({
  organizationId: uuid, contractId: uuid.optional(), packKey: z.literal('revenue_recovery').default('revenue_recovery'),
  semanticVersion: z.literal('0.1.0').default('0.1.0'), title: z.string().min(3).max(200), objective: z.string().min(3).max(2000),
  mode: z.enum(['shadow','prepare','assisted']).default('assisted'), deadlineAt: z.string().datetime(),
  parameters: z.object({
    targetRevenueBrl: decimal, deadlineDays: z.number().int().min(1).max(180).default(30),
    inactiveDays: z.number().int().min(7).max(3650).default(60), canarySize: z.number().int().min(1).max(20).default(20),
    maxPopulation: z.number().int().min(1).max(500).default(100), maxTotalCostBrl: decimal,
    maxHumanHours: decimal, humanHourlyRateBrl: decimal, minimumValueCostRatio: decimal.default('3'),
    channels: z.array(z.enum(['human_task','email','whatsapp','automation'])).min(1).default(['human_task']),
  }),
})
const missionPatch = z.object({
  organizationId: uuid, expectedVersion: z.number().int().positive(), title: z.string().min(3).max(200).optional(),
  objective: z.string().min(3).max(2000).optional(), deadlineAt: z.string().datetime().nullable().optional(),
  budget: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.title !== undefined || value.objective !== undefined || value.deadlineAt !== undefined || value.budget !== undefined)

export async function registerActionEngineRoutes(app: FastifyInstance) {
  const registry = createActionEngineCapabilityRegistry()

  app.get('/capabilities', async (request) => {
    const ctx = requireAuth(request)
    requireAccess(ctx, 'action_engine.read')
    return registry.listMetadata()
  })

  app.get('/action-packs', async (request) => {
    const ctx = requireAuth(request)
    requireAccess(ctx, 'action_engine.read')
    return [publicPack(REVENUE_RECOVERY_PACK_V0)]
  })

  app.get('/action-packs/:packKey/versions/:semanticVersion', async (request, reply) => {
    const ctx = requireAuth(request)
    requireAccess(ctx, 'action_engine.read')
    const parsed = z.object({ packKey: z.literal('revenue_recovery'), semanticVersion: z.literal('0.1.0') }).safeParse(request.params)
    if (!parsed.success) return reply.code(404).send({ error: 'action_pack_not_found' })
    return publicPack(REVENUE_RECOVERY_PACK_V0)
  })

  app.get('/operations/health', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = organizationQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_action_engine_health_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: parsed.data.organizationId })
    const [missions, actions, approvals, pack] = await Promise.all([
      app.pg.query<{ status: string; count: number | string }>(
        `SELECT status, COUNT(*)::INT AS count FROM public.action_missions
         WHERE organization_id = $1 GROUP BY status`, [parsed.data.organizationId],
      ),
      app.pg.query<{ failed: number | string; waiting: number | string }>(
        `SELECT COUNT(*) FILTER (WHERE run.status IN ('failed','blocked'))::INT AS failed,
                COUNT(*) FILTER (WHERE run.status = 'running' AND run.claimed_by = 'durable_wait')::INT AS waiting
         FROM public.action_runs run WHERE run.organization_id = $1`, [parsed.data.organizationId],
      ),
      app.pg.query<{ pending: number | string }>(
        `SELECT COUNT(*) FILTER (WHERE status = 'pending')::INT AS pending
         FROM public.action_approvals WHERE organization_id = $1`, [parsed.data.organizationId],
      ),
      app.pg.query<{ content_hash: string }>(
        `SELECT version.content_hash FROM public.action_pack_versions version
         JOIN public.action_packs pack ON pack.id = version.pack_id
         WHERE pack.key = 'revenue_recovery' AND version.semantic_version = '0.1.0'
           AND version.status IN ('published_for_internal_pilot','published') LIMIT 1`,
      ),
    ])
    return {
      status: pack.rows[0]?.content_hash === REVENUE_RECOVERY_PACK_V0.contentHash ? 'ready' : 'degraded',
      agentHarnessConfigured: Boolean(app.config.YUX_AGENT_RUNTIME_URL),
      pack: { key: REVENUE_RECOVERY_PACK_V0.key, version: REVENUE_RECOVERY_PACK_V0.semanticVersion, hashMatches: pack.rows[0]?.content_hash === REVENUE_RECOVERY_PACK_V0.contentHash },
      missions: Object.fromEntries(missions.rows.map(row => [row.status, Number(row.count)])),
      actionFailures: Number(actions.rows[0]?.failed ?? 0),
      durableWaits: Number(actions.rows[0]?.waiting ?? 0),
      pendingApprovals: Number(approvals.rows[0]?.pending ?? 0),
    }
  })

  app.post('/readiness', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = z.object({
      organizationId: uuid, contractId: uuid.optional(), targetRevenueBrl: decimal, deadlineAt: z.string().datetime(),
      maxTotalCostBrl: decimal, maxHumanHours: decimal, humanHourlyRateBrl: decimal,
    }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_mission_readiness_request' })
    requireAccess(ctx, 'action_engine.write', { organizationId: parsed.data.organizationId })
    return evaluateMissionReadiness(app.pg, { ...parsed.data, agentHarnessHealthy: Boolean(app.config.YUX_AGENT_RUNTIME_URL) })
  })

  app.get('/missions', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = z.object({ organizationId: uuid, status: z.union([status, z.array(status)]).optional(), limit: z.coerce.number().int().optional(), offset: z.coerce.number().int().optional() }).safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_mission_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: parsed.data.organizationId })
    const statuses = parsed.data.status ? (Array.isArray(parsed.data.status) ? parsed.data.status : [parsed.data.status]) as MissionStatus[] : undefined
    const missions = await listMissions(app.pg, { organizationId: parsed.data.organizationId, statuses, limit: parsed.data.limit, offset: parsed.data.offset })
    return missions.map((mission) => sanitizeMission(mission, ctx.role === 'yux_admin' || ctx.role === 'yux_operator'))
  })

  app.post('/missions', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = missionCreate.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_mission' })
    requireAccess(ctx, 'action_engine.write', { organizationId: parsed.data.organizationId })
    const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key'])
    if (!idempotencyKey) return reply.code(400).send({ error: 'idempotency_key_required' })
    const parameterResult = validatePackParameters(parsed.data.parameters, REVENUE_RECOVERY_PACK_V0)
    if (!parameterResult.success) return reply.code(400).send({ error: 'invalid_action_pack_parameters' })
    if (parameterResult.data.channels.some((channel) => channel !== 'human_task')) {
      return reply.code(400).send({ error: 'mission_channel_not_enabled_for_pilot' })
    }
    try {
      const packVersion = await ensurePackVersion(app.pg, ctx.userId)
      const mission = await createMission(app.pg as never, {
        organizationId: parsed.data.organizationId, contractId: parsed.data.contractId, packVersionId: packVersion.id,
        title: parsed.data.title, objective: parsed.data.objective, mode: parsed.data.mode, parameters: parameterResult.data,
        budget: {
          maxTotalCostBrl: parameterResult.data.maxTotalCostBrl, maxHumanHours: parameterResult.data.maxHumanHours,
          humanHourlyRateBrl: parameterResult.data.humanHourlyRateBrl,
        }, deadlineAt: parsed.data.deadlineAt, createdBy: ctx.userId, idempotencyKey,
      })
      return reply.code(201).send(mission)
    } catch (error) {
      return sendDomainError(reply, error)
    }
  })

  app.get('/missions/:missionId', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_mission_request' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const mission = await getMission(app.pg, params.data.missionId, query.data.organizationId)
    if (!mission) return reply.code(404).send({ error: 'mission_not_found' })
    return sanitizeMission(mission, ctx.role === 'yux_admin' || ctx.role === 'yux_operator')
  })

  app.patch('/missions/:missionId', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const body = missionPatch.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_mission_patch' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      return await updateMissionDraft(app.pg as never, { missionId: params.data.missionId, ...body.data, actor: { type: 'user', id: ctx.userId } })
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/missions/:missionId/plan', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const body = versionCommand.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_mission_plan_command' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      const current = await getMission(app.pg, params.data.missionId, body.data.organizationId)
      if (!current) return reply.code(404).send({ error: 'mission_not_found' })
      let planningVersion: number
      if (current.status === 'planning' && current.version === body.data.expectedVersion + 1) {
        planningVersion = current.version
      } else {
        const updated = await transaction(app.pg, (client) => transitionMission(client, {
          missionId: params.data.missionId, organizationId: body.data.organizationId,
          expectedVersion: body.data.expectedVersion, toStatus: 'planning',
          actor: { type: 'user', id: ctx.userId }, reason: body.data.reason,
        }))
        planningVersion = updated.version
      }
      const job = await app.jobQueue.add('action-engine.planMission', {
        missionId: params.data.missionId, organizationId: body.data.organizationId, requestedVersion: planningVersion,
      })
      return reply.code(202).send({ missionId: params.data.missionId, missionVersion: planningVersion, jobId: job.id ?? null })
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.get('/missions/:missionId/plans', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_plan_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const plans = await listMissionPlans(app.pg, params.data.missionId, query.data.organizationId)
    return plans.map((plan) => sanitizePlan(plan, ctx.role === 'yux_admin' || ctx.role === 'yux_operator'))
  })

  app.get('/plans/:planId', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ planId: uuid }).safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_plan_request' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const plan = await getPlan(app.pg, params.data.planId, query.data.organizationId)
    if (!plan) return reply.code(404).send({ error: 'plan_not_found' })
    return sanitizePlan(plan, ctx.role === 'yux_admin' || ctx.role === 'yux_operator')
  })

  app.post('/plans/:planId/submit', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ planId: uuid }).safeParse(request.params)
    const body = z.object({
      organizationId: uuid, missionId: uuid, approvalId: uuid, expectedMissionVersion: z.number().int().positive(),
      subjectHash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.literal('approved'), reason: z.string().min(3).max(1000),
    }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_plan_approval' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      const mission = await approvePlanRevision(app.pg as never, {
        organizationId: body.data.organizationId, missionId: body.data.missionId, planId: params.data.planId,
        approvalId: body.data.approvalId, expectedMissionVersion: body.data.expectedMissionVersion,
        subjectHash: body.data.subjectHash, decidedBy: ctx.userId, reason: body.data.reason,
      })
      if (mission.status === 'active') await app.jobQueue.add('action-engine.scheduleReadyActions', { missionId: mission.id })
      return mission
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/missions/:missionId/start', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const body = versionCommand.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_mission_start' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      const result = await startMission(app.pg as never, {
        organizationId: body.data.organizationId, missionId: params.data.missionId,
        expectedVersion: body.data.expectedVersion, actorId: ctx.userId,
      })
      await app.jobQueue.add('action-engine.scheduleReadyActions', { missionId: params.data.missionId })
      return result
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.get('/missions/:missionId/actions', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_action_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    return listMissionActions(app.pg, params.data.missionId, query.data.organizationId)
  })

  app.get('/missions/:missionId/metrics', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_metric_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    return collectMissionMetrics(app.pg, params.data.missionId, query.data.organizationId)
  })

  app.get('/missions/:missionId/economics', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_economics_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const economics = await collectMissionEconomics(app.pg, params.data.missionId, query.data.organizationId)
    const internal = ctx.role === 'yux_admin' || ctx.role === 'yux_operator'
    return internal ? economics : sanitizeEconomics(economics)
  })

  app.get('/actions/:actionId', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ actionId: uuid }).safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_action_request' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const action = await getAction(app.pg, params.data.actionId, query.data.organizationId)
    if (!action) return reply.code(404).send({ error: 'action_not_found' })
    return action
  })

  app.post('/missions/:missionId/evaluate', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const body = z.object({ organizationId: uuid, checkpointKey: z.string().min(1).max(100).default('manual') }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_evaluation_request' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    const job = await app.jobQueue.add('action-engine.evaluateMission', {
      missionId: params.data.missionId, organizationId: body.data.organizationId, checkpointKey: body.data.checkpointKey,
    })
    return reply.code(202).send({ missionId: params.data.missionId, checkpointKey: body.data.checkpointKey, jobId: job.id ?? null })
  })

  app.get('/missions/:missionId/approvals', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_approval_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    return listMissionApprovals(app.pg, params.data.missionId, query.data.organizationId)
  })

  app.post('/approvals/:approvalId/decide', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ approvalId: uuid }).safeParse(request.params)
    const body = z.object({ organizationId: uuid, subjectHash: z.string().regex(/^[a-f0-9]{64}$/), decision: z.enum(['approved','rejected','changes_requested']), comment: z.string().min(3).max(1000) }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_approval_decision' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      const result = await decideActionApproval(app.pg as never, {
        approvalId: params.data.approvalId, organizationId: body.data.organizationId,
        subjectHash: body.data.subjectHash, decision: body.data.decision, reason: body.data.comment, decidedBy: ctx.userId,
      })
      if (result.runId && result.status === 'approved') await app.jobQueue.add('action-engine.executeAction', { actionRunId: result.runId, organizationId: body.data.organizationId, missionId: result.missionId })
      return result
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/actions/:actionId/retry', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ actionId: uuid }).safeParse(request.params)
    const body = z.object({ organizationId: uuid, reason: z.string().min(3).max(1000) }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_action_retry' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      const result = await retryAction(app.pg as never, { actionId: params.data.actionId, ...body.data })
      await app.jobQueue.add('action-engine.executeAction', { actionRunId: result.id, organizationId: body.data.organizationId, missionId: result.missionId })
      return result
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/actions/:actionId/skip', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ actionId: uuid }).safeParse(request.params)
    const body = z.object({ organizationId: uuid, reason: z.string().min(3).max(1000) }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_action_skip' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try { return await skipAction(app.pg as never, { actionId: params.data.actionId, ...body.data }) }
    catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/actions/:actionId/resolve-human-task', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ actionId: uuid }).safeParse(request.params)
    const body = z.object({ organizationId: uuid, actualMinutes: z.number().int().positive().max(24 * 60), result: z.record(z.string(), z.unknown()).default({}) }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_human_task_resolution' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      const result = await resolveHumanTask(app.pg as never, { actionId: params.data.actionId, ...body.data, actorId: ctx.userId })
      await app.jobQueue.add('action-engine.scheduleReadyActions', { missionId: result.missionId })
      return result
    }
    catch (error) { return sendDomainError(reply, error) }
  })

  for (const command of ['qualify','pause','resume','cancel'] as const) {
    app.post(`/missions/:missionId/${command}`, async (request, reply) => {
      const ctx = requireAuth(request)
      const params = missionParams.safeParse(request.params)
      const body = versionCommand.safeParse(request.body)
      if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_mission_command' })
      requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
      try {
        return await transaction(app.pg, (client) => transitionMission(client, {
          missionId: params.data.missionId, organizationId: body.data.organizationId,
          expectedVersion: body.data.expectedVersion, toStatus: commandStatus(command),
          actor: { type: 'user', id: ctx.userId }, reason: body.data.reason,
        }))
      } catch (error) { return sendDomainError(reply, error) }
    })
  }
}

async function ensurePackVersion(client: Queryable, createdBy: string) {
  const { parameters: _parameters, ...definition } = REVENUE_RECOVERY_PACK_V0
  return publishActionPackVersion(client, {
    packKey: REVENUE_RECOVERY_PACK_V0.key, name: 'Revenue Recovery',
    description: 'Recuperação governada de receita sobre capacidades existentes do YUX Hub.',
    semanticVersion: REVENUE_RECOVERY_PACK_V0.semanticVersion, outcomeType: REVENUE_RECOVERY_PACK_V0.outcomeType,
    definition: definition as unknown as Record<string, unknown>, contentHash: REVENUE_RECOVERY_PACK_V0.contentHash, createdBy,
  })
}

function publicPack(pack: typeof REVENUE_RECOVERY_PACK_V0) {
  const { parameters: _parameters, ...serializable } = pack
  return serializable
}

function sanitizeMission<T extends { budget: Record<string, unknown> }>(mission: T, internal: boolean) {
  if (internal) return mission
  const { humanHourlyRateBrl: _rate, internalCostBrl: _internalCost, marginBrl: _margin, ...budget } = mission.budget
  return { ...mission, budget }
}

function sanitizePlan(plan: Record<string, unknown>, internal: boolean) {
  if (internal) return plan
  const { proposedPayload: _proposal, compiledPayload: _compiled, estimatedEconomics: rawEconomics, ...safe } = plan
  const economics = rawEconomics && typeof rawEconomics === 'object'
    ? Object.fromEntries(Object.entries(rawEconomics as Record<string, unknown>).filter(([key]) => !['humanCost','aiAndProviderCost','marginBrl','internalCostBrl'].includes(key)))
    : rawEconomics
  return { ...safe, estimatedEconomics: economics }
}

function sanitizeEconomics(economics: Awaited<ReturnType<typeof collectMissionEconomics>>) {
  return {
    producedValueBrl: economics.producedValueBrl,
    humanFreeExecutionRate: economics.humanFreeExecutionRate,
  }
}

function commandStatus(command: 'qualify' | 'pause' | 'resume' | 'cancel'): MissionStatus {
  return ({ qualify: 'qualifying', pause: 'paused', resume: 'active', cancel: 'cancelled' } as const)[command]
}

function readIdempotencyKey(value: string | string[] | undefined): string | null {
  const key = Array.isArray(value) ? value[0] : value
  return key?.trim().slice(0, 200) || null
}

async function transaction<T>(pool: FastifyInstance['pg'], work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally { client.release() }
}

function sendDomainError(reply: FastifyReply, error: unknown) {
  const code = error instanceof Error ? error.message : 'internal_error'
  const statusCode: Record<string, number> = {
    mission_not_found: 404, mission_transition_not_allowed: 409, mission_terminal: 409,
    mission_version_conflict: 409, mission_not_draft: 409, idempotency_conflict: 409,
    action_pack_version_hash_conflict: 409,
    plan_or_approval_not_found: 404, plan_not_pending_approval: 409, approval_subject_changed: 409,
    agent_harness_unavailable: 503,
    mission_not_ready: 409, mission_plan_not_approved: 409,
    approval_not_found: 404, approval_already_decided: 409, plan_approval_requires_version_context: 409,
    action_not_retryable: 409, action_skip_not_allowed: 409, action_not_human_task: 409,
    actual_minutes_required: 400, human_cost_rate_missing: 409,
  }
  return reply.code(statusCode[code] ?? 500).send({ error: statusCode[code] ? code : 'internal_error' })
}
