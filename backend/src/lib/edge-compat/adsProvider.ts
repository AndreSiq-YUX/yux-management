export type AdsProviderKey = 'meta' | 'google'
export type AdsProviderConnectionStatus = 'connected' | 'stale' | 'needs_reauth' | 'failed'
export type AdsProviderMutationAction = 'create_campaign' | 'activate_campaign' | 'update_budget' | 'pause_campaign' | 'sync_metrics'
export type AdsProviderMutationStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface ProviderMutationIdempotencyInput {
  provider: AdsProviderKey
  localMutationId: string
  action: AdsProviderMutationAction
}

export interface ProviderMutationResponseInput extends ProviderMutationIdempotencyInput {
  ok: boolean
  externalCampaignId?: string
  externalAdSetId?: string
  externalAdId?: string
  raw?: Record<string, unknown>
  error?: unknown
}

export interface NormalizedProviderMutationResponse {
  provider: AdsProviderKey
  action: AdsProviderMutationAction
  idempotencyKey: string
  status: AdsProviderMutationStatus
  externalCampaignId?: string
  externalAdSetId?: string
  externalAdId?: string
  payload: Record<string, unknown>
  protectedError?: string
}

export interface ProviderHttpRequest {
  step: string
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  body?: Record<string, unknown>
  bodyMode?: 'form' | 'json'
}

const providers = new Set<AdsProviderKey>(['meta', 'google'])
const actions = new Set<AdsProviderMutationAction>(['create_campaign', 'activate_campaign', 'update_budget', 'pause_campaign', 'sync_metrics'])
const redactedValue = '[redacted]'

function assertProvider(provider: string): AdsProviderKey {
  if (!providers.has(provider as AdsProviderKey)) throw new Error(`Unsupported ads provider: ${provider}`)
  return provider as AdsProviderKey
}

function assertAction(action: string): AdsProviderMutationAction {
  if (!actions.has(action as AdsProviderMutationAction)) throw new Error(`Unsupported provider mutation action: ${action}`)
  return action as AdsProviderMutationAction
}

function stringValue(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown, label: string) {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) throw new Error(`${label} is required`)
  return number
}

