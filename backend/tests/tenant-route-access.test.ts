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

const ids = {
  orgA: '00000000-0000-4000-8000-000000000001',
  orgB: '00000000-0000-4000-8000-000000000002',
  contractA: '00000000-0000-4000-8000-000000000003',
}

class FakeAuthStore implements AuthStore {
  sessionHash: string | null = null
  user: AuthUser | null = null

  async findActiveUserByEmail() { return null }
  async createSession() { return undefined }
  async deleteSession() { return undefined }
  async findUserBySession(sessionTokenHash: string) { return sessionTokenHash === this.sessionHash ? this.user : null }
}

class FakePool {
  async query(sql: string) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [{ organization_id: ids.orgA }] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
    if (sql.includes('FROM public.contracts c') && sql.includes('organization_id')) return { rows: [{ organization_id: ids.orgA }] }
    if (sql.includes('FROM public.campaigns') && sql.includes('WHERE contract_id')) {
      return { rows: [{ id: 'campaign-1', organization_id: ids.orgA, name: 'Campanha segura' }] }
    }
    if (sql.includes('FROM public.invoices')) return { rows: [] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  async end() { return undefined }
}

const jobQueue: AppJobQueue = {
  async add() { return { id: 'job-1' } },
  async close() { return undefined },
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

describe('tenant-scoped domain routes', () => {
  it.each([
    ['/api/finance/invoices', 'organizationId'],
    ['/api/support/tickets', 'organizationId'],
  ])('requires %s clients to provide %s', async (url) => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({ method: 'GET', url, headers: headers(token) })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({ error: 'organization_id_required' })
  })

  it.each([
    ['/api/finance/invoices', `?organizationId=${ids.orgB}`],
    ['/api/support/tickets', `?organizationId=${ids.orgB}`],
    [`/api/reports/operational-data/${ids.orgB}`, ''],
  ])('rejects a client attempting to read another organization from %s', async (path, query) => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({ method: 'GET', url: `${path}${query}`, headers: headers(token) })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })

  it('keeps unfiltered invoice lists available to internal YUX operators', async () => {
    const { authStore, token } = authenticatedStore('yux_operator')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({ method: 'GET', url: '/api/finance/invoices', headers: headers(token) })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([])
  })

  it('serves portal campaign DTOs without internal execution fields', async () => {
    const { authStore, token } = authenticatedStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'GET',
      url: `/api/campaigns/portal/campaigns?contractId=${ids.contractA}`,
      headers: headers(token),
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()[0]).toMatchObject({ id: 'campaign-1', name: 'Campanha segura' })
    expect(response.json()[0]).not.toHaveProperty('protected_error')
    expect(response.json()[0]).not.toHaveProperty('execution_logs')
  })
})
