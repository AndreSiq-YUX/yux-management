import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'
import { requireAuth } from '../../http/guards.js'
import { canAccess, requireAccess } from '../../policies/authorization.js'
import { runWithDatabaseRequestContext } from '../../db/request-context.js'
import { validatePackParameters } from './action-pack.js'
import { createActionEngineCapabilityRegistry } from './capabilities/index.js'
import { REVENUE_RECOVERY_PACK_V0 } from './packs/revenue-recovery-v0.js'
import { FUNNEL_NURTURE_PACK_V1 } from './packs/funnel-nurture-v1.js'
import { evaluateMissionReadiness, filterReadinessCorrectionLinks } from './readiness.js'
import {
  answerMissionClarification, approvePlanRevision, createMission, decideActionApproval, getMission, getPlan, listMissionApprovals, listMissionPlans, listMissions,
  getPublishedActionPackVersion, publishActionPackVersion, transitionMission, updateMissionDraft,
  type Queryable,
} from './repository.js'
import type { MissionStatus } from './types.js'
import { getAction, listMissionActions, resolveHumanTask, retryAction, skipAction, startMission } from './executor.js'
import { collectMissionMetrics } from './evaluator.js'
import { collectMissionEconomics } from './economics.js'
import { releaseResourceClaims } from './resource-claims.js'
import { buildActionEngineNfrSnapshot } from './operations-health.js'
import { createSimulationReport, getPublicSimulationReport, getPublicSimulationReportPdf, recordSimulationFeedback, revokeSimulationReport } from './simulation-reports.js'
import { DECISION_REASON_KEYS, exportDecisionFeedbackLearningEvidence } from './decision-feedback.js'
import { collectMissionBudgetBurnDown } from './budget-alerts.js'
import { listMissionCapabilityControls, setCapabilityControl } from './kill-switch-controls.js'
import { buildMissionArtifactProjections } from './mission-artifacts.js'
import { listMissionRecipes, resolveMissionRecipe } from './recipes.js'
import { cleanupMissionSandbox, seedMissionSandbox } from './sandbox-seeder.js'

const uuid = z.string().uuid()
const decimal = z.string().regex(/^\d+(\.\d{1,6})?$/)
const status = z.enum(['draft','qualifying','planning','pending_plan_approval','ready','active','paused','blocked','evaluating','pending_replan_approval','succeeded','failed','expired','cancelled'])
const organizationQuery = z.object({ organizationId: uuid })
const missionParams = z.object({ missionId: uuid })
const simulationTokenParams = z.object({ token: z.string().min(40).max(200) })
const versionCommand = z.object({ organizationId: uuid, expectedVersion: z.number().int().positive(), reason: z.string().min(3).max(1000) })
const missionGoal = z.object({
  statement: z.string().min(3).max(2000), requestedOutcome: z.string().min(1).max(200),
  scopeHints: z.array(z.string().min(1).max(100)).max(20).default([]),
  constraints: z.record(z.string(), z.unknown()).default({}),
  acceptanceCriteria: z.array(z.object({ key: z.string().min(1), operator: z.string().min(1), target: z.string(), unit: z.string() })).max(50).default([]),
})
const autonomyEnvelope = z.object({
  mode: z.enum(['shadow','prepare','assisted','autonomous']),
  allowedModules: z.array(z.string().min(1)).max(50), allowedCapabilityKeys: z.array(z.string().min(1)).max(500),
  maxTotalCostBrl: decimal, maxHumanHours: decimal, maxExternalContacts: z.number().int().nonnegative().optional(),
  expiresAt: z.string().datetime(), alwaysRequireApprovalFor: z.array(z.string().min(1)).max(100),
})
const missionCreate = z.object({
  organizationId: uuid, contractId: uuid.optional(), packKey: z.literal('revenue_recovery').default('revenue_recovery'),
  semanticVersion: z.enum(['0.1.0','0.2.0']).default('0.2.0'), title: z.string().min(3).max(200), objective: z.string().min(3).max(2000),
  mode: z.enum(['shadow','prepare','assisted','autonomous']).default('assisted'), deadlineAt: z.string().datetime(),
  goal: missionGoal.optional(), autonomyEnvelope: autonomyEnvelope.optional(),
  packSelection: z.record(z.string(), z.unknown()).optional(),
  parameters: z.object({
    targetRevenueBrl: decimal, deadlineDays: z.number().int().min(1).max(180).default(30),
    inactiveDays: z.number().int().min(7).max(3650).default(60), canarySize: z.number().int().min(1).max(20).default(20),
    maxPopulation: z.number().int().min(1).max(500).default(100), maxTotalCostBrl: decimal,
    maxHumanHours: decimal, humanHourlyRateBrl: decimal, minimumValueCostRatio: decimal.default('3'),
    channels: z.array(z.enum(['human_task','email','whatsapp','automation'])).min(1).default(['human_task']),
  }),
})
const missionIntentCreate = z.object({
  organizationId: uuid, contractId: uuid.optional(), title: z.string().min(3).max(200).optional(),
  objective: z.string().min(10).max(2000), mode: z.enum(['shadow','prepare','assisted','autonomous']).default('assisted'),
  deadlineAt: z.string().datetime(), allowedModules: z.array(z.string().min(1)).min(1).max(50),
  maxTotalCostBrl: decimal, maxHumanHours: decimal, maxExternalContacts: z.number().int().nonnegative().optional(),
  expectedValueBrl: decimal.optional(), quickStart: z.enum(['revenue_recovery','funnel_nurture']).optional(),
  recipeSelection: z.object({ key: z.string().min(1).max(100), version: z.number().int().positive(), contentHash: z.string().regex(/^[a-f0-9]{64}$/) }).optional(),
})
const clarificationAnswers = z.object({
  organizationId: uuid, expectedVersion: z.number().int().positive(),
  answers: z.record(z.string().min(1), z.unknown()).refine((value) => Object.keys(value).length > 0),
})
const missionPatch = z.object({
  organizationId: uuid, expectedVersion: z.number().int().positive(), title: z.string().min(3).max(200).optional(),
  objective: z.string().min(3).max(2000).optional(), deadlineAt: z.string().datetime().nullable().optional(),
  budget: z.record(z.string(), z.unknown()).optional(),
}).refine((value) => value.title !== undefined || value.objective !== undefined || value.deadlineAt !== undefined || value.budget !== undefined)

