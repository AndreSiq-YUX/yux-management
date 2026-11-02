import { afterAll, beforeAll, expect, it } from 'vitest'
import { sendEmailRequest } from '../../src/modules/email-delivery/service.js'
import { randomUUID } from 'node:crypto'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
const jobs: { name: string; data: any; options: any }[] = []
let queueAvailable = true
let rig: IntegrationRig,
  fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>,
  leadId: string
beforeAll(async () => {
  rig = await createIntegrationRig({
    queueMode: 'stub',
    stubJobQueue: {
      async add(name, data, options) {
        if (!queueAvailable) throw new Error('test queue unavailable')
        jobs.push({ name, data, options })
        return { id: 'test' } as any
      },
      async close() {},
    },
  })
  fixture = await createRecordProfileFixture(rig)
  leadId = (
    await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId,
      crmInstanceId: fixture.instanceId,
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
      name: 'Ações reais',
      email: 'lead@empresa.test',
      source: 'Manual',
    })
  ).body.id
})
afterAll(async () => {
  await rig?.close()
})
it('persists notes, meetings and scheduled tasks atomically and prevents duplicate submissions', async () => {
  const note = {
    kind: 'note',
    title: 'Conversa comercial',
    description: 'Solicitou retorno',
    requestId: randomUUID(),
  }
  const first = await rig.request(
    'client_admin_A',
    'POST',
    `/api/crm/leads/${leadId}/activities`,
    note,
  )
  expect(first.statusCode, JSON.stringify(first.body)).toBe(201)
  const repeats = await Promise.all([
    rig.request(
      'client_admin_A',
      'POST',
      `/api/crm/leads/${leadId}/activities`,
      note,
    ),
    rig.request(
      'client_admin_A',
      'POST',
      `/api/crm/leads/${leadId}/activities`,
      note,
    ),
  ])
  repeats.forEach((repeat) => expect(repeat.body).toEqual(first.body))
  const dueAt = '2026-11-20T13:00:00.000Z'
  const meeting = await rig.request(
    'client_admin_A',
    'POST',
    `/api/crm/leads/${leadId}/activities`,
    {
      kind: 'meeting',
      title: 'Reunião com compras',
      description: 'Apresentar catálogo',
      dueAt,
      requestId: randomUUID(),
    },
  )
  expect(meeting.statusCode, JSON.stringify(meeting.body)).toBe(201)
  const tasks = await rig.request(
    'client_admin_A',
    'GET',
    `/api/crm/leads/${leadId}/tasks`,
  )
  expect(
    tasks.body.find((t: any) => t.id === meeting.body.taskId),
  ).toMatchObject({ title: 'Reunião com compras', dueAt })
  const history = await rig.request(
    'client_admin_A',
    'GET',
    `/api/crm/leads/${leadId}/interactions`,
  )
  expect(
    history.body.filter((i: any) => i.title === 'Conversa comercial'),
  ).toHaveLength(1)
  expect(history.body.find((i: any) => i.type === 'meeting').title).toBe(
    'Reunião com compras',
  )
  expect(
    (
      await rig.sql('SELECT next_follow_up_at FROM leads WHERE id=$1', [leadId])
    ).rows[0].next_follow_up_at.toISOString(),
  ).toBe(dueAt)
  expect(
    (
      await rig.request(
        'client_admin_B',
        'POST',
        `/api/crm/leads/${leadId}/activities`,
        { ...note, requestId: randomUUID() },
      )
    ).statusCode,
  ).toBe(404)
})
it('validates scheduling and reports unavailable email delivery without fabricating send success', async () => {
  const invalid = await rig.request(
    'client_admin_A',
    'POST',
    `/api/crm/leads/${leadId}/activities`,
    {
      kind: 'meeting',
      title: 'Sem data',
      description: 'Teste',
      requestId: randomUUID(),
    },
  )
  expect(invalid.statusCode).toBe(400)
  const email = await rig.request(
    'client_admin_A',
    'GET',
    `/api/crm/leads/${leadId}/email`,
  )
  expect(email.statusCode).toBe(200)
  expect(email.body.canSend).toBe(false)
  expect(email.body.message).toBeTruthy()
  const send = await rig.request(
    'client_admin_A',
    'POST',
    `/api/crm/leads/${leadId}/email`,
    { requestId: randomUUID(), subject: 'Catálogo', body: 'Conteúdo' },
  )
  expect(send.statusCode).toBe(422)
  expect(
    (
      await rig.sql('SELECT id FROM email_send_requests WHERE lead_id=$1', [
        leadId,
      ])
    ).rows,
  ).toHaveLength(0)
  expect(await rig.providerCalls()).toHaveLength(0)
})

