export type SocialPublishingProvider = 'wordpress' | 'meta_facebook' | 'meta_instagram' | 'google_business_profile'
export type SocialPublishingAction = 'create_draft' | 'update_draft' | 'publish'
export type ProviderBodyMode = 'form' | 'json'

export interface ProviderPublishingRequest {
  method: 'POST'
  url: string
  headers?: Record<string, string>
  body: Record<string, unknown>
  bodyMode?: ProviderBodyMode
}

export interface SocialPublishingResult {
  providerPostId: string
  publishedUrl?: string | null
  externalAssetId?: string | null
  externalParentId?: string | null
  responsePayload: Record<string, unknown>
}

export class SocialPublishingProviderError extends Error {
  authFailure: boolean
  status?: number
  payload?: unknown

  constructor(message: string, options: { authFailure?: boolean, status?: number, payload?: unknown } = {}) {
    super(message)
    this.name = 'SocialPublishingProviderError'
    this.authFailure = Boolean(options.authFailure)
    this.status = options.status
    this.payload = options.payload
  }
}

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

function compactBody(body: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined && value !== null && value !== ''))
}

function shouldRedactKey(key: string) {
  const normalized = key.toLowerCase()
  return normalized.includes('token')
    || normalized.includes('secret')
    || normalized.includes('authorization')
    || normalized.includes('password')
    || normalized.includes('credential')
}

export function sanitizePublishingPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePublishingPayload)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
    key,
    shouldRedactKey(key) ? redactedValue : sanitizePublishingPayload(entry),
  ]))
}

export function buildFacebookPagePostRequest(input: {
  pageId: string
  graphVersion: string
  accessToken: string
  message: string
  link?: string
}): ProviderPublishingRequest {
  return {
    method: 'POST',
    url: `https://graph.facebook.com/${requireString(input.graphVersion, 'graphVersion')}/${requireString(input.pageId, 'pageId')}/feed`,
    bodyMode: 'form',
    body: compactBody({
      message: requireString(input.message, 'message'),
      link: optionalString(input.link),
      access_token: requireString(input.accessToken, 'accessToken'),
    }),
  }
}

export function buildInstagramMediaContainerRequest(input: {
  instagramAccountId: string
  graphVersion: string
  accessToken: string
  caption: string
  imageUrl: string
}): ProviderPublishingRequest {
  return {
    method: 'POST',
    url: `https://graph.facebook.com/${requireString(input.graphVersion, 'graphVersion')}/${requireString(input.instagramAccountId, 'instagramAccountId')}/media`,
    bodyMode: 'form',
    body: {
      image_url: requireString(input.imageUrl, 'imageUrl'),
      caption: requireString(input.caption, 'caption'),
      access_token: requireString(input.accessToken, 'accessToken'),
    },
  }
}

export function buildInstagramPublishRequest(input: {
  instagramAccountId: string
  graphVersion: string
  accessToken: string
  creationId: string
}): ProviderPublishingRequest {
  return {
    method: 'POST',
    url: `https://graph.facebook.com/${requireString(input.graphVersion, 'graphVersion')}/${requireString(input.instagramAccountId, 'instagramAccountId')}/media_publish`,
    bodyMode: 'form',
    body: {
      creation_id: requireString(input.creationId, 'creationId'),
      access_token: requireString(input.accessToken, 'accessToken'),
    },
  }
}

export function buildGoogleBusinessProfilePostRequest(input: {
  locationName: string
  accessToken: string
  summary: string
  ctaUrl?: string
}): ProviderPublishingRequest {
  return {
    method: 'POST',
    url: `https://mybusiness.googleapis.com/v4/${requireString(input.locationName, 'locationName')}/localPosts`,
    headers: { Authorization: `Bearer ${requireString(input.accessToken, 'accessToken')}` },
    bodyMode: 'json',
    body: compactBody({
      languageCode: 'pt-BR',
      summary: requireString(input.summary, 'summary'),
      topicType: 'STANDARD',
      callToAction: optionalString(input.ctaUrl) ? { actionType: 'LEARN_MORE', url: optionalString(input.ctaUrl) } : undefined,
    }),
  }
}

