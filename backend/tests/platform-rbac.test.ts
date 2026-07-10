import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'http://localhost:3000',
}

class FakeAuthStore implements AuthStore {
  sessionHash: string | null = null
  user: AuthUser | null = null

  async findActiveUserByEmail() {
    return null
  }

  async createSession() {
    return undefined
  }

  async deleteSession() {
    return undefined
  }

  async findUserBySession(sessionTokenHash: string) {
    return this.sessionHash === sessionTokenHash ? this.user : null
  }
}

class FakePool {
  async query(sql: string) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [{ organization_id: 'org-1' }] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
    if (sql.includes('FROM public.platform_provider_connections')) return { rows: [] }
    if (sql.includes('FROM public.organizations')) {
      return {
        rows: [
          organizationRow('org-1', 'Cliente A'),
          organizationRow('org-2', 'Cliente B'),
        ],
      }
    }
    if (sql.includes('FROM public.memberships')) return { rows: [{ id: 'membership-1', user_id: 'user-client_admin', organization_id: 'org-1', role_key: 'client_admin', created_at: '2026-01-01', updated_at: '2026-01-01' }] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() {
    return undefined
  }
}

const jobQueue: AppJobQueue = {
  async add() {
    return { id: 'job-1' }
  },
  async close() {
    return undefined
  },
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

function organizationRow(id: string, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(' ', '-'),
    kind: 'client',
    client_id: `client-${id}`,
    is_internal_growth_workspace: false,
    workspace_purpose: 'client_delivery',
    strategy_pack_scope: 'client',
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  }
}

function authenticatedStore(role: AuthUser['role']) {
  const token = `session-${role}`
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = {
    id: `user-${role}`,
    email: `${role}@example.com`,
    name: role,
    role,
  }
  return { authStore, token }
}

function cookie(token: string) {
  return { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` }
}

describe('platform route RBAC', () => {
  it('rejects client administrators from the global platform admin surface', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({ method: 'GET', url: '/api/platform/admin/provider-connections', headers: cookie(token) })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })

  it('allows YUX administrators to read the global platform admin surface', async () => {
    const { authStore, token } = authenticatedStore('yux_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({ method: 'GET', url: '/api/platform/admin/provider-connections', headers: cookie(token) })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('limits a client administrator to organizations in their request context', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({ method: 'GET', url: '/api/platform/organizations', headers: cookie(token) })

    expect(response.statusCode).toBe(200)
    expect(response.json().map((organization: { id: string }) => organization.id)).toEqual(['org-1'])
  })

  it('rejects a client administrator reading another user membership list', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'GET',
      url: '/api/platform/users/00000000-0000-4000-8000-000000000002/memberships',
      headers: cookie(token),
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })
})
