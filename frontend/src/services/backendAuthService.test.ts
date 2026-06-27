import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiClientError } from '@/lib/apiClient'
import { backendLogin, backendLogout, backendMe } from './backendAuthService'

const fetchMock = vi.fn()

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
}

describe('backendAuthService', () => {
  afterEach(() => {
    fetchMock.mockReset()
    vi.unstubAllGlobals()
  })

  it('logs in through the backend auth endpoint with cookie credentials', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: 'user-1',
          email: 'admin@yux.com.br',
          displayName: 'Admin YUX',
          name: 'Admin YUX',
          role: 'yux_admin',
        },
      }),
    )

    await expect(backendLogin('admin@yux.com.br', 'correct-password')).resolves.toEqual({
      user: {
        id: 'user-1',
        email: 'admin@yux.com.br',
        name: 'Admin YUX',
        role: 'admin',
      },
      token: 'cookie-session',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', {
      method: 'POST',
      headers: expect.any(Headers),
      body: JSON.stringify({ email: 'admin@yux.com.br', password: 'correct-password' }),
      credentials: 'include',
    })
  })

  it('loads the current user through the backend me endpoint with cookie credentials', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        user: {
          id: 'user-2',
          email: 'manager@yux.com.br',
          displayName: 'Gerente YUX',
          name: 'Gerente YUX',
          role: 'yux_operator',
        },
      }),
    )

    await expect(backendMe()).resolves.toEqual({
      user: {
        id: 'user-2',
        email: 'manager@yux.com.br',
        name: 'Gerente YUX',
        role: 'manager',
      },
      token: 'cookie-session',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/me', {
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('logs out through the backend logout endpoint with cookie credentials', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ ok: true }))

    await expect(backendLogout()).resolves.toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/logout', {
      method: 'POST',
      headers: expect.any(Headers),
      credentials: 'include',
    })
  })

  it('raises ApiClientError when the backend rejects the request', async () => {
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'not_authenticated' }, { status: 401 }))

    await expect(backendMe()).rejects.toBeInstanceOf(ApiClientError)
  })
})
