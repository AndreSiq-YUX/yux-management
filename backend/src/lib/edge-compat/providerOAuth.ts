export type MarketingOAuthProvider = 'meta_social' | 'google_business_profile' | 'meta_ads' | 'google_ads'
export type MarketingTargetKind = 'publishing' | 'ads'
export type OAuthFailureStatus = 'needs_reauth' | 'failed'

export interface MarketingOAuthToken {
  provider: MarketingOAuthProvider
  accessToken: string
  refreshToken?: string
  expiresAt?: string | null
  scopes: string[]
  tokenType?: string
  sanitizedPayload: Record<string, unknown>
}

export interface MarketingProviderAsset {
  provider: MarketingOAuthProvider
  targetKind: MarketingTargetKind
  assetKind: 'facebook_page' | 'instagram_business' | 'google_business_location' | 'meta_ad_account' | 'google_ads_customer'
  externalId: string
  name: string
  parentExternalId?: string | null
  accessToken?: string
  status?: string | null
  currency?: string | null
  timeZone?: string | null
  canManage?: boolean
  metadata: Record<string, unknown>
}

const oauthProviders = new Set<MarketingOAuthProvider>(['meta_social', 'google_business_profile', 'meta_ads', 'google_ads'])
const redactedValue = '[redacted]'

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function safeRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function assertProvider(value: unknown): MarketingOAuthProvider {
  const provider = requireString(value, 'provider')
  if (!oauthProviders.has(provider as MarketingOAuthProvider)) throw new Error(`Unsupported marketing provider: ${provider}`)
  return provider as MarketingOAuthProvider
}

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase()
  return normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('authorization')
    || normalized.includes('credential')
    || normalized.includes('password')
}

export function sanitizeOAuthPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeOAuthPayload)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    shouldRedactKey(key) ? redactedValue : sanitizeOAuthPayload(entry),
  ]))
}

export function scopesForMarketingProvider(provider: MarketingOAuthProvider) {
  const normalized = assertProvider(provider)
  if (normalized === 'meta_social') {
    return ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts', 'instagram_basic', 'instagram_content_publish']
  }
  if (normalized === 'meta_ads') {
    return ['ads_management', 'ads_read', 'business_management']
  }
  if (normalized === 'google_business_profile') {
    return ['https://www.googleapis.com/auth/business.manage']
  }
  return ['https://www.googleapis.com/auth/adwords']
}

export function buildMarketingProviderOAuthUrl(input: {
  provider: MarketingOAuthProvider
  state: string
  redirectUri: string
  clientId: string
  graphVersion?: string
}) {
  const provider = assertProvider(input.provider)
  const state = requireString(input.state, 'state')
  const redirectUri = requireString(input.redirectUri, 'redirectUri')
  const clientId = requireString(input.clientId, 'clientId')

  if (provider === 'meta_social' || provider === 'meta_ads') {
    const url = new URL(`https://www.facebook.com/${input.graphVersion || 'v20.0'}/dialog/oauth`)
    url.searchParams.set('client_id', clientId)
    url.searchParams.set('redirect_uri', redirectUri)
    url.searchParams.set('state', state)
    url.searchParams.set('response_type', 'code')
    url.searchParams.set('scope', scopesForMarketingProvider(provider).join(','))
    return url.toString()
  }

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('scope', scopesForMarketingProvider(provider).join(' '))
  return url.toString()
}

export function normalizeOAuthFailureStatus(status: number, payload: Record<string, unknown>): OAuthFailureStatus {
  const text = JSON.stringify(payload).toLowerCase()
  if (status === 401 || status === 403) return 'needs_reauth'
  if (text.includes('invalid_grant') || text.includes('revoked') || text.includes('reauth')) return 'needs_reauth'
  if (text.includes('insufficient') || text.includes('permission')) return 'needs_reauth'
  return 'failed'
}

export function normalizeTokenExpiry(expiresIn: unknown, now = new Date()) {
  const seconds = typeof expiresIn === 'number' ? expiresIn : Number(expiresIn)
  if (!Number.isFinite(seconds) || seconds <= 0) return null
  return new Date(now.getTime() + seconds * 1000).toISOString()
}