it('queues one immutable email, retries queue failure and reports simulated provider failure honestly', async () => {
  await rig.sql('UPDATE leads SET email_opt_in=true WHERE id=$1', [leadId])
  const provider = (
    await rig.sql(
      `INSERT INTO platform_provider_connections(provider_type,provider_key,display_name,status,is_default,public_config) VALUES('email','smtp2go','CRM fixture','active',true,'{"defaultFromEmail":"sender@fixture.test"}') ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active',public_config=EXCLUDED.public_config RETURNING id`,
    )
  ).rows[0]
  try {
    expect(
      (
        await rig.request(
          'client_admin_A',
          'GET',
          `/api/crm/leads/${leadId}/email`,
        )
      ).body.canSend,
    ).toBe(true)
    const input = {
      requestId: randomUUID(),
      subject: 'Catálogo comercial',
      body: 'Conteúdo revisto pelo usuário',
    }
    queueAvailable = false
    expect(
      (
        await rig.request(
          'client_admin_A',
          'POST',
          `/api/crm/leads/${leadId}/email`,
          input,
        )
      ).statusCode,
    ).toBe(503)
    queueAvailable = true
    const send = await rig.request(
      'client_admin_A',
      'POST',
      `/api/crm/leads/${leadId}/email`,
      input,
    )
    expect(send.statusCode, JSON.stringify(send.body)).toBe(202)
    expect(send.body.status).toBe('queued')
    expect(
      (
        await rig.request(
          'client_admin_A',
          'POST',
          `/api/crm/leads/${leadId}/email`,
          { ...input, body: 'Alterado' },
        )
      ).statusCode,
    ).toBe(409)
    expect(
      (
        await rig.sql('SELECT id FROM email_send_requests WHERE lead_id=$1', [
          leadId,
        ])
      ).rows,
    ).toHaveLength(1)
    expect(
      (
        await rig.sql(
          "SELECT id FROM interactions WHERE lead_id=$1 AND type='email'",
          [leadId],
        )
      ).rows,
    ).toHaveLength(1)
    expect(jobs.at(-1)).toMatchObject({
      name: 'email.send',
      data: { requestId: send.body.requestId },
      options: { jobId: `crm-email-${send.body.requestId}` },
    })
    const events = await rig.sql(
      "SELECT id FROM domain_events WHERE lead_id=$1 AND event_type='lead.interaction_recorded' AND payload->>'type'='email'",
      [leadId],
    )
    expect(events.rows).toHaveLength(0)
    const delivery = await sendEmailRequest(
      { query: rig.sql } as any,
      send.body.requestId,
      'fixture',
      async () => ({
        sent: false,
        reason: 'smtp2go_rejected',
        error: 'private provider diagnostic',
      }),
    )
    expect(delivery.success).toBe(false)
    const status = await rig.request(
      'client_admin_A',
      'GET',
      `/api/crm/leads/${leadId}/email`,
    )
    expect(status.body.requests[0].status).toBe('failed')
    expect(JSON.stringify(status.body)).not.toContain(
      'private provider diagnostic',
    )
    const accepted = await sendEmailRequest(
      { query: rig.sql } as any,
      send.body.requestId,
      'fixture',
      async () => ({ sent: true, providerMessageId: 'fixture-message' }),
    )
    expect(accepted).toMatchObject({ success: true, status: 'sent' })
    expect(
      (
        await rig.request(
          'client_admin_A',
          'GET',
          `/api/crm/leads/${leadId}/email`,
        )
      ).body.requests[0].status,
    ).toBe('sent')
    expect(await rig.providerCalls()).toHaveLength(0)
  } finally {
    queueAvailable = true
    await rig.sql('DELETE FROM platform_provider_connections WHERE id=$1', [
      provider.id,
    ])
  }
})

it('creates a scoped proposal draft once without claiming it was sent', async () => {
  const packageId = (
    await rig.sql(
      "SELECT package_id AS id FROM contracts WHERE id='30000000-0000-4000-8000-000000000001'",
    )
  ).rows[0].id
  const input = { packageId, requestId: randomUUID() }
  const create = await rig.request(
    'client_admin_A',
    'POST',
    `/api/crm/leads/${leadId}/proposal-drafts`,
    input,
  )
  expect(create.statusCode, JSON.stringify(create.body)).toBe(201)
  expect(create.body.status).toBe('draft')
  expect(
    (
      await rig.request(
        'client_admin_A',
        'POST',
        `/api/crm/leads/${leadId}/proposal-drafts`,
        input,
      )
    ).body.id,
  ).toBe(create.body.id)
  expect(
    (
      await rig.request(
        'client_admin_B',
        'POST',
        `/api/crm/leads/${leadId}/proposal-drafts`,
        input,
      )
    ).statusCode,
  ).toBe(404)
  const history = await rig.request(
    'client_admin_A',
    'GET',
    `/api/crm/leads/${leadId}/interactions`,
  )
  expect(
    history.body.some((i: any) => i.title === 'Rascunho de proposta criado'),
  ).toBe(true)
  expect(
    (
      await rig.sql(
        "SELECT id FROM proposal_view_events WHERE lead_id=$1 AND event_type='sent'",
        [leadId],
      )
    ).rows,
  ).toHaveLength(0)
  expect(await rig.providerCalls()).toHaveLength(0)
})

it('rejects writes to a lead excluded while a composition was open',async()=>{
 await rig.sql('UPDATE leads SET deleted_at=now() WHERE id=$1',[leadId])
 expect((await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/activities`,{kind:'note',title:'Não salvar',description:'Composição anterior',requestId:randomUUID()})).statusCode).toBe(404)
 expect((await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/email`,{subject:'Não enviar',body:'Composição anterior',requestId:randomUUID()})).statusCode).toBe(404)
 expect((await rig.request('client_admin_A','GET',`/api/crm/leads/${leadId}/related`)).statusCode).toBe(404)
 expect(await rig.providerCalls()).toHaveLength(0)
})
