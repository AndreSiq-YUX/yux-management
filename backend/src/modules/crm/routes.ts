import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { requireAuth } from '../../http/guards.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'
import {
  createLead,
  createLeadInteraction,
  createLeadTask,
  enrollLeadInSequence,
  getCrmGovernanceContext,
  listLeadInteractions,
  listCrmSequences,
  listLeadEnrollments,
  listLeadExecutions,
  listLeads,
  listLeadTasks,
  moveLeadToStage,
  patchLead,
  updateEnrollment,
} from './repository.js'
import {
  createPipeline,
  createPipelineStage,
  listPipelines,
  patchPipeline,
  patchPipelineStage,
  reorderPipelineStages,
} from './pipeline-repository.js'
import { listCrmTasks, patchCrmTask } from './task-repository.js'
import {
  createScoringRule,
  deactivateScoringRule,
  getActiveScoringModel,
  getScoringModelById,
  listActiveScoringRules,
  listLeadScoreEvents,
  updateScoringModel,
  updateScoringRule,
} from './scoring-repository.js'
import { combinedScore, matchesScoringRule } from './scoring-engine.js'
import { recordDomainEvent } from '../events/repository.js'
import { DOMAIN_EVENT_TYPES } from '../events/catalog.js'

const conversationAllowedTables = new Set([
  'leads',
  'conversations',
  'lead_conversation_links',
  'lead_ai_insights',
  'lead_ai_field_suggestions',
  'lead_response_suggestions',
  'lead_sla_events',
  'crm_quick_replies',
  'crm_message_templates',
  'lead_handoff_locks',
])

const closingAllowedTables = new Set([
  'lead_proposal_recommendations',
  'proposal_view_events',
  'proposal_follow_up_tasks',
  'proposal_objections',
  'proposal_closing_checklists',
  'proposal_conversion_runs',
])

const opsAllowedTables = new Set([
  'crm_instances',
  'crm_instance_members',
  'crm_teams',
  'crm_team_members',
  'crm_configuration_publications',
  'crm_pipeline_stages',
  'lead_next_actions',
  'lead_saved_views',
  'lead_imports',
  'lead_import_rows',
  'lead_stage_history',
  'lead_tags',
  'lead_tag_assignments',
  'lead_sources',
  'lead_attribution_events',
  'lead_source_rollups',
  'crm_mroi_alerts',
  'campaign_crm_performance_snapshots',
  'crm_report_exports',
  'leads',
])

const conversationTableRules = createScopedTableRules(
  ['leads', 'conversations', 'crm_quick_replies', 'crm_message_templates'],
  ['lead_conversation_links', 'lead_ai_insights', 'lead_ai_field_suggestions', 'lead_response_suggestions', 'lead_sla_events', 'lead_handoff_locks'],
)

const closingTableRules = createScopedTableRules([], [...closingAllowedTables])

const opsTableRules = createScopedTableRules(
  ['crm_instances', 'lead_imports', 'lead_tags', 'lead_sources', 'lead_source_rollups', 'crm_mroi_alerts', 'campaign_crm_performance_snapshots', 'crm_report_exports', 'leads'],
  ['crm_instance_members', 'crm_teams', 'crm_team_members', 'crm_configuration_publications', 'crm_pipeline_stages', 'lead_next_actions', 'lead_saved_views', 'lead_import_rows', 'lead_stage_history', 'lead_tag_assignments'],
)

const optionalUuid = z.string().uuid().optional()

const leadQuerySchema = z.object({
  organizationId: optionalUuid,
  pipelineId: optionalUuid,
  crmInstanceId: optionalUuid,
})