export function buildWordPressPostRequest(input: {
  siteUrl: string
  username: string
  token: string
  title: string
  content: string
  excerpt?: string
  status: 'draft' | 'publish'
  providerPostId?: string
}): ProviderPublishingRequest {
  const siteUrl = requireString(input.siteUrl, 'siteUrl').replace(/\/$/, '')
  const providerPostId = optionalString(input.providerPostId)
  return {
    method: 'POST',
    url: providerPostId ? `${siteUrl}/wp-json/wp/v2/posts/${providerPostId}` : `${siteUrl}/wp-json/wp/v2/posts`,
    headers: {
      Authorization: `Basic ${btoa(`${requireString(input.username, 'username')}:${requireString(input.token, 'token')}`)}`,
    },
    bodyMode: 'json',
    body: compactBody({
      title: requireString(input.title, 'title'),
      content: requireString(input.content, 'content'),
      excerpt: optionalString(input.excerpt),
      status: input.status,
    }),
  }
}

export async function executeSocialPublishingAction(input: {
  connection: Record<string, unknown>
  content: Record<string, unknown>
  run: Record<string, unknown>
  accessToken: string
  graphVersion?: string
  fetcher?: typeof fetch
}): Promise<SocialPublishingResult> {
  const provider = requireString(input.connection.provider, 'provider') as SocialPublishingProvider
  if (provider === 'wordpress') return executeWordPress(input)
  if (provider === 'meta_facebook') return executeFacebookPage(input)
  if (provider === 'meta_instagram') return executeInstagram(input)
  if (provider === 'google_business_profile') return executeGoogleBusinessProfile(input)
  throw new Error(`unsupported_publishing_provider:${provider}`)
}

async function executeFacebookPage(input: {
  connection: Record<string, unknown>
  content: Record<string, unknown>
  run: Record<string, unknown>
  accessToken: string
  graphVersion?: string
  fetcher?: typeof fetch
}): Promise<SocialPublishingResult> {
  const pageId = requireString(input.connection.provider_asset_id || input.connection.provider_account_id, 'provider_asset_id')
  const payload = await sendProviderRequest(buildFacebookPagePostRequest({
    pageId,
    graphVersion: input.graphVersion || 'v20.0',
    accessToken: input.accessToken,
    message: contentMessage(input.content),
    link: contentLink(input.content, input.run),
  }), input.fetcher)

  return {
    providerPostId: requireString(payload.id, 'provider post id'),
    publishedUrl: optionalString(payload.permalink_url) || optionalString(payload.link) || null,
    externalAssetId: pageId,
    externalParentId: optionalString(input.connection.provider_parent_asset_id) || null,
    responsePayload: sanitizePublishingPayload(payload) as Record<string, unknown>,
  }
}

async function executeInstagram(input: {
  connection: Record<string, unknown>
  content: Record<string, unknown>
  run: Record<string, unknown>
  accessToken: string
  graphVersion?: string
  fetcher?: typeof fetch
}): Promise<SocialPublishingResult> {
  const instagramAccountId = requireString(input.connection.provider_asset_id || input.connection.provider_account_id, 'provider_asset_id')
  const containerPayload = await sendProviderRequest(buildInstagramMediaContainerRequest({
    instagramAccountId,
    graphVersion: input.graphVersion || 'v20.0',
    accessToken: input.accessToken,
    caption: contentMessage(input.content),
    imageUrl: contentImageUrl(input.content, input.run),
  }), input.fetcher)
  const creationId = requireString(containerPayload.id, 'instagram creation id')
  const publishPayload = await sendProviderRequest(buildInstagramPublishRequest({
    instagramAccountId,
    graphVersion: input.graphVersion || 'v20.0',
    accessToken: input.accessToken,
    creationId,
  }), input.fetcher)

  return {
    providerPostId: requireString(publishPayload.id || creationId, 'instagram media id'),
    publishedUrl: optionalString(publishPayload.permalink) || null,
    externalAssetId: instagramAccountId,
    externalParentId: optionalString(input.connection.provider_parent_asset_id) || null,
    responsePayload: sanitizePublishingPayload({ container: containerPayload, publish: publishPayload }) as Record<string, unknown>,
  }
}

