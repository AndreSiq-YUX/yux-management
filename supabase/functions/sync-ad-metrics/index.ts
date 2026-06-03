import { corsHeaders, getAdminClient, json, requireAuthenticatedUser } from '../_shared/edge.ts'
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
      requestPayload: { campaignId, externalId: campaign.external_id },
    })

    await admin.from('campaign_metric_snapshots').insert({
      campaign_id: campaign.id,
      spend: campaign.spend || 0,
      impressions: campaign.impressions || 0,
      clicks: campaign.clicks || 0,
      leads: campaign.leads || campaign.conversions || 0,
      attributed_revenue: campaign.attributed_revenue || 0,
      raw_metrics: response.payload,
    })

    const { data: completedRun, error: completedRunError } = await admin
      .from('ad_provider_mutation_runs')
      .update({
        status: response.status,
        response_payload: response.payload,
        protected_error: response.protectedError || null,
      })
      .eq('id', run.id)
      .select('*')
      .single()
    if (completedRunError) throw completedRunError

    await admin.from('campaigns').update({ last_sync_at: new Date().toISOString() }).eq('id', campaign.id)
    return json({ success: response.status === 'succeeded', run: completedRun })
  } catch (error) {
    const protectedError = sanitizeProviderError(error)
    if (runId) {
      try {
        const admin = getAdminClient()
        await admin.from('ad_provider_mutation_runs').update({ status: 'failed', protected_error: protectedError }).eq('id', runId)
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
