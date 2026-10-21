import { randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { storeProviderSecretToPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { createIntegrationRig } from './support/rig.js'

it('envia um teste confirmado pela fila normal uma única vez e preserva a solicitação após reiniciar a API', async () => {
  const rig = await createIntegrationRig()
  const connectionId = randomUUID()
  const contactId = randomUUID()
  const conversationId = randomUUID()
  const requestId = randomUUID()
  const ambiguousRequestId = randomUUID()
  const recipient = '5511999990000'
  let redisStopped = false
  try {
    await rig.sql(`INSERT INTO public.channel_connections
      (id, organization_id, channel, name, is_active, adapter_key, inbound_token_hash, phone_number_id, provider_account_id, token_state)
      VALUES ($1::uuid,$2,'whatsapp',$1::uuid::text,TRUE,'meta_whatsapp',$1::uuid::text,$1::uuid::text,'123456789012345','connected')`, [connectionId, rig.ids.organizationA])
    const secret = await storeProviderSecretToPool({ query: rig.sql } as never, {
      organizationId: rig.ids.organizationA, provider: 'meta_social', targetKind: 'publishing',
      connectionTable: 'channel_connections', connectionId, secretKind: 'access_token', value: 'test-token-not-a-real-meta-token',
    }, Buffer.alloc(32, 7))
    await rig.sql(`UPDATE public.channel_connections SET protected_metadata_references = $2::jsonb WHERE id=$1`,
      [connectionId, JSON.stringify({ accessTokenReference: secret.reference })])
    await rig.sql(`INSERT INTO public.omnichannel_contacts (id, organization_id, display_name, phone)
      VALUES ($1,$2,'Contato de homologação',$3)`, [contactId, rig.ids.organizationA, '+551199990000'])
    await rig.sql(`INSERT INTO public.conversations (id,organization_id,contact_id,connection_id,channel,status,response_mode)
      VALUES ($1,$2,$3,$4,'whatsapp','open','manual')`, [conversationId, rig.ids.organizationA, contactId, connectionId])
    await rig.sql(`INSERT INTO public.messages (conversation_id,connection_id,direction,author_type,content_type,body,delivery_status)
      VALUES ($1,$2,'inbound','contact','text','Olá','delivered')`, [conversationId, connectionId])

    const body = { connectionId, requestId, recipient, message: 'Teste de integração YUX', confirmed: true }
    const send = (payload = body, role: 'client_admin_A' | 'client_admin_B' | 'client_member_A' = 'client_admin_A') =>
      rig.request(role, 'POST', '/api/functions/send-meta-channel-test', { body: payload })
    expect((await send(body, 'client_admin_B')).statusCode).toBe(403)
    expect((await send(body, 'client_member_A')).statusCode).toBe(403)
    expect((await send({ ...body, confirmed: false })).statusCode).toBe(400)
    expect((await send({ ...body, recipient: '5511888880000' })).body).toEqual({ error: 'whatsapp_test_recent_conversation_required' })

    await rig.stopRedis()
    redisStopped = true
    const first = await send()
    expect(first.statusCode).toBe(202)
    expect(first.body).toMatchObject({ messageId: requestId, conversationId, deliveryStatus: 'queued' })
    expect(await rig.providerCalls()).toHaveLength(0)
    expect((await rig.sql(`SELECT dispatch_status FROM public.domain_events WHERE aggregate_id=$1 AND event_type='omnichannel.outbound.requested'`, [requestId])).rows)
      .toEqual([{ dispatch_status: 'pending' }])
    await rig.restartApi()
    expect((await send()).statusCode).toBe(202)
    expect((await send({ ...body, message: 'Outro conteúdo' })).statusCode).toBe(409)
    await rig.startRedis()
    redisStopped = false
    await rig.workerTick()
    expect((await rig.providerCalls()).filter(call => call.intentId === requestId)).toEqual([{
      intentId: requestId,
      payload: { messaging_product: 'whatsapp', recipient_type: 'individual', to: '5511999990000', type: 'text', text: { preview_url: false, body: 'Teste de integração YUX' } },
    }])
    const sent = (await rig.sql(`SELECT delivery_status, external_message_id FROM public.messages WHERE id=$1`, [requestId])).rows[0]
    expect(sent).toEqual({ delivery_status: 'sent', external_message_id: `provider-${requestId}` })
    await send()
    await rig.workerTick()
    expect((await rig.providerCalls()).filter(call => call.intentId === requestId)).toHaveLength(1)

    await rig.sql(`UPDATE public.messages SET created_at=NOW()-INTERVAL '25 hours' WHERE conversation_id=$1 AND direction='inbound'`, [conversationId])
    expect((await send({ ...body, requestId: randomUUID() })).body).toEqual({ error: 'whatsapp_test_recent_conversation_required' })

    await rig.sql(`UPDATE public.messages SET created_at=NOW()-INTERVAL '1 hour' WHERE conversation_id=$1 AND direction='inbound'`, [conversationId])
    rig.setProviderMode('lost-response')
    expect((await send({ ...body, requestId: ambiguousRequestId })).statusCode).toBe(202)
    await rig.workerTick()
    expect((await rig.sql(`SELECT metadata->>'dispatchOutcome' AS outcome FROM public.messages WHERE id=$1`, [ambiguousRequestId])).rows[0])
      .toEqual({ outcome: 'ambiguous' })
    await rig.restartApi()
    expect((await rig.request('client_admin_A', 'POST', `/api/omnichannel/messages/${ambiguousRequestId}/retry`)).statusCode).toBe(200)
    await rig.workerTick()
    expect((await rig.providerCalls()).filter(call => call.intentId === ambiguousRequestId)).toHaveLength(1)
  } finally {
    if (redisStopped) await rig.startRedis()
    await rig.sql(`DELETE FROM public.domain_events WHERE aggregate_id=ANY($1::uuid[])`, [[requestId, ambiguousRequestId]])
    await rig.sql(`DELETE FROM public.conversations WHERE id=$1`, [conversationId])
    await rig.sql(`DELETE FROM public.omnichannel_contacts WHERE id=$1`, [contactId])
    await rig.sql(`DELETE FROM public.provider_integration_secrets WHERE connection_id=$1`, [connectionId])
    await rig.sql(`DELETE FROM public.channel_connections WHERE id=$1`, [connectionId])
    await rig.close()
  }
})
