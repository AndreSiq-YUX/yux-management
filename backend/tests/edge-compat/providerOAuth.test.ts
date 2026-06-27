import { it } from 'vitest'
import {
  buildMarketingProviderOAuthUrl,
  exchangeMarketingOAuthCode,
  listMarketingProviderAssets,
  normalizeOAuthFailureStatus,
  sanitizeOAuthPayload,
  scopesForMarketingProvider,
} from '../../src/lib/edge-compat/providerOAuth.js'

function assert(condition: unknown, message = 'Assertion failed') {
  if (!condition) throw new Error(message)
}

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function assertStringIncludes(actual: string, expected: string) {
  assert(actual.includes(expected), `Expected ${actual} to include ${expected}`)
}

it('builds Meta social OAuth URL with publishing scopes', () => {
  const url = buildMarketingProviderOAuthUrl({
    provider: 'meta_social',
    state: 'state-1',
    redirectUri: 'https://example.com/callback',
    clientId: 'meta-app',
    graphVersion: 'v20.0',
  })
  assertStringIncludes(url, 'https://www.facebook.com/v20.0/dialog/oauth')
  assertStringIncludes(decodeURIComponent(url), 'pages_manage_posts')
  assertStringIncludes(decodeURIComponent(url), 'instagram_content_publish')
})

it('builds Google Business Profile OAuth URL', () => {
  const url = buildMarketingProviderOAuthUrl({
    provider: 'google_business_profile',
    state: 'state-1',
    redirectUri: 'https://example.com/callback',
    clientId: 'google-client',
  })
  assertStringIncludes(url, 'https://accounts.google.com/o/oauth2/v2/auth')
  assertStringIncludes(decodeURIComponent(url), 'https://www.googleapis.com/auth/business.manage')
  assertStringIncludes(url, 'access_type=offline')
  assertStringIncludes(url, 'include_granted_scopes=true')
})

it('maps OAuth failures to operational states', () => {
  assertEquals(normalizeOAuthFailureStatus(401, { error: 'invalid_grant' }), 'needs_reauth')
  assertEquals(normalizeOAuthFailureStatus(403, { error: 'insufficient_permissions' }), 'needs_reauth')
  assertEquals(normalizeOAuthFailureStatus(500, { error: 'provider_down' }), 'failed')
})

it('returns exact scopes by provider', () => {
  assertEquals(scopesForMarketingProvider('google_ads'), ['https://www.googleapis.com/auth/adwords'])
})

it('exchanges Google OAuth codes without leaking tokens into sanitized payload', async () => {
  const fetcher = async (_url: string | URL | Request, init?: RequestInit) => {
    assertEquals(init?.method, 'POST')
    assertStringIncludes(String(init?.body), 'grant_type=authorization_code')
    return new Response(JSON.stringify({
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      expires_in: 3600,
      scope: 'https://www.googleapis.com/auth/adwords',
      token_type: 'Bearer',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }

  const token = await exchangeMarketingOAuthCode({
    provider: 'google_ads',
    code: 'code-1',
    redirectUri: 'https://example.com/callback',
    clientId: 'client',
    clientSecret: 'secret',
    fetcher,
  })

  assertEquals(token.accessToken, 'access-secret')
  assertEquals(token.refreshToken, 'refresh-secret')
  assertEquals(token.scopes, ['https://www.googleapis.com/auth/adwords'])
  assert(!JSON.stringify(token.sanitizedPayload).includes('access-secret'), 'sanitized payload leaked access token')
})

it('lists Meta social assets as Facebook Pages and Instagram business accounts', async () => {
  const fetcher = async () => new Response(JSON.stringify({
    data: [{
      id: 'page-1',
      name: 'YUX Page',
      access_token: 'page-token',
      tasks: ['CREATE_CONTENT'],
      instagram_business_account: { id: 'ig-1', username: 'yux' },
    }],
  }), { status: 200, headers: { 'Content-Type': 'application/json' } })

  const assets = await listMarketingProviderAssets({
    provider: 'meta_social',
    accessToken: 'user-token',
    fetcher,
  })

  assertEquals(assets.map(asset => [asset.assetKind, asset.externalId, asset.parentExternalId || null]), [
    ['facebook_page', 'page-1', null],
    ['instagram_business', 'ig-1', 'page-1'],
  ])
  assert(!JSON.stringify(assets).includes('page-token'), 'assets leaked page token in metadata')
})

it('lists Google Ads customers with configurable API version', async () => {
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => {
    assertStringIncludes(String(url), 'https://googleads.googleapis.com/v22/customers:listAccessibleCustomers')
    assertEquals(init?.headers, {
      Authorization: 'Bearer ads-token',
      'developer-token': 'developer-token',
    })
    return new Response(JSON.stringify({ resourceNames: ['customers/1234567890'] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const assets = await listMarketingProviderAssets({
    provider: 'google_ads',
    accessToken: 'ads-token',
    googleAdsDeveloperToken: 'developer-token',
    googleAdsApiVersion: 'v22',
    fetcher,
  })

  assertEquals(assets.map(asset => [asset.assetKind, asset.externalId]), [
    ['google_ads_customer', '1234567890'],
  ])
})

it('sanitizes nested OAuth payload secrets', () => {
  assertEquals(sanitizeOAuthPayload({
    access_token: 'access-secret',
    nested: { refreshToken: 'refresh-secret', ok: true },
  }), {
    access_token: '[redacted]',
    nested: { refreshToken: '[redacted]', ok: true },
  })
})
