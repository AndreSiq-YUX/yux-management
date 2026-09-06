import { createHmac, randomUUID } from 'node:crypto'
import { expect, it } from 'vitest'
import { createIntegrationRig } from './support/rig.js'

const metaSecret = 'integration-meta-app-secret'

it('persiste webhook assinado com Redis indisponível e entrega uma única mensagem após o retorno', async () => {
  const rig = await createIntegrationRig()
  const phoneNumberId = `phone-${randomUUID()}`
  const externalMessageId = `wamid.${randomUUID()}`
  const contactExternalId = randomUUID()
  let redisStopped = false
  try {
    const connectionId = await insertWhatsAppConnection(rig, phoneNumberId)
    const rawBody = whatsappPayload(phoneNumberId, externalMessageId, contactExternalId)

    const invalid = await rig.rawRequest('POST', '/api/webhooks/meta/channel-event', rawBody, {
      'content-type': 'application/json',
      'x-hub-signature-256': 'sha256=invalid',
    })
    expect(invalid.statusCode).toBe(401)
    expect((await rig.sql(
      `SELECT count(*)::int AS n FROM public.channel_webhook_events WHERE external_event_id = $1`,
      [externalMessageId],
    )).rows[0].n).toBe(0)

    await rig.stopRedis()
    redisStopped = true
    const headers = signedHeaders(rawBody)
    const firstResponse = await rig.rawRequest('POST', '/api/webhooks/meta/channel-event', rawBody, headers)
    const duplicateResponse = await rig.rawRequest('POST', '/api/webhooks/meta/channel-event', rawBody, headers)
    expect(firstResponse.statusCode).toBe(200)
    expect(firstResponse.body).toMatchObject({ accepted: true, duplicate: false })
    expect(duplicateResponse.statusCode).toBe(200)
    expect(duplicateResponse.body).toMatchObject({ accepted: true, duplicate: true })

    const persisted = await rig.sql(
      `SELECT event.id, event.status, domain_event.dispatch_status
         FROM public.channel_webhook_events event
         JOIN public.domain_events domain_event ON domain_event.id = event.id
        WHERE event.external_event_id = $1`,
      [externalMessageId],
    )
    expect(persisted.rows).toHaveLength(1)
    expect(persisted.rows[0]).toMatchObject({ status: 'received', dispatch_status: 'pending' })

    await rig.startRedis()
    redisStopped = false
    await rig.workerTick()

    expect((await rig.sql(
      `SELECT count(*)::int AS n FROM public.messages
        WHERE connection_id = $1 AND external_message_id = $2`,
      [connectionId, externalMessageId],
    )).rows[0].n).toBe(1)
    expect((await rig.sql(
      `SELECT count(*)::int AS n FROM public.conversations WHERE connection_id = $1`,
      [connectionId],
    )).rows[0].n).toBe(1)
    expect((await rig.sql(
      `SELECT status FROM public.channel_webhook_events WHERE external_event_id = $1`,
      [externalMessageId],
    )).rows[0].status).toBe('processed')
  } finally {
    if (redisStopped) await rig.startRedis().catch(() => undefined)
    await rig.close()
  }
})

