import { ApiClientError, apiRequest } from '@/lib/apiClient'

export type AuthRole = 'admin' | 'manager' | 'client'

export interface AuthenticatedUser {
  id: string
  name: string
  email: string
  role: AuthRole
}

interface BackendAuthUser {
  id: string
  email: string
  displayName?: string
  name?: string
  role: 'yux_admin' | 'yux_operator' | 'client_admin' | 'client_member' | string
}

interface BackendAuthResponse {
  user: BackendAuthUser
}

export function mapBackendRole(role: BackendAuthUser['role']): AuthRole {
  if (role === 'yux_admin') return 'admin'
  if (role === 'yux_operator') return 'manager'
  return 'client'
}

function mapBackendUser(user: BackendAuthUser): AuthenticatedUser {
  return {
    id: user.id,
    name: user.displayName || user.name || user.email,
    email: user.email,
    role: mapBackendRole(user.role),
  }
}

export async function backendLogin(email: string, password: string) {
  const response = await apiRequest<BackendAuthResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
  })

  return {
    user: mapBackendUser(response.user),
    token: 'cookie-session',
  }
}

export async function backendLogout() {
  return apiRequest<{ ok: boolean }>('/auth/logout', {
    method: 'POST',
  })
}

export async function backendMe() {
  const response = await apiRequest<BackendAuthResponse>('/auth/me')

  return {
    user: mapBackendUser(response.user),
    token: 'cookie-session',
  }
}

export async function setInvitationPassword(token: string, password: string) {
  return apiRequest<{ ok: boolean }>('/auth/invitations/set-password', {
    method: 'POST',
    body: { token, password },
  })
}

export function isNotAuthenticatedError(error: unknown) {
  if (!(error instanceof ApiClientError)) return false
  if (error.status !== 401) return false
  if (!error.body || typeof error.body !== 'object') return false

  return (error.body as { error?: unknown }).error === 'not_authenticated'
}
