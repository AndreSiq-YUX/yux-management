import type { Connectable, Queryable } from './repository.js'
import type {
  MissionConversation,
  MissionConversationMessage,
  MissionConversationMessageKind,
  MissionConversationStatus,
} from './types.js'

type ConversationRow = {
  id: string
  organization_id: string
  contract_id: string | null
  mission_id: string | null
  status: MissionConversationStatus
  title: string
  current_brief: Record<string, unknown>
  context_readiness: Record<string, unknown>
  last_context_hash: string | null
  last_harness_run_id: string | null
  version: number
  created_by: string
  created_at: string | Date
  updated_at: string | Date
  completed_at: string | Date | null
  create_idempotency_key?: string
}

type MessageRow = {
  id: string
  organization_id: string
  conversation_id: string
  sequence: number
  actor_type: 'user' | 'agent' | 'system'
  message_kind: MissionConversationMessageKind
  content: string
  structured_payload: Record<string, unknown>
  source_refs: Array<Record<string, unknown>>
  client_message_id: string | null
  harness_run_id: string | null
  created_by: string | null
  created_at: string | Date
}

const CONVERSATION_COLUMNS = `id, organization_id, contract_id, mission_id, status, title,
  current_brief, context_readiness, last_context_hash, last_harness_run_id, version,
  created_by, created_at, updated_at, completed_at`

const MESSAGE_COLUMNS = `id, organization_id, conversation_id, sequence, actor_type, message_kind,
  content, structured_payload, source_refs, client_message_id, harness_run_id, created_by, created_at`

export async function createMissionConversation(pool: Connectable, input: {
  organizationId: string
  contractId?: string | null
  title: string
  firstMessage: string
  firstMessageClientId: string
  createdBy: string
  idempotencyKey: string
}): Promise<MissionConversation> {
  return inTransaction(pool, async (client) => {
    const inserted = await client.query<ConversationRow>(
      `INSERT INTO public.action_mission_conversations
         (organization_id, contract_id, title, created_by, create_idempotency_key)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (organization_id, create_idempotency_key) DO NOTHING
       RETURNING ${CONVERSATION_COLUMNS}`,
      [input.organizationId, input.contractId ?? null, input.title.trim(), input.createdBy, input.idempotencyKey],
    )
    if (!inserted.rows[0]) {
      const existing = await client.query<ConversationRow & { create_idempotency_key: string }>(
        `SELECT ${CONVERSATION_COLUMNS}, create_idempotency_key
         FROM public.action_mission_conversations
         WHERE organization_id = $1 AND create_idempotency_key = $2 LIMIT 1`,
        [input.organizationId, input.idempotencyKey],
      )
      if (!existing.rows[0]) throw new Error('mission_conversation_insert_failed')
      if (existing.rows[0].title !== input.title.trim()) throw new Error('mission_conversation_idempotency_conflict')
      const conversation = await getRequiredMissionConversation(client, existing.rows[0].id, input.organizationId)
      const firstMessage = conversation.messages[0]
      if (!firstMessage
        || firstMessage.clientMessageId !== input.firstMessageClientId
        || firstMessage.content !== input.firstMessage.trim()) {
        throw new Error('mission_conversation_idempotency_conflict')
      }
      return conversation
    }
    const conversation = mapConversation(inserted.rows[0], [])
    const message = await insertMessage(client, {
      organizationId: input.organizationId,
      conversationId: conversation.id,
      sequence: 1,
      actorType: 'user',
      messageKind: 'text',
      content: input.firstMessage,
      structuredPayload: {},
      sourceRefs: [],
      clientMessageId: input.firstMessageClientId,
      createdBy: input.createdBy,
    })
    return { ...conversation, messages: [message] }
  })
}

export async function getMissionConversation(
  client: Queryable,
  conversationId: string,
  organizationId: string,
): Promise<MissionConversation | null> {
  const conversation = await client.query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM public.action_mission_conversations
     WHERE id = $1 AND organization_id = $2 LIMIT 1`,
    [conversationId, organizationId],
  )
  if (!conversation.rows[0]) return null
  const messages = await client.query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM public.action_mission_conversation_messages
     WHERE conversation_id = $1 AND organization_id = $2 ORDER BY sequence ASC`,
    [conversationId, organizationId],
  )
  return mapConversation(conversation.rows[0], messages.rows)
}

