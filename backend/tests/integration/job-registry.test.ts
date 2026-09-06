import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { JOB_NAMES } from '../../src/jobs/queue.js'
import { jobRegistry } from '../../src/jobs/registry.js'
import { storeProviderSecretToPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { fixtureIds } from './support/fixtures.js'
import { createIntegrationRig, getIntegrationDatabaseUrl } from './support/rig.js'

const providerKey = new Uint8Array(32).fill(7)

it('mantém schema, handler, classe, timeout e sandbox explícitos para todo JobName', () => {
  expect(JOB_NAMES.filter(name => !jobRegistry[name])).toEqual([])
  for (const name of JOB_NAMES) {
    expect(typeof jobRegistry[name].handler).toBe('function')
    expect(jobRegistry[name].timeoutMs).toBeGreaterThan(0)
    expect(typeof jobRegistry[name].sandboxOnly).toBe('boolean')
  }
  expect(jobRegistry['provider.syncMetrics'].queueClass).toBe('external')
  expect(jobRegistry['omnichannel.simulateChannelEvent'].sandboxOnly).toBe(true)
  expect(jobRegistry['omnichannel.requestScheduling'].queueClass).toBe('internal')
})

it('coleta métricas pelo adaptador real e persiste o timestamp de origem', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 4 })
  try {
    const connectionId = randomUUID()
    const campaignId = randomUUID()
    await rig.sql(
      `INSERT INTO public.ad_provider_connections (
         id, organization_id, provider, name, status, provider_account_id
       ) VALUES ($1,$2,'meta',$3,'connected','act_integration')`,
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
      value: 'integration-meta-ads-token',
    }, providerKey)
    await rig.sql(
      `UPDATE public.ad_provider_connections SET token_reference=$2 WHERE id=$1`,
      [connectionId, secret.reference],
    )
    await rig.sql(
      `INSERT INTO public.campaigns (
         id, organization_id, client_id, contract_id, provider_connection_id,
         name, platform, external_id, status, budget, provider, objective,
         lifecycle_status, daily_budget, total_budget, starts_at, attributed_revenue
       ) VALUES ($1,$2,$3,$4,$5,'Campanha integração','META',$6,'ACTIVE',100,
         'meta','lead_generation','active',10,100,NOW(),75)`,
      [campaignId, rig.ids.organizationA, fixtureIds.clientA, rig.ids.contractA, connectionId, `provider-${campaignId}`],
    )

    const response = await rig.request('client_admin_A', 'POST', '/api/functions/sync-ad-metrics', {
      body: { campaignId },
    })
    expect(response.statusCode).toBe(200)
    expect(response.body).toMatchObject({ success: true, pending: true, functionName: 'sync-ad-metrics' })
    await rig.workerTick()

    const snapshot = (await rig.sql(
      `SELECT spend::text, impressions, clicks, leads, source_timestamp, raw_metrics
         FROM public.campaign_metric_snapshots WHERE campaign_id=$1`,
      [campaignId],
    )).rows[0]
    expect(snapshot).toMatchObject({ spend: '12.50', impressions: 120, clicks: 15, leads: 3 })
    expect(new Date(snapshot.source_timestamp).toString()).not.toBe('Invalid Date')
    expect(snapshot.raw_metrics.raw).toBeTruthy()
    expect((await rig.sql(
      `SELECT status, completed_at FROM public.ad_provider_mutation_runs
        WHERE campaign_id=$1 AND action='sync_metrics'`,
      [campaignId],
    )).rows[0]).toMatchObject({ status: 'succeeded' })
  } finally {
    await pool.end()
    await rig.close()
  }
})

it('isola simulação no ledger de sandbox sem criar conversa ou mensagem', async () => {
  const rig = await createIntegrationRig()
  try {
    const before = (await rig.sql(
      `SELECT (SELECT count(*)::int FROM public.conversations) AS conversations,
              (SELECT count(*)::int FROM public.messages) AS messages`,
    )).rows[0]
    const rejected = await rig.request('yux_admin', 'POST', '/api/omnichannel/simulate-channel-event', {
      organizationId: rig.ids.organizationA,
      channel: 'webchat',
      eventType: 'message.created',
      payload: { text: 'não deve entrar em conversa real' },
    })
    expect(rejected).toMatchObject({ statusCode: 409, body: { error: 'capability_unavailable' } })

    const accepted = await rig.request('yux_admin', 'POST', '/api/omnichannel/simulate-channel-event', {
      organizationId: rig.ids.internalOrg,
      channel: 'webchat',
      eventType: 'message.created',
      payload: { text: 'somente sandbox' },
    })
    expect(accepted.statusCode).toBe(200)
    await rig.workerTick()

    const simulation = (await rig.sql(
      `SELECT channel, event_type, payload, status
         FROM public.omnichannel_simulation_events WHERE organization_id=$1`,
      [rig.ids.internalOrg],
    )).rows[0]
    expect(simulation).toMatchObject({
      channel: 'webchat',
      event_type: 'message.created',
      payload: { simulation: true, text: 'somente sandbox' },
      status: 'completed',
    })
    const after = (await rig.sql(
      `SELECT (SELECT count(*)::int FROM public.conversations) AS conversations,
              (SELECT count(*)::int FROM public.messages) AS messages`,
    )).rows[0]
    expect(after).toEqual(before)
  } finally {
    await rig.close()
  }
})