const leadInputSchema = z.object({
  organizationId: z.string().uuid(),
  crmInstanceId: optionalUuid,
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  teamId: optionalUuid,
  ownerMemberId: optionalUuid,
  pipelineVersionId: optionalUuid,
  stageVersionId: optionalUuid,
  assignmentState: z.string().optional(),
  assignmentMode: z.string().optional(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  source: z.string().min(1),
  sourceKind: z.string().optional(),
  status: z.string().optional(),
  score: z.number().int().min(0).max(100).optional(),
  value: z.number().optional(),
  notes: z.string().optional(),
  ownerId: optionalUuid,
  assignedTo: optionalUuid,
  lastActivityAt: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
  attributionContext: z.record(z.string(), z.unknown()).optional(),
})

const leadPatchSchema = leadInputSchema.partial().extend({
  stage: z.string().optional(),
  lostReason: z.string().nullable().optional(),
  wonAt: z.string().nullable().optional(),
  lostAt: z.string().nullable().optional(),
})

const interactionInputSchema = z.object({
  organizationId: z.string().uuid(),
  type: z.enum(['call', 'email', 'meeting', 'note']),
  title: z.string().min(1),
  description: z.string().min(1),
  date: z.string().optional(),
})

const taskInputSchema = z.object({
  organizationId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  dueAt: z.string().min(1),
  assignedTo: optionalUuid,
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
})

const taskQuerySchema = z.object({
  organizationId: z.string().uuid(),
  crmInstanceId: z.string().uuid(),
  status: z.enum(['pending', 'completed', 'cancelled']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: optionalUuid,
  leadId: optionalUuid,
  due: z.enum(['overdue', 'today', 'upcoming']).optional(),
  search: z.string().trim().max(120).optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
})

const taskPatchSchema = z.object({
  title: z.string().trim().min(1).max(240).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  dueAt: z.string().datetime().optional(),
  assignedTo: optionalUuid.nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  status: z.enum(['pending', 'completed', 'cancelled']).optional(),
})

const scoringModelQuerySchema = z.object({ crmInstanceId: z.string().uuid() })
const scoringModelPatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  fitWeight: z.number().int().min(0).max(100).optional(),
  intentWeight: z.number().int().min(0).max(100).optional(),
  thresholds: z.array(z.number().int().min(0).max(100)).max(10).optional(),
})
const scoringRuleSchema = z.object({
  modelId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  dimension: z.enum(['fit', 'intent']),
  eventType: z.string().trim().min(3).max(120),
  fieldPath: z.string().trim().max(120).nullable().optional(),
  operator: z.enum(['equals', 'not_equals', 'contains', 'greater_than', 'less_than', 'exists']).nullable().optional(),
  comparisonValue: z.unknown().optional(),
  points: z.number().int().min(-100).max(100).refine(value => value !== 0),
})
const scoringRulePatchSchema = scoringRuleSchema.partial().omit({ modelId: true })
const scoringSimulationSchema = z.object({
  crmInstanceId: z.string().uuid(),
  leadId: z.string().uuid(),
  eventType: z.string().trim().min(3).max(120),
  payload: z.record(z.string(), z.unknown()).optional(),
})
const scoreAdjustmentSchema = z.object({
  dimension: z.enum(['fit', 'intent']),
  points: z.number().int().min(-100).max(100).refine(value => value !== 0),
  reason: z.string().trim().min(5).max(300),
})
const scoreEventsQuerySchema = z.object({ limit: z.coerce.number().int().min(1).max(500).optional() })

const sequenceQuerySchema = z.object({
  organizationId: z.string().uuid(),
})

const enrollmentInputSchema = z.object({
  organizationId: z.string().uuid(),
  sequenceId: z.string().uuid(),
})

const enrollmentPatchSchema = z.object({
  status: z.enum(['active', 'paused', 'manual', 'completed', 'cancelled']).optional(),
  nextExecutionAt: z.string().nullable().optional(),
  manualNote: z.string().nullable().optional(),
})

const pipelineQuerySchema = z.object({
  organizationId: z.string().uuid(),
})

const pipelineInputSchema = z.object({
  organizationId: z.string().uuid(),
  crmInstanceId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  isDefault: z.boolean().optional(),
})

const pipelinePatchSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const pipelineStageInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  key: z.string().trim().min(1).max(80),
  color: z.string().trim().min(1).max(32),
  isWon: z.boolean().optional(),
  isLost: z.boolean().optional(),
})

const pipelineStagePatchSchema = pipelineStageInputSchema.partial().extend({
  isActive: z.boolean().optional(),
})

const pipelineStageOrderSchema = z.object({
  stageIds: z.array(z.string().uuid()).min(1).refine((stageIds) => new Set(stageIds).size === stageIds.length, {
    message: 'stageIds must be unique',
  }),
})

const governanceContextQuerySchema = z.object({
  crmInstanceId: z.string().uuid(),
})

const leadStagePatchSchema = z.object({
  stageId: z.string().uuid(),
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

export async function registerCrmRoutes(app: FastifyInstance) {
  app.post('/conversation-query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !conversationAllowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_crm_conversation_query' })
    }

    return executeScopedDataQuery(app, requireAuth(request), parsed.data, conversationTableRules)
  })

  app.post('/closing-query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !closingAllowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_crm_closing_query' })
    }

    return executeScopedDataQuery(app, requireAuth(request), parsed.data, closingTableRules)
  })

  app.post('/ops-query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !opsAllowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_crm_ops_query' })
    }

    return executeScopedDataQuery(app, requireAuth(request), parsed.data, opsTableRules)
  })

  app.get('/pipelines', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = pipelineQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_pipeline_query' })

    return listPipelines(app.pg, user, parsed.data.organizationId)
  })

  app.post('/pipelines', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = pipelineInputSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_pipeline_payload' })

    return reply.code(201).send(await createPipeline(app.pg, user, parsed.data))
  })

  app.patch('/pipelines/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = pipelinePatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_pipeline_patch' })

    return patchPipeline(app.pg, user, params.data.id, parsed.data)
  })

  app.post('/pipelines/:id/stages', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = pipelineStageInputSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_pipeline_stage_payload' })

    return reply.code(201).send(await createPipelineStage(app.pg, user, params.data.id, parsed.data))
  })

  app.patch('/pipeline-stages/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = pipelineStagePatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_pipeline_stage_patch' })

    return patchPipelineStage(app.pg, user, params.data.id, parsed.data)
  })

  app.put('/pipelines/:id/stages/order', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = pipelineStageOrderSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_pipeline_stage_order' })

    return reorderPipelineStages(app.pg, user, params.data.id, parsed.data.stageIds)
  })

  app.get('/governance-context', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = governanceContextQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_crm_governance_query' })

    return getCrmGovernanceContext(app.pg, user, parsed.data.crmInstanceId)
  })

  app.get('/scoring/model', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = scoringModelQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_scoring_model_query' })
    await assertScoringAccess(app.pg, user, parsed.data.crmInstanceId, false)
    const model = await getActiveScoringModel(app.pg, parsed.data.crmInstanceId)
    return { model, rules: model ? await listActiveScoringRules(app.pg, model.id) : [] }
  })

  app.patch('/scoring/model/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = scoringModelPatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: 'invalid_scoring_model_patch' })
    const model = await getScoringModelById(app.pg, params.data.id)
    if (!model) return reply.code(404).send({ error: 'lead_scoring_model_not_found' })
    await assertScoringAccess(app.pg, user, model.crmInstanceId, true)
    return updateScoringModel(app.pg, params.data.id, parsed.data)
  })

  app.post('/scoring/rules', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = scoringRuleSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_scoring_rule_payload' })
    const model = await getScoringModelById(app.pg, parsed.data.modelId)
    if (!model) return reply.code(404).send({ error: 'lead_scoring_model_not_found' })
    await assertScoringAccess(app.pg, user, model.crmInstanceId, true)
    if (!DOMAIN_EVENT_TYPES.includes(parsed.data.eventType as typeof DOMAIN_EVENT_TYPES[number]) && !isInternalUser(user)) {
      return reply.code(400).send({ error: 'scoring_event_type_invalid' })
    }
    return reply.code(201).send(await createScoringRule(app.pg, parsed.data))
  })

  app.patch('/scoring/rules/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = scoringRulePatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) return reply.code(400).send({ error: 'invalid_scoring_rule_patch' })
    const access = await getScoringRuleAccess(app.pg, params.data.id)
    if (!access) return reply.code(404).send({ error: 'lead_scoring_rule_not_found' })
    await assertScoringAccess(app.pg, user, access.crm_instance_id, true)
    return updateScoringRule(app.pg, params.data.id, parsed.data)
  })

  app.delete('/scoring/rules/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_scoring_rule_id' })
    const access = await getScoringRuleAccess(app.pg, params.data.id)
    if (!access) return reply.code(404).send({ error: 'lead_scoring_rule_not_found' })
    await assertScoringAccess(app.pg, user, access.crm_instance_id, true)
    await deactivateScoringRule(app.pg, params.data.id)
    return { success: true }
  })

  app.post('/scoring/simulate', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = scoringSimulationSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_scoring_simulation_payload' })
    await assertScoringAccess(app.pg, user, parsed.data.crmInstanceId, false)
    const model = await getActiveScoringModel(app.pg, parsed.data.crmInstanceId)
    if (!model) return { persisted: false, appliedRules: [], resultingFitScore: 0, resultingIntentScore: 0, resultingCombinedScore: 0 }
    const leadResult = await app.pg.query<Record<string, unknown>>(
      `SELECT id, organization_id, crm_instance_id, fit_score, intent_score, score, name, email, phone, company, source, stage, status, attribution_context
       FROM public.leads WHERE id = $1 AND crm_instance_id = $2 LIMIT 1`,
      [parsed.data.leadId, parsed.data.crmInstanceId],
    )
    const lead = leadResult.rows[0]
    if (!lead) return reply.code(404).send({ error: 'lead_not_found' })
    const rules = await listActiveScoringRules(app.pg, model.id, parsed.data.eventType)
    const context = { ...lead, ...(parsed.data.payload || {}), lead, payload: parsed.data.payload || {} }
    const currentFit = clampScoreValue(lead.fit_score)
    const currentIntent = clampScoreValue(lead.intent_score)
    let fit = currentFit
    let intent = currentIntent
    const appliedRules: Array<{ id: string; name: string; dimension: string; points: number }> = []
    for (const rule of rules) {
      if (!matchesScoringRule(rule, context)) continue
      if (rule.dimension === 'fit') fit = clampScoreValue(fit + rule.points)
      else intent = clampScoreValue(intent + rule.points)
      appliedRules.push({ id: rule.id, name: rule.name, dimension: rule.dimension, points: rule.points })
    }
    return {
      persisted: false,
      appliedRules,
      currentFitScore: currentFit,
      currentIntentScore: currentIntent,
      resultingFitScore: fit,
      resultingIntentScore: intent,
      resultingCombinedScore: combinedScore(fit, intent, model.fitWeight, model.intentWeight),
    }
  })

  app.get('/leads/:id/score-events', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const query = scoreEventsQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) return reply.code(400).send({ error: 'invalid_score_events_query' })
    const lead = await getLeadScoringAccess(app.pg, params.data.id)
    if (!lead) return reply.code(404).send({ error: 'lead_not_found' })
    await assertScoringAccess(app.pg, user, lead.crmInstanceId, false)
    return listLeadScoreEvents(app.pg, params.data.id, query.data.limit)
  })

  app.post('/leads/:id/score-adjustments', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = scoreAdjustmentSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_score_adjustment' })
    return applyManualScoreAdjustment(app.pg, user, params.data.id, parsed.data)
  })

  app.get('/sequences', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = sequenceQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_sequence_query' })

    return listCrmSequences(app.pg, user, parsed.data.organizationId)
  })

  app.get('/leads', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = leadQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_lead_query' })

    return listLeads(app.pg, user, parsed.data)
  })

  app.post('/leads', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = leadInputSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_lead_payload' })

    return reply.code(201).send(await createLead(app.pg, user, parsed.data))
  })

  app.patch('/leads/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = leadPatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_lead_patch' })

    return patchLead(app.pg, user, params.data.id, parsed.data)
  })

  app.patch('/leads/:id/stage', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = leadStagePatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_lead_stage_patch' })

    return moveLeadToStage(app.pg, user, params.data.id, parsed.data.stageId)
  })

  app.get('/leads/:id/interactions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_lead_id' })

    return listLeadInteractions(app.pg, user, params.data.id)
  })

  app.post('/leads/:id/interactions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = interactionInputSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_interaction_payload' })

    return reply.code(201).send(await createLeadInteraction(app.pg, user, params.data.id, parsed.data))
  })

  app.get('/leads/:id/tasks', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_lead_id' })

    return listLeadTasks(app.pg, user, params.data.id)
  })

  app.post('/leads/:id/tasks', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = taskInputSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_task_payload' })

    return reply.code(201).send(await createLeadTask(app.pg, user, params.data.id, parsed.data))
  })

  app.get('/tasks', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = taskQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_task_query' })

    return listCrmTasks(app.pg, user, parsed.data)
  })

  app.patch('/tasks/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = taskPatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success || Object.keys(parsed.data).length === 0) {
      return reply.code(400).send({ error: 'invalid_task_patch' })
    }

    return patchCrmTask(app.pg, user, params.data.id, parsed.data)
  })

  app.patch('/tasks/:id/complete', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_task_id' })

    return patchCrmTask(app.pg, user, params.data.id, { status: 'completed' })
  })

  app.get('/leads/:id/enrollments', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_lead_id' })

    return listLeadEnrollments(app.pg, user, params.data.id)
  })

  app.post('/leads/:id/enrollments', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = enrollmentInputSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_enrollment_payload' })

    return reply.code(201).send(await enrollLeadInSequence(app.pg, user, {
      organizationId: parsed.data.organizationId,
      leadId: params.data.id,
      sequenceId: parsed.data.sequenceId,
    }))
  })

  app.patch('/enrollments/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    const parsed = enrollmentPatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_enrollment_patch' })

    return updateEnrollment(app.pg, user, params.data.id, parsed.data)
  })

  app.get('/leads/:id/executions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_lead_id' })

    return listLeadExecutions(app.pg, user, params.data.id)
  })
}

