import type pg from 'pg'
import { executeProviderAdapter, type AdsProviderMutationAction, type AdsProviderKey } from '../../lib/edge-compat/adsProvider.js'
import { loadProviderSecretFromPool } from '../../lib/edge-compat/providerSecrets.js'
import { executeSocialPublishingAction } from '../../lib/edge-compat/socialPublishingProvider.js'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

async function requireApprovedRequest(pool: Pick<pg.Pool, 'query'>, approvalId: unknown) {
  const id = stringValue(approvalId, 'approvalId')
  const result = await pool.query('SELECT id FROM public.approval_requests WHERE id = $1 AND status = $2 LIMIT 1', [id, 'approved'])
  if (!result.rows[0]) throw new Error('approved_approval_required')
  return id
}

export async function handleProviderFunction(pool: Pick<pg.Pool, 'query'>, data: JsonRecord) {
  const functionName = stringValue(data.functionName, 'functionName')
  const body = record(data.body)
  const organizationId = stringValue(data.organizationId, 'organizationId')

  if (functionName === 'execute-ad-provider-mutation') {
    const action = stringValue(body.action, 'action') as AdsProviderMutationAction
    if (action === 'create_campaign' || action === 'activate_campaign' || action === 'update_budget') await requireApprovedRequest(pool, body.approvalId)

    const connectionId = stringValue(body.providerConnectionId, 'providerConnectionId')
    const campaignId = stringValue(body.campaignId, 'campaignId')
    const connectionResult = await pool.query<{
      id: string; organization_id: string; provider: AdsProviderKey; provider_account_id: string | null; token_reference: string | null
    }>(
      `SELECT id, organization_id, provider, provider_account_id, token_reference
       FROM public.ad_provider_connections WHERE id = $1 LIMIT 1`,
      [connectionId],
    )
    const connection = connectionResult.rows[0]
    if (!connection || connection.organization_id !== organizationId) throw new Error('provider_connection_not_found')
    if (!connection.token_reference) throw new Error('provider_access_token_not_configured')

    const existing = await pool.query<{ id: string; status: string }>(
      `SELECT id, status FROM public.ad_provider_mutation_runs
       WHERE idempotency_key = $1 LIMIT 1`,
      [`${connection.provider}:${action}:${campaignId}`],
    )
    if (existing.rows[0]?.status === 'succeeded') return { duplicate: true, runId: existing.rows[0].id }

    const run = await pool.query<{ id: string }>(
      `INSERT INTO public.ad_provider_mutation_runs (
         organization_id, provider_connection_id, campaign_id, provider, action, status,
         idempotency_key, request_payload, requested_by, approved_by
       ) VALUES ($1,$2,$3,$4,$5,'running',$6,$7::jsonb,$8,$9)
       ON CONFLICT (idempotency_key) DO UPDATE SET status = 'running', updated_at = NOW()
       RETURNING id`,
      [
        organizationId, connection.id, campaignId, connection.provider, action,
        `${connection.provider}:${action}:${campaignId}`, JSON.stringify(body.requestPayload || {}),
        typeof data.requestedBy === 'string' ? data.requestedBy : null,
        typeof body.approvalId === 'string' ? body.approvalId : null,
      ],
    )
    const secret = await loadProviderSecretFromPool(pool, connection.token_reference)
    if (secret.expired) throw new Error('provider_access_token_expired')
    const requestPayload = {
      ...record(body.requestPayload),
      accessToken: secret.value,
      providerAccountId: connection.provider_account_id || undefined,
      campaignId,
    }
    const response = await executeProviderAdapter({
      provider: connection.provider,
      action,
      localMutationId: run.rows[0]?.id || campaignId,
      requestPayload,
    })
    await pool.query(
      `UPDATE public.ad_provider_mutation_runs
       SET status = $2, response_payload = $3::jsonb, protected_error = $4, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [run.rows[0]?.id, response.status, JSON.stringify(response.payload), response.protectedError || null],
    )
    if (response.status !== 'succeeded') throw new Error(response.protectedError || 'provider_mutation_failed')
    return { runId: run.rows[0]?.id, response }
  }

  if (functionName === 'execute-wordpress-publishing' || functionName === 'execute-marketing-publishing') {
    const publishingRunId = stringValue(body.publishingRunId, 'publishingRunId')
    const result = await pool.query<{
      id: string; organization_id: string; status: string; token_reference: string | null; provider: string
      connection: JsonRecord; content: JsonRecord; run: JsonRecord
    }>(
      `SELECT r.id, r.organization_id, r.status, pc.token_reference, pc.provider,
              to_jsonb(pc) AS connection, to_jsonb(ci) AS content, to_jsonb(r) AS run
       FROM public.publishing_runs r
       JOIN public.publishing_connections pc ON pc.id = r.connection_id
       JOIN public.content_items ci ON ci.id = r.content_item_id
       WHERE r.id = $1 LIMIT 1`,
      [publishingRunId],
    )
    const publishing = result.rows[0]
    if (!publishing || publishing.organization_id !== organizationId) throw new Error('publishing_run_not_found')
    if (publishing.status === 'succeeded') return { duplicate: true, runId: publishing.id }
    if (!publishing.token_reference) throw new Error('publishing_access_token_not_configured')
    await pool.query(`UPDATE public.publishing_runs SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = $1`, [publishing.id])
    const secret = await loadProviderSecretFromPool(pool, publishing.token_reference)
    const response = await executeSocialPublishingAction({ connection: publishing.connection, content: publishing.content, run: publishing.run, accessToken: secret.value })
    await pool.query(
      `UPDATE public.publishing_runs
       SET status = 'succeeded', provider_post_id = $2, published_url = $3, response_payload = $4::jsonb,
           completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [publishing.id, response.providerPostId, response.publishedUrl, JSON.stringify(response.responsePayload)],
    )
    return { runId: publishing.id, response }
  }

  throw new Error(`unhandled_provider_function:${functionName}`)
}