export async function registerActionEngineRoutes(app: FastifyInstance) {
  app.get('/public/simulation-reports/:token', async (request, reply) => {
    if (app.config.MISSION_SIMULATION_REPORTS_ENABLED === false) return reply.code(503).send({ error: 'mission_simulation_reports_disabled' })
    const parsed = simulationTokenParams.safeParse(request.params)
    if (!parsed.success) return reply.code(404).send({ error: 'simulation_report_not_found' })
    try { return await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [] }, () => getPublicSimulationReport(app.pg, parsed.data.token)) }
    catch (error) { return sendSimulationError(reply, error) }
  })

  app.get('/public/simulation-reports/:token/pdf', async (request, reply) => {
    if (app.config.MISSION_SIMULATION_REPORTS_ENABLED === false) return reply.code(503).send({ error: 'mission_simulation_reports_disabled' })
    const parsed = simulationTokenParams.safeParse(request.params)
    if (!parsed.success) return reply.code(404).send({ error: 'simulation_report_not_found' })
    try {
      const report = await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [] }, () => getPublicSimulationReportPdf(app.pg, parsed.data.token))
      return reply.type('application/pdf').header('Content-Disposition', `attachment; filename="simulacao-yux-${report.id}.pdf"`).send(report.pdf)
    } catch (error) { return sendSimulationError(reply, error) }
  })

  app.post('/public/simulation-reports/:token/feedback', async (request, reply) => {
    if (app.config.MISSION_DECISION_FEEDBACK_ENABLED === false) return reply.code(503).send({ error: 'mission_decision_feedback_disabled' })
    const params = simulationTokenParams.safeParse(request.params)
    const body = z.object({
      reviewerName: z.string().trim().min(2).max(100),
      decision: z.enum(['support','request_changes','reject']),
      reasonKey: z.enum(DECISION_REASON_KEYS).optional(),
      comment: z.string().trim().max(2000).optional(),
    }).superRefine((value, ctx) => {
      if (value.decision !== 'support' && !value.reasonKey) ctx.addIssue({ code: 'custom', message: 'reasonKey is required', path: ['reasonKey'] })
      if (value.decision === 'support' && value.reasonKey) ctx.addIssue({ code: 'custom', message: 'reasonKey is not allowed', path: ['reasonKey'] })
      if (value.reasonKey === 'other' && (value.comment?.trim().length ?? 0) < 3) ctx.addIssue({ code: 'custom', message: 'comment is required', path: ['comment'] })
    }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_simulation_feedback' })
    try { return reply.code(201).send(await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [] }, () => recordSimulationFeedback(app.pg, params.data.token, body.data))) }
    catch (error) { return sendSimulationError(reply, error) }
  })

  const registry = createActionEngineCapabilityRegistry()

  app.get('/capabilities', async (request) => {
    const ctx = requireAuth(request)
    requireAccess(ctx, 'action_engine.read')
    return registry.listMetadata()
  })

  app.get('/action-packs', async (request) => {
    const ctx = requireAuth(request)
    requireAccess(ctx, 'action_engine.read')
    return [publicPack(REVENUE_RECOVERY_PACK_V0), publicPack(FUNNEL_NURTURE_PACK_V1)]
  })

  app.get('/mission-recipes', async (request, reply) => {
    const ctx = requireAuth(request)
    const query = organizationQuery.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'invalid_mission_recipe_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    try { return await listMissionRecipes(app.pg) }
    catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/mission-recipes/:recipeKey/versions/:version/seed-sandbox', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ recipeKey: z.string().min(1).max(100), version: z.coerce.number().int().positive() }).safeParse(request.params)
    const body = z.object({ organizationId: uuid }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_mission_sandbox_seed' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      return reply.code(201).send(await seedMissionSandbox(app.pg, {
        organizationId: body.data.organizationId, recipeKey: params.data.recipeKey,
        recipeVersion: params.data.version, actorId: ctx.userId,
      }))
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.delete('/sandbox-seeds/:manifestId', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ manifestId: uuid }).safeParse(request.params)
    const body = z.object({ organizationId: uuid }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_mission_sandbox_cleanup' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try { return await cleanupMissionSandbox(app.pg, { organizationId: body.data.organizationId, manifestId: params.data.manifestId, actorId: ctx.userId }) }
    catch (error) { return sendDomainError(reply, error) }
  })

  app.get('/action-packs/:packKey/versions/:semanticVersion', async (request, reply) => {
    const ctx = requireAuth(request)
    requireAccess(ctx, 'action_engine.read')
    const parsed = z.object({ packKey: z.enum(['revenue_recovery','funnel_nurture']), semanticVersion: z.string().min(1).max(40) }).safeParse(request.params)
    if (!parsed.success) return reply.code(404).send({ error: 'action_pack_not_found' })
    if (parsed.data.packKey === FUNNEL_NURTURE_PACK_V1.key && parsed.data.semanticVersion === FUNNEL_NURTURE_PACK_V1.semanticVersion) return publicPack(FUNNEL_NURTURE_PACK_V1)
    if (parsed.data.semanticVersion === '0.1.0') {
      const legacy = await getPublishedActionPackVersion(app.pg, parsed.data.packKey, parsed.data.semanticVersion)
      if (!legacy) return reply.code(404).send({ error: 'action_pack_not_found' })
      return { ...legacy.definition, contentHash: legacy.content_hash }
    }
    if (parsed.data.packKey === REVENUE_RECOVERY_PACK_V0.key && parsed.data.semanticVersion === REVENUE_RECOVERY_PACK_V0.semanticVersion) return publicPack(REVENUE_RECOVERY_PACK_V0)
    return reply.code(404).send({ error: 'action_pack_not_found' })
  })

  app.get('/operations/health', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = organizationQuery.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_action_engine_health_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: parsed.data.organizationId })
    const [missions, actions, approvals, pack, planningLatency, executionHealth, snapshots, staleEnvelopes, actionsByMode] = await Promise.all([
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
         WHERE pack.key = 'revenue_recovery' AND version.semantic_version = '0.2.0'
           AND version.status IN ('published_for_internal_pilot','published') LIMIT 1`,
      ),
      app.pg.query<{ latency_ms: number | string }>(
        `SELECT latency_ms FROM public.action_planning_usage_entries
         WHERE organization_id = $1 AND nature = 'actual' AND created_at > NOW() - INTERVAL '24 hours'
         ORDER BY created_at DESC LIMIT 1000`, [parsed.data.organizationId],
      ),
      app.pg.query<{ latency_ms: number | string; available: boolean }>(
        `SELECT GREATEST(0, EXTRACT(EPOCH FROM (COALESCE(completed_at,NOW()) - started_at)) * 1000)::BIGINT AS latency_ms,
                status IN ('succeeded','running') AS available
         FROM public.action_run_attempts WHERE organization_id = $1 AND started_at > NOW() - INTERVAL '24 hours'
         ORDER BY started_at DESC LIMIT 5000`, [parsed.data.organizationId],
      ),
      app.pg.query<{ count: number | string; latest_hash: string | null }>(
        `SELECT COUNT(*)::INT AS count,
                (ARRAY_AGG(capability_catalog_hash ORDER BY created_at DESC))[1] AS latest_hash
         FROM public.action_mission_context_snapshots
         WHERE organization_id = $1 AND created_at > NOW() - INTERVAL '24 hours'`, [parsed.data.organizationId],
      ),
      app.pg.query<{ count: number | string }>(
        `SELECT COUNT(*)::INT AS count FROM public.action_missions
         WHERE organization_id = $1 AND status NOT IN ('succeeded','failed','expired','cancelled')
           AND NULLIF(autonomy_envelope->>'expiresAt','')::TIMESTAMPTZ <= NOW()`, [parsed.data.organizationId],
      ),
      app.pg.query<{ mode: string; count: number | string }>(
        `SELECT mission.mode, COUNT(run.id)::INT AS count
         FROM public.action_missions mission LEFT JOIN public.action_runs run ON run.mission_id = mission.id
         WHERE mission.organization_id = $1 GROUP BY mission.mode`, [parsed.data.organizationId],
      ),
    ])
    const nfr = buildActionEngineNfrSnapshot({
      planningLatencyMs: planningLatency.rows.map(row => Number(row.latency_ms)),
      executionLatencyMs: executionHealth.rows.map(row => Number(row.latency_ms)),
      executorAvailable: executionHealth.rows.map(row => row.available),
    })
    return {
      status: pack.rows[0]?.content_hash === REVENUE_RECOVERY_PACK_V0.contentHash ? 'ready' : 'degraded',
      agentHarnessConfigured: Boolean(app.config.YUX_AGENT_RUNTIME_URL),
      pack: { key: REVENUE_RECOVERY_PACK_V0.key, version: REVENUE_RECOVERY_PACK_V0.semanticVersion, hashMatches: pack.rows[0]?.content_hash === REVENUE_RECOVERY_PACK_V0.contentHash },
      missions: Object.fromEntries(missions.rows.map(row => [row.status, Number(row.count)])),
      actionFailures: Number(actions.rows[0]?.failed ?? 0),
      durableWaits: Number(actions.rows[0]?.waiting ?? 0),
      pendingApprovals: Number(approvals.rows[0]?.pending ?? 0),
      rollout: {
        missionSupervisorEnabled: app.config.MISSION_SUPERVISOR_ENABLED !== false,
        decisionsEnabled: app.config.MISSION_DECISIONS_ENABLED !== false,
        decisionNotificationsEnabled: app.config.MISSION_DECISION_NOTIFICATIONS_ENABLED !== false,
        simulationReportsEnabled: app.config.MISSION_SIMULATION_REPORTS_ENABLED !== false,
        decisionFeedbackEnabled: app.config.MISSION_DECISION_FEEDBACK_ENABLED !== false,
      },
      planner: {
        available: app.config.MISSION_SUPERVISOR_ENABLED !== false && Boolean(app.config.YUX_AGENT_RUNTIME_URL && app.config.YUX_AGENT_RUNTIME_TOKEN),
        harnessConfigured: Boolean(app.config.YUX_AGENT_RUNTIME_URL && app.config.YUX_AGENT_RUNTIME_TOKEN),
      },
      telemetryRedactionReady: Boolean(app.config.ACTION_ENGINE_TELEMETRY_REDACTION_KEY ?? app.config.ACTION_ENGINE_MUTATION_LEASE_SECRET),
      contextRetrieval: { status: Number(snapshots.rows[0]?.count ?? 0) > 0 ? 'observed' : 'no_recent_samples', recentSnapshots: Number(snapshots.rows[0]?.count ?? 0) },
      pinnedCapabilityCatalogHash: snapshots.rows[0]?.latest_hash ?? null,
      staleAutonomyEnvelopes: Number(staleEnvelopes.rows[0]?.count ?? 0),
      actionsByMode: Object.fromEntries(actionsByMode.rows.map(row => [row.mode, Number(row.count)])),
      nfr,
    }
  })

  app.post('/missions/:missionId/simulation-reports', async (request, reply) => {
    const ctx = requireAuth(request)
    if (app.config.MISSION_SIMULATION_REPORTS_ENABLED === false) return reply.code(503).send({ error: 'mission_simulation_reports_disabled' })
    const params = missionParams.safeParse(request.params)
    const body = z.object({ organizationId: uuid, planId: uuid, expiresInDays: z.number().int().min(1).max(7).default(7) }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_simulation_report_request' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      return reply.code(201).send(await createSimulationReport(app.pg, {
        organizationId: body.data.organizationId, missionId: params.data.missionId,
        planId: body.data.planId, createdBy: ctx.userId, expiresInDays: body.data.expiresInDays,
      }))
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/simulation-reports/:reportId/revoke', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = z.object({ reportId: uuid }).safeParse(request.params)
    const body = organizationQuery.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_simulation_report_revoke' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try { return await revokeSimulationReport(app.pg, { reportId: params.data.reportId, organizationId: body.data.organizationId }) }
    catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/readiness', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = z.object({
      organizationId: uuid, contractId: uuid.optional(), targetRevenueBrl: decimal, deadlineAt: z.string().datetime(),
      maxTotalCostBrl: decimal, maxHumanHours: decimal, humanHourlyRateBrl: decimal,
      packKey: z.enum(['revenue_recovery','funnel_nurture']).optional(),
    }).safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_mission_readiness_request' })
    requireAccess(ctx, 'action_engine.write', { organizationId: parsed.data.organizationId })
    return evaluateMissionReadiness(app.pg, {
      ...parsed.data,
      agentHarnessHealthy: Boolean(app.config.YUX_AGENT_RUNTIME_URL),
      mutationLeaseReady: Boolean(app.config.ACTION_ENGINE_MUTATION_LEASE_SECRET),
    })
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
      const packVersion = parsed.data.semanticVersion === REVENUE_RECOVERY_PACK_V0.semanticVersion
        ? await ensurePackVersion(app.pg, ctx.userId)
        : await getPublishedActionPackVersion(app.pg, parsed.data.packKey, parsed.data.semanticVersion)
      if (!packVersion) return reply.code(404).send({ error: 'action_pack_not_found' })
      const mission = await createMission(app.pg as never, {
        organizationId: parsed.data.organizationId, contractId: parsed.data.contractId, packVersionId: packVersion.id,
        title: parsed.data.title, objective: parsed.data.objective, mode: parsed.data.mode, parameters: parameterResult.data,
        goal: parsed.data.goal ?? {
          statement: parsed.data.objective, requestedOutcome: 'recovered_revenue', scopeHints: ['crm'],
          constraints: {}, acceptanceCriteria: [{ key: 'recovered_revenue_brl', operator: 'gte', target: parameterResult.data.targetRevenueBrl, unit: 'BRL' }],
        },
        autonomyEnvelope: parsed.data.autonomyEnvelope ?? {
          mode: parsed.data.mode, allowedModules: ['crm'], allowedCapabilityKeys: [],
          maxTotalCostBrl: parameterResult.data.maxTotalCostBrl, maxHumanHours: parameterResult.data.maxHumanHours,
          expiresAt: parsed.data.deadlineAt, alwaysRequireApprovalFor: ['external','irreversible'],
        },
        packSelection: parsed.data.packSelection ?? { strategy: 'explicit', packs: [{ key: parsed.data.packKey, version: parsed.data.semanticVersion }] },
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

  app.post('/missions/intents', async (request, reply) => {
    const ctx = requireAuth(request)
    const parsed = missionIntentCreate.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_mission_intent' })
    if (app.config.MISSION_SUPERVISOR_ENABLED === false) return reply.code(503).send({ error: 'mission_supervisor_disabled' })
    requireAccess(ctx, 'action_engine.write', { organizationId: parsed.data.organizationId })
    const idempotencyKey = readIdempotencyKey(request.headers['idempotency-key'])
    if (!idempotencyKey) return reply.code(400).send({ error: 'idempotency_key_required' })
    try {
      const recipe = parsed.data.recipeSelection
        ? await resolveMissionRecipe(app.pg, parsed.data.recipeSelection.key, parsed.data.recipeSelection.version)
        : null
      if (recipe && recipe.contentHash !== parsed.data.recipeSelection?.contentHash) return reply.code(409).send({ error: 'mission_recipe_hash_mismatch' })
      const recipePack = recipe?.packSelections[0]
      const packKey = recipePack?.key ?? selectIntentPack(parsed.data.quickStart, parsed.data.objective)
      if (recipe && (!recipePack || recipe.packSelections.length !== 1)) return reply.code(409).send({ error: 'mission_recipe_pack_selection_invalid' })
      if (recipe) {
        const allowedModules = Array.isArray(recipe.defaultGoal.allowedModules)
          ? recipe.defaultGoal.allowedModules.filter((item): item is string => typeof item === 'string')
          : []
        if (JSON.stringify([...parsed.data.allowedModules].sort()) !== JSON.stringify([...allowedModules].sort())) {
          return reply.code(409).send({ error: 'mission_recipe_non_editable_default_changed' })
        }
      }
      if (packKey === FUNNEL_NURTURE_PACK_V1.key && !(await hasFunnelNurtureEntitlement(app.pg, parsed.data.organizationId, parsed.data.contractId))) {
        return reply.code(403).send({ error: 'funnel_nurture_contract_flag_required' })
      }
      const packVersion = packKey === FUNNEL_NURTURE_PACK_V1.key
        ? await ensureFunnelNurturePackVersion(app.pg, ctx.userId)
        : await ensurePackVersion(app.pg, ctx.userId)
      const expectedValue = parsed.data.expectedValueBrl ?? '1'
      const deadlineDays = Math.max(1, Math.min(180, Math.ceil((Date.parse(parsed.data.deadlineAt) - Date.now()) / 86_400_000)))
      const parameters = {
        targetRevenueBrl: expectedValue, deadlineDays, inactiveDays: 60, canarySize: 20, maxPopulation: 100,
        maxTotalCostBrl: parsed.data.maxTotalCostBrl, maxHumanHours: parsed.data.maxHumanHours,
        humanHourlyRateBrl: '100', minimumValueCostRatio: '1', channels: ['human_task'] as const,
      }
      const mission = await createMission(app.pg as never, {
        organizationId: parsed.data.organizationId, contractId: parsed.data.contractId,
        packVersionId: packVersion.id, title: parsed.data.title?.trim() || parsed.data.objective.slice(0, 120),
        objective: parsed.data.objective, mode: parsed.data.mode, parameters,
        goal: {
          statement: parsed.data.objective, requestedOutcome: parsed.data.quickStart ?? 'supervisor_interpreted_outcome',
          scopeHints: parsed.data.allowedModules, constraints: {}, acceptanceCriteria: [],
        },
        autonomyEnvelope: {
          mode: parsed.data.mode, allowedModules: parsed.data.allowedModules, allowedCapabilityKeys: [],
          maxTotalCostBrl: parsed.data.maxTotalCostBrl, maxHumanHours: parsed.data.maxHumanHours,
          ...(parsed.data.maxExternalContacts !== undefined ? { maxExternalContacts: parsed.data.maxExternalContacts } : {}),
          expiresAt: parsed.data.deadlineAt, alwaysRequireApprovalFor: ['destructive'],
        },
        packSelection: {
          strategy: recipe ? 'versioned_recipe' : parsed.data.quickStart ? 'explicit_quick_start' : 'supervisor',
          packs: [{ key: packKey, version: recipePack?.version ?? (packKey === FUNNEL_NURTURE_PACK_V1.key ? FUNNEL_NURTURE_PACK_V1.semanticVersion : REVENUE_RECOVERY_PACK_V0.semanticVersion) }],
          ...(recipe ? { recipe: { key: recipe.key, version: recipe.version, contentHash: recipe.contentHash } } : {}),
        },
        budget: { maxTotalCostBrl: parsed.data.maxTotalCostBrl, maxHumanHours: parsed.data.maxHumanHours },
        deadlineAt: parsed.data.deadlineAt, createdBy: ctx.userId, idempotencyKey,
      })
      return reply.code(201).send(mission)
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.post('/missions/:missionId/clarification', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const body = clarificationAnswers.safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_mission_clarification' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      return await transaction(app.pg, (client) => answerMissionClarification(client, {
        missionId: params.data.missionId, organizationId: body.data.organizationId,
        expectedVersion: body.data.expectedVersion, answers: body.data.answers, actorId: ctx.userId,
      }))
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.get('/missions/:missionId/context-preview', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_mission_context_preview' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const snapshot = await app.pg.query<{
      id: string; context_hash: string; knowledge_items: Array<Record<string, unknown>>;
      strategy_items: Array<Record<string, unknown>>; source_ids: string[]; created_at: string | Date;
    }>(
      `SELECT id, context_hash, knowledge_items, strategy_items, source_ids, created_at
       FROM public.action_mission_context_snapshots
       WHERE mission_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 1`,
      [params.data.missionId, query.data.organizationId],
    )
    const row = snapshot.rows[0]
    if (!row) return { snapshotId: null, contextHash: null, sources: [], createdAt: null }
    const knowledge = (row.knowledge_items ?? []).map((item) => ({
      id: String(item.sourceId ?? item.id ?? ''), title: 'Base de conhecimento publicada', category: 'knowledge',
    }))
    const strategy = (row.strategy_items ?? []).map((item) => ({
      id: String(item.id ?? ''), title: 'Estratégia YUX aprovada', category: 'strategy',
    }))
    return {
      snapshotId: row.id, contextHash: row.context_hash,
      sources: [...knowledge, ...strategy].filter((item) => item.id),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    }
  })

  app.get('/missions/:missionId/artifacts', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_mission_artifacts_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const mission = await getMission(app.pg, params.data.missionId, query.data.organizationId)
    if (!mission) return reply.code(404).send({ error: 'mission_not_found' })
    const plans = await listMissionPlans(app.pg, mission.id, query.data.organizationId)
    const plan = plans[0] ? await getPlan(app.pg, String(plans[0].id), query.data.organizationId) : null
    if (!plan) return []
    const [actions, approvals, snapshot] = await Promise.all([
      listMissionActions(app.pg, mission.id, query.data.organizationId),
      listMissionApprovals(app.pg, mission.id, query.data.organizationId),
      app.pg.query<{ knowledge_items: Array<Record<string, unknown>>; strategy_items: Array<Record<string, unknown>> }>(
        `SELECT knowledge_items, strategy_items FROM public.action_mission_context_snapshots
         WHERE mission_id = $1 AND organization_id = $2 ORDER BY created_at DESC LIMIT 1`,
        [mission.id, query.data.organizationId],
      ),
    ])
    const row = snapshot.rows[0]
    const sources = [
      ...(row?.knowledge_items ?? []).map(item => ({ id: String(item.sourceId ?? item.id ?? ''), title: 'Base de conhecimento publicada', category: 'knowledge' })),
      ...(row?.strategy_items ?? []).map(item => ({ id: String(item.id ?? ''), title: 'Estratégia YUX aprovada', category: 'strategy' })),
    ].filter(item => item.id)
    return buildMissionArtifactProjections({ plan, actions, approvals, sources })
  })

  app.get('/missions/:missionId', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_mission_request' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const mission = await getMission(app.pg, params.data.missionId, query.data.organizationId)
    if (!mission) return reply.code(404).send({ error: 'mission_not_found' })
    const pack = await app.pg.query<{ metric_spec: Record<string, unknown>; content_hash: string }>(
      `SELECT definition->'metricSpec' AS metric_spec,content_hash
       FROM public.action_pack_versions WHERE id=$1 LIMIT 1`, [mission.packVersionId],
    )
    return {
      ...sanitizeMission(mission, ctx.role === 'yux_admin' || ctx.role === 'yux_operator'),
      metricSpec: pack.rows[0]?.metric_spec ?? {},
      packContentHash: pack.rows[0]?.content_hash ?? null,
    }
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
    if (app.config.MISSION_DECISIONS_ENABLED === false) return reply.code(503).send({ error: 'mission_decisions_disabled' })
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

  app.get('/missions/:missionId/operational-controls', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const query = organizationQuery.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_operational_controls_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    const mission = await getMission(app.pg, params.data.missionId, query.data.organizationId)
    if (!mission) return reply.code(404).send({ error: 'mission_not_found' })
    const readiness = await evaluateMissionReadiness(app.pg, {
      organizationId: query.data.organizationId, missionId: mission.id, contractId: mission.contractId,
      targetRevenueBrl: String(mission.parameters.targetRevenueBrl ?? mission.goal.constraints.expectedValueBrl ?? '0'),
      deadlineAt: mission.deadlineAt ?? mission.autonomyEnvelope.expiresAt,
      maxTotalCostBrl: mission.autonomyEnvelope.maxTotalCostBrl,
      maxHumanHours: mission.autonomyEnvelope.maxHumanHours,
      humanHourlyRateBrl: String(mission.parameters.humanHourlyRateBrl ?? mission.budget.humanHourlyRateBrl ?? '100'),
      packKey: Array.isArray(mission.packSelection.packs) && (mission.packSelection.packs[0] as { key?: string } | undefined)?.key === 'funnel_nurture' ? 'funnel_nurture' : 'revenue_recovery',
      agentHarnessHealthy: Boolean(app.config.YUX_AGENT_RUNTIME_URL), mutationLeaseReady: Boolean(app.config.ACTION_ENGINE_MUTATION_LEASE_SECRET),
    })
    const allowedAreas = [
      canAccess(ctx, 'platform.manage', { organizationId: query.data.organizationId }) ? 'platform' : null,
      canAccess(ctx, 'omnichannel.write', { organizationId: query.data.organizationId }) ? 'integrations' : null,
      canAccess(ctx, 'omnichannel.write', { organizationId: query.data.organizationId }) ? 'omnichannel' : null,
      canAccess(ctx, 'crm.write', { organizationId: query.data.organizationId }) ? 'crm' : null,
      canAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId }) ? 'missions' : null,
    ].filter((item): item is string => Boolean(item))
    const [budget, capabilities] = await Promise.all([
      collectMissionBudgetBurnDown(app.pg, mission.id, query.data.organizationId),
      listMissionCapabilityControls(app.pg, { missionId: mission.id, organizationId: query.data.organizationId }),
    ])
    return { budget, readiness: { ...readiness, checks: filterReadinessCorrectionLinks(readiness.checks, allowedAreas) }, capabilities, canManagePolicy: canAccess(ctx, 'action_engine.policy.manage', { organizationId: query.data.organizationId }) }
  })

  app.post('/missions/:missionId/capability-controls', async (request, reply) => {
    const ctx = requireAuth(request)
    const params = missionParams.safeParse(request.params)
    const body = z.object({ organizationId: uuid, capabilityKey: z.string().min(1).max(200), capabilityVersion: z.number().int().positive(), disabled: z.boolean(), reason: z.string().trim().min(3).max(1000) }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_capability_control' })
    requireAccess(ctx, 'action_engine.policy.manage', { organizationId: body.data.organizationId })
    try { return await transaction(app.pg, client => setCapabilityControl(client, { ...body.data, missionId: params.data.missionId, actorId: ctx.userId })) }
    catch (error) { return sendDomainError(reply, error) }
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
    if (app.config.MISSION_DECISIONS_ENABLED === false) return reply.code(503).send({ error: 'mission_decisions_disabled' })
    const params = z.object({ approvalId: uuid }).safeParse(request.params)
    const body = z.object({
      organizationId: uuid, subjectHash: z.string().regex(/^[a-f0-9]{64}$/),
      decision: z.enum(['approved','rejected','changes_requested']),
      reasonKey: z.enum(DECISION_REASON_KEYS).optional(), comment: z.string().trim().max(2000).optional(),
    }).superRefine((value, ctx) => {
      if (value.decision !== 'approved' && !value.reasonKey) ctx.addIssue({ code: 'custom', message: 'reasonKey is required', path: ['reasonKey'] })
      if (value.decision === 'approved' && value.reasonKey) ctx.addIssue({ code: 'custom', message: 'reasonKey is not allowed', path: ['reasonKey'] })
      if (value.reasonKey === 'other' && (value.comment?.trim().length ?? 0) < 3) ctx.addIssue({ code: 'custom', message: 'comment is required', path: ['comment'] })
    }).safeParse(request.body)
    if (!params.success || !body.success) return reply.code(400).send({ error: 'invalid_approval_decision' })
    requireAccess(ctx, 'action_engine.write', { organizationId: body.data.organizationId })
    try {
      const result = await decideActionApproval(app.pg as never, {
        approvalId: params.data.approvalId, organizationId: body.data.organizationId,
        subjectHash: body.data.subjectHash, decision: body.data.decision,
        reason: body.data.comment || body.data.reasonKey || 'Aprovado pela operação',
        reasonKey: body.data.reasonKey, decidedBy: ctx.userId,
      })
      if (result.runId && result.status === 'approved') await app.jobQueue.add('action-engine.executeAction', { actionRunId: result.runId, organizationId: body.data.organizationId, missionId: result.missionId })
      return result
    } catch (error) { return sendDomainError(reply, error) }
  })

  app.get('/decision-feedback/learning', async (request, reply) => {
    const ctx = requireAuth(request)
    const query = organizationQuery.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'invalid_decision_feedback_query' })
    requireAccess(ctx, 'action_engine.read', { organizationId: query.data.organizationId })
    return exportDecisionFeedbackLearningEvidence(app.pg, query.data.organizationId)
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
        return await transaction(app.pg, async (client) => {
          const updated = await transitionMission(client, {
            missionId: params.data.missionId, organizationId: body.data.organizationId,
            expectedVersion: body.data.expectedVersion, toStatus: commandStatus(command),
            actor: { type: 'user', id: ctx.userId }, reason: body.data.reason,
          })
          if (command === 'cancel') await releaseResourceClaims(client, params.data.missionId, body.data.organizationId)
          return updated
        })
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

async function ensureFunnelNurturePackVersion(client: Queryable, createdBy: string) {
  const { parameters: _parameters, ...definition } = FUNNEL_NURTURE_PACK_V1
  return publishActionPackVersion(client, {
    packKey: FUNNEL_NURTURE_PACK_V1.key, name: 'Funnel + Nurture',
    description: 'Criação governada de funil, copy citada, sequência e gatilho de nutrição.',
    semanticVersion: FUNNEL_NURTURE_PACK_V1.semanticVersion, outcomeType: FUNNEL_NURTURE_PACK_V1.outcomeType,
    definition: definition as unknown as Record<string, unknown>, contentHash: FUNNEL_NURTURE_PACK_V1.contentHash, createdBy,
  })
}

function selectIntentPack(quickStart: 'revenue_recovery' | 'funnel_nurture' | undefined, objective: string) {
  if (quickStart) return quickStart
  return /(funil|pipeline|nutri[cç][aã]o|sequ[eê]ncia\s+de\s+e-?mails?|automati[sz].*e-?mails?)/iu.test(objective)
    ? FUNNEL_NURTURE_PACK_V1.key
    : REVENUE_RECOVERY_PACK_V0.key
}

async function hasFunnelNurtureEntitlement(client: Queryable, organizationId: string, contractId?: string) {
  const result = await client.query<{ entitled: boolean }>(
    `SELECT organization.kind = 'yux' OR EXISTS (
       SELECT 1 FROM public.contracts contract
       JOIN public.contract_modules module ON module.contract_id = contract.id
       WHERE contract.client_id = organization.client_id AND contract.status = 'active'
         AND module.module_key = 'funnel_nurture_agent' AND module.enabled = TRUE
         AND ($2::UUID IS NULL OR contract.id = $2)
     ) AS entitled
     FROM public.organizations organization WHERE organization.id = $1 LIMIT 1`,
    [organizationId, contractId ?? null],
  )
  return result.rows[0]?.entitled === true
}

function publicPack(pack: typeof REVENUE_RECOVERY_PACK_V0 | typeof FUNNEL_NURTURE_PACK_V1) {
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
    mission_not_awaiting_clarification: 409,
    action_pack_version_hash_conflict: 409,
    plan_or_approval_not_found: 404, plan_not_pending_approval: 409, approval_subject_changed: 409,
    agent_harness_unavailable: 503,
    mission_not_ready: 409, mission_plan_not_approved: 409,
    approval_not_found: 404, approval_already_decided: 409, plan_approval_requires_version_context: 409,
    action_not_retryable: 409, action_skip_not_allowed: 409, action_not_human_task: 409,
    actual_minutes_required: 400, human_cost_rate_missing: 409,
    simulation_plan_not_found: 404, simulation_report_not_found: 404,
    simulation_report_requires_shadow_mode: 409,
    decision_feedback_reason_required: 400, decision_feedback_reason_invalid: 400, decision_feedback_reason_not_allowed: 400,
    decision_feedback_comment_required: 400, decision_feedback_comment_too_long: 400,
    mission_budget_maximum_invalid: 409, mission_capability_not_found: 404,
    mission_recipe_not_found: 404, mission_recipe_hash_mismatch: 409, mission_recipe_pack_unavailable: 409,
    mission_recipe_pack_selection_invalid: 409, mission_recipe_non_editable_default_changed: 409, mission_sandbox_not_entitled: 403,
    sandbox_manifest_not_found: 404, sandbox_seed_persistence_failed: 500,
  }
  return reply.code(statusCode[code] ?? 500).send({ error: statusCode[code] ? code : 'internal_error' })
}

function sendSimulationError(reply: FastifyReply, error: unknown) {
  const code = error instanceof Error ? error.message : 'simulation_report_error'
  const status = code === 'simulation_report_expired' ? 410
    : code === 'simulation_report_revoked' ? 410
      : code === 'simulation_report_token_invalid' ? 404
        : code.startsWith('decision_feedback_') ? 400
        : 500
  return reply.code(status).send({ error: status === 500 ? 'simulation_report_error' : code })
}
