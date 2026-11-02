import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
import { fixtureUsers } from './support/fixtures.js'
import { createRadarCampaign } from '../../src/modules/radar/repository.js'
let rig: IntegrationRig,
  fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>,
  leadId: string,
  candidateId: string
beforeAll(async () => {
  rig = await createIntegrationRig({ queueMode: 'stub' })
  fixture = await createRecordProfileFixture(rig)
  const lead = await rig.request('client_admin_A', 'POST', '/api/crm/leads', {
    organizationId: fixture.organizationId,
    crmInstanceId: fixture.instanceId,
    pipelineId: fixture.pipelineId,
    stageId: fixture.stageId,
    name: 'Empresa Alfa',
    email: '',
    source: 'Radar Comercial',
    city: 'Cidade manual',
  })
  leadId = lead.body.id
  await rig.sql(
    `INSERT INTO contract_modules(contract_id,module_key,enabled) VALUES($1,'radar',true) ON CONFLICT(contract_id,module_key) DO UPDATE SET enabled=true`,
    [rig.ids.contractA],
  )
  const campaign = await createRadarCampaign(
    { query: rig.sql } as any,
    fixtureUsers.yux_admin as any,
    {
      organizationId: fixture.organizationId,
      name: 'Dados salvos',
      targetSegment: 'Cozinhas',
      targetStates: ['SP'],
      campaignType: 'regional_b2b',
      offerType: 'Massas',
    },
  )
  await rig.sql(
    'UPDATE leads SET owner_member_id=(SELECT id FROM crm_instance_members WHERE crm_instance_id=$2 AND user_id=$3) WHERE id=$1',
    [leadId, fixture.instanceId, fixtureUsers.client_member_A.id],
  )
  candidateId = randomUUID()
  await rig.sql(
    `INSERT INTO radar_candidate_records(id,organization_id,campaign_id,source_type,title,dedupe_key,crm_lead_id,normalized_payload) VALUES($1::uuid,$2,$3,'manual','Empresa Alfa',$1::text,$4,$5::jsonb)`,
    [
      candidateId,
      fixture.organizationId,
      campaign.id,
      leadId,
      JSON.stringify({
        websiteUrl: 'https://alfa.test',
        city: 'Cidade pesquisada',
        state: 'SP',
        address: 'Rua Um, 10',
        publicContacts: [
          {
            kind: 'whatsapp',
            value: '+5511999998888',
            sourceUrl: 'https://alfa.test',
            observedAt: '2026-11-02',
            association: 'confirmed',
            scope: 'company',
          },
        ],
      }),
    ],
  )
})
afterAll(async () => {
  await rig?.close()
})
it('previews and fills saved gaps idempotently while preserving manual values', async () => {
  const preview = await rig.request(
    'yux_admin',
    'GET',
    `/api/crm/leads/${leadId}/radar-data`,
  )
  expect(preview.statusCode, JSON.stringify(preview.body)).toBe(200)
  expect(
    preview.body.proposals.find((p: any) => p.field === 'websiteUrl'),
  ).toMatchObject({ incomingValue: 'https://alfa.test', decision: 'fill' })
  expect(
    preview.body.proposals.find((p: any) => p.field === 'city'),
  ).toMatchObject({ decision: 'preserve' })
  const input = {
    previewRevision: preview.body.previewRevision,
    requestId: randomUUID(),
  }
  const apply = await rig.request(
    'yux_admin',
    'POST',
    `/api/crm/leads/${leadId}/radar-data`,
    input,
  )
  expect(apply.statusCode, JSON.stringify(apply.body)).toBe(200)
  expect(
    (
      await rig.request(
        'yux_admin',
        'POST',
        `/api/crm/leads/${leadId}/radar-data`,
        input,
      )
    ).body,
  ).toEqual(apply.body)
  const row = (
    await rig.sql(
      'SELECT website_url,city,whatsapp_phone FROM leads WHERE id=$1',
      [leadId],
    )
  ).rows[0]
  expect(row).toMatchObject({
    website_url: 'https://alfa.test',
    city: 'Cidade manual',
    whatsapp_phone: '+5511999998888',
  })
  for (const role of [
    'yux_admin',
    'yux_operator',
    'client_admin_A',
    'client_member_A',
  ] as const) {
    const read = await rig.request(
      role,
      'GET',
      `/api/crm/leads/${leadId}/radar-data`,
    )
    expect(read.statusCode, role + JSON.stringify(read.body)).toBe(200)
    const applied=await rig.request(role,'POST',`/api/crm/leads/${leadId}/radar-data`,{previewRevision:read.body.previewRevision,requestId:randomUUID()})
    expect(applied.statusCode,role+JSON.stringify(applied.body)).toBe(200)
    expect(applied.body.appliedFields).toEqual([])
  }
  const licensed = (
    await rig.sql(
      `INSERT INTO platform_provider_connections(provider_type,provider_key,display_name,status,is_default,public_config) VALUES('internal_service','cnpja','Rights fixture','active',true,'{"clientDeliveryLicensed":true}') ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET public_config=EXCLUDED.public_config,is_default=true RETURNING id`,
    )
  ).rows[0]
  await rig.sql(
    "UPDATE radar_candidate_records SET source_type='cnpja_advanced_search' WHERE id=$1",
    [candidateId],
  )
  const licensedRead = await rig.request(
    'client_admin_A',
    'GET',
    `/api/crm/leads/${leadId}/radar-data`,
  )
  expect(licensedRead.statusCode, JSON.stringify(licensedRead.body)).toBe(200)
  await rig.sql(
    "UPDATE radar_candidate_records SET source_type='manual' WHERE id=$1",
    [candidateId],
  )
  await rig.sql('DELETE FROM platform_provider_connections WHERE id=$1', [
    licensed.id,
  ])
  const fresh = await rig.request(
    'client_admin_A',
    'GET',
    `/api/crm/leads/${leadId}/radar-data`,
  )
  const count = await rig.sql(
    'SELECT count(*)::int AS n FROM interactions WHERE lead_id=$1',
    [leadId],
  )
  const again = await rig.request(
    'client_admin_A',
    'POST',
    `/api/crm/leads/${leadId}/radar-data`,
    { previewRevision: fresh.body.previewRevision, requestId: randomUUID() },
  )
  expect(again.statusCode, JSON.stringify(again.body)).toBe(200)
  expect(again.body.appliedFields).toEqual([])
  expect(
    (
      await rig.sql(
        'SELECT count(*)::int AS n FROM interactions WHERE lead_id=$1',
        [leadId],
      )
    ).rows,
  ).toEqual(count.rows)
  expect(await rig.providerCalls()).toHaveLength(0)
})
it('rejects stale previews, foreign accounts and delivery without attribution rights', async () => {
  const preview = await rig.request(
    'yux_admin',
    'GET',
    `/api/crm/leads/${leadId}/radar-data`,
  )
  await rig.sql(
    "UPDATE leads SET city='Outra cidade',updated_at=now() WHERE id=$1",
    [leadId],
  )
  expect(
    (
      await rig.request(
        'yux_admin',
        'POST',
        `/api/crm/leads/${leadId}/radar-data`,
        {
          previewRevision: preview.body.previewRevision,
          requestId: randomUUID(),
        },
      )
    ).statusCode,
  ).toBe(409)
  expect(
    (
      await rig.request(
        'client_admin_B',
        'GET',
        `/api/crm/leads/${leadId}/radar-data`,
      )
    ).statusCode,
  ).toBe(404)
  await rig.sql(
    "UPDATE radar_candidate_records SET source_type='osm_extract' WHERE id=$1",
    [candidateId],
  )
  expect(
    (
      await rig.request(
        'yux_admin',
        'GET',
        `/api/crm/leads/${leadId}/radar-data`,
      )
    ).statusCode,
  ).toBe(409)
  await rig.sql(
    "UPDATE radar_candidate_records SET source_type='manual' WHERE id=$1",
    [candidateId],
  )
  await rig.sql('UPDATE leads SET deleted_at=now() WHERE id=$1', [leadId])
  expect(
    (
      await rig.request(
        'yux_admin',
        'GET',
        `/api/crm/leads/${leadId}/radar-data`,
      )
    ).statusCode,
  ).toBe(404)
})
