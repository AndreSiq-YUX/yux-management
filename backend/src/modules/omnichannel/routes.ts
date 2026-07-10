import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createReadStream } from 'node:fs'
import { z } from 'zod'
import { hashSessionToken } from '../../auth/session.js'
import { requireAuth } from '../../http/guards.js'
import { dataQuerySchema } from '../data/routes.js'
import { createScopedTableRules, executeScopedDataQuery } from '../data/scoped-query.js'
import {
  assignConversation,
  createMessageAttachment,
  createHumanReply,
  createKnowledgePublication,
  createOrganizationRow,
  createSchedulingRequest,
  getConversation,
  getInternalMetrics,
  getMessageAttachmentFile,
  getSettings,
  handoffConversation,
  listConversations,
  listKnowledgeEntries,
  listKnowledgePublications,
  listMessages,
  listOrganizationRows,
  listOutboundRetryLogs,
  listQueues,
  listTeamMembers,
  listWebhookEvents,
  requireOrganizationAccess,
  updateConversationStatus,
  updateRowById,
  type ConversationFilters,
} from './repository.js'

const optionalUuid = z.string().uuid().optional()
const idParams = z.object({ id: z.string().uuid() })

const conversationQuerySchema = z.object({
  organizationId: optionalUuid,
  channel: z.string().optional(),
  status: z.string().optional(),
  queueId: optionalUuid,
  teamId: optionalUuid,
  assignedUserId: optionalUuid,
  sla: z.enum(['overdue', 'due_soon']).optional(),
  tag: z.string().optional(),
  handoff: z.coerce.boolean().optional(),
})

const organizationQuerySchema = z.object({
  organizationId: z.string().uuid(),
})

const channelConnectionsQuerySchema = z.object({
  organizationId: z.string().uuid(),
  channels: z.string().optional(),
})

const queryAllowedTables = new Set([
  'conversation_tags',
])

const queryTableRules = createScopedTableRules([], ['conversation_tags'])

const humanReplySchema = z.object({
  conversationId: z.string().uuid(),
  connectionId: optionalUuid,
  body: z.string().min(1),
  authorUserId: optionalUuid,
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const attachmentUploadSchema = z.object({
  messageId: z.string().uuid(),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(255),
  byteSize: z.number().int().nonnegative(),
  contentBase64: z.string().min(1),
  retentionDeadlineAt: z.string().datetime().nullable().optional(),
})

const assignmentSchema = z.object({
  conversationId: z.string().uuid(),
  queueId: optionalUuid,
  teamId: optionalUuid,
  assignedUserId: optionalUuid,
  reason: z.string().optional(),
  assignedByUserId: optionalUuid,
})

const handoffSchema = z.object({
  conversationId: z.string().uuid(),
  trigger: z.string().min(1),
  ruleId: optionalUuid,
  outcome: z.record(z.string(), z.unknown()).optional(),
})

const teamSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  availabilityMode: z.string().optional(),
  isActive: z.boolean().optional(),
})

const teamPatchSchema = z.object({
  name: z.string().optional(),
  availabilityMode: z.string().optional(),
  isActive: z.boolean().optional(),
})

const queueSchema = z.object({
  organizationId: z.string().uuid(),
  teamId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  strategy: z.string().optional(),
  slaSettings: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
})

const ruleSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  isEnabled: z.boolean().optional(),
  priority: z.number().int().min(0).optional(),
  combinator: z.enum(['all', 'any']).optional(),
  conditions: z.array(z.unknown()).optional(),
  outcome: z.record(z.string(), z.unknown()).optional(),
})

const settingsSchema = z.object({
  organizationId: z.string().uuid(),
  defaultResponseMode: z.string().optional(),
  retentionMonths: z.number().int().positive().optional(),
  attachmentRetentionMonths: z.number().int().positive().optional(),
  anonymizeOnRetention: z.boolean().optional(),
  crmSyncFilters: z.record(z.string(), z.unknown()).optional(),
  businessHours: z.record(z.string(), z.unknown()).optional(),
  aiLogicalProvider: z.string().nullable().optional(),
  aiModel: z.string().nullable().optional(),
  aiTokenPrices: z.record(z.string(), z.unknown()).optional(),
})

const widgetSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().min(1),
  isActive: z.boolean().optional(),
  allowedOrigins: z.array(z.string()).optional(),
  branding: z.record(z.string(), z.unknown()).optional(),
  consentText: z.string().nullable().optional(),
  initialForm: z.record(z.string(), z.unknown()).optional(),
})