function recordValue(value: unknown, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} is required`)
  return value as Record<string, unknown>
}

function compactBody(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function envValue(name: string) {
  return process.env[name]
}

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase()
  return normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('password')
    || normalized.includes('credential')
    || normalized.includes('authorization')
}

export function sanitizeProviderMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeProviderMetadata)
  if (!value || typeof value !== 'object') return value

  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    shouldRedactKey(key) ? redactedValue : sanitizeProviderMetadata(entry),
  ]))
}

export function sanitizeProviderError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown provider error')
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [redacted]')
    .replace(/\b(access_token|refresh_token|token|secret|password|credential|authorization)\s+[^,\s]+/gi, '$1 [redacted]')
    .replace(/\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, '[redacted.jwt]')
    .replace(/\babc[0-9A-Za-z_-]+\b/g, '[redacted]')
}

export function buildProviderMutationIdempotencyKey(input: ProviderMutationIdempotencyInput) {
  const provider = assertProvider(stringValue(input.provider, 'provider'))
  const action = assertAction(stringValue(input.action, 'action'))
  const localMutationId = stringValue(input.localMutationId, 'localMutationId')
  return `${provider}:${action}:${localMutationId}`
}

export function buildProviderMutationResponse(input: ProviderMutationResponseInput): NormalizedProviderMutationResponse {
  const provider = assertProvider(input.provider)
  const action = assertAction(input.action)
  const payload = sanitizeProviderMetadata(input.raw || {}) as Record<string, unknown>

  return {
    provider,
    action,
    idempotencyKey: buildProviderMutationIdempotencyKey(input),
    status: input.ok ? 'succeeded' : 'failed',
    externalCampaignId: input.externalCampaignId,
    externalAdSetId: input.externalAdSetId,
    externalAdId: input.externalAdId,
    payload,
    protectedError: input.ok ? undefined : sanitizeProviderError(input.error),
  }
}

export function rejectNeedsReauthConnection(connection: { status?: string }) {
  return connection.status === 'needs_reauth'
}

export function buildMetaCampaignRequests(input: {
  graphVersion: string
  accessToken: string
  adAccountId: string
  campaign: {
    name: string
    objective: 'lead_generation' | 'traffic' | 'conversions' | 'awareness'
    dailyBudget: number
    landingPageUrl: string
    headline: string
    body: string
    pageId?: string
  }
}): ProviderHttpRequest[] {
  const baseUrl = `https://graph.facebook.com/${stringValue(input.graphVersion, 'graphVersion')}/${stringValue(input.adAccountId, 'adAccountId')}`
  const objectiveMap = {
    lead_generation: 'OUTCOME_LEADS',
    traffic: 'OUTCOME_TRAFFIC',
    conversions: 'OUTCOME_SALES',
    awareness: 'OUTCOME_AWARENESS',
  } as const
  const optimizationGoal = input.campaign.objective === 'traffic' ? 'LINK_CLICKS' : 'LEAD_GENERATION'

  return [
    {
      step: 'campaign',
      method: 'POST',
      url: `${baseUrl}/campaigns`,
      bodyMode: 'form',
      body: {
        name: stringValue(input.campaign.name, 'campaign.name'),
        objective: objectiveMap[input.campaign.objective],
        status: 'PAUSED',
        special_ad_categories: '[]',
        access_token: stringValue(input.accessToken, 'accessToken'),
      },
    },
    {
      step: 'adset',
      method: 'POST',
      url: `${baseUrl}/adsets`,
      bodyMode: 'form',
      body: compactBody({
        name: `${stringValue(input.campaign.name, 'campaign.name')} - Ad Set`,
        daily_budget: Math.round(numberValue(input.campaign.dailyBudget, 'campaign.dailyBudget') * 100),
        billing_event: 'IMPRESSIONS',
        optimization_goal: optimizationGoal,
        status: 'PAUSED',
        access_token: stringValue(input.accessToken, 'accessToken'),
      }),
    },
    {
      step: 'creative',
      method: 'POST',
      url: `${baseUrl}/adcreatives`,
      bodyMode: 'form',
      body: {
        name: `${stringValue(input.campaign.name, 'campaign.name')} - Creative`,
        object_story_spec: JSON.stringify({
          page_id: optionalString(input.campaign.pageId),
          link_data: {
            link: stringValue(input.campaign.landingPageUrl, 'campaign.landingPageUrl'),
            message: stringValue(input.campaign.body, 'campaign.body'),
            name: stringValue(input.campaign.headline, 'campaign.headline'),
          },
        }),
        access_token: stringValue(input.accessToken, 'accessToken'),
      },
    },
    {
      step: 'ad',
      method: 'POST',
      url: `${baseUrl}/ads`,
      bodyMode: 'form',
      body: {
        name: `${stringValue(input.campaign.name, 'campaign.name')} - Ad`,
        status: 'PAUSED',
        access_token: stringValue(input.accessToken, 'accessToken'),
      },
    },
  ]
}

