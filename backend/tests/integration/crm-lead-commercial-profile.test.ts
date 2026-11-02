import { afterAll, beforeAll, expect, it } from 'vitest'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
import { fixtureUsers } from './support/fixtures.js'
let rig: IntegrationRig,
  fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>
beforeAll(async () => {
  rig = await createIntegrationRig({ queueMode: 'stub' })
  fixture = await createRecordProfileFixture(rig)
})
afterAll(async () => {
  await rig?.close()
})
it('persists commercial fields, projects nested data for four roles and isolates other accounts', async () => {
  const created = await rig.request(
    'client_admin_A',
    'POST',
    '/api/crm/leads',
    {
      organizationId: fixture.organizationId,
      crmInstanceId: fixture.instanceId,
      pipelineId: fixture.pipelineId,
      stageId: fixture.stageId,
      name: 'Brave Alimentos',
      email: 'comercial@alimentos.test',
      source: 'Manual',
      websiteUrl: 'https://alimentos.test',
      city: 'Londrina',
      state: 'PR',
      address: 'Rua Um, 12',
      cnpj: '12345678000190',
      whatsappPhone: '+5543999998888',
      commercialProfile: {
        legalName: 'Brave Alimentos Ltda',
        provider: 'private',
        contacts: [
          {
            kind: 'email',
            value: 'compras@alimentos.test',
            association: 'confirmed',
            scope: 'company',
            model: 'hidden',
          },
        ],
        profile: {
          summary: {
            value: 'Brave Alimentos atende cozinhas industriais',
            sourceUrl: 'https://alimentos.test',
            tokens: 999,
          },
        },
        raw: { secret: 'private' },
      },
    },
  )
  expect(created.statusCode, JSON.stringify(created.body)).toBe(201)
  expect(created.body).toMatchObject({
    websiteUrl: 'https://alimentos.test',
    city: 'Londrina',
    state: 'PR',
    address: 'Rua Um, 12',
    cnpj: '12345678000190',
    whatsappPhone: '+5543999998888',
  })
  const member = await rig.sql(
    'SELECT id FROM crm_instance_members WHERE crm_instance_id=$1 AND user_id=$2',
    [fixture.instanceId, fixtureUsers.client_member_A.id],
  )
  await rig.sql('UPDATE leads SET owner_member_id=$2 WHERE id=$1', [
    created.body.id,
    member.rows[0].id,
  ])
  await rig.sql('UPDATE leads SET attribution_context=$2::jsonb WHERE id=$1',[created.body.id,JSON.stringify({utmSource:'campanha',radarCampaignId:'a163958e-fad8-4bd1-9118-e92dd38bd1d6',provider:'secret-provider',radarDiagnosticId:'secret-diagnostic',contacts:[{kind:'email',value:'compras@alimentos.test',association:'confirmed',model:'secret-model'}]})])
  for (const role of [
    'yux_admin',
    'yux_operator',
    'client_admin_A',
    'client_member_A',
  ] as const) {
    const list = await rig.request(
      role,
      'GET',
      `/api/crm/leads?crmInstanceId=${fixture.instanceId}`,
    )
    const lead = list.body.find((l: any) => l.id === created.body.id)
    expect(JSON.stringify(lead.attributionContext)).not.toMatch(/secret-provider|secret-diagnostic|secret-model|provider|model|radarDiagnosticId/)
    expect(lead.attributionContext.utmSource).toBe('campanha')
    expect(lead.city).toBe('Londrina')
    expect(lead.commercialProfile.legalName).toBe('Brave Alimentos Ltda')
    expect(JSON.stringify(lead.commercialProfile)).not.toMatch(
      /provider|model|tokens|secret|private/,
    )
  }
  expect((await rig.request('client_admin_B','GET',`/api/crm/leads/${created.body.id}`)).statusCode).toBe(404)
  expect(
    (
      await rig.request(
        'client_admin_B',
        'GET',
        `/api/crm/leads?crmInstanceId=${fixture.instanceId}`,
      )
    ).body,
  ).toEqual([])
  const patch = await rig.request(
    'client_admin_A',
    'PATCH',
    `/api/crm/leads/${created.body.id}`,
    { websiteUrl: 'javascript:alert(1)' },
  )
  expect(patch.statusCode).toBe(400)
  const updated = await rig.request(
    'client_admin_A',
    'PATCH',
    `/api/crm/leads/${created.body.id}`,
    { city: 'Maringá', websiteUrl: 'https://novo.test' },
  )
  expect(updated.body).toMatchObject({
    city: 'Maringá',
    websiteUrl: 'https://novo.test',
  })
  const contact = (
    await rig.sql(
      "INSERT INTO omnichannel_contacts(organization_id,display_name,email) VALUES($1,'Contato Alfa',$2) RETURNING id",
      [fixture.organizationId, created.body.id + '@integration.test'],
    )
  ).rows[0].id
  const conversation = (
    await rig.sql(
      "INSERT INTO conversations(organization_id,contact_id,channel,status,response_mode,lead_id) VALUES($1,$3,'webchat','open','manual',$2) RETURNING id",
      [fixture.organizationId, created.body.id, contact],
    )
  ).rows[0].id
  await rig.sql(
    "INSERT INTO lead_conversation_links(organization_id,crm_instance_id,lead_id,conversation_id,channel,status,match_method) VALUES($1,$2,$3,$4,'webchat','linked','manual')",
    [fixture.organizationId, fixture.instanceId, created.body.id, conversation],
  )
  await rig.sql(
    "INSERT INTO crm_quick_replies(crm_instance_id,label,body) VALUES($1,'Catálogo','Segue nosso catálogo.') ON CONFLICT(crm_instance_id,label) DO UPDATE SET body=EXCLUDED.body",
    [fixture.instanceId],
  )
  for (const role of [
    'yux_admin',
    'yux_operator',
    'client_admin_A',
    'client_member_A',
  ] as const) {
    const related = await rig.request(
      role,
      'GET',
      `/api/crm/leads/${created.body.id}/related`,
    )
    expect(related.statusCode, JSON.stringify(related.body)).toBe(200)
    expect(related.body.conversations[0].conversation.id).toBe(conversation)
    expect((await rig.request(role,'GET',`/api/crm/leads/${created.body.id}`)).body.city).toBe('Maringá')
    const inbox=await rig.request(role,'GET',`/api/omnichannel/conversations/${conversation}?portal=true`)
    expect(inbox.statusCode,JSON.stringify(inbox.body)).toBe(200)
    expect(inbox.body.leadId).toBe(created.body.id)
    expect(related.body.quickReplies[0].label).toBe('Catálogo')
  }
  expect((await rig.request('client_admin_B','GET',`/api/crm/leads/${created.body.id}`)).statusCode).toBe(404)
  expect(
    (
      await rig.request(
        'client_admin_B',
        'GET',
        `/api/crm/leads/${created.body.id}/related`,
      )
    ).statusCode,
  ).toBe(404)
})