const knowledgeSourceSchema = z.object({
  organizationId: z.string().uuid(),
  sourceType: z.string().min(1),
  name: z.string().min(1),
  sourceUrl: z.string().nullable().optional(),
  storagePath: z.string().nullable().optional(),
  retentionDeadlineAt: z.string().nullable().optional(),
  status: z.string().optional(),
})

const knowledgeEntrySchema = z.object({
  organizationId: z.string().uuid(),
  sourceId: optionalUuid,
  title: z.string().min(1),
  body: z.string().min(1),
  status: z.string().optional(),
  reviewerUserId: z.string().uuid().nullable().optional(),
})

const knowledgePublicationSchema = z.object({
  organizationId: z.string().uuid(),
  entryId: z.string().uuid(),
  bodySnapshot: z.string().min(1),
  publisherUserId: optionalUuid,
})

const schedulingSchema = z.object({
  conversationId: z.string().uuid(),
  requestedSlot: z.record(z.string(), z.unknown()),
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

function cleanPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

export async function registerOmnichannelRoutes(app: FastifyInstance) {
  app.post('/query', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = dataQuerySchema.safeParse(request.body)
    if (!parsed.success || !queryAllowedTables.has(parsed.data.table)) {
      return reply.code(400).send({ error: 'invalid_omnichannel_query' })
    }

    return executeScopedDataQuery(app, requireAuth(request), parsed.data, queryTableRules)
  })

  app.get('/channel-connections', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply

    const parsed = channelConnectionsQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_channel_connections_query' })
    await requireOrganizationAccess(app.pg, user, parsed.data.organizationId)

    const channels = (parsed.data.channels || '')
      .split(',')
      .map(channel => channel.trim())
      .filter(Boolean)

    const result = await app.pg.query(
      `SELECT *
       FROM public.channel_connections
       WHERE organization_id = $1
         AND ($2::text[] = '{}'::text[] OR channel = ANY($2::text[]))
       ORDER BY channel ASC`,
      [parsed.data.organizationId, channels],
    )

    return result.rows
  })

  app.get('/conversations', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = conversationQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_conversation_query' })
    return listConversations(app.pg, user, parsed.data as ConversationFilters)
  })

  app.get('/portal/conversations', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = conversationQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_conversation_query' })
    return listConversations(app.pg, user, parsed.data as ConversationFilters, true)
  })

  app.get('/conversations/:id', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    const portal = z.object({ portal: z.coerce.boolean().optional() }).safeParse(request.query)
    if (!params.success || !portal.success) return reply.code(400).send({ error: 'invalid_conversation_id' })
    return getConversation(app.pg, user, params.data.id, portal.data.portal)
  })

  app.get('/conversations/:id/messages', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_conversation_id' })
    return listMessages(app.pg, user, params.data.id)
  })

  app.post('/messages/human-reply', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = humanReplySchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_human_reply' })
    const message = await createHumanReply(app.pg, user, parsed.data)
    await app.jobQueue.add('omnichannel.dispatchOutbound', { messageId: message.id })
    return reply.code(201).send(message)
  })

  app.post('/attachments', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = attachmentUploadSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_attachment_payload' })
    return reply.code(201).send(await createMessageAttachment(app.pg, user, parsed.data))
  })

  app.get('/attachments/:id/file', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_attachment_id' })
    const file = await getMessageAttachmentFile(app.pg, user, params.data.id)
    reply.header('Content-Type', file.fileType)
    reply.header('Content-Disposition', `inline; filename="${file.fileName.replace(/"/g, '')}"`)
    return reply.send(createReadStream(file.filePath))
  })

  app.post('/messages/:id/approve', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_message_id' })
    const job = await app.jobQueue.add('omnichannel.dispatchOutbound', { messageId: params.data.id, requestedBy: user.id })
    return { success: true, dispatch: { pending: true, jobId: job.id } }
  })

  app.post('/messages/:id/retry', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_message_id' })
    const job = await app.jobQueue.add('omnichannel.retryOutbound', { messageId: params.data.id, requestedBy: user.id })
    return { success: true, retry: { pending: true, jobId: job.id } }
  })

  app.post('/assignments', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = assignmentSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_assignment' })
    return reply.code(201).send(await assignConversation(app.pg, user, parsed.data))
  })

  app.post('/handoff', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = handoffSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_handoff' })
    return reply.code(201).send(await handoffConversation(app.pg, user, parsed.data))
  })

  app.patch('/conversations/:id/resolve', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_conversation_id' })
    return updateConversationStatus(app.pg, user, params.data.id, 'resolved')
  })

  app.patch('/conversations/:id/reopen', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_conversation_id' })
    return updateConversationStatus(app.pg, user, params.data.id, 'open')
  })

  app.get('/teams', orgList('omnichannel_teams'))
  app.get('/teams/:id/members', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_team_id' })
    return listTeamMembers(app.pg, user, params.data.id)
  })
  app.post('/teams', createRoute(teamSchema, 'omnichannel_teams', (input) => ({
    organization_id: input.organizationId,
    name: input.name,
    availability_mode: input.availabilityMode || 'business_hours',
    is_active: input.isActive ?? true,
  })))
  app.patch('/teams/:id', updateRoute(teamPatchSchema, 'omnichannel_teams', (input) => cleanPayload({
    name: input.name,
    availability_mode: input.availabilityMode,
    is_active: input.isActive,
  })))

  app.get('/queues', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = organizationQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_organization_query' })
    return listQueues(app.pg, user, parsed.data.organizationId)
  })
  app.post('/queues', createRoute(queueSchema, 'conversation_queues', (input) => ({
    organization_id: input.organizationId,
    team_id: input.teamId || null,
    name: input.name,
    strategy: input.strategy || 'round_robin',
    sla_settings: input.slaSettings || {},
    is_active: input.isActive ?? true,
  })))
  app.patch('/queues/:id', updateRoute(queueSchema.partial(), 'conversation_queues', (input) => cleanPayload({
    team_id: input.teamId,
    name: input.name,
    strategy: input.strategy,
    sla_settings: input.slaSettings,
    is_active: input.isActive,
  })))

  app.get('/rules', orgList('handoff_rules', 'priority'))
  app.post('/rules', createRoute(ruleSchema, 'handoff_rules', (input) => ({
    organization_id: input.organizationId,
    name: input.name,
    is_enabled: input.isEnabled ?? true,
    priority: input.priority ?? 100,
    combinator: input.combinator || 'all',
    conditions: input.conditions || [],
    outcome: input.outcome || {},
  })))
  app.patch('/rules/:id', updateRoute(ruleSchema.partial(), 'handoff_rules', (input) => cleanPayload({
    name: input.name,
    is_enabled: input.isEnabled,
    priority: input.priority,
    combinator: input.combinator,
    conditions: input.conditions,
    outcome: input.outcome,
  })))

  app.get('/settings', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = organizationQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_organization_query' })
    return getSettings(app.pg, user, parsed.data.organizationId)
  })
  app.put('/settings', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = settingsSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_settings' })
    const body = parsed.data
    await getSettings(app.pg, user, body.organizationId)
    const result = await app.pg.query(
      `INSERT INTO public.omnichannel_settings (
         organization_id, default_response_mode, retention_months, attachment_retention_months,
         anonymize_on_retention, crm_sync_filters, business_hours, ai_logical_provider, ai_model, ai_token_prices
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (organization_id) DO UPDATE SET
         default_response_mode = EXCLUDED.default_response_mode,
         retention_months = EXCLUDED.retention_months,
         attachment_retention_months = EXCLUDED.attachment_retention_months,
         anonymize_on_retention = EXCLUDED.anonymize_on_retention,
         crm_sync_filters = EXCLUDED.crm_sync_filters,
         business_hours = EXCLUDED.business_hours,
         ai_logical_provider = EXCLUDED.ai_logical_provider,
         ai_model = EXCLUDED.ai_model,
         ai_token_prices = EXCLUDED.ai_token_prices,
         updated_at = NOW()
       RETURNING *`,
      [
        body.organizationId,
        body.defaultResponseMode || 'assisted',
        body.retentionMonths ?? 12,
        body.attachmentRetentionMonths ?? 12,
        body.anonymizeOnRetention ?? false,
        body.crmSyncFilters || {},
        body.businessHours || {},
        body.aiLogicalProvider || null,
        body.aiModel || null,
        body.aiTokenPrices || {},
      ],
    )
    return result.rows[0]
  })

  app.get('/widgets', orgList('webchat_widgets'))
  app.post('/widgets', createRoute(widgetSchema, 'webchat_widgets', (input) => ({
    organization_id: input.organizationId,
    name: input.name,
    is_active: input.isActive ?? true,
    allowed_origins: input.allowedOrigins || [],
    branding: input.branding || {},
    consent_text: input.consentText || null,
    initial_form: input.initialForm || {},
  })))
  app.patch('/widgets/:id', updateRoute(widgetSchema.partial(), 'webchat_widgets', (input) => cleanPayload({
    name: input.name,
    is_active: input.isActive,
    allowed_origins: input.allowedOrigins,
    branding: input.branding,
    consent_text: input.consentText,
    initial_form: input.initialForm,
  })))

  app.get('/knowledge-sources', orgList('knowledge_sources', 'updated_at DESC'))
  app.post('/knowledge-sources', createRoute(knowledgeSourceSchema, 'knowledge_sources', (input) => ({
    organization_id: input.organizationId,
    source_type: input.sourceType,
    name: input.name,
    source_url: input.sourceUrl || null,
    storage_path: input.storagePath || null,
    retention_deadline_at: input.retentionDeadlineAt || null,
    status: input.status || 'draft',
  })))

  app.get('/knowledge-entries', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = organizationQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_organization_query' })
    return listKnowledgeEntries(app.pg, user, parsed.data.organizationId)
  })
  app.post('/knowledge-entries', createRoute(knowledgeEntrySchema, 'knowledge_entries', (input) => ({
    organization_id: input.organizationId,
    source_id: input.sourceId || null,
    title: input.title,
    body: input.body,
    status: input.status || 'draft',
    reviewer_user_id: input.reviewerUserId || null,
  })))
  app.patch('/knowledge-entries/:id', updateRoute(knowledgeEntrySchema.partial(), 'knowledge_entries', (input) => cleanPayload({
    title: input.title,
    body: input.body,
    status: input.status,
    reviewer_user_id: input.reviewerUserId,
    reviewed_at: input.status === 'approved' || input.status === 'published' ? new Date().toISOString() : undefined,
  })))

  app.get('/knowledge-publications', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = organizationQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_organization_query' })
    return listKnowledgePublications(app.pg, user, parsed.data.organizationId)
  })
  app.post('/knowledge-publications', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = knowledgePublicationSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_publication' })
    return reply.code(201).send(await createKnowledgePublication(app.pg, user, parsed.data))
  })

  app.get('/metrics', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = organizationQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_organization_query' })
    return getInternalMetrics(app.pg, user, parsed.data.organizationId)
  })

  app.get('/webhook-events', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = organizationQuerySchema.safeParse(request.query)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_organization_query' })
    return listWebhookEvents(app.pg, user, parsed.data.organizationId)
  })

  app.get('/conversations/:id/outbound-runs', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const params = idParams.safeParse(request.params)
    if (!params.success) return reply.code(400).send({ error: 'invalid_conversation_id' })
    return listOutboundRetryLogs(app.pg, user, params.data.id)
  })

  app.post('/simulate-channel-event', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const job = await app.jobQueue.add('omnichannel.simulateChannelEvent', { body: request.body as Record<string, unknown>, requestedBy: user.id })
    return { success: true, event: { pending: true, jobId: job.id } }
  })

  app.post('/scheduling', async (request, reply) => {
    const user = await getAuthenticatedUser(request, reply)
    if (!user) return reply
    const parsed = schedulingSchema.safeParse(request.body)
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_scheduling_request' })
    const result = await createSchedulingRequest(app.pg, user, parsed.data)
    const job = await app.jobQueue.add('omnichannel.requestScheduling', { ...parsed.data, requestedBy: user.id })
    return { ...result, jobId: job.id }
  })

  function orgList(table: string, orderBy = 'name') {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await getAuthenticatedUser(request, reply)
      if (!user) return reply
      const parsed = organizationQuerySchema.safeParse(request.query)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_organization_query' })
      return listOrganizationRows(app.pg, user, parsed.data.organizationId, table, orderBy)
    }
  }

  function createRoute<Schema extends z.ZodTypeAny>(
    schema: Schema,
    table: string,
    mapper: (input: z.infer<Schema>) => Record<string, unknown>,
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await getAuthenticatedUser(request, reply)
      if (!user) return reply
      const parsed = schema.safeParse(request.body)
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_payload' })
      return reply.code(201).send(await createOrganizationRow(app.pg, user, table, mapper(parsed.data)))
    }
  }

  function updateRoute<Schema extends z.ZodTypeAny>(
    schema: Schema,
    table: string,
    mapper: (input: z.infer<Schema>) => Record<string, unknown>,
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const user = await getAuthenticatedUser(request, reply)
      if (!user) return reply
      const params = idParams.safeParse(request.params)
      const parsed = schema.safeParse(request.body)
      if (!params.success || !parsed.success) return reply.code(400).send({ error: 'invalid_payload' })
      return updateRowById(app.pg, user, table, params.data.id, mapper(parsed.data))
    }
  }
}
