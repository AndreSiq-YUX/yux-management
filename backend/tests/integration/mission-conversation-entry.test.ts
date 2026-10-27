import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { handleActionEngineProcessMissionConversation } from '../../src/jobs/handlers/action-engine.js'
import { publishActionPackVersion } from '../../src/modules/action-engine/repository.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../../src/modules/action-engine/packs/revenue-recovery-v0.js'
import type { AppEnv } from '../../src/config/env.js'
import type { MissionConversationTurnResponseWire } from '../../src/modules/action-engine/generated/mission-wire.js'
import { createIntegrationRig } from './support/rig.js'
import { fixtureUsers } from './support/fixtures.js'

it('starts from an unrestricted conversation, persists a simulated Harness reply and creates a zero-limit mission only after confirmation', async () => {
  const jobs: Array<{ name: string; data: Record<string, unknown> }> = []
  const rig = await createIntegrationRig({ queueMode: 'stub', missionConversations: true,
    stubJobQueue: { async add(name, data) { jobs.push({ name, data }); return { id: randomUUID() } }, async close() {} },
  })
  const pool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker') }), 'worker')
  try {
    await rig.sql("INSERT INTO public.contract_modules (contract_id,module_key,enabled) VALUES ($1,'action_engine',TRUE) ON CONFLICT (contract_id,module_key) DO UPDATE SET enabled=TRUE", [rig.ids.contractA])
    for (const [role, mode] of [['yux_admin', 'conversation'], ['yux_operator', 'conversation'], ['client_admin_A', 'unavailable'], ['client_member_A', 'unavailable']] as const) {
      const context = await rig.request(role, 'GET', `/api/workspace/organizations/${rig.ids.organizationA}/context`)
      expect(context.statusCode).toBe(200)
      expect(context.body.missionCreation.mode).toBe(mode)
    }
    const before = await rig.sql('SELECT COUNT(*)::int AS count FROM public.action_missions WHERE organization_id=$1', [rig.ids.organizationA])
    const message = 'Quero conversar sobre a estratégia do representante de massas, sem mídia paga. Ainda não defini as ações.'
    const accepted = await rig.request('yux_admin', 'POST', '/api/action-engine/mission-conversations', {
      organizationId: rig.ids.organizationA, contractId: rig.ids.contractA, message, clientMessageId: randomUUID(),
    }, { 'idempotency-key': randomUUID() })
    expect(accepted.statusCode).toBe(202)
    const id = accepted.body.conversation.id
    expect(accepted.body.conversation.messages[0].content).toBe(message)
    expect(jobs).toHaveLength(1)
    const brief: MissionConversationTurnResponseWire['brief'] = { title: 'Recuperar oportunidades sem gasto', objective: 'Organizar a recuperação de oportunidades sem custo de execução.',
      requestedOutcome: 'recovered_revenue', scopeHints: ['crm'], constraints: { targetRevenueBrl: '10000' },
      acceptanceCriteria: [], packKeys: ['revenue_recovery'], deadlineAt: new Date(Date.now() + 86400000).toISOString(),
      maxTotalCostBrl: '0', maxHumanHours: '0', maxExternalContacts: 0, mode: 'assisted' as const }
    await runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [rig.ids.organizationA], serviceRole: 'worker' }, async () => {
      const { parameters: _parameters, ...definition } = REVENUE_RECOVERY_PACK_V0
      await publishActionPackVersion(pool, { packKey: REVENUE_RECOVERY_PACK_V0.key, name: 'Revenue Recovery', description: 'Fixture sem custo',
        semanticVersion: REVENUE_RECOVERY_PACK_V0.semanticVersion, outcomeType: REVENUE_RECOVERY_PACK_V0.outcomeType,
        definition, contentHash: REVENUE_RECOVERY_PACK_V0.contentHash, createdBy: fixtureUsers.yux_admin.id })
      const result = await handleActionEngineProcessMissionConversation(pool as never, { MISSION_CONVERSATIONS_ENABLED: true } as AppEnv, jobs[0].data, {
        invokeTurn: async (_env, request) => {
          expect(request.user_message).toBe(message)
          expect(request.organization_id).toBe(rig.ids.organizationA)
          expect(request.currentBrief?.packKeys).toBeUndefined()
          expect(request.operationalContext?.accountAvailability).toBeDefined()
          return { schemaVersion: 1, kind: 'brief_confirmation', reply: 'Podemos começar organizando as oportunidades existentes. Confira este briefing sem gasto de execução.',
            understood: {}, questions: [], readiness: { status: 'ready_for_brief_confirmation', knownFacts: [], assumptions: [], missing: [] }, brief,
            suggestedActions: [], sources: [], retrievalTraceId: randomUUID(), contextHash: 'a'.repeat(64),
            usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } }
        },
      })
      expect(result.skipped).toBe(false)
    })
    const conversation = await rig.request('yux_admin', 'GET', `/api/action-engine/mission-conversations/${id}?organizationId=${rig.ids.organizationA}`)
    expect(conversation.body.messages.map((item: { actorType: string }) => item.actorType)).toEqual(['user', 'agent'])
    expect(conversation.body.status).toBe('brief_confirmation')
    const pending = await rig.sql('SELECT COUNT(*)::int AS count FROM public.action_missions WHERE organization_id=$1', [rig.ids.organizationA])
    expect(pending.rows[0].count).toBe(before.rows[0].count)
    const confirmed = await rig.request('yux_admin', 'POST', `/api/action-engine/mission-conversations/${id}/confirm`, {
      organizationId: rig.ids.organizationA, expectedVersion: conversation.body.version, briefHash: conversation.body.briefHash,
    })
    expect(confirmed.statusCode).toBe(202)
    const persisted = await rig.sql('SELECT parameters,budget,autonomy_envelope FROM public.action_missions WHERE id=$1', [confirmed.body.missionId])
    expect(persisted.rows[0].parameters).toMatchObject({ maxTotalCostBrl: '0', maxHumanHours: '0' })
    expect(persisted.rows[0].budget).toMatchObject({ maxTotalCostBrl: '0', maxHumanHours: '0' })
    expect(persisted.rows[0].autonomy_envelope).toMatchObject({ maxTotalCostBrl: '0', maxHumanHours: '0', maxExternalContacts: 0 })
    const foreign = await rig.request('client_admin_B', 'GET', `/api/action-engine/mission-conversations/${id}?organizationId=${rig.ids.organizationA}`)
    expect(foreign.statusCode).toBe(403)
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally { await pool.end(); await rig.close() }
})