export function buildGoogleAdsCampaignMutateOperations(input: {
  customerId: string
  campaign: {
    name: string
    objective: 'lead_generation' | 'traffic' | 'conversions' | 'awareness'
    dailyBudgetMicros: number
    landingPageUrl: string
    headline: string
    body: string
  }
}) {
  const customerId = stringValue(input.customerId, 'customerId')
  const campaignName = stringValue(input.campaign.name, 'campaign.name')
  const budgetResource = `customers/${customerId}/campaignBudgets/-1`
  const campaignResource = `customers/${customerId}/campaigns/-2`
  const adGroupResource = `customers/${customerId}/adGroups/-3`

  return [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetResource,
          name: `${campaignName} Budget`,
          amountMicros: Math.round(numberValue(input.campaign.dailyBudgetMicros, 'campaign.dailyBudgetMicros')),
          deliveryMethod: 'STANDARD',
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignResource,
          name: campaignName,
          status: 'PAUSED',
          advertisingChannelType: 'SEARCH',
          campaignBudget: budgetResource,
          manualCpc: {},
        },
      },
    },
    {
      adGroupOperation: {
        create: {
          resourceName: adGroupResource,
          campaign: campaignResource,
          name: `${campaignName} Ad Group`,
          status: 'PAUSED',
        },
      },
    },
    {
      adGroupAdOperation: {
        create: {
          adGroup: adGroupResource,
          status: 'PAUSED',
          ad: {
            finalUrls: [stringValue(input.campaign.landingPageUrl, 'campaign.landingPageUrl')],
            responsiveSearchAd: {
              headlines: [{ text: stringValue(input.campaign.headline, 'campaign.headline') }],
              descriptions: [{ text: stringValue(input.campaign.body, 'campaign.body') }],
            },
          },
        },
      },
    },
  ]
}

export async function executeProviderAdapter(input: {
  provider: AdsProviderKey
  action: AdsProviderMutationAction
  localMutationId: string
  requestPayload?: Record<string, unknown>
  fetcher?: typeof fetch
}) {
  const provider = assertProvider(input.provider)
  const action = assertAction(input.action)
  const requestPayload = input.requestPayload || {}

  try {
    if (provider === 'meta') return await executeMetaAdapter({ ...input, action, requestPayload })
    return await executeGoogleAdapter({ ...input, action, requestPayload })
  } catch (error) {
    return buildProviderMutationResponse({
      provider,
      action,
      localMutationId: input.localMutationId,
      ok: false,
      raw: { provider, action },
      error,
    })
  }
}

