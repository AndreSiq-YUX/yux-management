import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createReadStream } from 'node:fs'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import {
  createAutomationAction,
  createAutomationCondition,
  createAutomationFlow,
  createAutomationTrigger,
  createFlowVersion,
  createMaterial,
  createSequence,
  createSequenceStep,
  deleteAutomationChild,
  deleteAutomationFlow,
  deleteMaterial,
  deleteSequence,
  deleteSequenceStep,
  getMaterialFile,
  listAutomationExecutionRuns,
  getUploadLimitMb,
  listAutomationFlows,
  listFlowVersions,
  listMaterials,
  listSequences,
  saveAutomationSimulation,
  updateAutomationAction,
  updateAutomationCondition,
  updateAutomationFlow,
  updateAutomationTrigger,
  updateSequence,
  updateSequenceStep,
} from './repository.js'

const optionalUuid = z.string().uuid().optional()
const paramsWithId = z.object({ id: z.string().uuid() })
const flowParams = z.object({ flowId: z.string().uuid() })

const flowInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  sectorTemplateKey: z.string().nullable().optional(),
  status: z.string().optional(),
  isEnabled: z.boolean().optional(),
  automationKind: z.string().optional(),
  builderMode: z.string().optional(),
  dailyRunLimit: z.number().int().min(0).optional(),
  requiresHumanApproval: z.boolean().optional(),
  riskLevel: z.string().optional(),
  graph: z.record(z.string(), z.unknown()).nullable().optional(),
})

const flowPatchSchema = flowInputSchema.partial().extend({
  activeVersionId: optionalUuid,
  publishedVersion: z.number().int().min(0).optional(),
})

const triggerSchema = z.object({
  triggerType: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
})

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.string().min(1),
  value: z.unknown().optional(),
})

const actionSchema = z.object({
  actionType: z.string().min(1).optional(),
  orderIndex: z.number().int().min(0).optional(),
  payload: z.record(z.string(), z.unknown()).optional(),
})

const createActionSchema = actionSchema.extend({
  actionType: z.string().min(1),
})

const simulationSchema = z.object({
  organizationId: z.string().uuid(),
  flowId: z.string().uuid(),
  eventType: z.string().min(1),
  samplePayload: z.record(z.string(), z.unknown()),
  matched: z.boolean(),
  conditionResults: z.array(z.unknown()),
  plannedActions: z.array(z.unknown()),
  blockedReasons: z.array(z.string()),
})

const dispatchSchema = z.object({
  event: z.object({
    type: z.string().min(1),
    organizationId: z.string().uuid().optional(),
    leadId: z.string().uuid().optional(),
    conversationId: z.string().uuid().optional(),
    ticketId: z.string().uuid().optional(),
    payload: z.record(z.string(), z.unknown()).optional(),
  }).catchall(z.unknown()),
})

const flowVersionSchema = z.object({
  versionNumber: z.number().int().positive(),
  snapshot: z.record(z.string(), z.unknown()),
  status: z.enum(['draft', 'published', 'archived']).optional(),
})

const sequenceInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
  channel: z.enum(['email', 'whatsapp', 'mixed']).optional(),
  sectorTemplateKey: z.string().nullable().optional(),
  conversionGoal: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
})

const sequencePatchSchema = sequenceInputSchema.partial().extend({
  status: z.enum(['draft', 'active', 'paused', 'archived']).optional(),
})

const sequenceStepInputSchema = z.object({
  stepKind: z.enum(['message', 'delay', 'task', 'ai', 'webhook']),
  channel: z.enum(['email', 'whatsapp']).nullable().optional(),
  delayMinutes: z.number().int().min(0).optional(),
  subject: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
  templateId: z.string().uuid().nullable().optional(),
  requiresHumanApproval: z.boolean().optional(),
  isActive: z.boolean().optional(),
})

const sequenceParams = z.object({ sequenceId: z.string().uuid() })

const materialUploadSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  fileType: z.string().min(1),
  byteSize: z.number().int().min(0),
  contentBase64: z.string().min(1),
})

