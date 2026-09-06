import type pg from 'pg'
import { createHash, randomUUID } from 'node:crypto'
import { decodeProviderSecretEncryptionKey, loadProviderSecretFromPool } from '../../lib/edge-compat/providerSecrets.js'
import { executeProviderAdapter, type AdsProviderMutationAction, type AdsProviderKey } from '../../lib/edge-compat/adsProvider.js'
import { executeSocialPublishingAction } from '../../lib/edge-compat/socialPublishingProvider.js'

type JsonRecord = Record<string, unknown>

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

async function requireApprovedRequest(pool: Pick<pg.Pool, 'query'>, input: {
  approvalId: unknown
  organizationId: string
  intentId: string
  payloadHash: string
  campaignId: string
}) {
  const id = stringValue(input.approvalId, 'approvalId')
  const result = await pool.query(
    `SELECT approval.id FROM public.approval_requests approval
     JOIN public.projects project ON project.id=approval.project_id
     JOIN public.organizations organization ON organization.client_id=project.client_id
     WHERE approval.id=$1 AND approval.status='approved'
       AND approval.target_type='campaign_provider_mutation' AND approval.target_id=$2
       AND approval.provider_intent_id=$3 AND approval.provider_payload_hash=$4
       AND organization.id=$5
     LIMIT 1`,
    [id, input.campaignId, input.intentId, input.payloadHash, input.organizationId],
  )
  if (!result.rows[0]) throw new Error('approved_approval_required')
  return id
}