type CrmQueryable = {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>
}

async function assertScoringAccess(pool: CrmQueryable, user: { id: string; role: string }, crmInstanceId: string, write: boolean) {
  const result = await pool.query<{ member_role: string | null }>(
    `SELECT member.role AS member_role
     FROM public.crm_instances instance
     LEFT JOIN public.crm_instance_members member
       ON member.crm_instance_id = instance.id AND member.user_id = $2
     WHERE instance.id = $1
       AND ($3::boolean = TRUE OR member.status = 'active' OR EXISTS (
         SELECT 1 FROM public.memberships membership
         WHERE membership.user_id = $2 AND membership.organization_id = instance.organization_id
       ))
     LIMIT 1`,
    [crmInstanceId, user.id, isInternalUser(user)],
  )
  const access = result.rows[0]
  if (!access) throw Object.assign(new Error('crm_instance_forbidden'), { statusCode: 403 })
  if (write && !isInternalUser(user) && !['client_admin', 'manager'].includes(access.member_role ?? '')) {
    throw Object.assign(new Error('scoring_configuration_forbidden'), { statusCode: 403 })
  }
}

async function getScoringRuleAccess(pool: CrmQueryable, ruleId: string) {
  const result = await pool.query<{ crm_instance_id: string }>(
    `SELECT model.crm_instance_id
     FROM public.lead_scoring_rules rule
     JOIN public.lead_scoring_models model ON model.id = rule.model_id
     WHERE rule.id = $1 LIMIT 1`,
    [ruleId],
  )
  return result.rows[0] ?? null
}