const organizationQuerySchema = z.object({
  organizationId: z.string().uuid(),
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

export async function registerAutomationRoutes(app: FastifyInstance) {
  app.get('/flows', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = z.object({ organizationId: optionalUuid }).safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'invalid_automation_flow_query' })

    return listAutomationFlows(app.pg, user, query.data)
  })

  app.post('/flows', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = flowInputSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_automation_flow_payload' })

    return reply.code(201).send(await createAutomationFlow(app.pg, user, parsed.data))
  })

  app.patch('/flows/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    const parsed = flowPatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_automation_flow_patch' })

    return updateAutomationFlow(app.pg, user, params.data.id, parsed.data)
  })

  app.delete('/flows/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_automation_flow_id' })

    await deleteAutomationFlow(app.pg, user, params.data.id)
    return reply.code(204).send()
  })

  app.get('/flows/:flowId/executions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = flowParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_automation_flow_id' })

    return listAutomationExecutionRuns(app.pg, user, params.data.flowId)
  })

  app.post('/flows/:flowId/triggers', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = flowParams.safeParse(request.params)
    const parsed = triggerSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_automation_trigger_payload' })

    return reply.code(201).send(await createAutomationTrigger(app.pg, user, params.data.flowId, parsed.data))
  })

  app.patch('/triggers/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    const parsed = triggerSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_automation_trigger_patch' })

    return updateAutomationTrigger(app.pg, user, params.data.id, parsed.data)
  })

  app.delete('/triggers/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_automation_trigger_id' })

    await deleteAutomationChild(app.pg, user, 'automation_triggers', params.data.id)
    return reply.code(204).send()
  })

  app.post('/flows/:flowId/conditions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = flowParams.safeParse(request.params)
    const parsed = conditionSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_automation_condition_payload' })

    return reply.code(201).send(await createAutomationCondition(app.pg, user, params.data.flowId, parsed.data))
  })

  app.patch('/conditions/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    const parsed = conditionSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_automation_condition_patch' })

    return updateAutomationCondition(app.pg, user, params.data.id, parsed.data)
  })

  app.delete('/conditions/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_automation_condition_id' })

    await deleteAutomationChild(app.pg, user, 'automation_conditions', params.data.id)
    return reply.code(204).send()
  })

  app.post('/flows/:flowId/actions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = flowParams.safeParse(request.params)
    const parsed = createActionSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_automation_action_payload' })

    return reply.code(201).send(await createAutomationAction(app.pg, user, params.data.flowId, parsed.data))
  })

  app.patch('/actions/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    const parsed = actionSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_automation_action_patch' })

    return updateAutomationAction(app.pg, user, params.data.id, parsed.data)
  })

  app.delete('/actions/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_automation_action_id' })

    await deleteAutomationChild(app.pg, user, 'automation_actions', params.data.id)
    return reply.code(204).send()
  })

  app.post('/simulations', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = simulationSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_automation_simulation_payload' })

    return reply.code(201).send(await saveAutomationSimulation(app.pg, user, parsed.data))
  })

  app.post('/dispatch', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dispatchSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_automation_dispatch_payload' })

    const job = await app.jobQueue.add('automation.dispatch', {
      requestedBy: user.id,
      event: parsed.data.event,
    })
    return reply.code(202).send({ ok: true, jobId: job.id })
  })

  app.get('/flows/:flowId/versions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = flowParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_automation_flow_id' })

    return listFlowVersions(app.pg, user, params.data.flowId)
  })

  app.post('/flows/:flowId/versions', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = flowParams.safeParse(request.params)
    const parsed = flowVersionSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_automation_version_payload' })

    return reply.code(201).send(await createFlowVersion(app.pg, user, { flowId: params.data.flowId, ...parsed.data }))
  })

  app.get('/sequences', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = z.object({ organizationId: z.string().uuid() }).safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'invalid_sequence_query' })

    return listSequences(app.pg, user, query.data.organizationId)
  })

  app.post('/sequences', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = sequenceInputSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_sequence_payload' })

    return reply.code(201).send(await createSequence(app.pg, user, parsed.data))
  })

  app.patch('/sequences/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    const parsed = sequencePatchSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_sequence_patch' })

    return updateSequence(app.pg, user, params.data.id, parsed.data)
  })

  app.delete('/sequences/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_sequence_id' })

    await deleteSequence(app.pg, user, params.data.id)
    return reply.code(204).send()
  })

  app.post('/sequences/:sequenceId/steps', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = sequenceParams.safeParse(request.params)
    const parsed = sequenceStepInputSchema.safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_sequence_step_payload' })

    return reply.code(201).send(await createSequenceStep(app.pg, user, params.data.sequenceId, parsed.data))
  })

  app.patch('/sequence-steps/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    const parsed = sequenceStepInputSchema.partial().safeParse(request.body)
    if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_sequence_step_patch' })

    return updateSequenceStep(app.pg, user, params.data.id, parsed.data)
  })

  app.delete('/sequence-steps/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_sequence_step_id' })

    await deleteSequenceStep(app.pg, user, params.data.id)
    return reply.code(204).send()
  })

  app.get('/materials', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = organizationQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'invalid_material_query' })

    return listMaterials(app.pg, user, query.data.organizationId)
  })

  app.get('/materials/upload-limit', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const query = organizationQuerySchema.safeParse(request.query)
    if (!query.success) return reply.code(400).send({ error: 'invalid_material_limit_query' })

    return { limitMb: await getUploadLimitMb(app.pg, user, query.data.organizationId) }
  })

  app.post('/materials', { bodyLimit: 25 * 1024 * 1024 }, async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = materialUploadSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_material_payload' })

    return reply.code(201).send(await createMaterial(app.pg, user, parsed.data))
  })

  app.delete('/materials/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_material_id' })

    await deleteMaterial(app.pg, user, params.data.id)
    return reply.code(204).send()
  })

  app.get('/materials/:id/file', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const params = paramsWithId.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_material_id' })

    const file = await getMaterialFile(app.pg, user, params.data.id)
    reply.header('Content-Type', file.fileType)
    reply.header('Content-Disposition', `inline; filename="${file.fileName.replace(/"/g, '')}"`)
    return reply.send(createReadStream(file.filePath))
  })
}