export async function handleProviderFunction(
  pool: Pick<pg.Pool, 'query'>,
  data: JsonRecord,
  options: { encryptionKey?: string; graphBaseUrl?: string; fetcher?: typeof fetch } = {},
) {
  const functionName = stringValue(data.functionName, 'functionName')
  const body = record(data.body)
  const organizationId = stringValue(data.organizationId, 'organizationId')

  if (functionName === 'execute-ad-provider-mutation') {
    const action = stringValue(body.action, 'action') as AdsProviderMutationAction
    const connectionId = stringValue(body.providerConnectionId, 'providerConnectionId')
    const campaignId = stringValue(body.campaignId, 'campaignId')
    const intentId = uuidValue(body.intentId, 'intentId')
    const payloadHash = providerIntentPayloadHash({ action, campaignId, connectionId, requestPayload: record(body.requestPayload) })
    if (typeof body.payloadHash === 'string' && body.payloadHash !== payloadHash) throw new Error('provider_intent_payload_hash_mismatch')
    const approvalRequired = action === 'create_campaign' || action === 'activate_campaign' || action === 'update_budget'
    const approvalId = approvalRequired
      ? await requireApprovedRequest(pool, { approvalId: body.approvalId, organizationId, intentId, payloadHash, campaignId })
      : null
    const connectionResult = await pool.query<{
      id: string; organization_id: string; provider: AdsProviderKey; provider_account_id: string | null; token_reference: string | null; status: string
    }>(
      `SELECT connection.id, connection.organization_id, connection.provider,
              connection.provider_account_id, connection.token_reference, connection.status
       FROM public.ad_provider_connections connection
       JOIN public.campaigns campaign
         ON campaign.id=$2 AND campaign.organization_id=connection.organization_id
        AND campaign.provider_connection_id=connection.id
       WHERE connection.id=$1 AND connection.organization_id=$3
       LIMIT 1`,
      [connectionId, campaignId, organizationId],
    )
    const connection = connectionResult.rows[0]
    if (!connection) throw new Error('provider_connection_not_found')
    if (connection.status !== 'connected') throw new Error('provider_connection_not_ready')
    if (!connection.token_reference) throw new Error('provider_access_token_not_configured')

    const existing = await pool.query<{ id: string; status: string; payload_hash: string; approval_id: string | null }>(
      `SELECT id, status, payload_hash, approval_id FROM public.ad_provider_mutation_runs
       WHERE organization_id=$1 AND intent_id=$2 AND action=$3 LIMIT 1`,
      [organizationId, intentId, action],
    )
    if (existing.rows[0] && (existing.rows[0].payload_hash !== payloadHash || existing.rows[0].approval_id !== approvalId)) {
      throw new Error('provider_intent_identity_conflict')
    }
    if (existing.rows[0]?.status === 'succeeded') return { duplicate: true, runId: existing.rows[0].id }
    if (existing.rows[0]?.status === 'unknown' || existing.rows[0]?.status === 'manual_review') {
      if (existing.rows[0].status === 'unknown') {
        await pool.query(`UPDATE public.ad_provider_mutation_runs SET status='manual_review',updated_at=NOW() WHERE id=$1 AND status='unknown'`, [existing.rows[0].id])
      }
      return { duplicate: true, runId: existing.rows[0].id, status: 'manual_review', reconciliationRequired: true }
    }

    const run = await pool.query<{ id: string }>(
      `INSERT INTO public.ad_provider_mutation_runs (
         organization_id, provider_connection_id, campaign_id, provider, action, status,
         idempotency_key, request_payload, request_hash, payload_hash, requested_by, approved_by,
         intent_id, approval_id, approval_source
       ) VALUES ($1,$2,$3,$4,$5,'running',$6,$7::jsonb,$8,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (organization_id,intent_id,action) DO UPDATE SET status = 'running', updated_at = NOW()
       RETURNING id`,
      [
        organizationId, connection.id, campaignId, connection.provider, action,
        `${connection.provider}:${action}:${intentId}`, JSON.stringify(body.requestPayload || {}), payloadHash,
        typeof data.requestedBy === 'string' ? data.requestedBy : null,
        typeof data.requestedBy === 'string' ? data.requestedBy : null,
        intentId, approvalId, approvalId ? 'workspace' : 'operator_confirmation',
      ],
    )
    if (approvalId) await requireApprovedRequest(pool, { approvalId, organizationId, intentId, payloadHash, campaignId })
    const secret = await loadProviderSecretFromPool(
      pool,
      connection.token_reference,
      options.encryptionKey ? decodeProviderSecretEncryptionKey(options.encryptionKey) : undefined,
    )
    if (secret.expired) throw new Error('provider_access_token_expired')
    const requestPayload = {
      ...record(body.requestPayload),
      accessToken: secret.value,
      providerAccountId: connection.provider_account_id || undefined,
      campaignId,
      intentId,
      graphBaseUrl: options.graphBaseUrl,
    }
    const response = await executeProviderAdapter({
      provider: connection.provider,
      action,
      localMutationId: intentId,
      requestPayload,
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    })
    const unknown = /timeout|timed out|abort|network|fetch failed|socket|response lost/i.test(response.protectedError ?? '')
    await pool.query(
      `UPDATE public.ad_provider_mutation_runs
       SET status = $2, response_payload = $3::jsonb, protected_error = $4, completed_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [run.rows[0]?.id, response.status === 'succeeded' ? 'succeeded' : unknown ? 'unknown' : 'failed', JSON.stringify(response.payload), response.protectedError || null],
    )
    if (response.status !== 'succeeded') throw new Error(unknown ? 'provider_outcome_unknown' : response.protectedError || 'provider_mutation_failed')
    return { runId: run.rows[0]?.id, response }
  }

  if (functionName === 'execute-wordpress-publishing' || functionName === 'execute-marketing-publishing') {
    const publishingRunId = stringValue(body.publishingRunId, 'publishingRunId')
    const result = await pool.query<{
      id: string; organization_id: string; status: string; action: string; content_item_id: string
      approved_content_version_id: string | null; approved_version_valid: boolean
      token_reference: string | null; provider: string; connection_status: string
      connection: JsonRecord; content: JsonRecord; run: JsonRecord
    }>(
      `SELECT r.id, r.organization_id, r.status, r.action, r.content_item_id,
              r.approved_content_version_id,
              EXISTS (
                SELECT 1 FROM public.content_reviews review
                WHERE review.content_item_id=r.content_item_id
                  AND review.content_version_id=r.approved_content_version_id
                  AND review.status='approved'
              ) AS approved_version_valid,
              pc.token_reference, pc.provider,pc.status AS connection_status,
              to_jsonb(pc) AS connection,
              to_jsonb(ci) || jsonb_build_object(
                'title',COALESCE(cv.title,ci.title),'body',COALESCE(cv.body,ci.body),
                'approved_content_version_id',cv.id,'approved_version_number',cv.version_number
              ) AS content,
              to_jsonb(r) AS run
       FROM public.publishing_runs r
       JOIN public.publishing_connections pc ON pc.id = r.connection_id
       JOIN public.content_items ci ON ci.id = r.content_item_id
       LEFT JOIN public.content_versions cv ON cv.id=r.approved_content_version_id AND cv.content_item_id=ci.id
       WHERE r.id = $1 LIMIT 1`,
      [publishingRunId],
    )
    const publishing = result.rows[0]
    if (!publishing || publishing.organization_id !== organizationId) throw new Error('publishing_run_not_found')
    if (publishing.status === 'succeeded') return { duplicate: true, runId: publishing.id }
    await pool.query(`UPDATE public.publishing_runs SET status = 'running', started_at = NOW(), updated_at = NOW() WHERE id = $1`, [publishing.id])
    try {
      if (publishing.connection_status !== 'connected') throw new Error('publishing_connection_not_ready')
      if (publishing.action === 'publish' && (!publishing.approved_content_version_id || !publishing.approved_version_valid)) {
        throw new Error('publishing_approved_content_version_required')
      }
      if (!publishing.token_reference) throw new Error('publishing_access_token_not_configured')
      const secret = await loadProviderSecretFromPool(
        pool,
        publishing.token_reference,
        options.encryptionKey ? decodeProviderSecretEncryptionKey(options.encryptionKey) : undefined,
      )
      if (secret.expired) throw new Error('publishing_access_token_expired')
      const response = await executeSocialPublishingAction({
        connection: publishing.connection,
        content: publishing.content,
        run: publishing.run,
        accessToken: secret.value,
        graphBaseUrl: options.graphBaseUrl,
        ...(options.fetcher ? { fetcher: options.fetcher } : {}),
      })
      await pool.query(
        `UPDATE public.publishing_runs
         SET status = 'succeeded', provider_post_id = $2, published_url = $3, response_payload = $4::jsonb,
             protected_error=NULL,completed_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [publishing.id, response.providerPostId, response.publishedUrl, JSON.stringify(response.responsePayload)],
      )
      if (publishing.action === 'publish') {
        await pool.query(
          `UPDATE public.content_items
           SET status='published',published_at=NOW(),published_url=$2,updated_at=NOW()
           WHERE id=$1 AND organization_id=$3`,
          [publishing.content_item_id, response.publishedUrl, organizationId],
        )
        await pool.query(
          `UPDATE public.editorial_calendar_items
           SET status='published',updated_at=NOW()
           WHERE content_item_id=$1 AND organization_id=$2 AND status IN ('ready','scheduled')`,
          [publishing.content_item_id, organizationId],
        )
      }
      return { runId: publishing.id, response }
    } catch (error) {
      await pool.query(
        `UPDATE public.publishing_runs
         SET status='failed',protected_error=$2,completed_at=NOW(),updated_at=NOW()
         WHERE id=$1`,
        [publishing.id, safeProviderError(error)],
      ).catch(() => undefined)
      throw error
    }
  }

  throw new Error(`unhandled_provider_function:${functionName}`)
}

