import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { handleProviderFunction, providerIntentPayloadHash } from '../../src/jobs/handlers/providers.js'
import { storeProviderSecretToPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { fixtureIds, fixtureUsers } from './support/fixtures.js'
import { createIntegrationRig, getIntegrationDatabaseUrl, type IntegrationRig } from './support/rig.js'

const encryptionKey = new Uint8Array(32).fill(7)
const encryptionKeyBase64 = 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc='

it('executa duas intenções legítimas uma vez cada e bloqueia retry, payload alterado e aprovação revogada', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 4 })
  try {
    const fixture = await seedProviderFixture(rig, pool)
    const first = await approvedIntent(rig, fixture, 110)
    const second = await approvedIntent(rig, fixture, 120)

    for (const mutation of [first, first, second, second]) {
      const result = await handleProviderFunction(pool, mutation.job, providerOptions(rig))
      expect(result).toBeTruthy()
    }

    const calls = await rig.providerCalls()
    expect(calls.map(call => call.intentId)).toEqual([first.intentId, second.intentId])
    const succeeded = await rig.sql(
      `SELECT intent_id, status FROM public.ad_provider_mutation_runs
        WHERE campaign_id=$1 AND action='update_budget' ORDER BY created_at`,
      [fixture.campaignId],
    )
    expect(succeeded.rows).toEqual([
      expect.objectContaining({ intent_id: first.intentId, status: 'succeeded' }),
      expect.objectContaining({ intent_id: second.intentId, status: 'succeeded' }),
    ])

    const changedPayload = {
      ...first.job,
      body: { ...first.job.body, requestPayload: { externalAdSetId: fixture.adSetId, nextDaily: 111 } },
    }
    await expect(handleProviderFunction(pool, changedPayload, providerOptions(rig)))
      .rejects.toThrow(/approved_approval_required|provider_intent_payload_hash_mismatch|provider_intent_identity_conflict/)

    const revoked = await approvedIntent(rig, fixture, 130)
    await rig.sql(`UPDATE public.approval_requests SET status='cancelled',updated_at=NOW() WHERE id=$1`, [revoked.approvalId])
    await expect(handleProviderFunction(pool, revoked.job, providerOptions(rig)))
      .rejects.toThrow('approved_approval_required')
    expect((await rig.providerCalls()).map(call => call.intentId)).toEqual([first.intentId, second.intentId])
  } finally {
    await pool.end()
    await rig.close()
  }
})

it('mantém resposta perdida como ambígua e exige reconciliação antes de qualquer nova chamada', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 4 })
  try {
    const fixture = await seedProviderFixture(rig, pool)
    const mutation = await approvedIntent(rig, fixture, 140)
    const lostResponseFetcher: typeof fetch = (resource, init = {}) => fetch(resource, {
      ...init,
      headers: { ...Object.fromEntries(new Headers(init.headers).entries()), 'x-test-provider-mode': 'lost-response' },
    })

    await expect(handleProviderFunction(pool, mutation.job, {
      ...providerOptions(rig),
      fetcher: lostResponseFetcher,
    })).rejects.toThrow('provider_outcome_unknown')

    const recovered = await handleProviderFunction(pool, mutation.job, providerOptions(rig))
    expect(recovered).toMatchObject({ duplicate: true, status: 'manual_review', reconciliationRequired: true })
    expect((await rig.providerCalls()).map(call => call.intentId)).toEqual([mutation.intentId])
    expect((await rig.sql(
      `SELECT status FROM public.ad_provider_mutation_runs WHERE organization_id=$1 AND intent_id=$2`,
      [rig.ids.organizationA, mutation.intentId],
    )).rows[0]).toEqual({ status: 'manual_review' })
  } finally {
    await pool.end()
    await rig.close()
  }
})

function providerOptions(rig: IntegrationRig) {
  return { encryptionKey: encryptionKeyBase64, graphBaseUrl: rig.providerBaseUrl }
}

async function seedProviderFixture(rig: IntegrationRig, pool: pg.Pool) {
  const projectId = randomUUID()
  const connectionId = randomUUID()
  const campaignId = randomUUID()
  const adSetId = `adset-${randomUUID()}`
  await rig.sql(
    `INSERT INTO public.projects (id,name,client_id,status,type,start_date,expected_end_date)
     VALUES ($1,'Projeto provider intent',$2,'ACTIVE','MARKETING',CURRENT_DATE,CURRENT_DATE + 30)`,
    [projectId, fixtureIds.clientA],
  )
  await rig.sql(
    `INSERT INTO public.ad_provider_connections (
       id,organization_id,provider,name,status,provider_account_id
     ) VALUES ($1,$2,'meta',$3,'connected','act_intent_test')`,
    [connectionId, rig.ids.organizationA, `Meta ${connectionId}`],
  )
  const secret = await storeProviderSecretToPool(pool, {
    organizationId: rig.ids.organizationA,
    clientId: fixtureIds.clientA,
    contractId: rig.ids.contractA,
    provider: 'meta_ads',
    targetKind: 'ads',
    connectionTable: 'ad_provider_connections',
    connectionId,
    secretKind: 'access_token',
    value: 'provider-intent-access-token',
  }, encryptionKey)
  await rig.sql(`UPDATE public.ad_provider_connections SET token_reference=$2 WHERE id=$1`, [connectionId, secret.reference])
  await rig.sql(
    `INSERT INTO public.campaigns (
       id,organization_id,client_id,contract_id,provider_connection_id,name,platform,
       external_id,status,budget,provider,objective,lifecycle_status,daily_budget,total_budget,starts_at
     ) VALUES ($1,$2,$3,$4,$5,'Intent test','META',$6,'ACTIVE',100,'meta',
       'lead_generation','active',100,1000,NOW())`,
    [campaignId, rig.ids.organizationA, fixtureIds.clientA, rig.ids.contractA, connectionId, `campaign-${campaignId}`],
  )
  return { projectId, connectionId, campaignId, adSetId }
}

async function approvedIntent(
  rig: IntegrationRig,
  fixture: Awaited<ReturnType<typeof seedProviderFixture>>,
  nextDaily: number,
) {
  const intentId = randomUUID()
  const approvalId = randomUUID()
  const requestPayload = { externalAdSetId: fixture.adSetId, nextDaily }
  const payloadHash = providerIntentPayloadHash({
    action: 'update_budget',
    campaignId: fixture.campaignId,
    connectionId: fixture.connectionId,
    requestPayload,
  })
  await rig.sql(
    `INSERT INTO public.approval_requests (
       id,project_id,target_type,target_id,title,status,requested_by,decided_at,
       provider_intent_id,provider_payload_hash
     ) VALUES ($1,$2,'campaign_provider_mutation',$3,$4,'approved',$5,NOW(),$6,$7)`,
    [approvalId, fixture.projectId, fixture.campaignId, `Aprovar orçamento ${nextDaily}`,
      fixtureUsers.client_admin_A.id, intentId, payloadHash],
  )
  return {
    intentId,
    approvalId,
    job: {
      functionName: 'execute-ad-provider-mutation',
      organizationId: rig.ids.organizationA,
      requestedBy: fixtureUsers.client_admin_A.id,
      body: {
        organizationId: rig.ids.organizationA,
        provider: 'meta',
        action: 'update_budget',
        campaignId: fixture.campaignId,
        providerConnectionId: fixture.connectionId,
        intentId,
        approvalId,
        payloadHash,
        requestPayload,
      },
    },
  }
}
