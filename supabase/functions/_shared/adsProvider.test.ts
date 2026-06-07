import {
  buildGoogleAdsCampaignMutateOperations,
  buildMetaCampaignRequests,
  buildProviderMutationIdempotencyKey,
  buildProviderMutationResponse,
  executeProviderAdapter,
  rejectNeedsReauthConnection,
  sanitizeProviderError,
} from './adsProvider.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function assert(condition: unknown, message = 'Assertion failed') {
  if (!condition) throw new Error(message)
}

Deno.test('builds provider mutation idempotency keys', () => {
  assertEquals(buildProviderMutationIdempotencyKey({
    provider: 'meta',
    localMutationId: 'mutation-1',
    action: 'create_campaign',
  }), 'meta:create_campaign:mutation-1')
})

Deno.test('sanitizes protected provider errors', () => {
  assertEquals(sanitizeProviderError(new Error('token abc123 failed')).includes('abc123'), false)
})

Deno.test('normalizes provider mutation responses without raw credentials', () => {
  const response = buildProviderMutationResponse({
    provider: 'google',
    action: 'update_budget',
    localMutationId: 'mutation-2',
    ok: true,
    externalCampaignId: 'external-1',
    raw: { access_token: 'secret', budget: 100 },
  })

  assertEquals(response.idempotencyKey, 'google:update_budget:mutation-2')
  assertEquals(response.status, 'succeeded')
  assert(!JSON.stringify(response).includes('secret'), 'response leaked protected provider value')
})

Deno.test('rejects provider connections that need reauth', () => {
  assertEquals(rejectNeedsReauthConnection({ status: 'connected' }), false)
  assertEquals(rejectNeedsReauthConnection({ status: 'needs_reauth' }), true)
})

Deno.test('builds Meta campaign creation requests', () => {
  const requests = buildMetaCampaignRequests({
    graphVersion: 'v20.0',
    accessToken: 'token',
    adAccountId: 'act_123',
    campaign: {
      name: 'Campanha aprovada',
      objective: 'lead_generation',
      dailyBudget: 50,
      landingPageUrl: 'https://example.com',
      headline: 'Fale com a YUX',
      body: 'Campanha aprovada',
    },
  })

  assertEquals(requests[0].url, 'https://graph.facebook.com/v20.0/act_123/campaigns')
  assertEquals(requests[0].body?.status, 'PAUSED')
  assertEquals(requests[0].body?.special_ad_categories, '[]')
  assertEquals(requests[1].body?.daily_budget, 5000)
})

Deno.test('builds Google Ads mutate operations for campaign activation draft', () => {
  const operations = buildGoogleAdsCampaignMutateOperations({
    customerId: '1234567890',
    campaign: {
      name: 'Campanha aprovada',
      objective: 'lead_generation',
      dailyBudgetMicros: 50_000_000,
      landingPageUrl: 'https://example.com',
      headline: 'Fale com a YUX',
      body: 'Campanha aprovada',
    },
  })

  assertEquals(operations.some(operation => 'campaignBudgetOperation' in operation), true)
  assertEquals(operations.some(operation => 'campaignOperation' in operation), true)
  assertEquals(operations.some(operation => 'adGroupOperation' in operation), true)
  assertEquals(operations.some(operation => 'adGroupAdOperation' in operation), true)
})

Deno.test('executes Meta create campaign requests without stub responses', async () => {
  const ids = ['campaign-1', 'adset-1', 'creative-1', 'ad-1']
  const fetcher = async () => new Response(JSON.stringify({ id: ids.shift() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })

  const response = await executeProviderAdapter({
    provider: 'meta',
    action: 'create_campaign',
    localMutationId: 'mutation-3',
    requestPayload: {
      accessToken: 'token-secret',
      adAccountId: '123',
      campaign: {
        name: 'Campanha aprovada',
        objective: 'lead_generation',
        dailyBudget: 50,
        landingPageUrl: 'https://example.com',
        headline: 'Fale com a YUX',
        body: 'Campanha aprovada',
      },
    },
    fetcher,
  })

  assertEquals(response.status, 'succeeded')
  assertEquals(response.externalCampaignId, 'campaign-1')
  assert(!JSON.stringify(response).includes('provider_adapter_stub'), 'adapter returned stub mode')
  assert(!JSON.stringify(response).includes('token-secret'), 'response leaked access token')
})
