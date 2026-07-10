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
  dataQuery: { sql: string; params: unknown[] } | null = null

  async query(sql: string, params: unknown[] = []) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [{ organization_id: ids.orgA }] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
    if (sql.includes('FROM public."')) {
      this.dataQuery = { sql, params }
      return { rows: [{ id: 'campaign-a', organization_id: ids.orgA }] }
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() {
    return undefined
  }
}

const ids = {
  orgA: '00000000-0000-4000-8000-000000000001',
  orgB: '00000000-0000-4000-8000-000000000002',
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
  authStore.user = { id: `user-${role}`, email: `${role}@example.com`, name: role, role }
  return { authStore, token }
}

function headers(token: string) {
  return { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` }
}

describe('tenant-scoped module queries', () => {
  it('replaces a forged campaign organization filter with the server context', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    const pool = new FakePool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/campaigns/query',
      headers: headers(token),
      payload: {
        table: 'campaigns',
        operation: 'select',
        filters: [{ op: 'eq', column: 'organization_id', value: ids.orgB }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json().data).toEqual([{ id: 'campaign-a', organization_id: ids.orgA }])
    expect(pool.dataQuery?.params).toEqual([[ids.orgA]])
  })

  it('rejects a campaign insert with another organization ID', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/campaigns/query',
      headers: headers(token),
      payload: {
        table: 'campaigns',
        operation: 'insert',
        values: { organization_id: ids.orgB, name: 'Cross-tenant attempt' },
      },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })

  it.each([
    ['/api/crm/conversation-query', 'leads'],
    ['/api/marketing-studio/query', 'content_items'],
    ['/api/landing-pages/query', 'landing_pages'],
    ['/api/ai-assistant/query', 'ai_assistants'],
  ])('enforces the server organization scope for %s', async (url, table) => {
    const { authStore, token } = authenticatedStore('client_admin')
    const pool = new FakePool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url,
      headers: headers(token),
      payload: {
        table,
        operation: 'select',
        filters: [{ op: 'eq', column: 'organization_id', value: ids.orgB }],
      },
    })

    expect(response.statusCode).toBe(200)
    expect(pool.dataQuery?.params).toEqual([[ids.orgA]])
  })

  it('rejects a client query on an indirect omnichannel table', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/omnichannel/query',
      headers: headers(token),
      payload: { table: 'conversation_tags', operation: 'select' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })

  it.each([
    ['GET', '/api/workspace/dashboard/stats', undefined],
    ['GET', '/api/workspace/clients', undefined],
    ['POST', '/api/workspace/growth-query', { table: 'growth_campaign_plans', operation: 'select' }],
  ])('rejects client access to internal workspace route %s %s', async (method, url, payload) => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({ method: method as 'GET' | 'POST', url, headers: headers(token), payload })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })

  it('rejects client access to the internal strategy engine', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/strategy-engine/query',
      headers: headers(token),
      payload: { table: 'organizations', operation: 'select' },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })
})
