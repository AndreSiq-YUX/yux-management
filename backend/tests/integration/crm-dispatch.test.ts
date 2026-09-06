import { createHmac, randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { storeProviderSecretToPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { runCrmSequenceScheduler } from '../../src/modules/crm/scheduler.js'
import { createIntegrationRig, getIntegrationDatabaseUrl } from './support/rig.js'

const providerKey = new Uint8Array(32).fill(7)

it('agenda concorrentemente com Redis fora e entrega uma única vez pelo adaptador nativo', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 6 })
  let redisStopped = false
  try {
    const fixture = await createWhatsAppSequenceFixture(rig, pool)
    await rig.stopRedis()
    redisStopped = true

    await Promise.all([
      runCrmSequenceScheduler(pool, { now: new Date() }),
      runCrmSequenceScheduler(pool, { now: new Date() }),
    ])

    const intent = await rig.sql(
      `SELECT message.id, message.delivery_status, execution.id AS execution_id
         FROM public.messages message
         JOIN public.automation_executions execution
           ON execution.id::text = message.metadata->>'executionId'
        WHERE execution.enrollment_id = $1`,
      [fixture.enrollmentId],
    )
    expect(intent.rows).toHaveLength(1)
    expect(intent.rows[0].delivery_status).toBe('queued')
    expect((await rig.sql(
      `SELECT count(*)::int AS n FROM public.domain_events
        WHERE event_type = 'crm.sequence.delivery_requested' AND aggregate_id = $1`,
      [intent.rows[0].execution_id],
    )).rows[0].n).toBe(1)

    await rig.startRedis()
    redisStopped = false
    await rig.workerTick()
    await rig.workerTick()

    const calls = await rig.providerCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].intentId).toBe(intent.rows[0].id)
    const sent = (await rig.sql(`SELECT delivery_status, external_message_id FROM public.messages WHERE id = $1`, [intent.rows[0].id])).rows[0]
    expect(sent.delivery_status).toBe('sent')

    const receiptBody = whatsappReceiptPayload(fixture.phoneNumberId, sent.external_message_id, fixture.phone)
    const receiptSignature = createHmac('sha256', 'integration-meta-app-secret').update(receiptBody).digest('hex')
    const receipt = await rig.rawRequest('POST', '/api/webhooks/meta/channel-event', receiptBody, {
      'content-type': 'application/json',
      'x-hub-signature-256': `sha256=${receiptSignature}`,
    })
    expect(receipt.statusCode).toBe(200)
    await rig.workerTick()
    expect((await rig.sql(`SELECT delivery_status FROM public.messages WHERE id = $1`, [intent.rows[0].id])).rows[0].delivery_status).toBe('delivered')
    expect((await rig.sql(`SELECT payload->>'deliveryStatus' AS status FROM public.automation_executions WHERE id = $1`, [intent.rows[0].execution_id])).rows[0].status).toBe('delivered')
  } finally {
    if (redisStopped) await rig.startRedis().catch(() => undefined)
    await pool.end()
    await rig.close()
  }
})

it('bloqueia a intenção persistida se o canal for desconectado antes do envio', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 4 })
  try {
    const fixture = await createWhatsAppSequenceFixture(rig, pool)
    await runCrmSequenceScheduler(pool, { now: new Date() })
    await rig.sql(`UPDATE public.channel_connections SET is_active = FALSE WHERE id = $1`, [fixture.connectionId])

    await rig.workerTick()

    expect(await rig.providerCalls()).toHaveLength(0)
    const message = (await rig.sql(
      `SELECT delivery_status, metadata FROM public.messages WHERE metadata->>'executionId' = (
         SELECT id::text FROM public.automation_executions WHERE enrollment_id = $1 LIMIT 1
       )`,
      [fixture.enrollmentId],
    )).rows[0]
    expect(message.delivery_status).toBe('failed')
    expect(message.metadata.dispatchBlockedReason).toBe('whatsapp_connection_unavailable')
  } finally {
    await pool.end()
    await rig.close()
  }
})

