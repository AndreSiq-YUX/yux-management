import { describe, expect, it, vi } from 'vitest'
import { handleActionEngineProcessMissionConversation } from '../src/jobs/handlers/action-engine.js'
import type { AppEnv } from '../src/config/env.js'
import type { MissionConversationTurnResponseWire } from '../src/modules/action-engine/generated/mission-wire.js'

const now = '2026-08-31T12:00:00.000Z'
const conversationId = '00000000-0000-4000-8000-000000000001'
const organizationId = '00000000-0000-4000-8000-000000000002'

function conversationRow(change: Record<string, unknown> = {}) {
  return {
    id: conversationId, organization_id: organizationId, contract_id: null, mission_id: null,
    status: 'collecting_context', title: 'Campanha', current_brief: { allowedModules: ['unknown'] },
    context_readiness: {}, last_context_hash: null, last_harness_run_id: null, version: 2,
    created_by: 'user-1', created_at: now, updated_at: now, completed_at: null, ...change,
  }
}
function userMessage() {
  return {
    id: 'message-1', organization_id: organizationId, conversation_id: conversationId, sequence: 1,
    actor_type: 'user', message_kind: 'text', content: 'Quero uma campanha', structured_payload: {},
    source_refs: [], client_message_id: 'client-1', harness_run_id: null, created_by: 'user-1', created_at: now,
  }
}

class Pool {
  version = 2
  status = 'collecting_context'
  messages: Array<Record<string, unknown>> = [userMessage()]
  calls: string[] = []
  async query<T>(sql: string) {
    this.calls.push(sql)
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] as T[] }
    if (sql.includes('FROM public.action_mission_conversations') && sql.includes('FOR UPDATE')) {
      return { rows: [conversationRow({ version: this.version, status: this.status })] as T[] }
    }
    if (sql.includes('FROM public.action_mission_conversations') && sql.includes('LIMIT 1')) {
      return { rows: [conversationRow({ version: this.version, status: this.status })] as T[] }
    }
    if (sql.includes('FROM public.action_mission_conversation_messages') && sql.includes('ORDER BY sequence ASC')) {
      return { rows: this.messages as T[] }
    }
    if (sql.includes('action_mission_memory_summaries')) return { rows: [] as T[] }
    if (sql.includes('channel_connections') || sql.includes('ad_provider_connections')) return { rows: [] as T[] }
    if (sql.includes('FROM public.organizations')) return { rows: [{ client_id: 'client-1' }] as T[] }
    if (sql.includes('harness_run_id = $3')) return { rows: [] as T[] }
    if (sql.includes('AS next_sequence')) return { rows: [{ next_sequence: 2 }] as T[] }
    if (sql.includes('INSERT INTO public.action_mission_conversation_messages')) {
      const message = { ...userMessage(), id: 'message-2', sequence: 2, actor_type: 'agent',
        content: 'Qual é o orçamento?', client_message_id: null, harness_run_id: 'trace-1', created_by: null }
      this.messages.push(message)
      return { rows: [message] as T[] }
    }
    if (sql.includes('UPDATE public.action_mission_conversations')) {
      this.version += 1; this.status = 'awaiting_user'
      return { rows: [conversationRow({ version: this.version, status: this.status })] as T[] }
    }
    throw new Error(`unexpected query: ${sql}`)
  }
  async connect() { return { query: this.query.bind(this), release() {} } }
}

const response = {
  schemaVersion: 1, kind: 'questions', reply: 'Qual é o orçamento?', understood: {},
  questions: [{ key: 'budget', label: 'Orçamento', whyNeeded: 'Define limites', priority: 1, answerType: 'currency', choices: [] }],
  readiness: { status: 'needs_information', knownFacts: [], assumptions: [], missing: [{ key: 'budget', category: 'budget', reason: 'Ausente', requiredFor: [] }] },
  brief: { objective: 'Criar campanha', requestedOutcome: 'Leads', scopeHints: [], constraints: {}, acceptanceCriteria: [], packKeys: [] },
  suggestedActions: [], sources: [], retrievalTraceId: 'trace-1', contextHash: 'a'.repeat(64),
  usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
} as MissionConversationTurnResponseWire

describe('Mission conversation job handler', () => {
  it('builds context, calls Harness once and atomically completes the accepted turn', async () => {
    const pool = new Pool()
    const invokeTurn = vi.fn(async (_env: AppEnv, _request: import('../src/modules/action-engine/generated/mission-wire.js').MissionConversationTurnRequestWire) => response)
    const result = await handleActionEngineProcessMissionConversation(pool as never, { MISSION_CONVERSATIONS_ENABLED: true } as AppEnv, {
      conversationId, organizationId, requestedVersion: 2, audience: 'client_user',
    }, { invokeTurn })

    expect(result.skipped).toBe(false)
    expect(invokeTurn).toHaveBeenCalledTimes(1)
    expect(invokeTurn.mock.calls[0]?.[1]).toMatchObject({
      organization_id: organizationId, user_message: 'Quero uma campanha', audience: 'client_user',
    })
    expect(pool.version).toBe(3)
    expect(pool.status).toBe('awaiting_user')
    expect(pool.messages).toHaveLength(2)
  })

  it('skips stale or replayed versions before calling Harness', async () => {
    const pool = new Pool(); pool.version = 3; pool.status = 'awaiting_user'
    const invokeTurn = vi.fn(async (_env: AppEnv, _request: import('../src/modules/action-engine/generated/mission-wire.js').MissionConversationTurnRequestWire) => response)
    const result = await handleActionEngineProcessMissionConversation(pool as never, { MISSION_CONVERSATIONS_ENABLED: true } as AppEnv, {
      conversationId, organizationId, requestedVersion: 2, audience: 'client_user',
    }, { invokeTurn })
    expect(result).toEqual({ skipped: true, reason: 'mission_conversation_job_stale' })
    expect(invokeTurn).not.toHaveBeenCalled()
  })
})
