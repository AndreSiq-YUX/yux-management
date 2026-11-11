import { createHmac, randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { sendEmailRequest } from '../../src/modules/email-delivery/service.js'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'

const domain = 'respostas.integration.test'
const secret = 'integration-email-inbound-secret'
const jobs: Array<{ name: string; data: any }> = []
let rig: IntegrationRig
let fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>
let leadId: string
let previousDomain: string | undefined

beforeAll(async () => {
  previousDomain = process.env.EMAIL_REPLY_DOMAIN
  process.env.EMAIL_REPLY_DOMAIN = domain
  rig = await createIntegrationRig({
    queueMode: 'stub',
    stubJobQueue: { async add(name, data) { jobs.push({ name, data }); return { id: 'x' } as any }, async close() {} },
  })
  fixture = await createRecordProfileFixture(rig)
  leadId = (await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
    organizationId: fixture.organizationId, crmInstanceId: fixture.instanceId, pipelineId: fixture.pipelineId,
    stageId: fixture.stageId, name: 'Compras Empresa', email: 'compras@empresa.test', source: 'Manual',
  })).body.id
  await rig.sql(
    `INSERT INTO commercial_email_senders(organization_id,mode,from_email,from_name,reply_to,approved_at)
     VALUES($1,'professional','vendas@fixture.test','Fixture Comercial','caixa@fixture.test',now())
     ON CONFLICT (organization_id) DO UPDATE SET mode=EXCLUDED.mode, from_email=EXCLUDED.from_email,
       from_name=EXCLUDED.from_name, reply_to=EXCLUDED.reply_to, approved_at=now()`,
    [fixture.organizationId],
  )
})

afterAll(async () => {
  // The fixture organization is shared with other suites, which expect no approved sender.
  if (fixture) await rig.sql('DELETE FROM commercial_email_senders WHERE organization_id=$1', [fixture.organizationId])
  if (previousDomain === undefined) delete process.env.EMAIL_REPLY_DOMAIN
  else process.env.EMAIL_REPLY_DOMAIN = previousDomain
  await rig?.close()
})

function signed(payload: unknown, key = secret, timestamp = String(Math.floor(Date.now() / 1000))) {
  const body = JSON.stringify(payload)
  return {
    body,
    headers: {
      'content-type': 'application/json',
      'x-yux-timestamp': timestamp,
      'x-yux-signature': createHmac('sha256', key).update(`${timestamp}.${body}`).digest('hex'),
    },
  }
}