async function executeMetaAdapter(input: {
  provider: AdsProviderKey
  action: AdsProviderMutationAction
  localMutationId: string
  requestPayload: Record<string, unknown>
  fetcher?: typeof fetch
}) {
  const accessToken = stringValue(input.requestPayload.accessToken, 'accessToken')
  const graphVersion = optionalString(input.requestPayload.graphVersion) || envValue('META_GRAPH_VERSION') || 'v20.0'
  const adAccountId = normalizeMetaAdAccountId(stringValue(input.requestPayload.adAccountId || input.requestPayload.providerAccountId || input.requestPayload.externalAccountId, 'adAccountId'))
  const fetcher = input.fetcher || fetch

  if (input.action === 'create_campaign') {
    const campaign = normalizeCampaignPayload(input.requestPayload.campaign || input.requestPayload)
    const requests = buildMetaCampaignRequests({ graphVersion, accessToken, adAccountId, campaign })
    const campaignPayload = await sendProviderRequest(requests[0], fetcher)
    const campaignId = stringValue(campaignPayload.id, 'meta campaign id')
    const adsetPayload = await sendProviderRequest({
      ...requests[1],
      body: { ...(requests[1].body || {}), campaign_id: campaignId },
    }, fetcher)
    const adSetId = stringValue(adsetPayload.id, 'meta ad set id')
    const creativePayload = await sendProviderRequest(requests[2], fetcher)
    const creativeId = stringValue(creativePayload.id, 'meta creative id')
    const adPayload = await sendProviderRequest({
      ...requests[3],
      body: { ...(requests[3].body || {}), adset_id: adSetId, creative: JSON.stringify({ creative_id: creativeId }) },
    }, fetcher)

    return buildProviderMutationResponse({
      provider: 'meta',
      action: input.action,
      localMutationId: input.localMutationId,
      ok: true,
      externalCampaignId: campaignId,
      externalAdSetId: adSetId,
      externalAdId: optionalString(adPayload.id),
      raw: { campaign: campaignPayload, adset: adsetPayload, creative: creativePayload, ad: adPayload },
    })
  }

  if (input.action === 'update_budget') {
    const adSetId = stringValue(input.requestPayload.adSetId || input.requestPayload.externalAdSetId, 'adSetId')
    const dailyBudget = numberValue(input.requestPayload.dailyBudget || input.requestPayload.nextDaily, 'dailyBudget')
    const payload = await sendProviderRequest({
      step: 'update_budget',
      method: 'POST',
      url: `https://graph.facebook.com/${graphVersion}/${adSetId}`,
      bodyMode: 'form',
      body: { daily_budget: Math.round(dailyBudget * 100), access_token: accessToken },
    }, fetcher)
    return buildProviderMutationResponse({ provider: 'meta', action: input.action, localMutationId: input.localMutationId, ok: true, raw: payload })
  }

  if (input.action === 'pause_campaign' || input.action === 'activate_campaign') {
    const campaignId = stringValue(input.requestPayload.campaignId || input.requestPayload.externalCampaignId || input.requestPayload.externalId, 'campaignId')
    const payload = await sendProviderRequest({
      step: input.action,
      method: 'POST',
      url: `https://graph.facebook.com/${graphVersion}/${campaignId}`,
      bodyMode: 'form',
      body: { status: input.action === 'activate_campaign' ? 'ACTIVE' : 'PAUSED', access_token: accessToken },
    }, fetcher)
    return buildProviderMutationResponse({ provider: 'meta', action: input.action, localMutationId: input.localMutationId, ok: true, externalCampaignId: campaignId, raw: payload })
  }

  const campaignId = stringValue(input.requestPayload.campaignId || input.requestPayload.externalCampaignId || input.requestPayload.externalId, 'campaignId')
  const url = new URL(`https://graph.facebook.com/${graphVersion}/${campaignId}/insights`)
  url.searchParams.set('fields', 'spend,impressions,clicks,actions')
  url.searchParams.set('access_token', accessToken)
  const payload = await sendProviderRequest({ step: 'sync_metrics', method: 'GET', url: url.toString() }, fetcher)
  return buildProviderMutationResponse({ provider: 'meta', action: input.action, localMutationId: input.localMutationId, ok: true, externalCampaignId: campaignId, raw: normalizeMetaMetrics(payload) })
}

