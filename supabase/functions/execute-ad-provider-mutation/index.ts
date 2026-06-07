import { corsHeaders, getAdminClient, json, requireAuthenticatedUser } from '../_shared/edge.ts'
import { loadProviderSecret } from '../_shared/providerSecrets.ts'
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

    const [{ data: connection, error: connectionError }, campaignContext] = await Promise.all([
      admin
      .from('ad_provider_connections')
      .select('*')
      .eq('id', run.provider_connection_id)
        .single(),
      run.campaign_id ? loadCampaignContext(admin, run.campaign_id) : Promise.resolve(null),
    ])
    if (connectionError) throw connectionError
    if (rejectNeedsReauthConnection(connection)) throw new Error('provider_connection_needs_reauth')
    enforceProviderMutationApproval(run, campaignContext?.campaign, Boolean(body.explicitApproval || run.request_payload?.explicitApproval))

    await admin.from('ad_provider_mutation_runs').update({ status: 'running', protected_error: null, started_at: new Date().toISOString() }).eq('id', run.id)

    const accessToken = await loadProviderAccessToken(admin, connection)
    const response = await executeProviderAdapter({
      provider: run.provider,
      action: run.action,
      localMutationId: run.id,
      requestPayload: buildAdapterRequestPayload(connection, campaignContext, run, body, accessToken),
    })

    const completedAt = new Date().toISOString()
    const { data: completedRun, error: updateRunError } = await admin
      .from('ad_provider_mutation_runs')
      .update({
        status: response.status,
        response_payload: response.payload,
        protected_error: response.protectedError || null,
        external_campaign_id: response.externalCampaignId || null,
        external_ad_set_id: response.externalAdSetId || null,
        external_ad_id: response.externalAdId || null,
        completed_at: completedAt,
      })
      .eq('id', run.id)
      .select('*')
      .single()
    if (updateRunError) throw updateRunError

    if (run.campaign_id && response.status === 'succeeded') {
      await updateCampaignAfterMutation(admin, run, response, Boolean(body.activateProvider || body.activate))
      await updateCampaignChildrenAfterMutation(admin, run.campaign_id, response)
    }

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

async function loadMutationRun(admin: any, mutationRunId: string) {
  const { data, error } = await admin.from('ad_provider_mutation_runs').select('*').eq('id', mutationRunId).single()
  if (error) throw error
  return data
}

async function loadCampaignContext(admin: any, campaignId: string) {
  const [
    { data: campaign, error: campaignError },
    { data: creatives, error: creativesError },
    { data: adSets, error: adSetsError },
    { data: ads, error: adsError },
  ] = await Promise.all([
    admin.from('campaigns').select('*').eq('id', campaignId).single(),
    admin.from('campaign_creatives').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true }),
    admin.from('campaign_ad_sets').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true }),
    admin.from('campaign_ads').select('*').eq('campaign_id', campaignId).order('created_at', { ascending: true }),
  ])
  if (campaignError) throw campaignError
  if (creativesError) throw creativesError
  if (adSetsError) throw adSetsError
  if (adsError) throw adsError
  const adAccount = campaign.ad_account_id
    ? await loadAdAccount(admin, campaign.ad_account_id)
    : null
  return { campaign, creatives: creatives || [], adSets: adSets || [], ads: ads || [], adAccount }
}

async function loadAdAccount(admin: any, adAccountId: string) {
  const { data, error } = await admin.from('ad_accounts').select('*').eq('id', adAccountId).single()
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
    requested_by: optionalString(body.requestedBy) || null,
    approved_by: body.explicitApproval ? optionalString(body.approvedBy) || optionalString(body.requestedBy) || null : null,
    idempotency_key: buildProviderMutationIdempotencyKey({ provider, action, localMutationId }),
  }).select('*').single()
  if (error) throw error
  return data
}

function enforceProviderMutationApproval(run: any, campaign: any, explicitApproval: boolean) {
  if (!['create_campaign', 'update_budget'].includes(run.action)) return
  if (!campaign) throw new Error('campaign_required_for_provider_mutation')
  if (campaign.lifecycle_status !== 'approved') throw new Error('campaign_must_be_approved_before_provider_mutation')
  if (!explicitApproval) throw new Error('provider_mutation_requires_explicit_approval')
}

async function loadProviderAccessToken(admin: any, connection: any) {
  if (!connection.token_reference) throw new Error('provider_token_reference_required')
  const secret = await loadProviderSecret(admin, connection.token_reference)
  if (secret.expired) throw new Error('provider_token_expired')
  return secret.value
}

function buildAdapterRequestPayload(connection: any, context: any, run: any, body: Record<string, unknown>, accessToken: string) {
  const requestPayload = safeObject(run.request_payload)
  const campaign = context?.campaign
  const creative = context?.creatives?.[0] || {}
  const adSet = context?.adSets?.[0] || {}
  const ad = context?.ads?.[0] || {}
  const adAccount = context?.adAccount
  const providerAccountId = connection.provider_account_id || adAccount?.external_account_id || requestPayload.providerAccountId
  const landingPageUrl = requestPayload.landingPageUrl || requestPayload.finalUrl || requestPayload.landing_page_url

  return {
    ...requestPayload,
    accessToken,
    providerAccountId,
    adAccountId: providerAccountId,
    customerId: connection.provider === 'google' ? providerAccountId : undefined,
    campaignId: requestPayload.campaignId || campaign?.external_id,
    externalCampaignId: requestPayload.externalCampaignId || campaign?.external_id,
    externalAdSetId: requestPayload.externalAdSetId || adSet.external_id,
    externalAdId: requestPayload.externalAdId || ad.external_id,
    budgetResourceName: requestPayload.budgetResourceName || requestPayload.campaignBudgetResourceName,
    nextDaily: requestPayload.nextDaily,
    campaign: campaign ? {
      name: campaign.name,
      objective: campaign.objective,
      dailyBudget: Number(campaign.daily_budget || 0),
      dailyBudgetMicros: Math.round(Number(campaign.daily_budget || 0) * 1_000_000),
      landingPageUrl,
      headline: requestPayload.headline || creative.headline || campaign.name,
      body: requestPayload.body || creative.body || campaign.name,
      pageId: requestPayload.pageId,
    } : requestPayload.campaign,
    activateProvider: Boolean(body.activateProvider || body.activate),
  }
}

async function updateCampaignAfterMutation(admin: any, run: any, response: any, activateProvider: boolean) {
  const update: Record<string, unknown> = { protected_error: null }
  if (response.externalCampaignId) update.external_id = response.externalCampaignId
  if (run.action === 'create_campaign') {
    update.lifecycle_status = activateProvider ? 'active' : 'paused'
    update.status = activateProvider ? 'ACTIVE' : 'PAUSED'
  }
  if (run.action === 'pause_campaign') {
    update.lifecycle_status = 'paused'
    update.status = 'PAUSED'
  }
  if (run.action === 'sync_metrics') update.last_sync_at = new Date().toISOString()
  const { error } = await admin.from('campaigns').update(update).eq('id', run.campaign_id)
  if (error) throw error
}

async function updateCampaignChildrenAfterMutation(admin: any, campaignId: string, response: any) {
  await Promise.all([
    response.externalAdSetId
      ? admin.from('campaign_ad_sets').update({ external_id: response.externalAdSetId, status: 'paused' }).eq('campaign_id', campaignId).is('external_id', null)
      : Promise.resolve(),
    response.externalAdId
      ? admin.from('campaign_ads').update({ external_id: response.externalAdId, status: 'paused' }).eq('campaign_id', campaignId).is('external_id', null)
      : Promise.resolve(),
  ])
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function safeObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