it('routes replies to the lead, stops the sequence, copies the company mailbox and threads the answer', async () => {
  // 1. Send a commercial e-mail from the lead page; the provider sees the routed Reply-To.
  const sent = await rig.request('client_admin_A', 'POST', `/api/crm/leads/${leadId}/email`, {
    requestId: randomUUID(), subject: 'Proposta de massas', body: 'Olá, segue a proposta.',
  })
  expect(sent.statusCode, JSON.stringify(sent.body)).toBe(202)
  let providerInput: any
  await sendEmailRequest({ query: rig.sql } as any, sent.body.requestId, 'fixture', async (_pool, _key, input) => {
    providerInput = input
    return { sent: true, providerMessageId: 'smtp2go-1' }
  })
  const replyTo: string = providerInput.replyToOverride
  expect(replyTo).toMatch(new RegExp(`^r\\+[A-Za-z0-9_-]{20,64}@${domain.replaceAll('.', '\\.')}$`))

  const sequenceId = (await rig.sql(
    `INSERT INTO crm_sequences (organization_id, name, is_active) VALUES ($1,$2,TRUE) RETURNING id`,
    [fixture.organizationId, `Cadência ${randomUUID()}`],
  )).rows[0].id
  await rig.sql(
    `INSERT INTO crm_sequence_enrollments (organization_id, sequence_id, lead_id, status, next_execution_at)
     VALUES ($1,$2,$3,'active',NOW() + INTERVAL '2 days')`,
    [fixture.organizationId, sequenceId, leadId],
  )

  const reply = {
    to: replyTo, from: 'compras@empresa.test', fromName: 'Maria', subject: 'Re: Proposta de massas',
    text: 'Tenho interesse, me liga amanhã.\n\nEm seg., Fixture Comercial escreveu:\n> Olá, segue a proposta.',
    messageId: `<${randomUUID()}@mail.empresa.test>`, inReplyTo: '<smtp2go-1@x>', autoSubmitted: false,
    attachments: [{ filename: 'pedido.pdf', mimeType: 'application/pdf', size: 1200 }],
  }

  // 2. Unsigned, stale or unknown deliveries change nothing.
  const forged = signed(reply, 'wrong-secret')
  expect((await rig.rawRequest('POST', '/api/webhooks/email-inbound', forged.body, forged.headers)).statusCode).toBe(401)
  const stale = signed(reply, secret, String(Math.floor(Date.now() / 1000) - 600))
  expect((await rig.rawRequest('POST', '/api/webhooks/email-inbound', stale.body, stale.headers)).statusCode).toBe(401)
  const unknown = signed({ ...reply, to: `r+${'z'.repeat(24)}@${domain}` })
  const unknownResponse = await rig.rawRequest('POST', '/api/webhooks/email-inbound', unknown.body, unknown.headers)
  expect(unknownResponse.body).toMatchObject({ matched: false })

  // 3. The real reply is stored once, linked to the lead.
  const delivery = signed(reply)
  const accepted = await rig.rawRequest('POST', '/api/webhooks/email-inbound', delivery.body, delivery.headers)
  expect(accepted.statusCode, JSON.stringify(accepted.body)).toBe(202)
  expect(accepted.body).toMatchObject({ matched: true, duplicate: false })
  const again = await rig.rawRequest('POST', '/api/webhooks/email-inbound', delivery.body, delivery.headers)
  expect(again.body).toMatchObject({ matched: true, duplicate: true })

  const enrollment = (await rig.sql('SELECT status, exit_reason FROM crm_sequence_enrollments WHERE sequence_id=$1', [sequenceId])).rows[0]
  expect(enrollment).toEqual({ status: 'manual', exit_reason: 'lead_replied' })
  expect((await rig.sql(
    "SELECT count(*)::int AS n FROM domain_events WHERE event_type='lead.response_received' AND lead_id=$1 AND payload->>'channel'='email'",
    [leadId],
  )).rows[0].n).toBe(1)
  const interaction = (await rig.sql(
    "SELECT title, description FROM interactions WHERE lead_id=$1 AND title LIKE 'E-mail recebido%'", [leadId],
  )).rows[0]
  expect(interaction.description).toBe('Tenho interesse, me liga amanhã.')

  // 4. A copy goes to the company mailbox, answerable straight to the lead.
  const forward = (await rig.sql(
    `SELECT r.id, r.recipient_email, r.metadata FROM email_send_requests r
       JOIN email_inbound_messages i ON i.forward_request_id = r.id
      WHERE r.source_entity_type='commercial_reply_forward' AND i.provider_message_id=$1`,
    [reply.messageId],
  )).rows
  expect(forward).toHaveLength(1)
  expect(forward[0]).toMatchObject({ recipient_email: 'caixa@fixture.test', metadata: { forwardReplyTo: 'compras@empresa.test' } })
  expect(jobs.filter(job => job.name === 'email.send' && job.data.requestId === forward[0].id)).toHaveLength(1)
  let forwardInput: any
  await sendEmailRequest({ query: rig.sql } as any, forward[0].id, 'fixture', async (_pool, _key, input) => {
    forwardInput = input
    return { sent: true, providerMessageId: 'smtp2go-2' }
  })
  expect(forwardInput).toMatchObject({ to: 'caixa@fixture.test', replyToOverride: 'compras@empresa.test' })
  expect(forwardInput.commercialSender).toBeUndefined()

  // 5. The lead page lists the reply (other accounts cannot) and answers in the same thread.
  const page = await rig.request('client_admin_A', 'GET', `/api/crm/leads/${leadId}/email`)
  expect(page.body.replies).toHaveLength(1)
  expect(page.body.replies[0].subject).toBe(reply.subject)
  expect(page.body.replies[0]).toMatchObject({ fromEmail: 'compras@empresa.test', fromName: 'Maria', isAutoReply: false, attachments: [{ filename: 'pedido.pdf' }] })
  expect(JSON.stringify(page.body)).not.toContain(replyTo.split('@')[0]!.slice(2))
  expect((await rig.request('client_admin_B', 'GET', `/api/crm/leads/${leadId}/email`)).statusCode).toBe(404)
  const answer = await rig.request('client_admin_A', 'POST', `/api/crm/leads/${leadId}/email`, {
    requestId: randomUUID(), subject: 'Re: Proposta de massas', body: 'Combinado!', replyToInboundId: page.body.replies[0].id,
  })
  expect(answer.statusCode, JSON.stringify(answer.body)).toBe(202)
  let answerInput: any
  await sendEmailRequest({ query: rig.sql } as any, answer.body.requestId, 'fixture', async (_pool, _key, input) => {
    answerInput = input
    return { sent: true, providerMessageId: 'smtp2go-3' }
  })
  expect(answerInput.customHeaders).toEqual(expect.arrayContaining([
    { header: 'In-Reply-To', value: reply.messageId },
    { header: 'References', value: reply.messageId },
  ]))
})

it('records out-of-office answers without stopping the sequence', async () => {
  const sent = await rig.request('client_admin_A', 'POST', `/api/crm/leads/${leadId}/email`, {
    requestId: randomUUID(), subject: 'Novidades', body: 'Olá de novo.',
  })
  let providerInput: any
  await sendEmailRequest({ query: rig.sql } as any, sent.body.requestId, 'fixture', async (_pool, _key, input) => {
    providerInput = input
    return { sent: true, providerMessageId: 'smtp2go-4' }
  })
  const sequenceId = (await rig.sql(
    `INSERT INTO crm_sequences (organization_id, name, is_active) VALUES ($1,$2,TRUE) RETURNING id`,
    [fixture.organizationId, `Cadência ${randomUUID()}`],
  )).rows[0].id
  await rig.sql(
    `INSERT INTO crm_sequence_enrollments (organization_id, sequence_id, lead_id, status, next_execution_at)
     VALUES ($1,$2,$3,'active',NOW() + INTERVAL '2 days')`,
    [fixture.organizationId, sequenceId, leadId],
  )
  const delivery = signed({
    to: providerInput.replyToOverride, from: 'compras@empresa.test', subject: 'Resposta automática: ausente',
    text: 'Estou de férias.', messageId: `<${randomUUID()}@mail.empresa.test>`, autoSubmitted: true,
  })
  const accepted = await rig.rawRequest('POST', '/api/webhooks/email-inbound', delivery.body, delivery.headers)
  expect(accepted.body).toMatchObject({ matched: true })
  expect((await rig.sql('SELECT status FROM crm_sequence_enrollments WHERE sequence_id=$1', [sequenceId])).rows[0].status).toBe('active')
})