it('revalida opt-out entre agendamento e envio sem chamar o provedor', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 4 })
  try {
    const fixture = await createWhatsAppSequenceFixture(rig, pool)
    await runCrmSequenceScheduler(pool, { now: new Date() })
    await rig.sql(
      `INSERT INTO public.lead_channel_permissions (
         organization_id, lead_id, channel, address, status, source, revoked_at
       ) VALUES ($1,$2,'whatsapp',$3,'revoked','integration',NOW())`,
      [rig.ids.organizationA, fixture.leadId, fixture.phone],
    )

    await rig.workerTick()

    expect(await rig.providerCalls()).toHaveLength(0)
    const message = (await rig.sql(
      `SELECT delivery_status, metadata FROM public.messages WHERE metadata->>'executionId' = (
         SELECT id::text FROM public.automation_executions WHERE enrollment_id = $1 LIMIT 1
       )`,
      [fixture.enrollmentId],
    )).rows[0]
    expect(message.delivery_status).toBe('failed')
    expect(message.metadata.dispatchBlockedReason).toBe('recipient_opted_out')
  } finally {
    await pool.end()
    await rig.close()
  }
})

async function createWhatsAppSequenceFixture(
  rig: Awaited<ReturnType<typeof createIntegrationRig>>,
  pool: pg.Pool,
) {
  const leadId = randomUUID()
  const sequenceId = randomUUID()
  const stepId = randomUUID()
  const enrollmentId = randomUUID()
  const connectionId = randomUUID()
  const phoneNumberId = `phone-${connectionId}`
  const phone = `+55${randomUUID().replaceAll('-', '').slice(0, 13)}`

  await rig.sql(
    `INSERT INTO public.leads (id, organization_id, name, email, phone, source)
     VALUES ($1,$2,'Lead sequência',$3,$4,'integration')`,
    [leadId, rig.ids.organizationA, `${leadId}@integration.test`, phone],
  )
  await rig.sql(
    `INSERT INTO public.channel_connections (
       id, organization_id, channel, name, is_active, adapter_key, inbound_token_hash,
       phone_number_id, provider_verify_state, token_state
     ) VALUES ($1,$2,'whatsapp',$3,TRUE,'meta_whatsapp',$4,$5,'verified','connected')`,
    [connectionId, rig.ids.organizationA, `WhatsApp ${connectionId}`, `hash-${connectionId}`, phoneNumberId],
  )
  const secret = await storeProviderSecretToPool(pool, {
    organizationId: rig.ids.organizationA,
    clientId: null,
    contractId: rig.ids.contractA,
    provider: 'meta_social',
    targetKind: 'publishing',
    connectionTable: 'channel_connections',
    connectionId,
    secretKind: 'access_token',
    value: 'integration-whatsapp-token',
  }, providerKey)
  await rig.sql(
    `UPDATE public.channel_connections
        SET protected_metadata_references = jsonb_build_object('accessTokenReference', $2::text)
      WHERE id = $1`,
    [connectionId, secret.reference],
  )
  await rig.sql(
    `INSERT INTO public.crm_sequences (id, organization_id, name, is_active)
     VALUES ($1,$2,$3,TRUE)`,
    [sequenceId, rig.ids.organizationA, `Sequência ${sequenceId}`],
  )
  await rig.sql(
    `INSERT INTO public.crm_sequence_steps (
       id, sequence_id, action_type, delay_minutes, subject, body, order_index, is_active, metadata
     ) VALUES ($1,$2,'whatsapp',0,'Follow-up','Olá pelo WhatsApp',0,TRUE,$3::jsonb)`,
    [stepId, sequenceId, JSON.stringify({ connectionId, recipientOptIn: true, templateName: 'integration_follow_up', languageCode: 'pt_BR' })],
  )
  await rig.sql(
    `INSERT INTO public.crm_sequence_enrollments (
       id, organization_id, sequence_id, lead_id, status, current_step_index, next_execution_at
     ) VALUES ($1,$2,$3,$4,'active',0,NOW())`,
    [enrollmentId, rig.ids.organizationA, sequenceId, leadId],
  )

  return { leadId, sequenceId, stepId, enrollmentId, connectionId, phoneNumberId, phone }
}

function whatsappReceiptPayload(phoneNumberId: string, externalMessageId: string, recipientId: string) {
  return JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{
      id: 'waba-integration',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: { phone_number_id: phoneNumberId },
          statuses: [{
            id: externalMessageId,
            recipient_id: recipientId.replace(/^\+/, ''),
            timestamp: String(Math.floor(Date.now() / 1_000)),
            status: 'delivered',
          }],
        },
      }],
    }],
  })
}