it('retoma o consumidor após timeout posterior à mensagem sem duplicar conversa ou mensagem', async () => {
  const rig = await createIntegrationRig()
  const phoneNumberId = `phone-${randomUUID()}`
  const externalMessageId = `wamid.${randomUUID()}`
  const contactExternalId = randomUUID()
  try {
    const connectionId = await insertWhatsAppConnection(rig, phoneNumberId)
    const rawBody = whatsappPayload(phoneNumberId, externalMessageId, contactExternalId)
    const response = await rig.rawRequest('POST', '/api/webhooks/meta/channel-event', rawBody, signedHeaders(rawBody))
    expect(response.statusCode).toBe(200)

    const event = (await rig.sql(
      `SELECT id, sanitized_payload FROM public.channel_webhook_events WHERE external_event_id = $1`,
      [externalMessageId],
    )).rows[0]
    const contactId = randomUUID()
    const conversationId = randomUUID()
    await rig.sql(
      `INSERT INTO public.omnichannel_contacts (id, organization_id, display_name, phone, external_identities)
       VALUES ($1,$2,'Contato timeout',$3,$4::jsonb)`,
      [contactId, rig.ids.organizationA, `+${contactExternalId}`, JSON.stringify({ providerExternalId: contactExternalId })],
    )
    await rig.sql(
      `INSERT INTO public.conversations (
         id, organization_id, contact_id, connection_id, channel, status, response_mode, last_message_at
       ) VALUES ($1,$2,$3,$4,'whatsapp','open','manual',NOW())`,
      [conversationId, rig.ids.organizationA, contactId, connectionId],
    )
    await rig.sql(
      `INSERT INTO public.messages (
         conversation_id, connection_id, direction, author_type, content_type, body,
         external_message_id, delivery_status, metadata
       ) VALUES ($1,$2,'inbound','contact','text','Olá',$3,'delivered','{}'::jsonb)`,
      [conversationId, connectionId, externalMessageId],
    )
    await rig.sql(
      `UPDATE public.channel_webhook_events SET status = 'processing' WHERE id = $1`,
      [event.id],
    )
    await rig.sql(
      `INSERT INTO public.domain_event_deliveries (
         event_id, consumer_key, status, attempt_count, lease_owner, lease_until, processing_stage
       ) VALUES ($1,'omnichannel','processing',1,'dead-consumer',NOW() - INTERVAL '1 second','consume')`,
      [event.id],
    )

    await rig.workerTick()

    expect((await rig.sql(
      `SELECT count(*)::int AS n FROM public.messages
        WHERE connection_id = $1 AND external_message_id = $2`,
      [connectionId, externalMessageId],
    )).rows[0].n).toBe(1)
    expect((await rig.sql(
      `SELECT count(*)::int AS n FROM public.conversations WHERE connection_id = $1`,
      [connectionId],
    )).rows[0].n).toBe(1)
    expect((await rig.sql(
      `SELECT status, attempt_count FROM public.domain_event_deliveries
        WHERE event_id = $1 AND consumer_key = 'omnichannel'`,
      [event.id],
    )).rows[0]).toMatchObject({ status: 'completed', attempt_count: 2 })
  } finally {
    await rig.close()
  }
})

async function insertWhatsAppConnection(
  rig: Awaited<ReturnType<typeof createIntegrationRig>>,
  phoneNumberId: string,
) {
  const connectionId = randomUUID()
  await rig.sql(
    `INSERT INTO public.channel_connections (
       id, organization_id, channel, name, is_active, adapter_key,
       inbound_token_hash, phone_number_id, provider_verify_state, token_state
     ) VALUES ($1,$2,'whatsapp',$3,TRUE,'meta_whatsapp',$4,$5,'verified','connected')`,
    [connectionId, rig.ids.organizationA, `WhatsApp ${connectionId}`, `hash-${connectionId}`, phoneNumberId],
  )
  return connectionId
}

function whatsappPayload(phoneNumberId: string, externalMessageId: string, contactExternalId: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-integration',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: phoneNumberId, display_phone_number: '5511000000000' },
          contacts: [{ wa_id: contactExternalId, profile: { name: 'Contato teste' } }],
          messages: [{
            id: externalMessageId,
            from: contactExternalId,
            timestamp: String(Math.floor(Date.now() / 1_000)),
            type: 'text',
            text: { body: 'Olá' },
          }],
        },
      }],
    }],
  })
}

function signedHeaders(rawBody: string) {
  const signature = createHmac('sha256', metaSecret).update(rawBody).digest('hex')
  return {
    'content-type': 'application/json',
    'x-hub-signature-256': `sha256=${signature}`,
  }
}