export async function handleProviderMetricsSync(
  pool: pg.Pool,
  data: JsonRecord,
  options: { encryptionKey?: string; graphBaseUrl?: string; fetcher?: typeof fetch } = {},
) {
  const organizationId = stringValue(data.organizationId, 'organizationId')
  const body = record(data.body)
  const campaignId = stringValue(body.campaignId, 'campaignId')
  const sourceTimestamp = typeof body.sourceTimestamp === 'string' && !Number.isNaN(Date.parse(body.sourceTimestamp))
    ? new Date(body.sourceTimestamp).toISOString()
    : new Date().toISOString()
  const campaignResult = await pool.query<{
    id: string
    external_id: string | null
    provider_connection_id: string | null
    provider: AdsProviderKey
    attributed_revenue: string
    connection_status: string | null
    token_reference: string | null
    provider_account_id: string | null
  }>(
    `SELECT campaign.id, campaign.external_id, campaign.provider_connection_id, campaign.provider,
            campaign.attributed_revenue::text, connection.status AS connection_status,
            connection.token_reference, connection.provider_account_id
       FROM public.campaigns campaign
       LEFT JOIN public.ad_provider_connections connection
         ON connection.id = campaign.provider_connection_id
        AND connection.organization_id = campaign.organization_id
      WHERE campaign.id = $1 AND campaign.organization_id = $2
      LIMIT 1`,
    [campaignId, organizationId],
  )
  const campaign = campaignResult.rows[0]
  if (!campaign) throw new Error('campaign_not_found')
  if (!campaign.provider_connection_id || campaign.connection_status !== 'connected' || !campaign.token_reference) {
    throw new Error('capability_unavailable:ad_provider_connection_required')
  }
  if (!campaign.external_id) throw new Error('capability_unavailable:provider_campaign_reference_required')

  const idempotencyKey = `${campaign.provider}:sync_metrics:${campaignId}:${sourceTimestamp}`
  const intentId = randomUUID()
  const payloadHash = providerIntentPayloadHash({
    action: 'sync_metrics',
    campaignId,
    connectionId: campaign.provider_connection_id,
    requestPayload: { sourceTimestamp },
  })
  const existing = await pool.query<{ id: string; status: string }>(
    `SELECT id, status FROM public.ad_provider_mutation_runs WHERE idempotency_key = $1 LIMIT 1`,
    [idempotencyKey],
  )
  if (existing.rows[0]?.status === 'succeeded') return { duplicate: true, runId: existing.rows[0].id }
  const run = await pool.query<{ id: string; intent_id: string }>(
    `INSERT INTO public.ad_provider_mutation_runs (
       organization_id, provider_connection_id, campaign_id, provider, action, status,
       idempotency_key, request_payload, request_hash, payload_hash, requested_by,
       intent_id, approval_source
     ) VALUES ($1,$2,$3,$4,'sync_metrics','running',$5,$6::jsonb,$7,$7,$8,$9,'operator_confirmation')
     ON CONFLICT (idempotency_key) DO UPDATE SET status='running', protected_error=NULL, updated_at=NOW()
     RETURNING id, intent_id`,
    [organizationId, campaign.provider_connection_id, campaignId, campaign.provider, idempotencyKey,
      JSON.stringify({ campaignId, sourceTimestamp }), payloadHash,
      typeof data.requestedBy === 'string' ? data.requestedBy : null, intentId],
  )
  const runId = stringValue(run.rows[0]?.id, 'provider metrics run')
  const persistedIntentId = stringValue(run.rows[0]?.intent_id, 'provider metrics intent')
  try {
    const rawKey = options.encryptionKey ? decodeProviderSecretEncryptionKey(options.encryptionKey) : undefined
    const secret = await loadProviderSecretFromPool(pool, campaign.token_reference, rawKey)
    if (secret.expired) throw new Error('provider_access_token_expired')
    const response = await executeProviderAdapter({
      provider: campaign.provider,
      action: 'sync_metrics',
      localMutationId: persistedIntentId,
      requestPayload: {
        accessToken: secret.value,
        providerAccountId: campaign.provider_account_id ?? undefined,
        campaignId: campaign.external_id,
        externalCampaignId: campaign.external_id,
        campaignResourceName: campaign.external_id,
        graphBaseUrl: options.graphBaseUrl,
        intentId: persistedIntentId,
      },
      ...(options.fetcher ? { fetcher: options.fetcher } : {}),
    })
    if (response.status !== 'succeeded') throw new Error(response.protectedError || 'provider_metrics_sync_failed')
    const metrics = response.payload
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const snapshot = await client.query<{ id: string }>(
        `INSERT INTO public.campaign_metric_snapshots (
           campaign_id, snapshot_at, source_timestamp, spend, impressions, clicks, leads,
           attributed_revenue, raw_metrics
         ) VALUES ($1,NOW(),$2,$3,$4,$5,$6,$7,$8::jsonb)
         RETURNING id`,
        [campaignId, sourceTimestamp, finiteNumber(metrics.spend), integer(metrics.impressions), integer(metrics.clicks),
          integer(metrics.leads), finiteNumber(campaign.attributed_revenue), JSON.stringify(metrics)],
      )
      await client.query(
        `UPDATE public.campaigns
            SET spent=$3, impressions=$4, clicks=$5, leads=$6,
                cpl=CASE WHEN $6::int > 0 THEN $3::numeric / $6::int ELSE cpl END,
                metrics=$7::jsonb, last_sync_at=NOW(), updated_at=NOW()
          WHERE id=$1 AND organization_id=$2`,
        [campaignId, organizationId, finiteNumber(metrics.spend), integer(metrics.impressions), integer(metrics.clicks), integer(metrics.leads), JSON.stringify(metrics)],
      )
      await client.query(
        `UPDATE public.ad_provider_connections SET last_sync_at=NOW(), protected_error=NULL, updated_at=NOW() WHERE id=$1 AND organization_id=$2`,
        [campaign.provider_connection_id, organizationId],
      )
      await client.query(
        `UPDATE public.ad_provider_mutation_runs
            SET status='succeeded', response_payload=$2::jsonb, completed_at=NOW(), updated_at=NOW()
          WHERE id=$1`,
        [runId, JSON.stringify({ ...metrics, sourceTimestamp, snapshotId: snapshot.rows[0]?.id })],
      )
      await client.query('COMMIT')
      return { runId, snapshotId: snapshot.rows[0]?.id, sourceTimestamp, metrics }
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  } catch (error) {
    await pool.query(
      `UPDATE public.ad_provider_mutation_runs SET status='failed', protected_error=$2, updated_at=NOW() WHERE id=$1`,
      [runId, safeProviderError(error)],
    ).catch(() => undefined)
    throw error
  }
}

