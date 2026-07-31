import { describe, expect, it } from 'vitest'
import { ApiClientError, rethrowAuthorizationError } from './apiClient'

describe('rethrowAuthorizationError', () => {
  it.each([401, 403])('propagates HTTP %i instead of turning it into an empty query result', (status) => {
    const error = new ApiClientError(new Response(null, { status, statusText: 'forbidden' }), { error: 'forbidden' })
    expect(() => rethrowAuthorizationError(error)).toThrow(error)
  })

  it('keeps non-authorization errors available to structured query clients', () => {
    const error = new ApiClientError(new Response(null, { status: 500, statusText: 'server error' }), { error: 'internal_error' })
    expect(() => rethrowAuthorizationError(error)).not.toThrow()
  })
})