export async function exchangeMarketingOAuthCode(input: {
  provider: MarketingOAuthProvider
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
  graphVersion?: string
  fetcher?: typeof fetch
}): Promise<MarketingOAuthToken> {
  const provider = assertProvider(input.provider)
  if (provider === 'meta_social' || provider === 'meta_ads') return exchangeMetaOAuthCode({ ...input, provider })
  return exchangeGoogleOAuthCode({ ...input, provider })
}

export async function refreshGoogleAccessToken(input: {
  provider: Extract<MarketingOAuthProvider, 'google_business_profile' | 'google_ads'>
  refreshToken: string
  clientId: string
  clientSecret: string
  fetcher?: typeof fetch
}) {
  const provider = assertProvider(input.provider)
  if (provider !== 'google_business_profile' && provider !== 'google_ads') throw new Error('google_provider_required')
  const payload = await postForm({
    url: 'https://oauth2.googleapis.com/token',
    body: {
      client_id: requireString(input.clientId, 'clientId'),
      client_secret: requireString(input.clientSecret, 'clientSecret'),
      refresh_token: requireString(input.refreshToken, 'refreshToken'),
      grant_type: 'refresh_token',
    },
    fetcher: input.fetcher,
  })

  return {
    provider,
    accessToken: requireString(payload.access_token, 'access_token'),
    expiresAt: normalizeTokenExpiry(payload.expires_in),
    scopes: scopesForMarketingProvider(provider),
    tokenType: optionalString(payload.token_type),
    sanitizedPayload: sanitizeOAuthPayload(payload) as Record<string, unknown>,
  }
}

async function exchangeMetaOAuthCode(input: {
  provider: MarketingOAuthProvider
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
  graphVersion?: string
  fetcher?: typeof fetch
}): Promise<MarketingOAuthToken> {
  const fetcher = input.fetcher || fetch
  const graphVersion = input.graphVersion || 'v20.0'
  const shortUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`)
  shortUrl.searchParams.set('client_id', requireString(input.clientId, 'clientId'))
  shortUrl.searchParams.set('client_secret', requireString(input.clientSecret, 'clientSecret'))
  shortUrl.searchParams.set('redirect_uri', requireString(input.redirectUri, 'redirectUri'))
  shortUrl.searchParams.set('code', requireString(input.code, 'code'))
  const shortPayload = await getJson(shortUrl, fetcher)
  const shortAccessToken = requireString(shortPayload.access_token, 'access_token')

  const longUrl = new URL(`https://graph.facebook.com/${graphVersion}/oauth/access_token`)
  longUrl.searchParams.set('grant_type', 'fb_exchange_token')
  longUrl.searchParams.set('client_id', requireString(input.clientId, 'clientId'))
  longUrl.searchParams.set('client_secret', requireString(input.clientSecret, 'clientSecret'))
  longUrl.searchParams.set('fb_exchange_token', shortAccessToken)
  const longPayload = await getJson(longUrl, fetcher)
  const accessToken = optionalString(longPayload.access_token) || shortAccessToken

  return {
    provider: input.provider,
    accessToken,
    expiresAt: normalizeTokenExpiry(longPayload.expires_in || shortPayload.expires_in),
    scopes: scopesForMarketingProvider(input.provider),
    tokenType: optionalString(longPayload.token_type) || optionalString(shortPayload.token_type),
    sanitizedPayload: sanitizeOAuthPayload({ short: shortPayload, long: longPayload }) as Record<string, unknown>,
  }
}

async function exchangeGoogleOAuthCode(input: {
  provider: MarketingOAuthProvider
  code: string
  redirectUri: string
  clientId: string
  clientSecret: string
  fetcher?: typeof fetch
}): Promise<MarketingOAuthToken> {
  const payload = await postForm({
    url: 'https://oauth2.googleapis.com/token',
    body: {
      code: requireString(input.code, 'code'),
      client_id: requireString(input.clientId, 'clientId'),
      client_secret: requireString(input.clientSecret, 'clientSecret'),
      redirect_uri: requireString(input.redirectUri, 'redirectUri'),
      grant_type: 'authorization_code',
    },
    fetcher: input.fetcher,
  })

  return {
    provider: input.provider,
    accessToken: requireString(payload.access_token, 'access_token'),
    refreshToken: optionalString(payload.refresh_token),
    expiresAt: normalizeTokenExpiry(payload.expires_in),
    scopes: optionalString(payload.scope)?.split(/\s+/).filter(Boolean) || scopesForMarketingProvider(input.provider),
    tokenType: optionalString(payload.token_type),
    sanitizedPayload: sanitizeOAuthPayload(payload) as Record<string, unknown>,
  }
}

