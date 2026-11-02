import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createIntegrationRig, type IntegrationRig } from './support/rig.js'
import { createRecordProfileFixture } from './support/crm-record-profile-fixtures.js'
import { fixtureUsers } from './support/fixtures.js'
import { createRadarCampaign } from '../../src/modules/radar/repository.js'
let rig: IntegrationRig,
  fixture: Awaited<ReturnType<typeof createRecordProfileFixture>>,
  campaignId: string
beforeAll(async () => {
  rig = await createIntegrationRig({ queueMode: 'stub' })
  fixture = await createRecordProfileFixture(rig)
  campaignId = (
    await createRadarCampaign(
      { query: rig.sql } as never,
      fixtureUsers.yux_admin as never,
      {
        organizationId: fixture.organizationId,
        name: 'Legacy rights',
        campaignType: 'regional_b2b',
        targetSegment: 'Cozinhas',
        targetStates: ['PR'],
        offerType: 'Massas',
      },
    )
  ).id
})
afterAll(async () => {
  await rig?.close()
})
it('rechecks revoked delivery rights before any legacy conversion write and permits currently licensed data', async () => {
  for (const [provider, source] of [
    ['cnpja', 'cnpja_advanced_search'],
    ['brave_place', 'brave_place'],
    ['serper', 'serper_web_search'],
    ['perplexity', 'perplexity_search_web'],
  ]) {
    await rig.sql(
      `INSERT INTO platform_provider_connections(provider_type,provider_key,display_name,status,is_default,public_config) VALUES('internal_service',$1,'Rights fixture','active',true,'{}') ON CONFLICT(provider_type,provider_key,environment) DO UPDATE SET public_config='{}',is_default=true,updated_at=now()`,
      [provider],
    )
    const company = (
      await rig.sql(
        `INSERT INTO radar_company_records(organization_id,trade_name,cnpj,city,state,address,website_url,source_type,dedupe_key) VALUES($1,'Cozinha pesquisada','92345678000109','Londrina','PR','Rua Um, 10','https://cozinha.test',$2,$3) RETURNING id`,
        [fixture.organizationId, source, randomUUID()],
      )
    ).rows[0].id
    const opportunity = (
      await rig.sql(
        `INSERT INTO radar_opportunities(organization_id,campaign_id,company_record_id,status) VALUES($1,$2,$3,'approved') RETURNING id`,
        [fixture.organizationId, campaignId, company],
      )
    ).rows[0].id
    const convert = () =>
      rig.request(
        'yux_admin',
        'POST',
        `/api/radar/opportunities/${opportunity}/convert-to-lead`,
      )
    const rejected = await convert()
    expect(rejected.statusCode, provider + JSON.stringify(rejected.body)).toBe(
      409,
    )
    expect(
      (
        await rig.sql(
          "SELECT id FROM leads WHERE attribution_context->>'radarOpportunityId'=$1",
          [opportunity],
        )
      ).rows,
    ).toHaveLength(0)
    expect(
      (
        await rig.sql('SELECT status FROM radar_opportunities WHERE id=$1', [
          opportunity,
        ])
      ).rows[0].status,
    ).toBe('approved')
    if (provider === 'cnpja') {
      await rig.sql(
        `UPDATE platform_provider_connections SET public_config='{"clientDeliveryLicensed":true}',updated_at=now() WHERE provider_key=$1`,
        [provider],
      )
      const accepted = await convert()
      expect(accepted.statusCode, JSON.stringify(accepted.body)).toBe(201)
      const lead = (
        await rig.sql(
          'SELECT city,website_url,score,email FROM leads WHERE id=$1',
          [accepted.body.leadId],
        )
      ).rows[0]
      expect(lead).toMatchObject({
        city: 'Londrina',
        website_url: 'https://cozinha.test',
        score: 0,
        email: '',
      })
    }
  }
  expect(await rig.providerCalls()).toHaveLength(0)
})
