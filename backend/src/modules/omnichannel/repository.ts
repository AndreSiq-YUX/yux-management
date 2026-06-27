import type pg from 'pg'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { AuthUser } from '../../auth/routes.js'

type JsonRecord = Record<string, unknown>

export type ConversationFilters = {
  organizationId?: string
  channel?: string
  status?: string
  queueId?: string
  teamId?: string
  assignedUserId?: string
  sla?: string
  tag?: string
  handoff?: boolean
}

type ConversationRow = Record<string, unknown> & {
  id: string
  organization_id: string
  contact_id: string
  connection_id: string | null
  channel: string
  status: string
  response_mode: string
  queue_id: string | null
  team_id: string | null
  assigned_user_id: string | null
  lead_id: string | null
  subject: string | null
  summary: string | null
  classification: string | null
  sentiment: string | null
  commercial_intent: string | null
  scheduling_intent: string | null
  last_message_at: string | null
  sla_deadline_at: string | null
  resolved_at: string | null
  created_at: string
  updated_at: string
  omnichannel_contacts?: any
  channel_connections?: any
  conversation_queues?: any
  omnichannel_teams?: any
  users?: any
  conversation_tags?: Array<{ tag: string }>
}

type MessageRow = {
  id: string
  conversation_id: string
  connection_id: string | null
  direction: string
  author_type: string
  author_user_id: string | null
  content_type: string
  body: string | null
  external_message_id: string | null
  delivery_status: string
  metadata: JsonRecord | null
  created_at: string
  updated_at: string
  message_attachments?: any[]
}

type AttachmentRow = {
  id: string
  message_id: string
  storage_path: string
  filename: string
  mime_type: string
  byte_size: string | number
  retention_deadline_at: string | null
  created_at: string
  updated_at: string
}

type AiRunRow = {
  id: string
  organization_id: string
  conversation_id: string
  inbound_message_id: string | null
  outbound_message_id: string | null
  logical_provider: string | null
  model: string | null
  status: string
  input_tokens: string | number | null
  output_tokens: string | number | null
  estimated_cost: string | number | null
  latency_ms: string | number | null
  fallback_used: boolean
  protected_error_text: string | null
  metadata: JsonRecord | null
  created_at: string
  updated_at: string
}

type PublicationRow = {
  id: string
  organization_id: string
  entry_id: string
  body_snapshot: string
  publisher_user_id: string | null
  published_at: string
  knowledge_entries?: any
}

export async function listConversations(pool: pg.Pool, user: AuthUser, filters: ConversationFilters, portal = false) {
  const values: unknown[] = [user.id, isInternal(user)]
  const where: string[] = [
    `($2::boolean = TRUE OR EXISTS (
      SELECT 1 FROM public.memberships m
      WHERE m.user_id = $1 AND m.organization_id = c.organization_id
    ))`,
  ]

  addOptionalFilter(where, values, 'c.organization_id', filters.organizationId, 'uuid')
  addOptionalFilter(where, values, 'c.channel', filters.channel, 'text')
  addOptionalFilter(where, values, 'c.status', filters.status, 'text')
  addOptionalFilter(where, values, 'c.queue_id', filters.queueId, 'uuid')
  addOptionalFilter(where, values, 'c.team_id', filters.teamId, 'uuid')
  addOptionalFilter(where, values, 'c.assigned_user_id', filters.assignedUserId, 'uuid')
  if (filters.tag) {
    values.push(filters.tag)
    where.push(`EXISTS (SELECT 1 FROM public.conversation_tags ct WHERE ct.conversation_id = c.id AND ct.tag = $${values.length})`)
  }
  if (filters.handoff !== undefined) {
    where.push(filters.handoff ? `c.status = 'waiting_human'` : `c.status <> 'waiting_human'`)
  }
  if (filters.sla === 'overdue') {
    where.push(`c.sla_deadline_at < NOW() AND c.status <> 'resolved'`)
  }
  if (filters.sla === 'due_soon') {
    where.push(`c.sla_deadline_at >= NOW() AND c.sla_deadline_at <= NOW() + INTERVAL '1 hour' AND c.status <> 'resolved'`)
  }

  const result = await pool.query<ConversationRow>(
    `${conversationSelectSql()}
     WHERE ${where.join(' AND ')}
     ORDER BY c.last_message_at DESC NULLS LAST`,
    values,
  )
  return result.rows.map((row) => portal ? mapPortalConversation(row) : mapConversation(row))
}