async function postForm(input: { url: string, body: Record<string, string>, fetcher?: typeof fetch }) {
  const response = await (input.fetcher || fetch)(input.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(input.body),
  })
  return responseJsonOrThrow(response)
}

async function getJson(url: URL, fetcher: typeof fetch) {
  const response = await fetcher(url.toString())
  return responseJsonOrThrow(response)
}

async function responseJsonOrThrow(response: Response) {
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    const status = normalizeOAuthFailureStatus(response.status, safeRecord(payload))
    const error = new Error(`oauth_${status}_${response.status}`)
    ;(error as Error & { status?: OAuthFailureStatus, payload?: unknown }).status = status
    ;(error as Error & { status?: OAuthFailureStatus, payload?: unknown }).payload = sanitizeOAuthPayload(payload)
    throw error
  }
  return safeRecord(payload)
}

export async function listMarketingProviderAssets(input: {
  provider: MarketingOAuthProvider
  accessToken: string
  graphVersion?: string
  googleAdsDeveloperToken?: string
  googleAdsLoginCustomerId?: string
  googleAdsApiVersion?: string
  includeAccessTokens?: boolean
  fetcher?: typeof fetch
}) {
  const provider = assertProvider(input.provider)
  if (provider === 'meta_social') return listMetaSocialAssets(input)
  if (provider === 'meta_ads') return listMetaAdAssets(input)
  if (provider === 'google_business_profile') return listGoogleBusinessProfileAssets(input)
  return listGoogleAdsCustomers(input)
}

async function listMetaSocialAssets(input: {
  accessToken: string
  graphVersion?: string
  includeAccessTokens?: boolean
  fetcher?: typeof fetch
}): Promise<MarketingProviderAsset[]> {
  const url = new URL(`https://graph.facebook.com/${input.graphVersion || 'v20.0'}/me/accounts`)
  url.searchParams.set('fields', 'id,name,access_token,tasks,instagram_business_account{id,username,name}')
  url.searchParams.set('limit', '100')
  url.searchParams.set('access_token', requireString(input.accessToken, 'accessToken'))
  const payload = await getJson(url, input.fetcher || fetch)
  const pages = Array.isArray(payload.data) ? payload.data.map(safeRecord) : []
  const assets: MarketingProviderAsset[] = []

  for (const page of pages) {
    const pageId = optionalString(page.id)
    if (!pageId) continue
    const pageName = optionalString(page.name) || pageId
    const pageToken = optionalString(page.access_token) || input.accessToken
    assets.push({
      provider: 'meta_social',
      targetKind: 'publishing',
      assetKind: 'facebook_page',
      externalId: pageId,
      name: pageName,
      accessToken: input.includeAccessTokens ? pageToken : undefined,
      canManage: true,
      metadata: sanitizeOAuthPayload({ tasks: page.tasks || [], page }) as Record<string, unknown>,
    })

    const instagram = safeRecord(page.instagram_business_account)
    const instagramId = optionalString(instagram.id)
    if (instagramId) {
      assets.push({
        provider: 'meta_social',
        targetKind: 'publishing',
        assetKind: 'instagram_business',
        externalId: instagramId,
        parentExternalId: pageId,
        name: optionalString(instagram.username) || optionalString(instagram.name) || `${pageName} Instagram`,
        accessToken: input.includeAccessTokens ? pageToken : undefined,
        canManage: true,
        metadata: sanitizeOAuthPayload({ pageId, instagram }) as Record<string, unknown>,
      })
    }
  }

  return assets
}

