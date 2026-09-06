import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError, apiBinaryRequest, rethrowAuthorizationError } from './apiClient'

afterEach(() => vi.unstubAllGlobals())

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

describe('apiBinaryRequest', () => {
  it('envia os bytes sem serializar o arquivo como JSON', async () => {
    const file = new File(['arquivo real'], 'guia.txt', { type: 'text/plain' })
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.method).toBe('PUT')
      expect(init?.body).toBe(file)
      expect(new Headers(init?.headers).get('Content-Type')).toBe('application/octet-stream')
      return new Response(JSON.stringify({ status: 'queued' }), {
        status: 202,
        headers: { 'content-type': 'application/json' },
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiBinaryRequest('/strategy-engine/ingestions/id/file', file)).resolves.toEqual({ status: 'queued' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