export async function handleOmnichannelSchedulingFallback(pool: Pick<pg.Pool, 'query'>, data: JsonRecord) {
  const schedulingRequestId = typeof data.schedulingRequestId === 'string' ? data.schedulingRequestId : null
  const conversationId = typeof data.conversationId === 'string' ? data.conversationId : null
  const organizationId = typeof data.organizationId === 'string' ? data.organizationId : null
  const result = await pool.query<{ id: string }>(
    `UPDATE public.scheduling_requests request
        SET status='pending',
            n8n_metadata=n8n_metadata || jsonb_build_object(
              'capabilityStatus','capability_unavailable',
              'fulfillment','human_task',
              'automaticConfirmation',false
            ),
            updated_at=NOW()
      WHERE ($1::uuid IS NOT NULL AND request.id=$1)
         OR ($1::uuid IS NULL AND $2::uuid IS NOT NULL AND request.conversation_id=$2
             AND ($3::uuid IS NULL OR request.organization_id=$3) AND request.status='pending')
      RETURNING id`,
    [schedulingRequestId, conversationId, organizationId],
  )
  if (!result.rows[0]) throw new Error('scheduling_request_not_found')
  return { requestId: result.rows[0].id, capabilityStatus: 'capability_unavailable', fulfillment: 'human_task' }
}