async function listMetaAdAssets(input: {
  accessToken: string
  graphVersion?: string
  fetcher?: typeof fetch
}): Promise<MarketingProviderAsset[]> {
  const url = new URL(`https://graph.facebook.com/${input.graphVersion || 'v20.0'}/me/adaccounts`)
  url.searchParams.set('fields', 'account_id,id,name,account_status,currency,timezone_name,business{id,name}')
  url.searchParams.set('limit', '100')
  url.searchParams.set('access_token', requireString(input.accessToken, 'accessToken'))
  const payload = await getJson(url, input.fetcher || fetch)
  const accounts = Array.isArray(payload.data) ? payload.data.map(safeRecord) : []

  return accounts.map((account): MarketingProviderAsset => ({
    provider: 'meta_ads',
    targetKind: 'ads',
    assetKind: 'meta_ad_account',
    externalId: optionalString(account.account_id) || optionalString(account.id) || '',
    name: optionalString(account.name) || optionalString(account.account_id) || optionalString(account.id) || 'Meta ad account',
    parentExternalId: optionalString(safeRecord(account.business).id),
    status: optionalString(account.account_status),
    currency: optionalString(account.currency),
    timeZone: optionalString(account.timezone_name),
    canManage: true,
    metadata: sanitizeOAuthPayload(account) as Record<string, unknown>,
  })).filter(asset => Boolean(asset.externalId))
}

async function listGoogleBusinessProfileAssets(input: {
  accessToken: string
  fetcher?: typeof fetch
}): Promise<MarketingProviderAsset[]> {
  const fetcher = input.fetcher || fetch
  const accountsPayload = await fetchGoogleJson('https://mybusinessaccountmanagement.googleapis.com/v1/accounts', input.accessToken, fetcher)
  const accounts = Array.isArray(accountsPayload.accounts) ? accountsPayload.accounts.map(safeRecord) : []
  const assets: MarketingProviderAsset[] = []

  for (const account of accounts) {
    const accountName = optionalString(account.name)
    if (!accountName) continue
    const locationsPayload = await fetchGoogleJson(`https://mybusinessbusinessinformation.googleapis.com/v1/${accountName}/locations?readMask=name,title,storefrontAddress,metadata`, input.accessToken, fetcher)
    const locations = Array.isArray(locationsPayload.locations) ? locationsPayload.locations.map(safeRecord) : []
    for (const location of locations) {
      const locationName = optionalString(location.name)
      if (!locationName) continue
      assets.push({
        provider: 'google_business_profile',
        targetKind: 'publishing',
        assetKind: 'google_business_location',
        externalId: locationName,
        name: optionalString(location.title) || locationName,
        parentExternalId: accountName,
        canManage: true,
        metadata: sanitizeOAuthPayload({ account, location }) as Record<string, unknown>,
      })
    }
  }

  return assets
}

async function listGoogleAdsCustomers(input: {
  accessToken: string
  googleAdsDeveloperToken?: string
  googleAdsLoginCustomerId?: string
  googleAdsApiVersion?: string
  fetcher?: typeof fetch
}): Promise<MarketingProviderAsset[]> {
  const developerToken = requireString(input.googleAdsDeveloperToken || process.env.GOOGLE_ADS_DEVELOPER_TOKEN, 'GOOGLE_ADS_DEVELOPER_TOKEN')
  const apiVersion = optionalString(input.googleAdsApiVersion) || process.env.GOOGLE_ADS_API_VERSION || 'v22'
  const response = await (input.fetcher || fetch)(`https://googleads.googleapis.com/${apiVersion}/customers:listAccessibleCustomers`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${requireString(input.accessToken, 'accessToken')}`,
      'developer-token': developerToken,
      ...(input.googleAdsLoginCustomerId ? { 'login-customer-id': input.googleAdsLoginCustomerId } : {}),
    },
  })
  const payload = await responseJsonOrThrow(response)
  const resourceNames = Array.isArray(payload.resourceNames) ? payload.resourceNames : []

  return resourceNames.map(resourceName => {
    const externalId = String(resourceName).replace(/^customers\//, '')
    return {
      provider: 'google_ads' as const,
      targetKind: 'ads' as const,
      assetKind: 'google_ads_customer' as const,
      externalId,
      name: externalId,
      providerCustomerId: externalId,
      canManage: true,
      metadata: sanitizeOAuthPayload({ resourceName }) as Record<string, unknown>,
    }
  })
}

async function fetchGoogleJson(url: string, accessToken: string, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    headers: { Authorization: `Bearer ${requireString(accessToken, 'accessToken')}` },
  })
  return responseJsonOrThrow(response)
}
