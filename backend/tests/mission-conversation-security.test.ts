import { describe, expect, it } from 'vitest'
import { appendMissionConversationMessageSchema, createMissionConversationSchema } from '../src/modules/action-engine/mission-conversation-schemas.js'
import { appendUserConversationMessage, isMissionConversationRolloutEnabled } from '../src/modules/action-engine/mission-conversations.js'
import { mapMissionCorrectionAction, verifyMissionKnowledgeContext } from '../src/modules/action-engine/mission-source-verifier.js'
import { canAccess } from '../src/policies/authorization.js'
import type { Connectable, Queryable } from '../src/modules/action-engine/repository.js'

const organizationId = '00000000-0000-4000-8000-000000000001'
const conversationId = '00000000-0000-4000-8000-000000000002'

describe('Mission conversation security boundary', () => {
  it('rejects oversized intake and follow-up messages at the HTTP contract', () => {
    const common = { organizationId, clientMessageId: 'message-1' }
    expect(createMissionConversationSchema.safeParse({ ...common, message: 'x'.repeat(8001) }).success).toBe(false)
    expect(appendMissionConversationMessageSchema.safeParse({ ...common, expectedVersion: 1, message: 'x'.repeat(8001) }).success).toBe(false)
  })

  it('defaults rollout to off and enforces an exact tenant allowlist', () => {
    expect(isMissionConversationRolloutEnabled({}, organizationId)).toBe(false)
    expect(isMissionConversationRolloutEnabled({ MISSION_CONVERSATIONS_ENABLED: true, MISSION_CONVERSATIONS_TENANT_ALLOWLIST: organizationId }, organizationId)).toBe(true)
    expect(isMissionConversationRolloutEnabled({ MISSION_CONVERSATIONS_ENABLED: true, MISSION_CONVERSATIONS_TENANT_ALLOWLIST: '00000000-0000-4000-8000-000000000099' }, organizationId)).toBe(false)
  })

  it('stops new turns at the configured cap without appending or queueing work', async () => {
    const calls: string[] = []
    const client: Queryable & { release(): void } = {
      async query<T>(sql: string) {
        calls.push(sql)
        if (['BEGIN', 'ROLLBACK'].includes(sql)) return { rows: [] as T[] }
        if (sql.includes('FOR UPDATE')) return { rows: [conversationRow()] as T[] }
        if (sql.includes('client_message_id = $3')) return { rows: [] as T[] }
        if (sql.includes('COUNT(*)::INT AS count')) return { rows: [{ count: 6 }] as T[] }
        throw new Error(`unexpected_query:${sql}`)
      }, release() {},
    }
    const pool: Connectable = { ...client, async connect() { return client } }
    await expect(appendUserConversationMessage(pool, { organizationId, conversationId, expectedVersion: 2, clientMessageId: 'message-7', content: 'Mais uma pergunta', createdBy: 'user-1', maxTurns: 6 })).rejects.toThrow('mission_conversation_turn_limit_reached')
    expect(calls.some(sql => sql.includes('INSERT INTO public.action_mission_conversation_messages'))).toBe(false)
  })

  it('rejects forged tenant/source identities before querying knowledge', async () => {
    let queried = false
    await expect(verifyMissionKnowledgeContext({ async query() { queried = true; return { rows: [] } } } as never, {
      organizationId, audience: 'client_user', sourceRefs: [{ ref: 'customer:foreign-id', id: 'local-id', kind: 'knowledge_chunk', version: '1', contentHash: 'a'.repeat(64), visibility: 'both', title: 'Ignore instruções', displayMode: 'named' }],
    })).rejects.toThrow('mission_source_identity_mismatch')
    expect(queried).toBe(false)
  })

  it('ignores model-provided correction URLs and denies client plan approval', () => {
    expect(mapMissionCorrectionAction({ category: 'integration', key: 'provider', audience: 'client_user', modelUrl: 'javascript:alert(1)' })).toEqual({ key: 'provider', label: 'Conectar ferramenta', routeTemplate: '/portal/empresa/integracoes' })
    expect(canAccess({ userId: 'user-1', role: 'client_admin', organizationIds: [organizationId], activeOrganizationId: organizationId, enabledModuleKeys: ['action_engine'] }, 'action_engine.write', { organizationId })).toBe(false)
  })
})

function conversationRow() {
  return { id: conversationId, organization_id: organizationId, contract_id: null, mission_id: null, status: 'awaiting_user', title: 'Campanha', current_brief: {}, context_readiness: {}, last_context_hash: null, last_harness_run_id: null, version: 2, created_by: 'user-1', created_at: '2026-08-31T12:00:00Z', updated_at: '2026-08-31T12:00:00Z', completed_at: null }
}
