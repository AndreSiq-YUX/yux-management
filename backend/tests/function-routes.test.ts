import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'

const testEnv = {
  NODE_ENV: 'test' as const, PORT: 4000, DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379', SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars', CORS_ORIGIN: 'http://localhost:3000',
}
const ids = {
  orgA: '00000000-0000-4000-8000-000000000001',
  orgB: '00000000-0000-4000-8000-000000000002',
  campaign: '00000000-0000-4000-8000-000000000003',
}

class FakeAuthStore implements AuthStore {
  user: AuthUser | null = null
  sessionHash: string | null = null
  async findActiveUserByEmail() { return null }
  async createSession() { return undefined }
  async deleteSession() { return undefined }
  async findUserBySession(value: string) { return value === this.sessionHash ? this.user : null }
}

class FakePool {
  constructor(private readonly campaignOrganization = ids.orgA) {}
  async query(sql: string) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [{ organization_id: ids.orgA }] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
    if (sql.includes('FROM public.campaigns')) return { rows: [{ organization_id: this.campaignOrganization }] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  async end() { return undefined }
}

class FakeQueue implements AppJobQueue {
  jobs: Array<{ name: string; data: Record<string, unknown> }> = []
  async add(name: never, data: Record<string, unknown>) { this.jobs.push({ name, data }); return { id: 'job-1' } }
  async close() { return undefined }
}

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

function authentication(role: AuthUser['role']) {
  const token = `session-${role}`
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = { id: `user-${role}`, email: `${role}@example.com`, name: role, role }
  return { authStore, token }
}
function headers(token: string) { return { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` } }

describe('function route authorization', () => {
  it('rejects function names outside the explicit allowlist', async () => {
    const { authStore, token } = authentication('yux_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue: new FakeQueue() })
    const response = await app.inject({ method: 'POST', url: '/api/functions/untrusted-job', headers: headers(token), payload: { body: {} } })
    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({ error: 'function_not_found' })
  })

  it('rejects client members from client-admin functions', async () => {
    const { authStore, token } = authentication('client_member')
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue: new FakeQueue() })
    const response = await app.inject({
      method: 'POST', url: '/api/functions/execute-ad-provider-mutation', headers: headers(token),
      payload: { body: { organizationId: ids.orgA } },
    })
    expect(response.statusCode).toBe(403)
  })

  it('rejects a function whose resolved campaign belongs to another organization', async () => {
    const { authStore, token } = authentication('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakePool(ids.orgB) as never, jobQueue: new FakeQueue() })
    const response = await app.inject({
      method: 'POST', url: '/api/functions/sync-ad-metrics', headers: headers(token),
      payload: { body: { campaignId: ids.campaign } },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })

  it('queues only a membership-validated organization context', async () => {
    const { authStore, token } = authentication('client_admin')
    const queue = new FakeQueue()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue: queue })
    const response = await app.inject({
      method: 'POST', url: '/api/functions/execute-ad-provider-mutation', headers: headers(token),
      payload: { body: { organizationId: ids.orgA, campaignId: ids.campaign } },
    })
    expect(response.statusCode).toBe(200)
    expect(queue.jobs[0]?.data).toMatchObject({ requestedBy: 'user-client_admin', organizationId: ids.orgA })
  })
})