export async function getConversation(pool: pg.Pool, user: AuthUser, conversationId: string, portal = false) {
  const result = await pool.query<ConversationRow>(
    `${conversationSelectSql()}
     WHERE c.id = $2
       AND ($3::boolean = TRUE OR EXISTS (
         SELECT 1 FROM public.memberships m
         WHERE m.user_id = $1 AND m.organization_id = c.organization_id
       ))
     LIMIT 1`,
    [user.id, conversationId, isInternal(user)],
  )
  const row = result.rows[0]
  if (!row) throw Object.assign(new Error('conversation_not_found'), { statusCode: 404 })
  return portal ? mapPortalConversation(row) : mapConversation(row)
}

export async function listMessages(pool: pg.Pool, user: AuthUser, conversationId: string) {
  await requireConversationAccess(pool, user, conversationId)
  const result = await pool.query<MessageRow>(
    `SELECT m.*,
       COALESCE((
         SELECT json_agg(a ORDER BY a.created_at)
         FROM public.message_attachments a
         WHERE a.message_id = m.id
       ), '[]'::json) AS message_attachments
     FROM public.messages m
     WHERE m.conversation_id = $1
     ORDER BY m.created_at ASC`,
    [conversationId],
  )
  return result.rows.map(mapMessage)
}

export async function listOrganizationRows(pool: pg.Pool, user: AuthUser, organizationId: string, table: string, orderBy = 'name') {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query(`SELECT * FROM public.${table} WHERE organization_id = $1 ORDER BY ${orderBy}`, [organizationId])
  return result.rows
}

export async function listTeamMembers(pool: pg.Pool, user: AuthUser, teamId: string) {
  await requireTeamAccess(pool, user, teamId)
  const result = await pool.query(
    `SELECT tm.*, row_to_json(u) AS users
     FROM public.omnichannel_team_members tm
     LEFT JOIN LATERAL (SELECT id, name FROM public.users WHERE id = tm.user_id) u ON TRUE
     WHERE tm.team_id = $1
     ORDER BY tm.priority ASC`,
    [teamId],
  )
  return result.rows
}

export async function listQueues(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query(
    `SELECT q.*, row_to_json(t) AS omnichannel_teams
     FROM public.conversation_queues q
     LEFT JOIN LATERAL (SELECT id, name FROM public.omnichannel_teams WHERE id = q.team_id) t ON TRUE
     WHERE q.organization_id = $1
     ORDER BY q.name`,
    [organizationId],
  )
  return result.rows
}

export async function getSettings(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query('SELECT * FROM public.omnichannel_settings WHERE organization_id = $1 LIMIT 1', [organizationId])
  return result.rows[0] ?? null
}

export async function listKnowledgeEntries(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query(
    `SELECT e.*, row_to_json(s) AS knowledge_sources
     FROM public.knowledge_entries e
     LEFT JOIN LATERAL (SELECT id, name FROM public.knowledge_sources WHERE id = e.source_id) s ON TRUE
     WHERE e.organization_id = $1
     ORDER BY e.updated_at DESC`,
    [organizationId],
  )
  return result.rows
}

export async function listKnowledgePublications(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query<PublicationRow>(
    `SELECT p.*,
       row_to_json(e) AS knowledge_entries
     FROM public.knowledge_publications p
     LEFT JOIN LATERAL (SELECT id, title, body, status FROM public.knowledge_entries WHERE id = p.entry_id) e ON TRUE
     WHERE p.organization_id = $1
     ORDER BY p.published_at DESC`,
    [organizationId],
  )
  return result.rows.map(mapKnowledgePublication)
}

