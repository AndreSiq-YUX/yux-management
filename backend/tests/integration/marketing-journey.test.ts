import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { storeProviderSecretToPool } from '../../src/lib/edge-compat/providerSecrets.js'
import { handleProviderFunction } from '../../src/jobs/handlers/providers.js'
import { fixtureIds, fixtureUsers } from './support/fixtures.js'
import { createIntegrationRig, getIntegrationDatabaseUrl } from './support/rig.js'

const encryptionKey = new Uint8Array(32).fill(7)

it('percorre planejamento, refresh, revisão, nova versão e publicação controlada no Studio', async () => {
  const rig = await createIntegrationRig()
  const pool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 4 })
  let created: { campaignId: string; contentId: string; workflowId: string; workflowRunId: string } | undefined
  let connectionId: string | undefined
  try {
    const summaryUrl = `/api/marketing-studio/journey/summary?organizationId=${rig.ids.organizationA}&contractId=${rig.ids.contractA}`
    const empty = await rig.request('client_admin_A', 'GET', summaryUrl)
    expect(empty.statusCode).toBe(200)
    expect(empty.body.counts).toMatchObject({ activeFlows: 0, generatedAssets: 0 })

    const planKey = `studio-plan-${randomUUID()}`
    const plan = await rig.request('client_admin_A', 'POST', '/api/marketing-studio/journey/plans', {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      idempotencyKey: planKey,
      name: 'Aquisição consultiva',
      objective: 'lead_generation',
      audience: 'Gestores de clínicas com equipe comercial',
      offer: 'Diagnóstico comercial de 30 minutos',
      channel: 'linkedin',
      constraints: 'Não prometer resultado garantido',
      sourceIds: [],
      provider: 'meta',
    })
    expect(plan.statusCode).toBe(201)
    expect(plan.body).toMatchObject({ status: 'draft', duplicate: false })
    created = plan.body

    const duplicate = await rig.request('client_admin_A', 'POST', '/api/marketing-studio/journey/plans', {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      idempotencyKey: planKey,
      name: 'Aquisição consultiva',
      objective: 'lead_generation',
      audience: 'Gestores de clínicas com equipe comercial',
      offer: 'Diagnóstico comercial de 30 minutos',
      channel: 'linkedin',
      constraints: 'Não prometer resultado garantido',
      sourceIds: [],
      provider: 'meta',
    })
    expect(duplicate.statusCode).toBe(201)
    expect(duplicate.body).toMatchObject({ campaignId: plan.body.campaignId, duplicate: true })

    await rig.restartApi()
    const refreshed = await rig.request('client_admin_A', 'GET', summaryUrl)
    expect(refreshed.statusCode).toBe(200)
    expect(refreshed.body.counts).toMatchObject({ activeFlows: 1, generatedAssets: 1 })
    expect(refreshed.body.contents[0]).toMatchObject({
      id: plan.body.contentId, campaignId: plan.body.campaignId, status: 'draft', latestVersionNumber: 1,
    })
    expect(refreshed.body.links.generatedAssets).toContain('#contents')

    const submitted = await rig.request('client_admin_A', 'POST', `/api/marketing-studio/journey/contents/${plan.body.contentId}/submit-review`, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      contentVersionId: plan.body.contentVersionId,
    })
    expect(submitted.statusCode).toBe(201)
    expect(submitted.body.status).toBe('pending')

    const forbiddenMemberDecision = await rig.request('client_member_A', 'POST', `/api/marketing-studio/journey/contents/${plan.body.contentId}/review`, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      contentVersionId: plan.body.contentVersionId,
      status: 'approved',
    })
    expect(forbiddenMemberDecision.statusCode).toBe(403)

    const rejected = await rig.request('client_admin_A', 'POST', `/api/marketing-studio/journey/contents/${plan.body.contentId}/review`, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      contentVersionId: plan.body.contentVersionId,
      status: 'rejected',
      comments: 'Incluir prova e tornar a chamada mais específica.',
    })
    expect(rejected.statusCode).toBe(200)
    expect(rejected.body.status).toBe('rejected')

    const nextVersion = await rig.request('client_admin_A', 'POST', `/api/marketing-studio/journey/contents/${plan.body.contentId}/versions`, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      title: 'Diagnóstico comercial para clínicas',
      body: 'Veja os gargalos do seu processo comercial com uma avaliação consultiva.',
      changeSummary: 'Prova e chamada ajustadas após revisão.',
    })
    expect(nextVersion.statusCode).toBe(201)
    expect(nextVersion.body.versionNumber).toBe(2)

    expect((await rig.request('client_admin_A', 'POST', `/api/marketing-studio/journey/contents/${plan.body.contentId}/submit-review`, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      contentVersionId: nextVersion.body.id,
    })).statusCode).toBe(201)
    expect((await rig.request('client_admin_A', 'POST', `/api/marketing-studio/journey/contents/${plan.body.contentId}/review`, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      contentVersionId: nextVersion.body.id,
      status: 'approved',
      comments: 'Versão aprovada para publicação.',
    })).statusCode).toBe(200)

    await expect(rig.sql(`UPDATE public.content_versions SET body='alterado' WHERE id=$1`, [nextVersion.body.id]))
      .rejects.toThrow('approved_content_version_immutable')

    connectionId = randomUUID()
    await rig.sql(
      `INSERT INTO public.publishing_connections (
         id,organization_id,client_id,contract_id,provider,name,status,site_url,auth_type,provider_asset_id
       ) VALUES ($1,$2,$3,$4,'meta_facebook',$5,'connected','https://facebook.com','token_reference','page-integration')`,
      [connectionId, rig.ids.organizationA, fixtureIds.clientA, rig.ids.contractA, `Facebook ${connectionId}`],
    )
    const secret = await storeProviderSecretToPool(pool, {
      organizationId: rig.ids.organizationA,
      clientId: fixtureIds.clientA,
      contractId: rig.ids.contractA,
      provider: 'meta_social',
      targetKind: 'publishing',
      connectionTable: 'publishing_connections',
      connectionId,
      secretKind: 'access_token',
      value: 'studio-publishing-token',
    }, encryptionKey)
    await rig.sql(`UPDATE public.publishing_connections SET token_reference=$2 WHERE id=$1`, [connectionId, secret.reference])

    const publishKey = `studio-publish-${randomUUID()}`
    const publishing = await rig.request('client_admin_A', 'POST', `/api/marketing-studio/journey/contents/${plan.body.contentId}/publish`, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      approvedContentVersionId: nextVersion.body.id,
      connectionId,
      action: 'publish',
      idempotencyKey: publishKey,
    })
    expect(publishing.statusCode).toBe(202)
    expect(publishing.body).toMatchObject({ approvedContentVersionId: nextVersion.body.id, status: 'queued', duplicate: false })
    const sameIntent = await rig.request('client_admin_A', 'POST', `/api/marketing-studio/journey/contents/${plan.body.contentId}/publish`, {
      organizationId: rig.ids.organizationA,
      contractId: rig.ids.contractA,
      approvedContentVersionId: nextVersion.body.id,
      connectionId,
      action: 'publish',
      idempotencyKey: publishKey,
    })
    expect(sameIntent.statusCode).toBe(200)
    expect(sameIntent.body).toMatchObject({ id: publishing.body.id, duplicate: true })

    await rig.workerTick()
    const published = (await rig.sql(
      `SELECT run.status,run.provider_post_id,run.published_url,content.status AS content_status,content.published_url AS content_url
       FROM public.publishing_runs run JOIN public.content_items content ON content.id=run.content_item_id
       WHERE run.id=$1`,
      [publishing.body.id],
    )).rows[0]
    expect(published).toMatchObject({ status: 'succeeded', content_status: 'published' })
    expect(published.provider_post_id).toBeTruthy()
    expect(published.published_url).toContain('https://provider.test/posts/')
    expect(published.content_url).toBe(published.published_url)

    const failedRunId = randomUUID()
    await rig.sql(
      `INSERT INTO public.publishing_runs (
         id,organization_id,client_id,contract_id,connection_id,content_item_id,approved_content_version_id,
         action,status,idempotency_key,request_payload,response_payload,requested_by,approved_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'publish','queued',$8,'{}'::jsonb,'{}'::jsonb,$9,$9)`,
      [failedRunId, rig.ids.organizationA, fixtureIds.clientA, rig.ids.contractA, connectionId,
        plan.body.contentId, nextVersion.body.id, `studio-failure-${randomUUID()}`, fixtureUsers.client_admin_A.id],
    )
    await rig.sql(`UPDATE public.publishing_connections SET status='stale' WHERE id=$1`, [connectionId])
    await expect(handleProviderFunction(pool, {
      functionName: 'execute-marketing-publishing', organizationId: rig.ids.organizationA,
      body: { publishingRunId: failedRunId },
    })).rejects.toThrow('publishing_connection_not_ready')
    expect((await rig.sql(`SELECT status,protected_error FROM public.publishing_runs WHERE id=$1`, [failedRunId])).rows[0])
      .toMatchObject({ status: 'failed', protected_error: 'publishing_connection_not_ready' })

    const failureSummary = await rig.request('client_admin_A', 'GET', summaryUrl)
    expect(failureSummary.body.counts.failedPublications).toBe(1)
    expect(failureSummary.body.publishingRuns.find((item: { id: string }) => item.id === failedRunId)?.protectedError)
      .toBe('publishing_failed')

    const leadId = randomUUID()
    await rig.sql(
      `INSERT INTO public.leads (id,organization_id,name,email,source,status,campaign_id)
       VALUES ($1,$2,'Lead atribuído',$3,'linkedin','open',$4)`,
      [leadId, rig.ids.organizationA, `${leadId}@integration.test`, plan.body.campaignId],
    )
    expect((await rig.sql(`SELECT campaign_id FROM public.leads WHERE id=$1`, [leadId])).rows[0].campaign_id)
      .toBe(plan.body.campaignId)

    const crossOrganization = await rig.request(
      'client_admin_B', 'GET',
      `/api/marketing-studio/journey/summary?organizationId=${rig.ids.organizationB}&contractId=${rig.ids.contractA}`,
    )
    expect(crossOrganization.statusCode).toBe(404)
  } finally {
    if (connectionId) {
      await rig.sql(`DELETE FROM public.provider_integration_secrets WHERE connection_id=$1`, [connectionId])
      await rig.sql(`DELETE FROM public.publishing_connections WHERE id=$1`, [connectionId])
    }
    if (created) {
      await rig.sql(`DELETE FROM public.marketing_content_generation_runs WHERE content_item_id=$1`, [created.contentId])
      await rig.sql(`DELETE FROM public.content_reviews WHERE content_item_id=$1`, [created.contentId])
      await rig.sql(`DELETE FROM public.content_items WHERE id=$1`, [created.contentId])
      await rig.sql(`DELETE FROM public.campaigns WHERE id=$1`, [created.campaignId])
      await rig.sql(`DELETE FROM public.marketing_workflow_runs WHERE id=$1`, [created.workflowRunId])
      await rig.sql(`DELETE FROM public.marketing_workflows WHERE id=$1`, [created.workflowId])
    }
    await pool.end()
    await rig.close()
  }
})
