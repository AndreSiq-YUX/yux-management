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
  // No opt-in on the lead: the default policy allows the published business contact,
  // but only once the organization's commercial sender is approved.
  expect(
    (await rig.request('client_admin_A', 'GET', `/api/crm/leads/${leadId}/email`)).body.message,
  ).toContain('remetente comercial')
  await rig.sql(
    `INSERT INTO commercial_email_senders(organization_id,mode,from_email,from_name,reply_to,approved_at)
     VALUES($1,'professional','vendas@fixture.test','Fixture Comercial','caixa@fixture.test',now())`,
    [fixture.organizationId],
  )
  await rig.sql(
    `INSERT INTO organization_contact_policies(organization_id,email_basis,whatsapp_basis) VALUES($1,'explicit_opt_in','explicit_opt_in')`,
    [fixture.organizationId],
  )
  expect(
    (await rig.request('client_admin_A', 'GET', `/api/crm/leads/${leadId}/email`)).body.canSend,
  ).toBe(false)
  await rig.sql('DELETE FROM organization_contact_policies WHERE organization_id=$1', [fixture.organizationId])
  const provider = (
    await rig.sql(
      `INSERT INTO platform_provider_connections(provider_type,provider_key,display_name,status,is_default,public_config) VALUES('email','smtp2go','CRM fixture','active',true,'{"defaultFromEmail":"sender@fixture.test"}') ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET status='active',public_config=EXCLUDED.public_config RETURNING id`,
    )
  ).rows[0]
  try {
    const capability = (
      await rig.request('client_admin_A', 'GET', `/api/crm/leads/${leadId}/email`)
    ).body
    expect(capability.canSend).toBe(true)
    expect(capability.sender).toEqual({ fromName: 'Fixture Comercial', fromEmail: 'vendas@fixture.test' })
    expect(JSON.stringify(capability)).not.toContain('caixa@fixture.test')
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
    const stored = (
      await rig.sql('SELECT email_kind, metadata FROM email_send_requests WHERE id=$1', [send.body.requestId])
    ).rows[0]
    expect(stored.email_kind).toBe('operational')
    expect(stored.metadata).toMatchObject({ contactBasis: 'published_business_contact' })
    let providerInput: any
    const accepted = await sendEmailRequest(
      { query: rig.sql } as any,
      send.body.requestId,
      'fixture',
      async (_pool, _key, input) => {
        providerInput = input
        return { sent: true, providerMessageId: 'fixture-message' }
      },
    )
    expect(providerInput.commercialSender).toMatchObject({ leadId, revision: expect.any(String) })
    expect(providerInput.optOutUrl).toMatch(/\/api\/public\/email\/unsubscribe\/[A-Za-z0-9_-]+$/)
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
    await rig.sql('DELETE FROM commercial_email_senders WHERE organization_id=$1', [fixture.organizationId])
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

it('sends WhatsApp from the lead page within policy and links the conversation to the lead', async () => {
  const url = `/api/crm/leads/${leadId}/whatsapp`
  expect((await rig.request('client_admin_A', 'GET', url)).body).toMatchObject({ canSend: false, mode: null })
  await rig.sql("UPDATE leads SET whatsapp_phone='(47) 99876-5432' WHERE id=$1", [leadId])
  const connectionId = randomUUID()
  await rig.sql(
    `INSERT INTO channel_connections (id, organization_id, channel, name, is_active, adapter_key, inbound_token_hash, phone_number_id, provider_verify_state, token_state, display_phone_number)
     VALUES ($1,$2,'whatsapp',$5,TRUE,'meta_whatsapp',$3,$4,'verified','connected','+55 47 3000-0000')`,
    [connectionId, fixture.organizationId, `hash-${connectionId}`, `phone-${connectionId}`, `Comercial ${connectionId}`],
  )
  try {
    // Default WhatsApp policy keeps Meta's explicit opt-in.
    const blocked = (await rig.request('client_admin_A', 'GET', url)).body
    expect(blocked).toMatchObject({ canSend: false, insideWindow: false })
    expect(blocked.message).toContain('autorização')
    expect((await rig.request('client_admin_A', 'POST', url, { requestId: randomUUID(), templateName: 'primeiro_contato' })).statusCode).toBe(422)

    await rig.sql('UPDATE leads SET whatsapp_opt_in=true WHERE id=$1', [leadId])
    const capability = (await rig.request('client_admin_A', 'GET', url)).body
    expect(capability.message).toContain('modelo aprovado')
    expect(capability).toMatchObject({ canSend: true, mode: 'template' })
    expect(capability.connections.map((c: any) => c.id)).toContain(connectionId)
    expect(JSON.stringify(capability)).not.toContain(`phone-${connectionId}`)
    const text = await rig.request('client_admin_A', 'POST', url, { requestId: randomUUID(), body: 'Olá!' })
    expect(text.statusCode).toBe(422)

    const input = { requestId: randomUUID(), templateName: 'primeiro_contato', bodyParameters: ['Maria'] }
    const sent = await rig.request('client_admin_A', 'POST', url, input)
    expect(sent.statusCode, JSON.stringify(sent.body)).toBe(202)
    expect(jobs.at(-1)).toMatchObject({ name: 'omnichannel.dispatchOutbound', data: { messageId: sent.body.messageId } })
    const again = await rig.request('client_admin_A', 'POST', url, input)
    expect(again.body).toMatchObject({ messageId: sent.body.messageId, duplicate: true })
    expect((await rig.request('client_admin_B', 'POST', url, { ...input, requestId: randomUUID() })).statusCode).toBe(404)

    const stored = (await rig.sql(
      `SELECT m.content_type, m.metadata, c.lead_id, link.status AS link_status
         FROM messages m JOIN conversations c ON c.id = m.conversation_id
         LEFT JOIN lead_conversation_links link ON link.conversation_id = c.id AND link.lead_id = c.lead_id
        WHERE m.id = $1`,
      [sent.body.messageId],
    )).rows[0]
    expect(stored).toMatchObject({ content_type: 'template', lead_id: leadId, link_status: 'linked' })
    expect(stored.metadata).toMatchObject({
      source: 'crm_lead', templateName: 'primeiro_contato', recipientOptIn: true,
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Maria' }] }],
    })
    const related = await rig.request('client_admin_A', 'GET', `/api/crm/leads/${leadId}/related`)
    expect(related.body.conversations.map((c: any) => c.conversation_id ?? c.conversationId)).toContain(sent.body.conversationId)
  } finally {
    await rig.sql('UPDATE leads SET whatsapp_opt_in=false, whatsapp_phone=NULL WHERE id=$1', [leadId])
    await rig.sql('UPDATE channel_connections SET is_active=FALSE WHERE id=$1', [connectionId])
  }
})

it('applies bulk sequence actions lead by lead, skipping duplicates and foreign leads', async () => {
  const second = (
    await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
      organizationId: fixture.organizationId,
      crmInstanceId: fixture.instanceId,
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
      name: 'Lote',
      email: 'lote@empresa.test',
      source: 'Manual',
    })
  ).body.id
  const sequenceId = (await rig.sql(
    `INSERT INTO crm_sequences (organization_id, name, is_active) VALUES ($1, $2, TRUE) RETURNING id`,
    [fixture.organizationId, `Lote ${randomUUID()}`],
  )).rows[0].id
  const foreign = randomUUID()
  const enroll = await rig.request('client_admin_A', 'POST', '/api/crm/leads/bulk', {
    action: 'enroll_sequence', organizationId: fixture.organizationId, sequenceId, leadIds: [leadId, second, foreign],
  })
  expect(enroll.statusCode, JSON.stringify(enroll.body)).toBe(200)
  expect(enroll.body).toMatchObject({ done: 2, skipped: 0, failed: 1 })
  const repeat = await rig.request('client_admin_A', 'POST', '/api/crm/leads/bulk', {
    action: 'enroll_sequence', organizationId: fixture.organizationId, sequenceId, leadIds: [leadId, second],
  })
  expect(repeat.body).toMatchObject({ done: 0, skipped: 2 })
  const otherAccount = await rig.request('client_admin_B', 'POST', '/api/crm/leads/bulk', {
    action: 'pause_sequences', organizationId: fixture.organizationId, leadIds: [leadId, second],
  })
  expect(otherAccount.body?.done ?? 0).toBe(0)
  const pause = await rig.request('client_admin_A', 'POST', '/api/crm/leads/bulk', {
    action: 'pause_sequences', organizationId: fixture.organizationId, leadIds: [leadId, second],
  })
  expect(pause.body).toMatchObject({ done: 2 })
  expect((await rig.sql(
    `SELECT status FROM crm_sequence_enrollments WHERE sequence_id = $1 ORDER BY status`, [sequenceId],
  )).rows.map((r: any) => r.status)).toEqual(['paused', 'paused'])
  expect((await rig.request('client_admin_A', 'POST', '/api/crm/leads/bulk', { action: 'pause_sequences', organizationId: fixture.organizationId, leadIds: [] })).statusCode).toBe(400)
  await rig.sql('UPDATE leads SET deleted_at = now() WHERE id = $1', [second])
})

it('rejects writes to a lead excluded while a composition was open',async()=>{
 await rig.sql('UPDATE leads SET deleted_at=now() WHERE id=$1',[leadId])
 expect((await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/activities`,{kind:'note',title:'Não salvar',description:'Composição anterior',requestId:randomUUID()})).statusCode).toBe(404)
 expect((await rig.request('client_admin_A','POST',`/api/crm/leads/${leadId}/email`,{subject:'Não enviar',body:'Composição anterior',requestId:randomUUID()})).statusCode).toBe(404)
 expect((await rig.request('client_admin_A','GET',`/api/crm/leads/${leadId}/related`)).statusCode).toBe(404)
 expect(await rig.providerCalls()).toHaveLength(0)
})
