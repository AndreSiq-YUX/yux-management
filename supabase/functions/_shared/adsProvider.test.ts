import {
  buildProviderMutationIdempotencyKey,
  buildProviderMutationResponse,
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
