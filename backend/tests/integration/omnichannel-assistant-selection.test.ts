import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it, vi } from 'vitest'
import type { AppEnv } from '../../src/config/env.js'
import { createContextAwarePool } from '../../src/db/client.js'
import { runWithDatabaseRequestContext } from '../../src/db/request-context.js'
import { handleInboundMessage } from '../../src/jobs/handlers/omnichannel.js'
import { selectOmnichannelAssistant } from '../../src/modules/omnichannel/assistant-selection.js'
import { fixtureUsers } from './support/fixtures.js'
import { createIntegrationRig } from './support/rig.js'

it('selects WhatsApp assistants by binding, rule and scoped prior state without dispatching', async () => {
  const rig = await createIntegrationRig({ queueMode: 'stub' })
  const worker = createContextAwarePool(new pg.Pool({ connectionString: rig.serviceDatabaseUrl('yux_worker') }), 'worker')
  const organizationId = randomUUID()
  const clientId = randomUUID()
  const contractId = randomUUID()
  const connectionId = randomUUID()
  const endpoint = '/api/strategy-engine/agent-prompts/omnichannel'
  const message = 'Preciso de suporte com o relatório.'
  const scenario = { organizationId, connectionId, message }
  const preview = (extra: object = {}) => rig.request('yux_admin', 'POST', `${endpoint}/preview`, { ...scenario, ...extra })
  const asWorker = <T>(work: () => Promise<T>) => runWithDatabaseRequestContext(
    { role: 'yux_operator', organizationIds: [organizationId], serviceRole: 'worker' }, work,
  )

  try {
    await rig.sql(`INSERT INTO public.clients(id,company_name,contact_name,email,sector,size,lead_source)
      VALUES ($1,'Empresa fictícia de seleção','Contato fictício',$2,'Software','small','integration')`, [clientId, `${clientId}@integration.test`])
    await rig.sql(`INSERT INTO public.organizations(id,name,slug,kind,client_id)
      VALUES ($1,'Organização fictícia do WhatsApp',$2,'client',$3)`, [organizationId, `routing-${organizationId}`, clientId])
    await rig.sql(`INSERT INTO public.memberships (user_id,organization_id,role_key) VALUES ($1,$3,'client_admin'),($2,$3,'client_member')`,
      [fixtureUsers.client_admin_A.id, fixtureUsers.client_member_A.id, organizationId])
    await rig.sql(`INSERT INTO public.contracts (id,client_id,package_id,status)
      VALUES ($1,$2,'31000000-0000-4000-8000-000000000001','active')`, [contractId, clientId])
    await rig.sql(`INSERT INTO public.contract_modules (contract_id,module_key,enabled) VALUES ($1,'whatsapp_ai',TRUE)`, [contractId])
    await rig.sql(`INSERT INTO public.channel_connections (id,organization_id,channel,name,adapter_key,inbound_token_hash)
      VALUES ($1,$2,'whatsapp','Canal sintético','meta-cloud',$3)`, [connectionId, organizationId, randomUUID()])

    const assist = async (role: string, name: string, profile: string, priority: number) => (await rig.sql(
      `INSERT INTO public.ai_assistants(organization_id,client_id,contract_id,name,assistant_role,strategy_profile_id,routing_priority)
       SELECT $1,$2,$3,$4,$5,id,$7 FROM public.yux_strategy_agent_profiles WHERE profile_key=$6 RETURNING id`,
      [organizationId, clientId, contractId, name, role, profile, priority],
    )).rows[0].id as string
    const support = await assist('support', 'Apoio sintético', 'support_assistant', 100)
    const closer = await assist('closer', 'Negociação sintética', 'ai_closer', 90)
    const retention = await assist('retention', 'Retenção sintética', 'customer_growth_comercial_2', 70)
    await rig.sql(`INSERT INTO public.ai_assistant_routing_rules(assistant_id,channel,intent_keys,stage_keys,keyword_patterns,score_weight,lock_role_minutes)
      VALUES ($1,'whatsapp',ARRAY['support'],'{}',ARRAY['suporte','relatorio'],10,30),
             ($2,'whatsapp','{}',ARRAY['negotiation'],'{}',10,0),
             ($3,'email','{}','{}',ARRAY['suporte'],500,0)`, [support, closer, retention])

    for (const role of ['yux_operator', 'client_admin_A', 'client_member_A'] as const) {
      expect((await rig.request(role, 'GET', `${endpoint}/connections?organizationId=${organizationId}`)).statusCode).toBe(403)
      expect((await rig.request(role, 'POST', `${endpoint}/preview`, scenario)).statusCode).toBe(403)
    }
    expect((await rig.request('yux_admin', 'GET', `${endpoint}/connections?organizationId=${organizationId}`)).body)
      .toEqual([{ id: connectionId, name: 'Canal sintético' }])
    expect((await preview({ organizationId: rig.ids.organizationB })).statusCode).toBe(404)
    expect((await preview({ conversationId: randomUUID() })).statusCode).toBe(400)
    expect((await preview()).body).toMatchObject({ enabled: false, baseline: { configuredAssistant: false },
      candidate: { reason: 'routing_rule', role: 'support', assistantName: 'Apoio sintético' } })
    expect((await preview({ message: 'Bom dia', stage: 'negotiation' })).body.candidate).toMatchObject({ role: 'closer' })
    expect((await preview({ message: 'Bom dia' })).body.candidate).toMatchObject({ role: 'sdr', reason: 'default_sdr' })
    await rig.sql('UPDATE public.channel_connections SET assistant_id=$2 WHERE id=$1', [connectionId, closer])
    expect((await preview()).body.candidate).toMatchObject({ role: 'closer', reason: 'channel_binding' })
    await rig.sql('UPDATE public.ai_assistants SET status=$2 WHERE id=$1', [closer, 'paused'])
    expect((await preview()).body.candidate).toEqual({ wait: 'channel_assistant_unavailable' })
    await rig.sql('UPDATE public.channel_connections SET assistant_id=NULL WHERE id=$1', [connectionId])
    await rig.sql('UPDATE public.ai_assistants SET status=$2 WHERE id=$1', [closer, 'active'])

    const identity = `fixture-${randomUUID()}`
    const contactId = (await rig.sql(`INSERT INTO public.omnichannel_contacts (organization_id,display_name,external_identities)
      VALUES ($1,'Contato fictício', jsonb_build_object('providerExternalId',$2::text)) RETURNING id`, [organizationId, identity])).rows[0].id
    const conversationId = (await rig.sql(`INSERT INTO public.conversations (organization_id,contact_id,connection_id,channel,status,response_mode)
      VALUES ($1,$2,$3,'whatsapp','open','automatic') RETURNING id`, [organizationId, contactId, connectionId])).rows[0].id
    async function receiveFixtureMessage() {
      const id = randomUUID()
      await rig.sql(`INSERT INTO public.channel_webhook_events(id,connection_id,event_type,idempotency_key,sanitized_payload)
        VALUES ($1::uuid,$2,'message.received',$1::uuid::text,$3::jsonb)`, [id, connectionId, JSON.stringify({
          object: 'whatsapp_business_account', entry: [{ id: 'synthetic-waba', changes: [{ value: {
            messaging_product: 'whatsapp', metadata: { phone_number_id: 'synthetic-phone' }, contacts: [{ wa_id: identity }],
            messages: [{ id, from: identity, type: 'text', text: { body: message }, timestamp: `${Math.floor(Date.now() / 1000)}` }],
          } }] }],
        })])
      return id
    }
    const eventId = await receiveFixtureMessage()
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      expect(url).toBe('http://127.0.0.1:4189/workflows/execute')
      expect(JSON.parse(String(init.body))).toMatchObject({ organization_id: organizationId, client_id: clientId,
        contract_id: contractId, conversation_id: conversationId, source: 'whatsapp' })
      return Response.json({ synthesis: { reply: { body: 'Rascunho fictício de suporte.' }, classification: { intent: 'support', stage: 'service' } },
        policy: { should_send: true, blocked: false, should_handoff: false } })
    })
    vi.stubGlobal('fetch', fetch)
    const add = vi.fn(async () => ({}))
    const env = { YUX_AGENT_RUNTIME_URL: 'http://127.0.0.1:4189', YUX_AGENT_RUNTIME_TOKEN: 'fixture',
      OMNICHANNEL_ASSISTANT_ROUTING_CONNECTION_IDS: connectionId } as AppEnv
    const result = await asWorker(() => handleInboundMessage(worker, env, { eventId }, { add }))
    expect(result).toMatchObject({ conversationId, aiMessageId: expect.any(String) })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(JSON.parse(String(fetch.mock.calls[0][1].body))).toMatchObject({
      assistant_id: support, profile_key: 'support_assistant', retrieval_context: { scoped_omnichannel_assistant: true },
    })
    expect(add).not.toHaveBeenCalled()
    const messagesPath = `/api/omnichannel/conversations/${conversationId}/messages`
    const adminMessages = await rig.request('yux_admin', 'GET', messagesPath)
    expect(adminMessages.body.find((row: { authorType: string }) => row.authorType === 'ai')).toMatchObject({
      metadata: { approvalStatus: 'waiting_approval' }, assistantSelection: { reason: 'routing_rule', role: 'support' },
    })
    for (const role of ['yux_operator', 'client_admin_A', 'client_member_A'] as const) {
      const result = await rig.request(role, 'GET', messagesPath)
      expect(result.statusCode).toBe(200)
      expect(JSON.stringify(result.body)).not.toContain('assistantSelection')
    }
    expect(await asWorker(() => selectOmnichannelAssistant(worker, { ...scenario, conversationId, message: 'Bom dia' })))
      .toMatchObject({ selection: { role: 'support', reason: 'locked_role' } })
    expect(await asWorker(() => selectOmnichannelAssistant(worker, { ...scenario, conversationId: randomUUID() }))).toBeNull()
    const rollbackEventId = await receiveFixtureMessage()
    const rollbackEnv = { ...env, OMNICHANNEL_ASSISTANT_ROUTING_CONNECTION_IDS: '' }
    expect(await asWorker(() => handleInboundMessage(worker, rollbackEnv, { eventId: rollbackEventId }))).toMatchObject({ conversationId })
    expect(fetch).toHaveBeenCalledTimes(2)
    const baseline = JSON.parse(String(fetch.mock.calls[1][1].body))
    expect(baseline).toMatchObject({ profile_key: 'ai_sdr_comercial_1' })
    expect(baseline).not.toHaveProperty('retrieval_context')
    expect((await rig.request('yux_admin', 'GET', messagesPath)).body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: result.aiMessageId, metadata: expect.objectContaining({ approvalStatus: 'waiting_approval' }) }),
    ]))

    await rig.sql('UPDATE public.conversations SET status=$2 WHERE id=$1', [conversationId, 'waiting_human'])
    expect(await asWorker(() => selectOmnichannelAssistant(worker, { ...scenario, conversationId }))).toEqual({ wait: 'human_in_control' })
  } finally {
    vi.unstubAllGlobals()
    await worker.end()
    await rig.sql('DELETE FROM public.organizations WHERE id=$1', [organizationId])
    await rig.sql('DELETE FROM public.clients WHERE id=$1', [clientId])
    await rig.close()
  }
})