async function getLeadScoringAccess(pool: CrmQueryable, leadId: string) {
  const result = await pool.query<{ organization_id: string; crm_instance_id: string | null }>(
    `SELECT organization_id, crm_instance_id FROM public.leads WHERE id = $1 LIMIT 1`,
    [leadId],
  )
  const row = result.rows[0]
  return row?.crm_instance_id ? { organizationId: row.organization_id, crmInstanceId: row.crm_instance_id } : null
}

async function applyManualScoreAdjustment(
  pool: pg.Pool,
  user: { id: string; role: string },
  leadId: string,
  input: { dimension: 'fit' | 'intent'; points: number; reason: string },
) {
  const access = await getLeadScoringAccess(pool, leadId)
  if (!access) throw Object.assign(new Error('lead_not_found'), { statusCode: 404 })
  await assertScoringAccess(pool, user, access.crmInstanceId, true)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const leadResult = await client.query<{
      id: string; organization_id: string; crm_instance_id: string; fit_score: number | null; intent_score: number | null; score: number | null
    }>(
      `SELECT id, organization_id, crm_instance_id, fit_score, intent_score, score
       FROM public.leads WHERE id = $1 AND crm_instance_id = $2 FOR UPDATE`,
      [leadId, access.crmInstanceId],
    )
    const lead = leadResult.rows[0]
    if (!lead) throw Object.assign(new Error('lead_not_found'), { statusCode: 404 })
    const model = await getActiveScoringModel(client, access.crmInstanceId)
    const fitWeight = model?.fitWeight ?? 40
    const intentWeight = model?.intentWeight ?? 60
    const previousFit = clampScoreValue(lead.fit_score)
    const previousIntent = clampScoreValue(lead.intent_score)
    const previous = input.dimension === 'fit' ? previousFit : previousIntent
    const nextFit = input.dimension === 'fit' ? clampScoreValue(previousFit + input.points) : previousFit
    const nextIntent = input.dimension === 'intent' ? clampScoreValue(previousIntent + input.points) : previousIntent
    const combined = combinedScore(nextFit, nextIntent, fitWeight, intentWeight)
    await client.query(
      `UPDATE public.leads SET fit_score = $2, intent_score = $3, score = $4, updated_at = NOW() WHERE id = $1`,
      [leadId, nextFit, nextIntent, combined],
    )
    const eventKey = `manual:${randomUUID()}`
    await client.query(
      `INSERT INTO public.lead_score_events (
         organization_id, crm_instance_id, lead_id, rule_id, event_key,
         event_type, dimension, points, previous_score, resulting_score, context, created_by
       ) VALUES ($1, $2, $3, NULL, $4, 'lead.score_manual_adjustment', $5, $6, $7, $8, $9, $10)`,
      [lead.organization_id, lead.crm_instance_id, lead.id, eventKey, input.dimension, input.points, previous, input.dimension === 'fit' ? nextFit : nextIntent, { reason: input.reason }, user.id],
    )
    await recordDomainEvent(client, {
      eventType: 'lead.score_manual_adjustment',
      organizationId: lead.organization_id,
      crmInstanceId: lead.crm_instance_id,
      aggregateType: 'lead',
      aggregateId: lead.id,
      leadId: lead.id,
      actor: { type: 'user', id: user.id },
      payload: { dimension: input.dimension, points: input.points, reason: input.reason, fitScore: nextFit, intentScore: nextIntent, combinedScore: combined },
    })
    await client.query('COMMIT')
    return { leadId: lead.id, fitScore: nextFit, intentScore: nextIntent, score: combined, reason: input.reason }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

function clampScoreValue(value: unknown) {
  const number = typeof value === 'number' ? value : Number(value ?? 0)
  return Math.max(0, Math.min(100, Math.round(Number.isFinite(number) ? number : 0)))
}

function isInternalUser(user: { role: string }) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}
