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
    return sessionTokenHash === this.sessionHash ? this.user : null
  }
}

class FakePool {
  async query(sql: string) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [{ organization_id: 'org-1' }] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [{ module_key: 'crm' }] }
    if (sql.includes('FROM public."organizations"')) return { rows: [{ id: 'org-1', name: 'Cliente Demo' }] }
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

function queryRequest(token: string, table: string) {
  return {
    method: 'POST' as const,
    url: '/api/data/query',
    headers: { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` },
    payload: { table, operation: 'select' },
  }
}

describe('generic data query route', () => {
  it('rejects a client administrator before executing a query', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject(queryRequest(token, 'organizations'))

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })

  it('rejects sensitive tables even for a YUX administrator', async () => {
    const { authStore, token } = authenticatedStore('yux_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject(queryRequest(token, 'app_sessions'))

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'data_query_table_forbidden' })
  })

  it('allows a YUX administrator to query an allowlisted internal table', async () => {
    const { authStore, token } = authenticatedStore('yux_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject(queryRequest(token, 'organizations'))

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      data: [{ id: 'org-1', name: 'Cliente Demo' }],
      error: null,
      count: null,
    })
  })
})
