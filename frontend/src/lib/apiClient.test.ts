import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, apiRequest } from './apiClient'

describe('apiRequest', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('rejects successful non-JSON responses from the API path', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<!doctype html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    })))

    await expect(apiRequest('/platform/admin/provider-connections')).rejects.toMatchObject({
      name: 'ApiClientError',
      message: 'API returned a non-JSON response',
    } satisfies Partial<ApiClientError>)
  })
})
