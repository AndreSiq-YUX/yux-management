import { beforeEach, describe, expect, it, vi } from 'vitest'

const authService = vi.hoisted(() => ({
  backendMe: vi.fn(),
  backendLogin: vi.fn(),
  backendLogout: vi.fn(),
  isNotAuthenticatedError: vi.fn(),
}))

vi.mock('@/services/backendAuthService', () => ({
  backendMe: authService.backendMe,
  backendLogin: authService.backendLogin,
  backendLogout: authService.backendLogout,
  isNotAuthenticatedError: authService.isNotAuthenticatedError,
}))

import { useAuthStore } from './authStore'

describe('authStore session initialization', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    useAuthStore.setState({
      user: {
        id: 'stale-user',
        name: 'Sessao antiga',
        email: 'admin@yux.com.br',
        role: 'admin',
      },
      token: 'cookie-session',
      isAuthenticated: true,
      isLoading: false,
      isSessionResolved: false,
    })
  })

  it('clears persisted authentication when the server session is no longer valid', async () => {
    const sessionError = new Error('not_authenticated')
    authService.backendMe.mockRejectedValueOnce(sessionError)
    authService.isNotAuthenticatedError.mockReturnValueOnce(true)

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      isSessionResolved: true,
    })
  })

  it('keeps the authenticated user only after the server validates the session', async () => {
    authService.backendMe.mockResolvedValueOnce({
      user: {
        id: 'user-1',
        name: 'Andre YUX',
        email: 'admin@yux.com.br',
        role: 'admin',
      },
      token: 'cookie-session',
    })

    await useAuthStore.getState().initialize()

    expect(useAuthStore.getState()).toMatchObject({
      user: {
        id: 'user-1',
        email: 'admin@yux.com.br',
      },
      isAuthenticated: true,
      isSessionResolved: true,
    })
  })
})
