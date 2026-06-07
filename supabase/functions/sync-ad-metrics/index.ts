import { corsHeaders, getAdminClient, json, requireAuthenticatedUser } from '../_shared/edge.ts'
import { loadProviderSecret } from '../_shared/providerSecrets.ts'
import {
  buildProviderMutationIdempotencyKey,
  executeProviderAdapter,
  rejectNeedsReauthConnection,
  sanitizeProviderError,
} from '../_shared/adsProvider.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let runId: string | undefined
  try {
    const authorization = req.headers.get('Authorization')
    const { user } = await requireAuthenticatedUser(authorization)
    const admin = getAdminClient()
    await requireInternalUser(admin, user.id)

    const { campaignId } = await req.json()
    if (!campaignId) return json({ error: 'campaignId is required' }, 400)

    const { data: campaign, error: campaignError } = await admin
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()
    if (campaignError) throw campaignError

    const { data: connection, error: connectionError } = await admin
      .from('ad_provider_connections')
      .select('*')
      .eq('id', campaign.provider_connection_id)
      .single()
    if (connectionError) throw connectionError
    if (rejectNeedsReauthConnection(connection)) throw new Error('provider_connection_needs_reauth')
    const accessToken = await loadProviderAccessToken(admin, connection)

    const localMutationId = crypto.randomUUID()
    const { data: run, error: runError } = await admin.from('ad_provider_mutation_runs').insert({
      organization_id: campaign.organization_id,
      provider_connection_id: campaign.provider_connection_id,
      campaign_id: campaign.id,
      provider: campaign.provider,
      action: 'sync_metrics',
      status: 'running',
      idempotency_key: buildProviderMutationIdempotencyKey({
        provider: campaign.provider,
        action: 'sync_metrics',
        localMutationId,
      }),
      request_payload: { campaignId },
    }).select('*').single()
    if (runError) throw runError
    runId = run.id

    const response = await executeProviderAdapter({
      provider: campaign.provider,
      action: 'sync_metrics',
      localMutationId: run.id,
      requestPayload: {
        accessToken,
        providerAccountId: connection.provider_account_id,
        customerId: connection.provider === 'google' ? connection.provider_account_id : undefined,
        campaignId,
        externalId: campaign.external_id,
        externalCampaignId: campaign.external_id,
      },
    })
    const metrics = normalizeMetrics(response.payload)

    await admin.from('campaign_metric_snapshots').insert({
      campaign_id: campaign.id,
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      leads: metrics.leads,
      attributed_revenue: campaign.attributed_revenue || 0,
      raw_metrics: response.payload,
    })

    const { data: completedRun, error: completedRunError } = await admin
      .from('ad_provider_mutation_runs')
      .update({
        status: response.status,
        response_payload: response.payload,
        protected_error: response.protectedError || null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id)
      .select('*')
      .single()
    if (completedRunError) throw completedRunError

    const cpl = metrics.leads > 0 ? metrics.spend / metrics.leads : 0
    const mroi = metrics.spend > 0 ? (Number(campaign.attributed_revenue || 0) - metrics.spend) / metrics.spend : 0
    await admin.from('campaigns').update({
      spend: metrics.spend,
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      leads: metrics.leads,
      conversions: metrics.leads,
      cpl,
      mroi,
      last_sync_at: new Date().toISOString(),
    }).eq('id', campaign.id)
    return json({ success: response.status === 'succeeded', run: completedRun })
  } catch (error) {
    const protectedError = sanitizeProviderError(error)
    if (runId) {
      try {
        const admin = getAdminClient()
        await admin.from('ad_provider_mutation_runs').update({ status: 'failed', protected_error: protectedError, completed_at: new Date().toISOString() }).eq('id', runId)
      } catch {
        // Preserve original error response.
      }
    }
    return json({ error: protectedError }, 500)
  }
})

async function requireInternalUser(admin: any, userId: string) {
  const { data, error } = await admin.from('memberships').select('roles(scope)').eq('user_id', userId)
  if (error) throw error
  if (!data?.some((membership: any) => membership.roles?.scope === 'internal')) throw new Error('Internal permission required')
}

async function loadProviderAccessToken(admin: any, connection: any) {
  if (!connection.token_reference) throw new Error('provider_token_reference_required')
  const secret = await loadProviderSecret(admin, connection.token_reference)
  if (secret.expired) throw new Error('provider_token_expired')
  return secret.value
}

function normalizeMetrics(payload: Record<string, unknown>) {
  return {
    spend: Number(payload.spend || 0),
    impressions: Number(payload.impressions || 0),
    clicks: Number(payload.clicks || 0),
    leads: Number(payload.leads || 0),
  }
}