async function executeGoogleAdapter(input: {
  provider: AdsProviderKey
  action: AdsProviderMutationAction
  localMutationId: string
  requestPayload: Record<string, unknown>
  fetcher?: typeof fetch
}) {
  const accessToken = stringValue(input.requestPayload.accessToken, 'accessToken')
  const customerId = normalizeGoogleCustomerId(stringValue(input.requestPayload.customerId || input.requestPayload.providerCustomerId || input.requestPayload.providerAccountId, 'customerId'))
  const developerToken = stringValue(input.requestPayload.developerToken || envValue('GOOGLE_ADS_DEVELOPER_TOKEN'), 'GOOGLE_ADS_DEVELOPER_TOKEN')
  const apiVersion = optionalString(input.requestPayload.apiVersion) || envValue('GOOGLE_ADS_API_VERSION') || 'v22'
  const fetcher = input.fetcher || fetch

  if (input.action === 'create_campaign') {
    const campaign = normalizeCampaignPayload(input.requestPayload.campaign || input.requestPayload)
    const payload = await sendProviderRequest({
      step: 'create_campaign',
      method: 'POST',
      url: `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:mutate`,
      headers: googleAdsHeaders(accessToken, developerToken, optionalString(input.requestPayload.loginCustomerId)),
      bodyMode: 'json',
      body: {
        mutateOperations: buildGoogleAdsCampaignMutateOperations({
          customerId,
          campaign: {
            ...campaign,
            dailyBudgetMicros: Math.round(numberValue(campaign.dailyBudgetMicros || campaign.dailyBudget * 1_000_000, 'dailyBudgetMicros')),
          },
        }),
        partialFailure: false,
        validateOnly: false,
      },
    }, fetcher)

    return buildProviderMutationResponse({
      provider: 'google',
      action: input.action,
      localMutationId: input.localMutationId,
      ok: true,
      externalCampaignId: extractGoogleResourceId(payload, 'campaigns'),
      raw: payload,
    })
  }

  if (input.action === 'update_budget') {
    const budgetResourceName = stringValue(input.requestPayload.budgetResourceName || input.requestPayload.campaignBudgetResourceName, 'budgetResourceName')
    const amountMicros = Math.round(numberValue(input.requestPayload.amountMicros || numberValue(input.requestPayload.nextDaily, 'nextDaily') * 1_000_000, 'amountMicros'))
    const payload = await sendProviderRequest({
      step: 'update_budget',
      method: 'POST',
      url: `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:mutate`,
      headers: googleAdsHeaders(accessToken, developerToken, optionalString(input.requestPayload.loginCustomerId)),
      bodyMode: 'json',
      body: {
        mutateOperations: [{
          campaignBudgetOperation: {
            update: { resourceName: budgetResourceName, amountMicros },
            updateMask: 'amount_micros',
          },
        }],
      },
    }, fetcher)
    return buildProviderMutationResponse({ provider: 'google', action: input.action, localMutationId: input.localMutationId, ok: true, raw: payload })
  }

  if (input.action === 'pause_campaign' || input.action === 'activate_campaign') {
    const campaignResourceName = stringValue(input.requestPayload.campaignResourceName || input.requestPayload.externalCampaignId, 'campaignResourceName')
    const payload = await sendProviderRequest({
      step: input.action,
      method: 'POST',
      url: `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:mutate`,
      headers: googleAdsHeaders(accessToken, developerToken, optionalString(input.requestPayload.loginCustomerId)),
      bodyMode: 'json',
      body: {
        mutateOperations: [{
          campaignOperation: {
            update: { resourceName: campaignResourceName, status: input.action === 'activate_campaign' ? 'ENABLED' : 'PAUSED' },
            updateMask: 'status',
          },
        }],
      },
    }, fetcher)
    return buildProviderMutationResponse({ provider: 'google', action: input.action, localMutationId: input.localMutationId, ok: true, externalCampaignId: campaignResourceName, raw: payload })
  }

  const campaignResourceName = stringValue(input.requestPayload.campaignResourceName || input.requestPayload.externalCampaignId, 'campaignResourceName')
  const payload = await sendProviderRequest({
    step: 'sync_metrics',
    method: 'POST',
    url: `https://googleads.googleapis.com/${apiVersion}/customers/${customerId}/googleAds:searchStream`,
    headers: googleAdsHeaders(accessToken, developerToken, optionalString(input.requestPayload.loginCustomerId)),
    bodyMode: 'json',
    body: {
      query: `SELECT campaign.id, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions FROM campaign WHERE campaign.resource_name = '${campaignResourceName}'`,
    },
  }, fetcher)
  return buildProviderMutationResponse({ provider: 'google', action: input.action, localMutationId: input.localMutationId, ok: true, externalCampaignId: campaignResourceName, raw: normalizeGoogleMetrics(payload) })
}

async function sendProviderRequest(request: ProviderHttpRequest, fetcher: typeof fetch) {
  const response = await fetcher(request.url, {
    method: request.method,
    headers: request.method === 'GET'
      ? request.headers
      : request.bodyMode === 'form'
        ? { ...(request.headers || {}), 'Content-Type': 'application/x-www-form-urlencoded' }
        : { ...(request.headers || {}), 'Content-Type': 'application/json' },
    body: request.method === 'GET'
      ? undefined
      : request.bodyMode === 'form'
        ? new URLSearchParams(Object.fromEntries(Object.entries(compactBody(request.body || {})).map(([key, value]) => [key, String(value)])))
        : JSON.stringify(compactBody(request.body || {})),
  })
  const text = await response.text()
  let payload: unknown = text
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { text }
  }
  if (!response.ok) {
    throw new Error(`provider_${request.step}_http_${response.status}:${JSON.stringify(sanitizeProviderMetadata(payload)).slice(0, 240)}`)
  }
  return payload as any
}