export async function getInternalMetrics(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const [aiRuns, crmRuns, outboundRuns] = await Promise.all([
    pool.query<AiRunRow>('SELECT * FROM public.ai_message_runs WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId]),
    pool.query('SELECT * FROM public.crm_sync_runs WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId]),
    pool.query('SELECT * FROM public.outbound_message_runs WHERE organization_id = $1 ORDER BY created_at DESC', [organizationId]),
  ])
  return {
    aiRuns: aiRuns.rows.map(mapAiRun),
    crmRuns: crmRuns.rows,
    outboundRuns: outboundRuns.rows,
  }
}

export async function listWebhookEvents(pool: pg.Pool, user: AuthUser, organizationId: string) {
  await requireOrganizationAccess(pool, user, organizationId)
  const result = await pool.query(
    `SELECT e.*, row_to_json(c) AS channel_connections
     FROM public.channel_webhook_events e
     JOIN public.channel_connections c ON c.id = e.connection_id
     WHERE c.organization_id = $1
     ORDER BY e.received_at DESC`,
    [organizationId],
  )
  return result.rows
}

export async function listOutboundRetryLogs(pool: pg.Pool, user: AuthUser, conversationId: string) {
  await requireConversationAccess(pool, user, conversationId)
  const result = await pool.query('SELECT * FROM public.outbound_message_runs WHERE conversation_id = $1 ORDER BY created_at DESC', [conversationId])
  return result.rows
}

export async function createHumanReply(pool: pg.Pool, user: AuthUser, input: { conversationId: string; connectionId?: string; body: string; authorUserId?: string; metadata?: JsonRecord }) {
  const conversation = await requireConversationAccess(pool, user, input.conversationId)
  const result = await pool.query<MessageRow>(
    `INSERT INTO public.messages (
       conversation_id, connection_id, direction, author_type, author_user_id, content_type, body, delivery_status, metadata
     )
     VALUES ($1, $2, 'outbound', 'agent', $3, 'text', $4, 'queued', $5)
     RETURNING *`,
    [input.conversationId, input.connectionId ?? conversation.connection_id ?? null, input.authorUserId ?? user.id, input.body, input.metadata ?? {}],
  )
  return mapMessage({ ...result.rows[0], message_attachments: [] })
}

export async function createMessageAttachment(pool: pg.Pool, user: AuthUser, input: {
  messageId: string
  filename: string
  mimeType: string
  byteSize: number
  contentBase64: string
  retentionDeadlineAt?: string | null
}) {
  const message = await requireMessageAccess(pool, user, input.messageId)
  const maxMb = await getAttachmentLimitMb(pool, message.organization_id)
  if (input.byteSize > maxMb * 1024 * 1024) {
    throw Object.assign(new Error('attachment_too_large'), { statusCode: 413 })
  }

  const content = Buffer.from(input.contentBase64, 'base64')
  if (content.byteLength !== input.byteSize) {
    throw Object.assign(new Error('invalid_attachment_size'), { statusCode: 400 })
  }

  const id = randomUUID()
  const safeName = sanitizeFileName(input.filename)
  const relativePath = path.join(message.organization_id, input.messageId, `${id}-${safeName}`)
  const absolutePath = attachmentPath(relativePath)
  await mkdir(path.dirname(absolutePath), { recursive: true })
  await writeFile(absolutePath, content)

  const result = await pool.query<AttachmentRow>(
    `INSERT INTO public.message_attachments (
       id, message_id, storage_path, filename, mime_type, byte_size, retention_deadline_at
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING id, message_id, storage_path, filename, mime_type, byte_size, retention_deadline_at, created_at, updated_at`,
    [id, input.messageId, relativePath, input.filename, input.mimeType, input.byteSize, input.retentionDeadlineAt ?? null],
  )
  return mapAttachment(result.rows[0])
}

export async function getMessageAttachmentFile(pool: pg.Pool, user: AuthUser, attachmentId: string) {
  const attachment = await getAttachmentRow(pool, user, attachmentId)
  const filePath = await findAttachmentFile(attachment)
  if (!filePath) throw Object.assign(new Error('attachment_file_not_found'), { statusCode: 404 })
  return {
    filePath,
    fileName: attachment.filename,
    fileType: attachment.mime_type,
  }
}

export async function assignConversation(pool: pg.Pool, user: AuthUser, input: { conversationId: string; queueId?: string; teamId?: string; assignedUserId?: string; reason?: string; assignedByUserId?: string }) {
  await requireConversationAccess(pool, user, input.conversationId)
  const assignment = await pool.query(
    `INSERT INTO public.conversation_assignments (
       conversation_id, queue_id, team_id, assigned_user_id, source, reason, assigned_by_user_id
     )
     VALUES ($1, $2, $3, $4, 'manual', $5, $6)
     RETURNING *`,
    [input.conversationId, input.queueId ?? null, input.teamId ?? null, input.assignedUserId ?? null, input.reason ?? null, input.assignedByUserId ?? user.id],
  )
  await pool.query(
    `UPDATE public.conversations
     SET queue_id = $2, team_id = $3, assigned_user_id = $4, status = $5, updated_at = NOW()
     WHERE id = $1`,
    [input.conversationId, input.queueId ?? null, input.teamId ?? null, input.assignedUserId ?? null, input.assignedUserId ? 'assigned' : 'waiting_human'],
  )
  return assignment.rows[0]
}

export async function handoffConversation(pool: pg.Pool, user: AuthUser, input: { conversationId: string; trigger: string; ruleId?: string; outcome?: JsonRecord }) {
  await requireConversationAccess(pool, user, input.conversationId)
  const event = await pool.query(
    `INSERT INTO public.handoff_events (conversation_id, rule_id, trigger, outcome)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.conversationId, input.ruleId ?? null, input.trigger, input.outcome ?? {}],
  )
  await pool.query(
    `UPDATE public.conversations
     SET status = 'waiting_human', response_mode = 'manual', updated_at = NOW()
     WHERE id = $1`,
    [input.conversationId],
  )
  return event.rows[0]
}

export async function updateConversationStatus(pool: pg.Pool, user: AuthUser, conversationId: string, status: 'resolved' | 'open') {
  await requireConversationAccess(pool, user, conversationId)
  await pool.query(
    `UPDATE public.conversations
     SET status = $2, resolved_at = $3, updated_at = NOW()
     WHERE id = $1`,
    [conversationId, status, status === 'resolved' ? new Date().toISOString() : null],
  )
  return getConversation(pool, user, conversationId)
}

export async function createOrganizationRow(pool: pg.Pool, user: AuthUser, table: string, values: JsonRecord) {
  await requireOrganizationAccess(pool, user, String(values.organization_id))
  const keys = Object.keys(values)
  const placeholders = keys.map((_, index) => `$${index + 1}`)
  const result = await pool.query(
    `INSERT INTO public.${table} (${keys.join(', ')})
     VALUES (${placeholders.join(', ')})
     RETURNING *`,
    keys.map((key) => values[key]),
  )
  return result.rows[0]
}

export async function updateRowById(pool: pg.Pool, user: AuthUser, table: string, id: string, values: JsonRecord) {
  const existing = await getRowById(pool, table, id)
  if (!existing) throw Object.assign(new Error('row_not_found'), { statusCode: 404 })
  await requireOrganizationAccess(pool, user, existing.organization_id)

  const keys = Object.keys(values).filter((key) => values[key] !== undefined)
  if (keys.length === 0) return existing
  const assignments = keys.map((key, index) => `${key} = $${index + 2}`)
  const result = await pool.query(
    `UPDATE public.${table}
     SET ${assignments.join(', ')}, updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [id, ...keys.map((key) => values[key])],
  )
  return result.rows[0]
}

export async function createKnowledgePublication(pool: pg.Pool, user: AuthUser, input: { organizationId: string; entryId: string; bodySnapshot: string; publisherUserId?: string }) {
  await requireOrganizationAccess(pool, user, input.organizationId)
  const result = await pool.query<PublicationRow>(
    `INSERT INTO public.knowledge_publications (organization_id, entry_id, body_snapshot, publisher_user_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [input.organizationId, input.entryId, input.bodySnapshot, input.publisherUserId ?? user.id],
  )
  await pool.query(
    `UPDATE public.knowledge_entries
     SET status = 'published', reviewer_user_id = $2, reviewed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [input.entryId, input.publisherUserId ?? user.id],
  )
  const hydrated = await pool.query<PublicationRow>(
    `SELECT p.*, row_to_json(e) AS knowledge_entries
     FROM public.knowledge_publications p
     LEFT JOIN LATERAL (SELECT id, title, body, status FROM public.knowledge_entries WHERE id = p.entry_id) e ON TRUE
     WHERE p.id = $1`,
    [result.rows[0].id],
  )
  return mapKnowledgePublication(hydrated.rows[0])
}

export async function createSchedulingRequest(pool: pg.Pool, user: AuthUser, body: { conversationId: string; requestedSlot: JsonRecord }) {
  const conversation = await requireConversationAccess(pool, user, body.conversationId)
  const result = await pool.query(
    `INSERT INTO public.scheduling_requests (
       organization_id, conversation_id, contact_id, lead_id, requested_slot, status, n8n_metadata
     )
     VALUES ($1, $2, $3, $4, $5, 'pending', $6)
     RETURNING *`,
    [conversation.organization_id, conversation.id, conversation.contact_id, conversation.lead_id, body.requestedSlot, { source: 'backend' }],
  )
  return { success: true, schedulingRequest: result.rows[0] }
}

async function getRowById(pool: pg.Pool, table: string, id: string) {
  const result = await pool.query(`SELECT * FROM public.${table} WHERE id = $1 LIMIT 1`, [id])
  return result.rows[0]
}

async function requireOrganizationAccess(pool: pg.Pool, user: AuthUser, organizationId: string) {
  if (isInternal(user)) return
  const result = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok
     FROM public.memberships
     WHERE user_id = $1 AND organization_id = $2
     LIMIT 1`,
    [user.id, organizationId],
  )
  if (!result.rows[0]) throw Object.assign(new Error('organization_forbidden'), { statusCode: 403 })
}

async function requireConversationAccess(pool: pg.Pool, user: AuthUser, conversationId: string) {
  const result = await pool.query<ConversationRow>(
    `SELECT *
     FROM public.conversations c
     WHERE c.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships m
           WHERE m.user_id = $1 AND m.organization_id = c.organization_id
         )
       )
     LIMIT 1`,
    [user.id, conversationId, isInternal(user)],
  )
  const conversation = result.rows[0]
  if (!conversation) throw Object.assign(new Error('conversation_not_found'), { statusCode: 404 })
  return conversation
}

async function requireMessageAccess(pool: pg.Pool, user: AuthUser, messageId: string) {
  const result = await pool.query<{ id: string; organization_id: string }>(
    `SELECT m.id, c.organization_id
     FROM public.messages m
     JOIN public.conversations c ON c.id = m.conversation_id
     WHERE m.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships ms
           WHERE ms.user_id = $1 AND ms.organization_id = c.organization_id
         )
       )
     LIMIT 1`,
    [user.id, messageId, isInternal(user)],
  )
  const message = result.rows[0]
  if (!message) throw Object.assign(new Error('message_not_found'), { statusCode: 404 })
  return message
}

async function getAttachmentRow(pool: pg.Pool, user: AuthUser, attachmentId: string) {
  const result = await pool.query<AttachmentRow>(
    `SELECT a.*
     FROM public.message_attachments a
     JOIN public.messages m ON m.id = a.message_id
     JOIN public.conversations c ON c.id = m.conversation_id
     WHERE a.id = $2
       AND (
         $3::boolean = TRUE
         OR EXISTS (
           SELECT 1 FROM public.memberships ms
           WHERE ms.user_id = $1 AND ms.organization_id = c.organization_id
         )
       )
     LIMIT 1`,
    [user.id, attachmentId, isInternal(user)],
  )
  const attachment = result.rows[0]
  if (!attachment) throw Object.assign(new Error('attachment_not_found'), { statusCode: 404 })
  return attachment
}

async function getAttachmentLimitMb(pool: pg.Pool, organizationId: string) {
  const configured = Number(process.env.OMNICHANNEL_ATTACHMENT_MAX_MB || 25)
  const defaultLimit = Number.isFinite(configured) && configured > 0 ? configured : 25
  const result = await pool.query<{ max_upload_size_mb: number | null }>(
    'SELECT max_upload_size_mb FROM public.omnichannel_settings WHERE organization_id = $1 LIMIT 1',
    [organizationId],
  )
  return Number(result.rows[0]?.max_upload_size_mb || defaultLimit)
}

async function findAttachmentFile(attachment: AttachmentRow) {
  const basePath = attachmentPath()
  const resolvedPath = attachmentPath(attachment.storage_path)
  if (!resolvedPath.startsWith(`${basePath}${path.sep}`)) return null

  const exactExists = await readdir(path.dirname(resolvedPath)).then(
    (files) => files.includes(path.basename(resolvedPath)),
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return false
      throw error
    },
  )
  return exactExists ? resolvedPath : null
}

async function requireTeamAccess(pool: pg.Pool, user: AuthUser, teamId: string) {
  const result = await pool.query<{ organization_id: string }>('SELECT organization_id FROM public.omnichannel_teams WHERE id = $1 LIMIT 1', [teamId])
  const row = result.rows[0]
  if (!row) throw Object.assign(new Error('team_not_found'), { statusCode: 404 })
  await requireOrganizationAccess(pool, user, row.organization_id)
}

function conversationSelectSql() {
  return `SELECT c.*,
       (SELECT row_to_json(oc) FROM (
         SELECT id, display_name, email, phone, lead_id, client_id
         FROM public.omnichannel_contacts WHERE id = c.contact_id
       ) oc) AS omnichannel_contacts,
       (SELECT row_to_json(cc) FROM (
         SELECT id, channel, name, adapter_key, is_active, provider_account_id, phone_number_id,
                provider_verify_state, token_state, last_provider_sync_at, protected_metadata_references
         FROM public.channel_connections WHERE id = c.connection_id
       ) cc) AS channel_connections,
       (SELECT row_to_json(q) FROM (SELECT id, name FROM public.conversation_queues WHERE id = c.queue_id) q) AS conversation_queues,
       (SELECT row_to_json(t) FROM (SELECT id, name FROM public.omnichannel_teams WHERE id = c.team_id) t) AS omnichannel_teams,
       (SELECT row_to_json(u) FROM (SELECT id, name FROM public.users WHERE id = c.assigned_user_id) u) AS users,
       COALESCE((
         SELECT json_agg(json_build_object('tag', ct.tag) ORDER BY ct.tag)
         FROM public.conversation_tags ct
         WHERE ct.conversation_id = c.id
       ), '[]'::json) AS conversation_tags
     FROM public.conversations c`
}

function addOptionalFilter(where: string[], values: unknown[], column: string, value: unknown, type: 'uuid' | 'text') {
  if (!value) return
  values.push(value)
  where.push(`${column} = $${values.length}::${type}`)
}

function optional<T>(value: T | null | undefined | '') {
  return value === null || value === undefined || value === '' ? undefined : value
}

function numberValue(value: string | number | null | undefined) {
  return Number(value || 0)
}

function mapConversation(row: ConversationRow) {
  const connection = row.channel_connections
  return {
    id: row.id,
    organizationId: row.organization_id,
    contactId: row.contact_id,
    connectionId: optional(row.connection_id),
    channel: row.channel,
    status: row.status,
    responseMode: row.response_mode,
    queueId: optional(row.queue_id),
    teamId: optional(row.team_id),
    assignedUserId: optional(row.assigned_user_id),
    leadId: optional(row.lead_id),
    subject: optional(row.subject),
    summary: optional(row.summary),
    classification: optional(row.classification),
    sentiment: optional(row.sentiment),
    commercialIntent: optional(row.commercial_intent),
    schedulingIntent: optional(row.scheduling_intent),
    lastMessageAt: optional(row.last_message_at),
    slaDeadlineAt: optional(row.sla_deadline_at),
    resolvedAt: optional(row.resolved_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    contact: row.omnichannel_contacts ? {
      id: row.omnichannel_contacts.id,
      displayName: row.omnichannel_contacts.display_name,
      email: optional(row.omnichannel_contacts.email),
      phone: optional(row.omnichannel_contacts.phone),
      leadId: optional(row.omnichannel_contacts.lead_id),
      clientId: optional(row.omnichannel_contacts.client_id),
    } : undefined,
    connection: connection ? {
      id: connection.id,
      channel: connection.channel,
      name: connection.name,
      adapterKey: optional(connection.adapter_key),
      isActive: Boolean(connection.is_active),
      providerAccountId: optional(connection.provider_account_id),
      phoneNumberId: optional(connection.phone_number_id),
      providerVerifyState: optional(connection.provider_verify_state),
      tokenState: optional(connection.token_state),
      lastProviderSyncAt: optional(connection.last_provider_sync_at),
      protectedMetadataReferences: connection.protected_metadata_references || {},
      health: deriveProviderHealth({
        isActive: Boolean(connection.is_active),
        channel: connection.channel,
        phoneNumberId: optional(connection.phone_number_id),
        providerVerifyState: optional(connection.provider_verify_state),
        tokenState: optional(connection.token_state),
      }),
    } : undefined,
    queue: summaryByName(row.conversation_queues),
    team: summaryByName(row.omnichannel_teams),
    assignedUser: summaryByName(row.users),
    tags: (row.conversation_tags || []).map((tag) => tag.tag).filter(Boolean),
  }
}

function mapPortalConversation(row: ConversationRow) {
  const conversation = mapConversation(row)
  return {
    id: conversation.id,
    organizationId: conversation.organizationId,
    channel: conversation.channel,
    status: conversation.status,
    responseMode: conversation.responseMode,
    subject: conversation.subject,
    summary: conversation.summary,
    classification: conversation.classification,
    sentiment: conversation.sentiment,
    lastMessageAt: conversation.lastMessageAt,
    slaDeadlineAt: conversation.slaDeadlineAt,
    resolvedAt: conversation.resolvedAt,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    contact: conversation.contact,
    queue: conversation.queue,
    team: conversation.team,
    assignedUser: conversation.assignedUser,
    tags: conversation.tags,
  }
}

function mapMessage(row: MessageRow) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    connectionId: optional(row.connection_id),
    direction: row.direction,
    authorType: row.author_type,
    authorUserId: optional(row.author_user_id),
    contentType: row.content_type,
    body: optional(row.body),
    externalMessageId: optional(row.external_message_id),
    deliveryStatus: row.delivery_status,
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    attachments: (row.message_attachments || []).map(mapAttachment),
  }
}

function mapAttachment(attachment: AttachmentRow) {
  return {
    id: attachment.id,
    messageId: attachment.message_id,
    storagePath: attachment.storage_path,
    filename: attachment.filename,
    mimeType: attachment.mime_type,
    byteSize: numberValue(attachment.byte_size),
    retentionDeadlineAt: optional(attachment.retention_deadline_at),
    createdAt: attachment.created_at,
    updatedAt: attachment.updated_at,
    fileUrl: `/api/omnichannel/attachments/${attachment.id}/file`,
  }
}

function attachmentPath(...parts: string[]) {
  return path.resolve(process.env.OMNICHANNEL_ATTACHMENTS_DIR ?? path.join(process.cwd(), 'storage', 'omnichannel-attachments'), ...parts)
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 160) || 'attachment'
}

function mapAiRun(row: AiRunRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    inboundMessageId: optional(row.inbound_message_id),
    outboundMessageId: optional(row.outbound_message_id),
    logicalProvider: optional(row.logical_provider),
    model: optional(row.model),
    status: row.status,
    inputTokens: numberValue(row.input_tokens),
    outputTokens: numberValue(row.output_tokens),
    estimatedCost: numberValue(row.estimated_cost),
    latencyMs: numberValue(row.latency_ms),
    fallbackUsed: Boolean(row.fallback_used),
    protectedErrorText: optional(row.protected_error_text),
    metadata: row.metadata || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapKnowledgePublication(row: PublicationRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    entryId: row.entry_id,
    bodySnapshot: row.body_snapshot,
    publisherUserId: optional(row.publisher_user_id),
    publishedAt: row.published_at,
    entry: row.knowledge_entries ? {
      id: row.knowledge_entries.id,
      title: row.knowledge_entries.title,
      body: row.knowledge_entries.body,
      status: row.knowledge_entries.status,
    } : undefined,
  }
}

function summaryByName(row: { id?: string; name?: string | null } | null | undefined) {
  return row?.id ? { id: row.id, name: row.name || '' } : undefined
}

function deriveProviderHealth(input: {
  isActive: boolean
  channel: string
  phoneNumberId?: string
  providerVerifyState?: string
  tokenState?: string
}) {
  if (!input.isActive) return { state: 'inactive', label: 'Provider inativo' }
  if (input.channel !== 'whatsapp') return { state: 'healthy', label: 'Provider padrao' }
  if (!input.phoneNumberId || input.tokenState === 'not_configured') return { state: 'warning', label: 'WhatsApp nao configurado' }
  if (input.tokenState === 'needs_reauth') return { state: 'blocked', label: 'WhatsApp precisa reautenticar' }
  if (input.tokenState === 'failed') return { state: 'blocked', label: 'WhatsApp com falha' }
  if (input.tokenState === 'stale' || input.providerVerifyState !== 'verified') return { state: 'warning', label: 'WhatsApp requer revisao' }
  return { state: 'healthy', label: 'WhatsApp conectado' }
}

function isInternal(user: AuthUser) {
  return user.role === 'yux_admin' || user.role === 'yux_operator'
}