async function executeGoogleBusinessProfile(input: {
  connection: Record<string, unknown>
  content: Record<string, unknown>
  run: Record<string, unknown>
  accessToken: string
  fetcher?: typeof fetch
}): Promise<SocialPublishingResult> {
  const locationName = requireString(input.connection.provider_asset_id || input.connection.provider_account_id, 'provider_asset_id')
  const payload = await sendProviderRequest(buildGoogleBusinessProfilePostRequest({
    locationName,
    accessToken: input.accessToken,
    summary: contentMessage(input.content),
    ctaUrl: contentLink(input.content, input.run),
  }), input.fetcher)

  return {
    providerPostId: requireString(payload.name, 'google local post name'),
    publishedUrl: optionalString(payload.searchUrl) || null,
    externalAssetId: locationName,
    externalParentId: optionalString(input.connection.provider_parent_asset_id) || null,
    responsePayload: sanitizePublishingPayload(payload) as Record<string, unknown>,
  }
}

async function executeWordPress(input: {
  connection: Record<string, unknown>
  content: Record<string, unknown>
  run: Record<string, unknown>
  accessToken: string
  fetcher?: typeof fetch
}): Promise<SocialPublishingResult> {
  const action = requireString(input.run.action, 'action') as SocialPublishingAction
  const providerPostId = optionalString(safeRecord(input.run.request_payload).providerPostId) || optionalString(input.run.provider_post_id)
  const request = buildWordPressPostRequest({
    siteUrl: requireString(input.connection.site_url, 'site_url'),
    username: requireString(input.connection.username, 'username'),
    token: input.accessToken,
    title: requireString(input.content.title, 'title'),
    content: requireString(input.content.body, 'body'),
    excerpt: optionalString(input.content.cta),
    status: action === 'publish' ? 'publish' : 'draft',
    providerPostId: action === 'create_draft' ? undefined : providerPostId,
  })
  const payload = await sendProviderRequest(request, input.fetcher)

  return {
    providerPostId: String(payload.id || providerPostId || ''),
    publishedUrl: optionalString(payload.link) || null,
    externalAssetId: optionalString(input.connection.provider_asset_id) || null,
    externalParentId: optionalString(input.connection.provider_parent_asset_id) || null,
    responsePayload: sanitizePublishingPayload(payload) as Record<string, unknown>,
  }
}

async function sendProviderRequest(request: ProviderPublishingRequest, fetcher = fetch) {
  const headers = { ...(request.headers || {}) }
  const body = compactBody(request.body)
  const response = await fetcher(request.url, {
    method: request.method,
    headers: request.bodyMode === 'form'
      ? { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' }
      : { ...headers, 'Content-Type': 'application/json' },
    body: request.bodyMode === 'form'
      ? new URLSearchParams(Object.fromEntries(Object.entries(body).map(([key, value]) => [key, String(value)])))
      : JSON.stringify(body),
  })
  const text = await response.text()
  let payload: unknown = text
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { text }
  }
  if (!response.ok) {
    const sanitized = sanitizePublishingPayload(payload)
    throw new SocialPublishingProviderError(
      `provider_http_${response.status}:${JSON.stringify(sanitized).slice(0, 240)}`,
      { authFailure: response.status === 401 || response.status === 403, status: response.status, payload: sanitized },
    )
  }
  return safeRecord(payload)
}

function contentMessage(content: Record<string, unknown>) {
  return optionalString(content.body) || requireString(content.title, 'title')
}

function contentLink(content: Record<string, unknown>, run: Record<string, unknown>) {
  const requestPayload = safeRecord(run.request_payload)
  const metadata = safeRecord(content.metadata)
  return optionalString(requestPayload.link)
    || optionalString(requestPayload.ctaUrl)
    || optionalString(metadata.link)
    || optionalString(metadata.ctaUrl)
    || optionalString(content.published_url)
}

function contentImageUrl(content: Record<string, unknown>, run: Record<string, unknown>) {
  const requestPayload = safeRecord(run.request_payload)
  const metadata = safeRecord(content.metadata)
  return optionalString(requestPayload.imageUrl)
    || optionalString(requestPayload.mediaUrl)
    || optionalString(metadata.imageUrl)
    || optionalString(metadata.mediaUrl)
    || optionalString(metadata.primaryImageUrl)
    || optionalString(metadata.thumbnailUrl)
    || requireString(undefined, 'instagram_image_url')
}