function normalizeCampaignPayload(value: unknown) {
  const campaign = recordValue(value, 'campaign')
  return {
    name: stringValue(campaign.name, 'campaign.name'),
    objective: (optionalString(campaign.objective) || 'lead_generation') as 'lead_generation' | 'traffic' | 'conversions' | 'awareness',
    dailyBudget: numberValue(campaign.dailyBudget || campaign.daily_budget || campaign.budget, 'campaign.dailyBudget'),
    dailyBudgetMicros: campaign.dailyBudgetMicros || campaign.daily_budget_micros,
    landingPageUrl: stringValue(campaign.landingPageUrl || campaign.landing_page_url || campaign.finalUrl || campaign.final_url, 'campaign.landingPageUrl'),
    headline: stringValue(campaign.headline || campaign.title || campaign.name, 'campaign.headline'),
    body: stringValue(campaign.body || campaign.description || campaign.copy, 'campaign.body'),
    pageId: optionalString(campaign.pageId || campaign.page_id),
  }
}

function normalizeMetaAdAccountId(value: string) {
  return value.startsWith('act_') ? value : `act_${value}`
}

function normalizeGoogleCustomerId(value: string) {
  return value.replace(/^customers\//, '').replaceAll('-', '')
}

function googleAdsHeaders(accessToken: string, developerToken: string, loginCustomerId?: string) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': developerToken,
    ...(loginCustomerId ? { 'login-customer-id': loginCustomerId } : {}),
  }
}

function extractGoogleResourceId(payload: Record<string, unknown>, resourceKind: string) {
  const mutateOperationResponses = Array.isArray(payload.mutateOperationResponses) ? payload.mutateOperationResponses : []
  const hit = mutateOperationResponses
    .map(recordValueOrEmpty)
    .map(response => Object.values(response).find(value => optionalString(recordValueOrEmpty(value).resourceName)))
    .map(recordValueOrEmpty)
    .find(value => String(value.resourceName || '').includes(`/${resourceKind}/`))
  return optionalString(hit?.resourceName)
}

function recordValueOrEmpty(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function normalizeMetaMetrics(payload: unknown): Record<string, unknown> {
  const root = recordValueOrEmpty(payload)
  const first = Array.isArray(root.data) ? recordValueOrEmpty(root.data[0]) : root
  const actions = Array.isArray(first.actions) ? first.actions.map(recordValueOrEmpty) : []
  const leads = actions
    .filter(action => String(action.action_type || '').includes('lead'))
    .reduce((sum, action) => sum + Number(action.value || 0), 0)
  return {
    spend: Number(first.spend || 0),
    impressions: Number(first.impressions || 0),
    clicks: Number(first.clicks || 0),
    leads,
    raw: sanitizeProviderMetadata(payload),
  }
}

function normalizeGoogleMetrics(payload: unknown): Record<string, unknown> {
  const batches = Array.isArray(payload) ? payload : [payload]
  const rows = batches.flatMap(batch => Array.isArray(recordValueOrEmpty(batch).results) ? recordValueOrEmpty(batch).results as unknown[] : [])
  const metrics = rows.map(recordValueOrEmpty).map(row => recordValueOrEmpty(row.metrics))
  return {
    spend: metrics.reduce((sum, metric) => sum + Number(metric.costMicros || 0), 0) / 1_000_000,
    impressions: metrics.reduce((sum, metric) => sum + Number(metric.impressions || 0), 0),
    clicks: metrics.reduce((sum, metric) => sum + Number(metric.clicks || 0), 0),
    leads: metrics.reduce((sum, metric) => sum + Number(metric.conversions || 0), 0),
    raw: sanitizeProviderMetadata(payload),
  }
}