export async function handleSandboxChannelSimulation(pool: Pick<pg.Pool, 'query'>, data: JsonRecord) {
  const organizationId = stringValue(data.organizationId, 'organizationId')
  const requestedBy = stringValue(data.requestedBy, 'requestedBy')
  const body = record(data.body)
  if (stringValue(body.organizationId, 'body.organizationId') !== organizationId) throw new Error('simulation_organization_mismatch')
  const allowed = await pool.query<{ allowed: boolean }>(
    `SELECT organization.kind='yux' OR EXISTS (
       SELECT 1 FROM public.contracts contract
       JOIN public.contract_modules module ON module.contract_id=contract.id
       WHERE contract.client_id=organization.client_id AND contract.status='active'
         AND module.module_key='mission_sandbox' AND module.enabled=TRUE
     ) AS allowed
     FROM public.organizations organization WHERE organization.id=$1`,
    [organizationId],
  )
  if (allowed.rows[0]?.allowed !== true) throw new Error('capability_unavailable:sandbox_required')
  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO public.omnichannel_simulation_events (
       organization_id, requested_by, channel, event_type, payload, status
     ) VALUES ($1,$2,$3,$4,$5::jsonb,'completed') RETURNING id`,
    [organizationId, requestedBy, stringValue(body.channel, 'channel'), stringValue(body.eventType, 'eventType'),
      JSON.stringify({ ...record(body.payload), simulation: true })],
  )
  return { simulationId: inserted.rows[0]?.id, persisted: true, realConversationCreated: false }
}

function finiteNumber(value: unknown) {
  const parsed = Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

function integer(value: unknown) {
  return Math.max(0, Math.trunc(finiteNumber(value)))
}

function safeProviderError(error: unknown) {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1_000)
    .replace(/Bearer\s+[^\s]+/gi, 'Bearer [redacted]')
}

function uuidValue(value: unknown, label: string) {
  const text = stringValue(value, label)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) throw new Error(`${label} must be a UUID`)
  return text.toLowerCase()
}

export function providerIntentPayloadHash(input: {
  action: string
  campaignId: string
  connectionId: string
  requestPayload: Record<string, unknown>
}) {
  return createHash('sha256').update(stableSerialize(input)).digest('hex')
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => `${JSON.stringify(key)}:${stableSerialize(entry)}`).join(',')}}`
  }
  return JSON.stringify(value)
}
