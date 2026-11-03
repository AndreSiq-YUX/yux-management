import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'

let rig: IntegrationRig
let leadId: string
let secondLeadId: string
let fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>
const route = () => `/api/crm/leads/${leadId}/priority-signals`
const happenedAt = '2026-10-01T13:00:00.000Z'

beforeAll(async () => {
  rig = await createIntegrationRig({ queueMode: 'stub' })
  fixture = await createRecordProfileFixture(rig)
  const ids = []
  for (const name of ['Conta Norte', 'Conta Sul']) {
    const result = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId,
      crmInstanceId: fixture.instanceId,
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
      name,
      email: '',
      source: 'manual',
    })
    expect(result.statusCode).toBe(201)
    ids.push(result.body.id)
  }
  ;[leadId, secondLeadId] = ids
})
afterAll(async () => {
  await rig?.close()
})

it('records, links, deduplicates and revokes signals without exposing event text', async () => {
  const messageId = randomUUID()
  const eventIds = [randomUUID(), randomUUID()]
  for (const eventId of eventIds) {
    await rig.sql(
      `INSERT INTO public.domain_events
      (id,organization_id,crm_instance_id,event_type,aggregate_type,aggregate_id,lead_id,correlation_id,actor,occurred_at,payload)
      VALUES($1,$2,$3,'lead.response_received','message',$4,$5,$1,'{"type":"lead"}',$6,$7)`,
      [
        eventId,
        fixture.organizationId,
        fixture.instanceId,
        messageId,
        leadId,
        happenedAt,
        JSON.stringify({ channel: 'whatsapp', messageId, text: 'conteudo-privado-da-mensagem' }),
      ],
    )
  }
  const history = await rig.request('client_admin_A', 'GET', route())
  expect(history.statusCode).toBe(200)
  expect(history.body.items).toHaveLength(1)
  expect(JSON.stringify(history.body)).not.toContain('conteudo-privado-da-mensagem')
  const replyId = history.body.items[0].id
  const payload = {
    requestId: randomUUID(),
    kind: 'quote_requested',
    channel: 'email',
    occurredAt: new Date(Date.now() - 1000).toISOString(),
    sameAsSignalId: replyId,
  }
  const created = await rig.request('client_admin_A', 'POST', route(), payload)
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201)
  expect(created.body.occurredAt).toBe(happenedAt)
  expect((await rig.request('client_admin_A', 'POST', route(), payload)).body).toEqual(created.body)
  expect(
    (await rig.request('client_admin_A', 'POST', route(), { ...payload, channel: 'call' }))
      .statusCode,
  ).toBe(409)
  expect(
    (
      await rig.request(
        'client_admin_A',
        'POST',
        `/api/crm/leads/${secondLeadId}/priority-signals`,
        payload,
      )
    ).statusCode,
  ).toBe(404)
  expect((await rig.request('client_admin_B', 'GET', route())).statusCode).toBe(404)
  const revokeUrl = `${route()}/${created.body.id}/revoke`
  const correction = { requestId: randomUUID(), reason: 'Registro duplicado' }
  const revoked = await rig.request('client_admin_A', 'POST', revokeUrl, correction)
  expect(revoked.statusCode, JSON.stringify(revoked.body)).toBe(200)
  expect((await rig.request('client_admin_A', 'POST', revokeUrl, correction)).body).toEqual(
    revoked.body,
  )
  const after = await rig.request('client_admin_A', 'GET', route())
  expect(after.body.items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: created.body.id, revokedAt: expect.any(String) }),
    ]),
  )
})

it('requires a valid date for purchase forecasts', async () => {
  const result = await rig.request('client_admin_A', 'POST', route(), {
    requestId: randomUUID(),
    kind: 'purchase_window',
    channel: 'crm',
    occurredAt: happenedAt,
  })
  expect(result.statusCode).toBe(400)
})
