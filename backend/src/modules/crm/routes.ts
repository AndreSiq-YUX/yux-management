import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { requireAuth } from '../../http/guards.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'
import {
  completeLeadTask,
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
  listPipelines,
  moveLeadToStage,
  patchLead,
  updateEnrollment,
} from './repository.js'

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

  app.get('/governance-context', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = governanceContextQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_crm_governance_query' })

    return getCrmGovernanceContext(app.pg, user, parsed.data.crmInstanceId)
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

  app.patch('/tasks/:id/complete', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = z.object({ id: z.string().uuid() }).safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_task_id' })

    return completeLeadTask(app.pg, user, params.data.id)
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
