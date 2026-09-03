import { recordDomainEvent } from '../events/repository.js'
import { CAMPAIGN_LAUNCH_PACK_V1 } from './packs/campaign-launch-v1.js'
import { FUNNEL_NURTURE_PACK_V1 } from './packs/funnel-nurture-v1.js'
import { REVENUE_RECOVERY_PACK_V0 } from './packs/revenue-recovery-v0.js'
import { createMissionInTransaction, getMission, hashCanonical, transitionMission, type Connectable, type Queryable } from './repository.js'
import type {
  ActionMission,
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

export function isMissionConversationRolloutEnabled(
  config: { MISSION_CONVERSATIONS_ENABLED?: boolean; MISSION_CONVERSATIONS_TENANT_ALLOWLIST?: string },
  organizationId: string,
) {
  if (config.MISSION_CONVERSATIONS_ENABLED !== true) return false
  const allowlist = new Set((config.MISSION_CONVERSATIONS_TENANT_ALLOWLIST ?? '').split(',').map(item => item.trim()).filter(Boolean))
  return allowlist.size === 0 || allowlist.has(organizationId)
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

export async function listMissionConversations(
  client: Queryable,
  organizationId: string,
): Promise<MissionConversation[]> {
  const conversations = await client.query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM public.action_mission_conversations
     WHERE organization_id = $1
     ORDER BY updated_at DESC, id DESC
     LIMIT 50`,
    [organizationId],
  )
  if (!conversations.rows.length) return []
  const ids = conversations.rows.map((row) => row.id)
  const messages = await client.query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM public.action_mission_conversation_messages
     WHERE organization_id = $1 AND conversation_id = ANY($2::uuid[])
     ORDER BY conversation_id ASC, sequence ASC`,
    [organizationId, ids],
  )
  const byConversation = new Map<string, MessageRow[]>()
  for (const message of messages.rows) {
    const current = byConversation.get(message.conversation_id) ?? []
    current.push(message)
    byConversation.set(message.conversation_id, current)
  }
  return conversations.rows.map((row) => mapConversation(row, byConversation.get(row.id) ?? []))
}

export async function confirmMissionConversationBrief(pool: Connectable, input: {
  organizationId: string
  conversationId: string
  expectedVersion: number
  briefHash: string
  confirmedBy: string
}): Promise<{ conversation: MissionConversation; mission: ActionMission }> {
  return inTransaction(pool, async (client) => {
    const current = await lockConversation(client, input.conversationId, input.organizationId)
    if (current.mission_id) {
      const mission = await getAttachedMission(client, current.mission_id, input.organizationId)
      return { conversation: await getRequiredMissionConversation(client, input.conversationId, input.organizationId), mission }
    }
    if (current.version !== input.expectedVersion) throw new Error('mission_conversation_version_conflict')
    if (current.status !== 'brief_confirmation') throw new Error('mission_conversation_brief_not_confirmable')
    const currentBrief = current.current_brief ?? {}
    if (hashCanonical(currentBrief) !== input.briefHash) throw new Error('mission_conversation_brief_changed')
    const selected = await resolveConversationPacks(client, input.organizationId, current.contract_id, currentBrief)
    const deadlineAt = requiredDeadline(currentBrief.deadlineAt)
    const mode = missionMode(currentBrief.mode)
    const objective = requiredBriefString(currentBrief.objective, 'mission_conversation_objective_required')
    const maxTotalCostBrl = positiveDecimal(currentBrief.maxTotalCostBrl, '1000')
    const maxHumanHours = positiveDecimal(currentBrief.maxHumanHours, '8')
    const allowedModules = [...new Set(selected.flatMap(item => item.allowedModules))].sort()
    const parameters = conversationMissionParameters(currentBrief, selected.map(item => item.key), deadlineAt, maxTotalCostBrl, maxHumanHours)
    const mission = await createMissionInTransaction(client, {
      organizationId: input.organizationId,
      ...(current.contract_id ? { contractId: current.contract_id } : {}),
      packVersionId: selected[0]!.id,
      title: optionalBriefString(currentBrief.title) ?? current.title,
      objective,
      mode,
      parameters,
      goal: {
        statement: objective,
        requestedOutcome: optionalBriefString(currentBrief.requestedOutcome) ?? selected.map(item => item.key).join('+'),
        scopeHints: stringList(currentBrief.scopeHints).length ? stringList(currentBrief.scopeHints) : allowedModules,
        constraints: recordValue(currentBrief.constraints),
        acceptanceCriteria: Array.isArray(currentBrief.acceptanceCriteria)
          ? currentBrief.acceptanceCriteria.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object')) as never
          : [],
      },
      autonomyEnvelope: {
        mode,
        allowedModules,
        allowedCapabilityKeys: [],
        maxTotalCostBrl,
        maxHumanHours,
        ...(positiveInteger(currentBrief.maxExternalContacts) ? { maxExternalContacts: positiveInteger(currentBrief.maxExternalContacts) } : {}),
        expiresAt: deadlineAt,
        alwaysRequireApprovalFor: ['external', 'irreversible', 'destructive'],
      },
      packSelection: {
        strategy: 'confirmed_conversation',
        conversationId: current.id,
        briefHash: input.briefHash,
        packs: selected.map(item => ({ key: item.key, version: item.version, contentHash: item.contentHash })),
      },
      budget: { maxTotalCostBrl, maxHumanHours, humanHourlyRateBrl: '100' },
      deadlineAt,
      createdBy: input.confirmedBy,
      idempotencyKey: `mission-conversation:${current.id}:${input.briefHash}`,
    })
    const planningMission = await transitionMission(client, {
      missionId: mission.id, organizationId: input.organizationId, expectedVersion: mission.version,
      toStatus: 'planning', actor: { type: 'user', id: input.confirmedBy }, reason: 'conversation_brief_confirmed',
    })
    const updated = await client.query<ConversationRow>(
      `UPDATE public.action_mission_conversations
       SET mission_id = $4, status = 'planning', version = version + 1, updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND version = $3 AND mission_id IS NULL
       RETURNING ${CONVERSATION_COLUMNS}`,
      [input.conversationId, input.organizationId, input.expectedVersion, planningMission.id],
    )
    if (!updated.rows[0]) throw new Error('mission_conversation_version_conflict')
    await recordDomainEvent(client, {
      eventType: 'mission.conversation_brief_confirmed', organizationId: input.organizationId,
      aggregateType: 'mission', aggregateId: planningMission.id, actor: { type: 'user', id: input.confirmedBy },
      payload: { conversationId: input.conversationId, briefHash: input.briefHash },
    })
    return {
      conversation: await getRequiredMissionConversation(client, input.conversationId, input.organizationId),
      mission: planningMission,
    }
  })
}

export async function appendUserConversationMessage(pool: Connectable, input: {
  organizationId: string
  conversationId: string
  expectedVersion: number
  clientMessageId: string
  content: string
  createdBy: string
  maxTurns?: number
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
    if (!['awaiting_user', 'brief_confirmation', 'blocked'].includes(current.status)) throw new Error('mission_conversation_not_writable')
    const turnCount = await client.query<{ count: number | string }>(
      `SELECT COUNT(*)::INT AS count FROM public.action_mission_conversation_messages
       WHERE conversation_id = $1 AND organization_id = $2 AND actor_type = 'user'`,
      [input.conversationId, input.organizationId],
    )
    if (Number(turnCount.rows[0]?.count ?? 0) >= (input.maxTurns ?? 6)) throw new Error('mission_conversation_turn_limit_reached')
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

export async function cancelMissionConversation(pool: Connectable, input: {
  organizationId: string
  conversationId: string
  expectedVersion: number
}): Promise<MissionConversation> {
  return inTransaction(pool, async (client) => {
    const current = await lockConversation(client, input.conversationId, input.organizationId)
    if (current.status === 'cancelled') return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
    if (current.mission_id || ['planning', 'awaiting_plan_approval', 'converted'].includes(current.status)) {
      throw new Error('mission_conversation_not_cancellable')
    }
    if (current.version !== input.expectedVersion) throw new Error('mission_conversation_version_conflict')
    const updated = await client.query<ConversationRow>(
      `UPDATE public.action_mission_conversations
       SET status = 'cancelled', completed_at = NOW(), version = version + 1
       WHERE id = $1 AND organization_id = $2 AND version = $3
       RETURNING ${CONVERSATION_COLUMNS}`,
      [input.conversationId, input.organizationId, input.expectedVersion],
    )
    if (!updated.rows[0]) throw new Error('mission_conversation_version_conflict')
    return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
  })
}

export async function recordMissionConversationProcessingError(client: Queryable, input: {
  organizationId: string
  conversationId: string
  expectedVersion: number
  errorCode: string
}): Promise<void> {
  await client.query(
    `UPDATE public.action_mission_conversations
     SET status = 'blocked',
         context_readiness = context_readiness || jsonb_build_object('processingError', $4::TEXT),
         updated_at = NOW()
     WHERE id = $1 AND organization_id = $2 AND version = $3 AND status = 'collecting_context'`,
    [input.conversationId, input.organizationId, input.expectedVersion, input.errorCode],
  )
}

export async function retryMissionConversationProcessing(pool: Connectable, input: {
  organizationId: string
  conversationId: string
  expectedVersion: number
}): Promise<MissionConversation> {
  return inTransaction(pool, async (client) => {
    const current = await lockConversation(client, input.conversationId, input.organizationId)
    if (current.version !== input.expectedVersion) throw new Error('mission_conversation_version_conflict')
    const processingError = current.context_readiness?.processingError
    const hasRecordedError = typeof processingError === 'string' && Boolean(processingError.trim())
    const staleCollecting = current.status === 'collecting_context'
      && Date.now() - new Date(current.updated_at).getTime() >= 30_000
    if (!(current.status === 'blocked' && hasRecordedError) && !staleCollecting) {
      throw new Error('mission_conversation_processing_not_retryable')
    }
    const updated = await client.query<ConversationRow>(
      `UPDATE public.action_mission_conversations
       SET status = 'collecting_context', context_readiness = context_readiness - 'processingError', updated_at = NOW()
       WHERE id = $1 AND organization_id = $2 AND version = $3
       RETURNING ${CONVERSATION_COLUMNS}`,
      [input.conversationId, input.organizationId, input.expectedVersion],
    )
    if (!updated.rows[0]) throw new Error('mission_conversation_version_conflict')
    return getRequiredMissionConversation(client, input.conversationId, input.organizationId)
  })
}

export async function projectMissionConversationPlanningResult(client: Queryable, input: {
  organizationId: string
  missionId: string
  status: 'awaiting_user' | 'awaiting_plan_approval' | 'blocked'
  messageKind: 'question' | 'plan' | 'error' | 'status'
  content: string
  structuredPayload: Record<string, unknown>
  contextReadiness?: Record<string, unknown>
}): Promise<MissionConversation | null> {
  const locked = await client.query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM public.action_mission_conversations
     WHERE mission_id = $1 AND organization_id = $2 FOR UPDATE`,
    [input.missionId, input.organizationId],
  )
  const current = locked.rows[0]
  if (!current) return null
  const existing = await client.query<MessageRow>(
    `SELECT ${MESSAGE_COLUMNS} FROM public.action_mission_conversation_messages
     WHERE conversation_id = $1 AND organization_id = $2
       AND structured_payload->>'projectionKey' = $3 LIMIT 1`,
    [current.id, input.organizationId, String(input.structuredPayload.projectionKey ?? '')],
  )
  if (!existing.rows[0]) {
    const latestSources = await client.query<{ source_refs: Array<Record<string, unknown>> }>(
      `SELECT source_refs FROM public.action_mission_conversation_messages
       WHERE conversation_id = $1 AND organization_id = $2 AND actor_type = 'agent'
       ORDER BY sequence DESC LIMIT 1`,
      [current.id, input.organizationId],
    )
    await insertMessage(client, {
      organizationId: input.organizationId, conversationId: current.id,
      sequence: await nextMessageSequence(client, current.id, input.organizationId),
      actorType: 'agent', messageKind: input.messageKind, content: input.content,
      structuredPayload: input.structuredPayload, sourceRefs: latestSources.rows[0]?.source_refs ?? [],
    })
  }
  await client.query(
    `UPDATE public.action_mission_conversations
     SET status = $3, context_readiness = COALESCE($4::JSONB, context_readiness),
         version = version + 1, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [current.id, input.organizationId, input.status, input.contextReadiness ?? null],
  )
  return getRequiredMissionConversation(client, current.id, input.organizationId)
}

export async function returnMissionConversationToUser(client: Queryable, input: {
  organizationId: string
  missionId: string
  approvalId: string
  reason: string
}): Promise<void> {
  const conversation = await client.query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM public.action_mission_conversations
     WHERE mission_id = $1 AND organization_id = $2 FOR UPDATE`,
    [input.missionId, input.organizationId],
  )
  const current = conversation.rows[0]
  if (!current) return
  await insertMessage(client, {
    organizationId: input.organizationId, conversationId: current.id,
    sequence: await nextMessageSequence(client, current.id, input.organizationId),
    actorType: 'agent', messageKind: 'question',
    content: 'Entendi. Diga o que você quer alterar e vou preparar uma nova versão do plano.',
    structuredPayload: { kind: 'questions', projectionKey: `approval-feedback:${input.approvalId}`, feedbackReason: input.reason },
    sourceRefs: [],
  })
  await client.query(
    `UPDATE public.action_mission_conversations SET status = 'awaiting_user', version = version + 1, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [current.id, input.organizationId],
  )
}

export async function markMissionConversationPlanApproved(client: Queryable, input: {
  organizationId: string
  missionId: string
  planId: string
}): Promise<void> {
  const conversation = await client.query<ConversationRow>(
    `SELECT ${CONVERSATION_COLUMNS} FROM public.action_mission_conversations
     WHERE mission_id = $1 AND organization_id = $2 FOR UPDATE`,
    [input.missionId, input.organizationId],
  )
  const current = conversation.rows[0]
  if (!current || current.status === 'converted') return
  await insertMessage(client, {
    organizationId: input.organizationId, conversationId: current.id,
    sequence: await nextMessageSequence(client, current.id, input.organizationId),
    actorType: 'agent', messageKind: 'status',
    content: 'Plano aprovado. A missão está pronta para seguir conforme o modo de autonomia definido.',
    structuredPayload: { kind: 'message', projectionKey: `plan-approved:${input.planId}`, planId: input.planId, missionId: input.missionId },
    sourceRefs: [],
  })
  await client.query(
    `UPDATE public.action_mission_conversations
     SET status = 'converted', completed_at = NOW(), version = version + 1, updated_at = NOW()
     WHERE id = $1 AND organization_id = $2`,
    [current.id, input.organizationId],
  )
}

export async function getMissionConversationForMission(
  client: Queryable,
  missionId: string,
  organizationId: string,
): Promise<MissionConversation | null> {
  const row = await client.query<{ id: string }>(
    `SELECT id FROM public.action_mission_conversations
     WHERE mission_id = $1 AND organization_id = $2 LIMIT 1`,
    [missionId, organizationId],
  )
  return row.rows[0] ? getMissionConversation(client, row.rows[0].id, organizationId) : null
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
      input.content.trim(), input.structuredPayload, JSON.stringify(input.sourceRefs), input.clientMessageId ?? null,
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
    briefHash: hashCanonical(row.current_brief ?? {}),
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

type ConversationPack = { id: string; key: string; version: string; contentHash: string; allowedModules: string[] }

const CONVERSATION_PACKS = {
  funnel_nurture: { definition: FUNNEL_NURTURE_PACK_V1, allowedModules: ['crm', 'automations', 'funnel_nurture_agent'] },
  campaign_launch: { definition: CAMPAIGN_LAUNCH_PACK_V1, allowedModules: ['campaigns', 'landing_pages', 'campaign_launch_agent'] },
  revenue_recovery: { definition: REVENUE_RECOVERY_PACK_V0, allowedModules: ['crm'] },
} as const

async function resolveConversationPacks(
  client: Queryable,
  organizationId: string,
  contractId: string | null,
  brief: Record<string, unknown>,
): Promise<ConversationPack[]> {
  const requested = stringList(brief.packKeys)
  const order = ['funnel_nurture', 'campaign_launch', 'revenue_recovery'] as const
  const keys = order.filter((key) => requested.includes(key))
  if (!keys.length) throw new Error('mission_conversation_pack_selection_invalid')
  const definitions = keys.map((key) => ({ key, ...CONVERSATION_PACKS[key] }))
  const rows = await client.query<{ id: string; key: string; semantic_version: string; content_hash: string }>(
    `SELECT version.id, pack.key, version.semantic_version, version.content_hash
     FROM public.action_pack_versions version
     JOIN public.action_packs pack ON pack.id = version.pack_id
     WHERE pack.key = ANY($1::TEXT[]) AND version.status IN ('published_for_internal_pilot','published')`,
    [keys],
  )
  const resolved = definitions.map(({ key, definition, allowedModules }) => {
    const row = rows.rows.find(item => item.key === key && item.semantic_version === definition.semanticVersion)
    if (!row || row.content_hash !== definition.contentHash) throw new Error('mission_conversation_pack_unavailable')
    return { id: row.id, key, version: row.semantic_version, contentHash: row.content_hash, allowedModules: [...allowedModules] }
  })
  const requiredEntitlements = resolved.flatMap(item => item.allowedModules.filter(module => module.endsWith('_agent')))
  if (requiredEntitlements.length) {
    const entitlement = await client.query<{ kind: string; module_keys: string[] }>(
      `SELECT organization.kind,
              COALESCE(array_agg(module.module_key) FILTER (WHERE module.enabled = TRUE), ARRAY[]::TEXT[]) AS module_keys
       FROM public.organizations organization
       LEFT JOIN public.contracts contract ON contract.client_id = organization.client_id
         AND contract.status = 'active' AND ($2::UUID IS NULL OR contract.id = $2)
       LEFT JOIN public.contract_modules module ON module.contract_id = contract.id
       WHERE organization.id = $1 GROUP BY organization.kind`,
      [organizationId, contractId],
    )
    const row = entitlement.rows[0]
    const enabled = new Set(row?.module_keys ?? [])
    if (row?.kind !== 'yux' && requiredEntitlements.some(key => !enabled.has(key))) {
      throw new Error('mission_conversation_pack_not_entitled')
    }
  }
  return resolved
}

function conversationMissionParameters(
  brief: Record<string, unknown>,
  packKeys: string[],
  deadlineAt: string,
  maxTotalCostBrl: string,
  maxHumanHours: string,
): Record<string, unknown> {
  const constraints = recordValue(brief.constraints)
  const deadlineDays = Math.max(1, Math.min(180, Math.ceil((Date.parse(deadlineAt) - Date.now()) / 86_400_000)))
  const common = { maxTotalCostBrl, maxHumanHours, humanHourlyRateBrl: '100', deadlineDays }
  if (packKeys.includes('campaign_launch')) {
    return {
      ...common,
      icp: requiredBriefString(constraints.icp ?? constraints.audience, 'mission_conversation_icp_required'),
      offer: requiredBriefString(constraints.offer, 'mission_conversation_offer_required'),
      platform: requiredBriefString(constraints.platform, 'mission_conversation_platform_required'),
      providerConnectionId: requiredBriefString(constraints.providerConnectionId, 'mission_conversation_provider_required'),
      dailyBudgetBrl: positiveDecimal(constraints.dailyBudgetBrl, '50'),
      totalBudgetBrl: positiveDecimal(constraints.totalBudgetBrl ?? maxTotalCostBrl, maxTotalCostBrl),
      targetLeads: positiveInteger(constraints.targetLeads) ?? 50,
      maximumCplBrl: positiveDecimal(constraints.maximumCplBrl, '100'), observationDays: positiveInteger(constraints.observationDays) ?? 30,
      targetRevenueBrl: positiveDecimal(constraints.targetRevenueBrl, '1'),
    }
  }
  if (packKeys.includes('funnel_nurture')) {
    return {
      ...common,
      icp: requiredBriefString(constraints.icp ?? constraints.audience, 'mission_conversation_icp_required'),
      offer: requiredBriefString(constraints.offer, 'mission_conversation_offer_required'),
      targetOutcome: optionalBriefString(constraints.targetOutcome) ?? 'qualified_lead',
      observationDays: positiveInteger(constraints.observationDays) ?? 30,
      expectedReplyRate: Number(constraints.expectedReplyRate ?? 0.05), maximumOptOutRate: Number(constraints.maximumOptOutRate ?? 0.02),
      targetRevenueBrl: positiveDecimal(constraints.targetRevenueBrl, '1'),
    }
  }
  return {
    ...common, targetRevenueBrl: positiveDecimal(constraints.targetRevenueBrl, '1'), inactiveDays: positiveInteger(constraints.inactiveDays) ?? 60,
    canarySize: Math.min(20, positiveInteger(constraints.canarySize) ?? 20), maxPopulation: positiveInteger(constraints.maxPopulation) ?? 100,
    minimumValueCostRatio: positiveDecimal(constraints.minimumValueCostRatio, '3'), channels: stringList(constraints.channels).length ? stringList(constraints.channels) : ['human_task'],
  }
}

async function getAttachedMission(client: Queryable, missionId: string, organizationId: string): Promise<ActionMission> {
  const mission = await getMission(client, missionId, organizationId)
  if (!mission) throw new Error('mission_not_found')
  return mission
}

function requiredDeadline(value: unknown): string {
  const deadline = optionalBriefString(value)
  if (!deadline || !Number.isFinite(Date.parse(deadline))) throw new Error('mission_conversation_deadline_required')
  return new Date(deadline).toISOString()
}

function missionMode(value: unknown): 'shadow' | 'prepare' | 'assisted' | 'autonomous' {
  return value === 'shadow' || value === 'prepare' || value === 'autonomous' ? value : 'assisted'
}

function requiredBriefString(value: unknown, error: string): string {
  const result = optionalBriefString(value)
  if (!result) throw new Error(error)
  return result
}

function optionalBriefString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function positiveDecimal(value: unknown, fallback: string): string {
  const candidate = typeof value === 'number' || typeof value === 'string' ? String(value) : fallback
  return /^\d+(?:\.\d{1,6})?$/.test(candidate) && Number(candidate) > 0 ? candidate : fallback
}

function positiveInteger(value: unknown): number | undefined {
  const candidate = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isInteger(candidate) && candidate > 0 ? candidate : undefined
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map(item => item.trim()) : []
}

function recordValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
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
