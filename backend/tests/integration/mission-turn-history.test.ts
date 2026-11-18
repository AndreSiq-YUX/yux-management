import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { createIntegrationRig } from './support/rig.js'
import { fixtureIds, fixtureUsers } from './support/fixtures.js'

it('shows mission turn usage and credit settlement only to a scoped global admin', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const pool = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_api') }))
  const { organizationA: org, organizationB: otherOrg, contractA: contract, contractB: otherContract } = rig.ids
  const conversation = randomUUID(), noContractConversation = randomUUID(), runId = randomUUID()
  const settled = randomUUID(), uncertain = randomUUID(), strategist = randomUUID()
  const root = '/api/strategy-engine/agent-prompts'
  const url = (params: Record<string, string>) => `${root}/mission-turn-history?${new URLSearchParams(params)}`
  const attempts = [
    { status: 'received', costUsd: 0.022, tokens: { input: 30, output: 14, reasoning: 4 }, model: 'private-model-fixture' },
    { status: 'started', costUsd: null, tokens: null, credential: 'private-secret-fixture' },
  ]
  try {
    await rig.sql(`INSERT INTO public.action_mission_conversations(id,organization_id,contract_id,title,create_idempotency_key,created_by)
      VALUES($1,$3,$4,'Conversa faturável',$1::uuid::text,$5),($2,$3,NULL,'Conversa organizacional',$2::uuid::text,$5)`,
    [conversation, noContractConversation, org, contract, fixtureUsers.yux_admin.id])
    await rig.sql(`INSERT INTO public.action_mission_conversation_messages(id,organization_id,conversation_id,sequence,actor_type,message_kind,content)
      VALUES($1,$4,$5,1,'user','text','Conteúdo privado'),($2,$4,$5,2,'user','text','Conteúdo privado'),
            ($3,$4,$5,3,'user','text','Conteúdo privado')`, [settled, uncertain, strategist, org, conversation])
    const wallet = (await rig.sql(`INSERT INTO public.ai_credit_wallets(organization_id,client_id,contract_id) VALUES($1,$2,$3)
      ON CONFLICT(contract_id) DO UPDATE SET contract_id=EXCLUDED.contract_id RETURNING id`, [org, fixtureIds.clientA, contract])).rows[0].id
    await rig.sql(`INSERT INTO private.strategy_workflow_credit_holds
      (organization_id,contract_id,operation_id,owner_token,wallet_id,input_hash,reserved_credits,charged_credits,unlimited,state,action,audience,attempts)
      VALUES($1,$2,$3,$3,$6,repeat('a',64),3,1,FALSE,'settled','agent_runtime_mission_conversation_turn','client_user',$7::jsonb),
            ($1,$2,$4,$4,$6,repeat('b',64),1,NULL,FALSE,'uncertain','agent_runtime_mission_conversation_turn','internal_operator',$8::jsonb),
            ($1,$2,$5,$5,$6,repeat('c',64),1,NULL,FALSE,'held','agent_runtime_workflow','internal_operator','[]'::jsonb)`,
    [org, contract, settled, uncertain, strategist, wallet, JSON.stringify(attempts), JSON.stringify(attempts.slice(1))])
    await rig.sql(`INSERT INTO public.agent_execution_runs(id,organization_id,mission_conversation_id,run_source,profile_key,workflow_key,status)
      VALUES($1,$2,$3,'mission_intake','growth_strategist','mission_intake_conversation','failed')`, [runId, org, noContractConversation])
    await rig.sql(`INSERT INTO public.agent_context_snapshots(run_id,profile_key,context_kind,safe_context,context_hash)
      VALUES($1,'growth_strategist','runtime',$2,repeat('a',64))`,
    [runId, { measurement: 'mission_turn_provider_attempts', audience: 'client_user', attempts: [{ status: 'received', costUsd: 0, tokens: { input: 0 } }] }])

    const query = { organizationId: org, contractId: contract, conversationId: conversation, audience: 'client_user' }
    const listed = await rig.request('yux_admin', 'GET', `${root}/conversations?organizationId=${org}&contractId=${contract}`)
    expect(listed.statusCode).toBe(200)
    expect(listed.body.conversations).toContainEqual({ id: conversation, title: 'Conversa faturável' })
    expect(listed.body.conversations).not.toContainEqual({ id: noContractConversation, title: 'Conversa organizacional' })
    const response = await rig.request('yux_admin', 'GET', url(query))
    expect(response.statusCode, JSON.stringify(response.body)).toBe(200)
    expect(response.body).toEqual({ turns: [{ id: settled, startedAt: expect.any(String), provider: {
      attempts: 2, knownSubtotalUsd: 0.022, totalUsd: null, inputTokens: 30, outputTokens: 14, reasoningTokens: 4,
    }, credits: { state: 'settled', unlimited: false, reserved: 3, charged: 1, released: 2 } }] })
    const internal = await rig.request('yux_admin', 'GET', url({ ...query, audience: 'internal_operator' }))
    expect(internal.body.turns).toEqual([expect.objectContaining({ id: uncertain,
      credits: { state: 'uncertain', unlimited: false, reserved: 1, charged: null, released: null } })])
    const unbilled = await rig.request('yux_admin', 'GET', url({ organizationId: org, conversationId: noContractConversation, audience: 'client_user' }))
    expect(unbilled.body.turns).toEqual([expect.objectContaining({ id: runId,
      provider: expect.objectContaining({ attempts: 1, totalUsd: 0, knownSubtotalUsd: 0 }),
      credits: { state: 'unbilled', unlimited: null, reserved: null, charged: null, released: null } })])
    expect((await rig.request('yux_admin', 'GET', url({ ...query, organizationId: otherOrg }))).statusCode).toBe(404)
    expect((await rig.request('yux_admin', 'GET', url({ ...query, contractId: otherContract }))).statusCode).toBe(404)
    for (const role of ['yux_operator', 'client_admin_A', 'client_member_A'] as const) {
      expect((await rig.request(role, 'GET', url(query))).statusCode).toBe(403)
      expect((await rig.request(role, 'GET', `${root}/conversations?organizationId=${org}`)).statusCode).toBe(403)
    }
    const visible = (role: 'yux_admin' | 'yux_operator', organizationIds: string[]) => runWithDatabaseRequestContext(
      { role, organizationIds, serviceRole: 'api' }, () => pool.query(
        'SELECT operation_id FROM private.strategy_workflow_credit_holds WHERE operation_id=ANY($1::uuid[])', [[settled, uncertain, strategist]],
      ).then(result => result.rows.map(row => row.operation_id).sort()),
    )
    expect(await visible('yux_admin', [org])).toEqual([settled, uncertain].sort())
    expect(await visible('yux_admin', [otherOrg])).toEqual([])
    expect(await visible('yux_operator', [org])).toEqual([])
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally { await pool.end(); await rig.close() }
})
