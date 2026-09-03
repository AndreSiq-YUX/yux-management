import { describe, expect, it } from 'vitest'
import {
  appendUserConversationMessage,
  attachMissionToConversation,
  completeAgentConversationTurn,
  createMissionConversation,
} from '../src/modules/action-engine/mission-conversations.js'
import type { Connectable, Queryable } from '../src/modules/action-engine/repository.js'

type Row = Record<string, unknown>
type Step = { match: string; rows: Row[] }

const now = '2026-08-31T12:00:00.000Z'
const conversationRow = (change: Row = {}) => ({
  id: 'conversation-1', organization_id: 'org-1', contract_id: 'contract-1', mission_id: null,
  status: 'collecting_context', title: 'Nova campanha', current_brief: {}, context_readiness: {},
  last_context_hash: null, last_harness_run_id: null, version: 1, created_by: 'user-1',
  created_at: now, updated_at: now, completed_at: null, ...change,
})
const messageRow = (change: Row = {}) => ({
  id: 'message-1', organization_id: 'org-1', conversation_id: 'conversation-1', sequence: 1,
  actor_type: 'user', message_kind: 'text', content: 'Quero uma campanha', structured_payload: {},
  source_refs: [], client_message_id: 'client-message-1', harness_run_id: null,
  created_by: 'user-1', created_at: now, ...change,
})

function scriptedPool(steps: Step[]) {
  const calls: Array<{ sql: string; params?: unknown[] }> = []
  const client: Queryable & { release(): void } = {
    async query<T = Row>(sql: string, params?: unknown[]) {
      calls.push({ sql, params })
      if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] as T[] }
      const step = steps.shift()
      if (!step) throw new Error(`unexpected query: ${sql}`)
      expect(sql).toContain(step.match)
      return { rows: step.rows as T[] }
    },
    release() {},
  }
  const pool: Connectable = { ...client, async connect() { return client } }
  return { pool, calls, remaining: steps }
}

