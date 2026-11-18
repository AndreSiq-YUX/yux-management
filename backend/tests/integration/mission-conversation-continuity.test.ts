import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import pg from 'pg'
import type { AppEnv } from '../../src/config/env.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { handleActionEngineProcessMissionConversation } from '../../src/jobs/handlers/action-engine.js'
import type { MissionConversationTurnRequestWire, MissionConversationTurnResponseWire, MissionSourceRefWire } from '../../src/modules/action-engine/generated/mission-wire.js'
import { appendUserConversationMessage, completeAgentConversationTurn, createMissionConversation, getMissionConversation } from '../../src/modules/action-engine/mission-conversations.js'
import { hashCanonical } from '../../src/modules/action-engine/repository.js'
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

it('rebuilds future mission context after a retrieved source is revoked, preserving user statements', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub', missionConversations: true })
  const pool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker') }), 'worker')
  const organizationId = rig.ids.organizationA
  const sourceId = randomUUID()
  const entryId = randomUUID()
  const oldAvailability = 'Entrega antes das 6h em cidade exclusiva'
  const recoveredReply = 'Vou confirmar o horário antes de sugerir a sequência.'
  const requests: MissionConversationTurnRequestWire[] = []
  try {
    await rig.sql(`INSERT INTO public.knowledge_sources (id,organization_id,source_type,name,status,visibility)
      VALUES ($1,$2,'manual','Horário sintético','published','both')`, [sourceId, organizationId])
    const { rows: [entry] } = await rig.sql(
      `INSERT INTO public.knowledge_entries (id,organization_id,source_id,title,body,status)
       VALUES ($1,$2,$3,'Horário sintético',$4,'published')
       RETURNING floor(extract(epoch from updated_at))::text AS version`,
      [entryId, organizationId, sourceId, oldAvailability],
    )
    const reference: MissionSourceRefWire = {
      ref: `customer:${entryId}`, id: entryId, kind: 'knowledge_chunk', visibility: 'both', displayMode: 'named',
      title: 'Horário sintético', version: entry.version,
      contentHash: hashCanonical({ id: entryId, version: entry.version, content: oldAvailability }),
    }
    const conversationId = await runWithDatabaseRequestContext({
      role: 'yux_operator', organizationIds: [organizationId], serviceRole: 'worker',
    }, async () => {
      let conversation = await createMissionConversation(pool, {
        organizationId, contractId: rig.ids.contractA, title: 'Sequência de captação',
        firstMessage: 'Orçamento de R$ 5.000 para cozinhas industriais.',
        firstMessageClientId: randomUUID(), createdBy: fixtureUsers.client_member_A.id, idempotencyKey: randomUUID(),
      })
      const sendTurn = async (reply: string, inputSources: MissionSourceRefWire[] = [], expectStaleResponse = false) => {
        const result = await handleActionEngineProcessMissionConversation(pool, { MISSION_CONVERSATIONS_ENABLED: true } as AppEnv, {
          organizationId, conversationId: conversation.id, requestedVersion: conversation.version, audience: 'client_user',
        }, {
          async invokeTurn(_env, request): Promise<MissionConversationTurnResponseWire> {
            requests.push(request)
            return { schemaVersion: 1, kind: 'message', reply, sources: [], retrievedSources: inputSources,
              readiness: { status: 'needs_information', knownFacts: [], assumptions: [], missing: [] },
              brief: { objective: reply, requestedOutcome: 'Captação', scopeHints: [], constraints: {}, acceptanceCriteria: [], packKeys: [], mode: 'assisted' },
              contextHash: 'a'.repeat(64), retrievalTraceId: randomUUID(), usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
            }
          },
        })
        if (expectStaleResponse) {
          expect(result).toEqual({ skipped: false, blocked: true, reason: 'source_verification_failed' })
          return
        }
        expect(result).toMatchObject({ skipped: false, conversation: { status: 'awaiting_user' } })
        if (!('conversation' in result) || !result.conversation) throw new Error('missing_test_conversation')
        conversation = result.conversation
      }
      const next = async (content: string) => {
        conversation = await appendUserConversationMessage(pool, {
          organizationId, conversationId: conversation.id, expectedVersion: conversation.version, content,
          clientMessageId: randomUUID(), createdBy: fixtureUsers.client_member_A.id,
        })
      }
      await sendTurn(oldAvailability, [reference])
      await next('Essa condição vale para o próximo lote?')
      await sendTurn(`Sim, considerando: ${oldAvailability}`)
      expect(JSON.stringify(requests.at(-1))).toContain(oldAvailability)
      await rig.sql("UPDATE public.knowledge_sources SET status='draft' WHERE id=$1", [sourceId])
      await next('Ajuste a sequência considerando as condições disponíveis.')
      await sendTurn(recoveredReply)
      expect(requests.at(-1)?.currentBrief).toEqual({})
      expect(requests.at(-1)?.transcript?.map(message => message.role)).toEqual(['user', 'user', 'user'])
      expect(JSON.stringify(requests.at(-1))).not.toContain(oldAvailability)
      expect(JSON.stringify(requests.at(-1))).toContain('Orçamento de R$ 5.000')
      await next('Certo, prossiga com o rascunho.')
      await sendTurn('Vou preparar o rascunho.')
      expect(JSON.stringify(requests.at(-1))).toContain(recoveredReply)
      expect(JSON.stringify(requests.at(-1))).not.toContain(oldAvailability)
      await next('Verifique as condições atualizadas.')
      await sendTurn('Resposta antiga devolvida após a revogação', [reference], true)
      return conversation.id
    })
    const portal = await rig.request('client_member_A', 'GET',
      `/api/action-engine/mission-conversations/${conversationId}?organizationId=${organizationId}`)
    expect(portal.statusCode).toBe(200)
    expect(JSON.stringify(portal.body)).not.toMatch(/retrievedSources|historyAfterSequence|Horário sintético/)
    expect(portal.body.messages).toHaveLength(9)
    expect(JSON.stringify(portal.body)).not.toContain('Resposta antiga devolvida após a revogação')
    await runWithDatabaseRequestContext({ role: 'yux_operator', organizationIds: [rig.ids.organizationB], serviceRole: 'worker' }, async () => {
      expect((await pool.query('SELECT * FROM private.mission_conversation_turn_context WHERE conversation_id=$1', [conversationId])).rows).toEqual([])
    })
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally {
    await pool.end()
    await rig.close()
  }
})