export async function appendUserConversationMessage(pool: Connectable, input: {
  organizationId: string
  conversationId: string
  expectedVersion: number
  clientMessageId: string
  content: string
  createdBy: string
}): Promise<MissionConversation> {
  return inTransaction(pool, async (client) => {
    const current = await lockConversation(client, input.conversationId, input.organizationId)
    const duplicate = await client.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM public.action_mission_conversation_messages
       WHERE conversation_id = $1 AND organization_id = $2 AND client_message_id = $3 LIMIT 1`,
      [input.conversationId, input.organizationId, input.clientMessageId],
    )
    if (duplicate.rows[0]) return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
    if (current.version !== input.expectedVersion) throw new Error('mission_conversation_version_conflict')
    if (['converted', 'cancelled'].includes(current.status)) throw new Error('mission_conversation_not_writable')
    const sequence = await nextMessageSequence(client, input.conversationId, input.organizationId)
    await insertMessage(client, {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      sequence,
      actorType: 'user',
      messageKind: 'text',
      content: input.content,
      structuredPayload: {},
      sourceRefs: [],
      clientMessageId: input.clientMessageId,
      createdBy: input.createdBy,
    })
    const updated = await client.query<ConversationRow>(
      `UPDATE public.action_mission_conversations
       SET status = 'collecting_context', version = version + 1
       WHERE id = $1 AND organization_id = $2 AND version = $3
       RETURNING ${CONVERSATION_COLUMNS}`,
      [input.conversationId, input.organizationId, input.expectedVersion],
    )
    if (!updated.rows[0]) throw new Error('mission_conversation_version_conflict')
    return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
  })
}

export async function completeAgentConversationTurn(pool: Connectable, input: {
  organizationId: string
  conversationId: string
  expectedVersion: number
  status: MissionConversationStatus
  messageKind: MissionConversationMessageKind
  content: string
  structuredPayload: Record<string, unknown>
  sourceRefs: Array<Record<string, unknown>>
  harnessRunId: string
  contextHash: string
  currentBrief: Record<string, unknown>
  contextReadiness: Record<string, unknown>
}): Promise<MissionConversation> {
  return inTransaction(pool, async (client) => {
    const current = await lockConversation(client, input.conversationId, input.organizationId)
    const duplicate = await client.query<MessageRow>(
      `SELECT ${MESSAGE_COLUMNS} FROM public.action_mission_conversation_messages
       WHERE conversation_id = $1 AND organization_id = $2 AND harness_run_id = $3 LIMIT 1`,
      [input.conversationId, input.organizationId, input.harnessRunId],
    )
    if (duplicate.rows[0]) return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
    if (current.version !== input.expectedVersion) throw new Error('mission_conversation_version_conflict')
    const sequence = await nextMessageSequence(client, input.conversationId, input.organizationId)
    await insertMessage(client, {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      sequence,
      actorType: 'agent',
      messageKind: input.messageKind,
      content: input.content,
      structuredPayload: input.structuredPayload,
      sourceRefs: input.sourceRefs,
      harnessRunId: input.harnessRunId,
    })
    const updated = await client.query<ConversationRow>(
      `UPDATE public.action_mission_conversations
       SET status = $4, current_brief = $5, context_readiness = $6,
           last_context_hash = $7, last_harness_run_id = $8,
           completed_at = CASE WHEN $4 IN ('converted','cancelled') THEN NOW() ELSE NULL END,
           version = version + 1
       WHERE id = $1 AND organization_id = $2 AND version = $3
       RETURNING ${CONVERSATION_COLUMNS}`,
      [input.conversationId, input.organizationId, input.expectedVersion, input.status,
        input.currentBrief, input.contextReadiness, input.contextHash, input.harnessRunId],
    )
    if (!updated.rows[0]) throw new Error('mission_conversation_version_conflict')
    return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
  })
}

export async function attachMissionToConversation(pool: Connectable, input: {
  organizationId: string
  conversationId: string
  missionId: string
  expectedVersion: number
}): Promise<MissionConversation> {
  return inTransaction(pool, async (client) => {
    const current = await lockConversation(client, input.conversationId, input.organizationId)
    if (current.mission_id === input.missionId) return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
    if (current.mission_id) throw new Error('mission_conversation_already_attached')
    if (current.version !== input.expectedVersion) throw new Error('mission_conversation_version_conflict')
    const updated = await client.query<ConversationRow>(
      `UPDATE public.action_mission_conversations
       SET mission_id = $4, status = 'converted', completed_at = NOW(), version = version + 1
       WHERE id = $1 AND organization_id = $2 AND version = $3 AND mission_id IS NULL
       RETURNING ${CONVERSATION_COLUMNS}`,
      [input.conversationId, input.organizationId, input.expectedVersion, input.missionId],
    )
    if (!updated.rows[0]) throw new Error('mission_conversation_version_conflict')
    return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
  })
}

async function lockConversation(client: Queryable, conversationId: string, organizationId: string): Promise<ConversationRow> {
  const result = await client.query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM public.action_mission_conversations
     WHERE id = $1 AND organization_id = $2 FOR UPDATE`,
    [conversationId, organizationId],
  )
  if (!result.rows[0]) throw new Error('mission_conversation_not_found')
  return result.rows[0]
}

async function nextMessageSequence(client: Queryable, conversationId: string, organizationId: string): Promise<number> {
  const result = await client.query<{ next_sequence: number }>(
    `SELECT COALESCE(MAX(sequence), 0)::INTEGER + 1 AS next_sequence
     FROM public.action_mission_conversation_messages
     WHERE conversation_id = $1 AND organization_id = $2`,
    [conversationId, organizationId],
  )
  return Number(result.rows[0]?.next_sequence ?? 1)
}

async function insertMessage(client: Queryable, input: {
  organizationId: string
  conversationId: string
  sequence: number
  actorType: 'user' | 'agent' | 'system'
  messageKind: MissionConversationMessageKind
  content: string
  structuredPayload: Record<string, unknown>
  sourceRefs: Array<Record<string, unknown>>
  clientMessageId?: string
  harnessRunId?: string
  createdBy?: string
}): Promise<MissionConversationMessage> {
  const result = await client.query<MessageRow>(
    `INSERT INTO public.action_mission_conversation_messages
       (organization_id, conversation_id, sequence, actor_type, message_kind, content,
        structured_payload, source_refs, client_message_id, harness_run_id, created_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING ${MESSAGE_COLUMNS}`,
    [input.organizationId, input.conversationId, input.sequence, input.actorType, input.messageKind,
      input.content.trim(), input.structuredPayload, input.sourceRefs, input.clientMessageId ?? null,
      input.harnessRunId ?? null, input.createdBy ?? null],
  )
  if (!result.rows[0]) throw new Error('mission_conversation_message_insert_failed')
  return mapMessage(result.rows[0])
}

async function getRequiredMissionConversation(client: Queryable, conversationId: string, organizationId: string) {
  const conversation = await getMissionConversation(client, conversationId, organizationId)
  if (!conversation) throw new Error('mission_conversation_not_found')
  return conversation
}

function mapConversation(row: ConversationRow, messages: MessageRow[]): MissionConversation {
  return {
    id: row.id,
    organizationId: row.organization_id,
    ...(row.contract_id ? { contractId: row.contract_id } : {}),
    ...(row.mission_id ? { missionId: row.mission_id } : {}),
    status: row.status,
    title: row.title,
    currentBrief: row.current_brief ?? {},
    contextReadiness: row.context_readiness ?? {},
    ...(row.last_context_hash ? { lastContextHash: row.last_context_hash } : {}),
    ...(row.last_harness_run_id ? { lastHarnessRunId: row.last_harness_run_id } : {}),
    version: Number(row.version),
    createdBy: row.created_by,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    ...(row.completed_at ? { completedAt: iso(row.completed_at) } : {}),
    messages: messages.map(mapMessage),
  }
}

function mapMessage(row: MessageRow): MissionConversationMessage {
  return {
    id: row.id,
    organizationId: row.organization_id,
    conversationId: row.conversation_id,
    sequence: Number(row.sequence),
    actorType: row.actor_type,
    messageKind: row.message_kind,
    content: row.content,
    structuredPayload: row.structured_payload ?? {},
    sourceRefs: row.source_refs ?? [],
    ...(row.client_message_id ? { clientMessageId: row.client_message_id } : {}),
    ...(row.harness_run_id ? { harnessRunId: row.harness_run_id } : {}),
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    createdAt: iso(row.created_at),
  }
}

function iso(value: string | Date): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

async function inTransaction<T>(pool: Connectable, work: (client: Queryable) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    await client.release()
  }
}