describe('Mission conversation repository', () => {
  it('creates the conversation and first user message in one transaction', async () => {
    const fake = scriptedPool([
      { match: 'INSERT INTO public.action_mission_conversations', rows: [conversationRow()] },
      { match: 'INSERT INTO public.action_mission_conversation_messages', rows: [messageRow()] },
    ])

    const result = await createMissionConversation(fake.pool, {
      organizationId: 'org-1', contractId: 'contract-1', title: 'Nova campanha',
      firstMessage: 'Quero uma campanha', firstMessageClientId: 'client-message-1',
      createdBy: 'user-1', idempotencyKey: 'create-1',
    })

    expect(result.messages).toHaveLength(1)
    expect(result.messages[0]?.clientMessageId).toBe('client-message-1')
    const messageInsert = fake.calls.find(item => item.sql.includes('INSERT INTO public.action_mission_conversation_messages'))
    expect(messageInsert?.params?.[7]).toBe('[]')
    expect(fake.calls.map(item => item.sql)).toEqual(expect.arrayContaining(['BEGIN', 'COMMIT']))
    expect(fake.calls.every(item => !item.params || item.params.includes('org-1'))).toBe(true)
    expect(fake.remaining).toHaveLength(0)
  })

  it('returns the existing conversation for a retried create idempotency key', async () => {
    const fake = scriptedPool([
      { match: 'INSERT INTO public.action_mission_conversations', rows: [] },
      { match: 'create_idempotency_key = $2', rows: [conversationRow({ create_idempotency_key: 'create-1' })] },
      { match: 'WHERE id = $1 AND organization_id = $2', rows: [conversationRow()] },
      { match: 'ORDER BY sequence ASC', rows: [messageRow()] },
    ])

    const result = await createMissionConversation(fake.pool, {
      organizationId: 'org-1', title: 'Nova campanha', firstMessage: 'Quero uma campanha',
      firstMessageClientId: 'client-message-1', createdBy: 'user-1', idempotencyKey: 'create-1',
    })

    expect(result.id).toBe('conversation-1')
    expect(result.messages).toHaveLength(1)
  })

  it('rejects stale optimistic versions without appending a message', async () => {
    const fake = scriptedPool([
      { match: 'FOR UPDATE', rows: [conversationRow({ version: 3 })] },
      { match: 'client_message_id = $3', rows: [] },
    ])

    await expect(appendUserConversationMessage(fake.pool, {
      organizationId: 'org-1', conversationId: 'conversation-1', expectedVersion: 2,
      clientMessageId: 'new-client-message', content: 'Mais contexto', createdBy: 'user-1',
    })).rejects.toThrow('mission_conversation_version_conflict')
    expect(fake.calls.some(item => item.sql.includes('INSERT INTO public.action_mission_conversation_messages'))).toBe(false)
    expect(fake.calls.at(-1)?.sql).toBe('ROLLBACK')
  })

  it('makes a retried client message idempotent even after the version advanced', async () => {
    const fake = scriptedPool([
      { match: 'FOR UPDATE', rows: [conversationRow({ version: 2 })] },
      { match: 'client_message_id = $3', rows: [messageRow({ client_message_id: 'retry-1' })] },
      { match: 'WHERE id = $1 AND organization_id = $2', rows: [conversationRow({ version: 2 })] },
      { match: 'ORDER BY sequence ASC', rows: [messageRow({ client_message_id: 'retry-1' })] },
    ])

    const result = await appendUserConversationMessage(fake.pool, {
      organizationId: 'org-1', conversationId: 'conversation-1', expectedVersion: 1,
      clientMessageId: 'retry-1', content: 'Mesmo texto', createdBy: 'user-1',
    })

    expect(result.version).toBe(2)
    expect(result.messages).toHaveLength(1)
  })

  it('appends the agent response and changes state in the same transaction', async () => {
    const agentMessage = messageRow({
      id: 'message-2', sequence: 2, actor_type: 'agent', message_kind: 'question',
      content: 'Qual o orçamento?', client_message_id: null, harness_run_id: 'run-1', created_by: null,
    })
    const fake = scriptedPool([
      { match: 'FOR UPDATE', rows: [conversationRow()] },
      { match: 'harness_run_id = $3', rows: [] },
      { match: 'AS next_sequence', rows: [{ next_sequence: 2 }] },
      { match: 'INSERT INTO public.action_mission_conversation_messages', rows: [agentMessage] },
      { match: 'UPDATE public.action_mission_conversations', rows: [conversationRow({ status: 'awaiting_user', version: 2 })] },
      { match: 'WHERE id = $1 AND organization_id = $2', rows: [conversationRow({ status: 'awaiting_user', version: 2 })] },
      { match: 'ORDER BY sequence ASC', rows: [messageRow(), agentMessage] },
    ])

    const result = await completeAgentConversationTurn(fake.pool, {
      organizationId: 'org-1', conversationId: 'conversation-1', expectedVersion: 1,
      status: 'awaiting_user', messageKind: 'question', content: 'Qual o orçamento?',
      structuredPayload: { questions: [{ key: 'budget' }] }, sourceRefs: [{ ref: 'yux:card-1' }],
      harnessRunId: 'run-1', contextHash: 'a'.repeat(64), currentBrief: {},
      contextReadiness: { status: 'needs_information' },
    })

    expect(result.status).toBe('awaiting_user')
    expect(result.messages.at(-1)?.harnessRunId).toBe('run-1')
    const messageInsert = fake.calls.find(item => item.sql.includes('INSERT INTO public.action_mission_conversation_messages'))
    expect(messageInsert?.params?.[7]).toBe('[{"ref":"yux:card-1"}]')
  })

  it('attaches the same Mission idempotently and rejects a different Mission', async () => {
    const same = scriptedPool([
      { match: 'FOR UPDATE', rows: [conversationRow({ mission_id: 'mission-1', status: 'converted', version: 4 })] },
      { match: 'WHERE id = $1 AND organization_id = $2', rows: [conversationRow({ mission_id: 'mission-1', status: 'converted', version: 4 })] },
      { match: 'ORDER BY sequence ASC', rows: [] },
    ])
    const existing = await attachMissionToConversation(same.pool, {
      organizationId: 'org-1', conversationId: 'conversation-1', missionId: 'mission-1', expectedVersion: 3,
    })
    expect(existing.missionId).toBe('mission-1')

    const different = scriptedPool([
      { match: 'FOR UPDATE', rows: [conversationRow({ mission_id: 'mission-1', version: 4 })] },
    ])
    await expect(attachMissionToConversation(different.pool, {
      organizationId: 'org-1', conversationId: 'conversation-1', missionId: 'mission-2', expectedVersion: 4,
    })).rejects.toThrow('mission_conversation_already_attached')
  })
})
