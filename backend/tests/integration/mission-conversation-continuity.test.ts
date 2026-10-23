import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import pg from 'pg'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { appendUserConversationMessage, completeAgentConversationTurn, createMissionConversation, getMissionConversation } from '../../src/modules/action-engine/mission-conversations.js'
import { createIntegrationRig } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'

it('continues beyond six and twenty messages while preserving idempotency, version checks and tenant isolation', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const pool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_api') }), 'api')
  try {
    await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [rig.ids.organizationA], serviceRole: 'api' }, async () => {
      let conversation = await createMissionConversation(pool, {
        organizationId: rig.ids.organizationA, contractId: rig.ids.contractA, title: 'Continuidade sem corte por mensagens',
        firstMessage: 'Quero planejar a captação', firstMessageClientId: randomUUID(), createdBy: fixtureUsers.yux_admin.id, idempotencyKey: randomUUID(),
      })
      for (let turn = 1; turn <= 25; turn++) {
        if (turn > 1) {
          const input = { organizationId: rig.ids.organizationA, conversationId: conversation.id, expectedVersion: conversation.version,
            clientMessageId: randomUUID(), content: `Informação complementar ${turn}`, createdBy: fixtureUsers.yux_admin.id }
          conversation = await appendUserConversationMessage(pool, input)
          const repeated = await appendUserConversationMessage(pool, input)
          expect(repeated.version).toBe(conversation.version)
          expect(repeated.messages.filter(message => message.clientMessageId === input.clientMessageId)).toHaveLength(1)
          await expect(appendUserConversationMessage(pool, { ...input, clientMessageId: randomUUID() })).rejects.toThrow('mission_conversation_version_conflict')
        }
        conversation = await completeAgentConversationTurn(pool, {
          organizationId: rig.ids.organizationA, conversationId: conversation.id, expectedVersion: conversation.version,
          status: 'awaiting_user', messageKind: 'text', content: `Resposta simulada ${turn}`, structuredPayload: {}, sourceRefs: [],
          harnessRunId: randomUUID(), contextHash: 'a'.repeat(64), currentBrief: {}, contextReadiness: {},
        })
      }
      expect(conversation.messages.filter(message => message.actorType === 'user')).toHaveLength(25)
      expect(conversation.messages.filter(message => message.actorType === 'agent')).toHaveLength(25)
      expect(conversation.messages.at(-1)?.content).toBe('Resposta simulada 25')
      expect(await getMissionConversation(pool, conversation.id, rig.ids.organizationB)).toBeNull()
      expect(await rig.providerCalls()).toHaveLength(0)
    })
  } finally { await pool.end(); await rig.close() }
})
