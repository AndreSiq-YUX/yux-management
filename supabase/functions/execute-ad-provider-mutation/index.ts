import { corsHeaders, getAdminClient, json, requireAuthenticatedUser } from '../_shared/edge.ts'
import {
  buildProviderMutationIdempotencyKey,
  executeProviderAdapter,
  rejectNeedsReauthConnection,
  sanitizeProviderError,
  sanitizeProviderMetadata,
} from '../_shared/adsProvider.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let runId: string | undefined
  try {
    const authorization = req.headers.get('Authorization')
    const { user } = await requireAuthenticatedUser(authorization)
    const admin = getAdminClient()
    await requireInternalUser(admin, user.id)

    const body = await req.json()
    const run = body.mutationRunId
      ? await loadMutationRun(admin, body.mutationRunId)
      : await createMutationRun(admin, body)
    runId = run.id

    if (run.status === 'succeeded') return json({ success: true, duplicate: true, run })

    const { data: connection, error: connectionError } = await admin
      .from('ad_provider_connections')
      .select('*')
      .eq('id', run.provider_connection_id)
      .single()
    if (connectionError) throw connectionError
    if (rejectNeedsReauthConnection(connection)) throw new Error('provider_connection_needs_reauth')

    await admin.from('ad_provider_mutation_runs').update({ status: 'running', protected_error: null }).eq('id', run.id)

    const response = await executeProviderAdapter({
      provider: run.provider,
      action: run.action,
      localMutationId: run.id,
      requestPayload: run.request_payload || {},
    })

    const { data: completedRun, error: updateRunError } = await admin
      .from('ad_provider_mutation_runs')
      .update({
        status: response.status,
        response_payload: response.payload,
        protected_error: response.protectedError || null,
      })
      .eq('id', run.id)
      .select('*')
      .single()
    if (updateRunError) throw updateRunError

    if (run.campaign_id && response.status === 'succeeded') {
      await updateCampaignAfterMutation(admin, run, response)
    }

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

async function loadMutationRun(admin: any, mutationRunId: string) {
  const { data, error } = await admin.from('ad_provider_mutation_runs').select('*').eq('id', mutationRunId).single()
  if (error) throw error
  return data
}

async function createMutationRun(admin: any, body: Record<string, unknown>) {
  const provider = requireString(body.provider, 'provider') as 'meta' | 'google'
  const action = requireString(body.action, 'action') as 'create_campaign' | 'update_budget' | 'pause_campaign' | 'sync_metrics'
  const organizationId = requireString(body.organizationId, 'organizationId')
  const localMutationId = optionalString(body.localMutationId) || crypto.randomUUID()
  const { data, error } = await admin.from('ad_provider_mutation_runs').insert({
    organization_id: organizationId,
    provider,
    action,
    campaign_id: optionalString(body.campaignId) || null,
    provider_connection_id: optionalString(body.providerConnectionId) || null,
    request_payload: sanitizeProviderMetadata(body.requestPayload || {}),
    idempotency_key: buildProviderMutationIdempotencyKey({ provider, action, localMutationId }),
  }).select('*').single()
  if (error) throw error
  return data
}

async function updateCampaignAfterMutation(admin: any, run: any, response: any) {
  const update: Record<string, unknown> = { protected_error: null }
  if (response.externalCampaignId) update.external_id = response.externalCampaignId
  if (run.action === 'create_campaign') update.lifecycle_status = 'active'
  if (run.action === 'pause_campaign') {
    update.lifecycle_status = 'paused'
    update.status = 'PAUSED'
  }
  if (run.action === 'sync_metrics') update.last_sync_at = new Date().toISOString()
  const { error } = await admin.from('campaigns').update(update).eq('id', run.campaign_id)
  if (error) throw error
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}
