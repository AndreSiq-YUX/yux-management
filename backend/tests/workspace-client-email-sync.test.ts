import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
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

const clientId = '10000000-0000-4000-8000-000000000001'
const portalUserId = '20000000-0000-4000-8000-000000000001'

class FakeAuthStore implements AuthStore {
  user: AuthUser | null = null
  sessionHash: string | null = null

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
    return this.user && sessionTokenHash === this.sessionHash ? this.user : null
  }
}

type FakeUser = {
  id: string
  email: string
  display_name: string
}

class FakeWorkspacePool {
  client = {
    id: clientId,
    user_id: portalUserId,
    company_name: 'YUXQuant',
    contact_name: 'Andre Siqueira',
    email: 'andresiq02@gmail.com',
    phone: null,
    website: 'https://yuxquant.com',
    sector: 'Marketing',
    size: 'small',
    lead_source: 'referral',
    status: 'prospect',
    created_at: '2026-07-31T12:00:00.000Z',
    updated_at: '2026-07-31T12:00:00.000Z',
  }

  users: FakeUser[] = [{
    id: portalUserId,
    email: 'andresiq02@gmail.com',
    display_name: 'Andre Siqueira',
  }]

  committed = false
  rolledBack = false
  released = false
  lastUnexpectedSql = ''

  async connect() {
    return this
  }

  async query(sql: string, params: unknown[] = []) {
    if (sql === 'BEGIN') return { rows: [], rowCount: null }
    if (sql === 'COMMIT') {
      this.committed = true
      return { rows: [], rowCount: null }
    }
    if (sql === 'ROLLBACK') {
      this.rolledBack = true
      return { rows: [], rowCount: null }
    }
    if (sql.includes('FROM public.memberships')) return { rows: [], rowCount: 0 }
    if (sql.includes('FROM public.contract_modules')) return { rows: [], rowCount: 0 }

    if (sql.includes('FROM public.clients c') && sql.includes('FOR UPDATE OF c')) {
      return {
        rows: [{
          ...this.client,
          portal_user_id: this.users.find((user) => user.id === this.client.user_id)?.id ?? null,
        }],
        rowCount: 1,
      }
    }

    if (sql.includes('FROM app_users') && sql.includes('WHERE id = $1') && sql.includes('FOR UPDATE')) {
      const user = this.users.find((item) => item.id === params[0])
      return { rows: user ? [{ ...user }] : [], rowCount: user ? 1 : 0 }
    }

    if (sql.includes('FROM app_users') && sql.includes('lower(email) = lower($1)')) {
      const email = String(params[0]).toLowerCase()
      const excludedId = params[1]
      const user = this.users.find((item) => item.email.toLowerCase() === email && item.id !== excludedId)
      return { rows: user ? [{ id: user.id }] : [], rowCount: user ? 1 : 0 }
    }

    if (sql.includes('UPDATE app_users') && sql.includes('SET email = $1')) {
      const user = this.users.find((item) => item.id === params[2])
      if (!user) return { rows: [], rowCount: 0 }
      user.email = String(params[0])
      user.display_name = String(params[1])
      return { rows: [{ ...user }], rowCount: 1 }
    }

    if (sql.startsWith('UPDATE public.clients SET')) {
      const assignments = sql.match(/SET (.+) WHERE/)?.[1].split(', ') ?? []
      assignments.forEach((assignment, index) => {
        const column = assignment.split(' = ')[0] as keyof typeof this.client
        ;(this.client[column] as unknown) = params[index]
      })
      this.client.updated_at = '2026-07-31T13:00:00.000Z'
      return { rows: [{ ...this.client }], rowCount: 1 }
    }

    this.lastUnexpectedSql = sql
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  release() {
    this.released = true
  }

  async end() {
    return undefined
  }
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

function authenticatedStore() {
  const token = 'workspace-session-token'
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = {
    id: 'admin-user',
    email: 'admin@yux.com.br',
    name: 'Admin YUX',
    role: 'yux_admin',
  }
  return { authStore, token }
}

describe('workspace client email synchronization', () => {
  it('updates the linked portal account in the same transaction', async () => {
    const pool = new FakeWorkspacePool()
    const { authStore, token } = authenticatedStore()
    app = await buildServer(testEnv, { authStore, pool: pool as never })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/workspace/clients/${clientId}`,
      headers: { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` },
      payload: {
        email: ' support@yuxquant.com ',
        contactName: 'Andre Siqueira',
      },
    })

    expect(response.statusCode, `${response.body}\n${pool.lastUnexpectedSql}`).toBe(200)
    expect(response.json().client.email).toBe('support@yuxquant.com')
    expect(pool.users[0].email).toBe('support@yuxquant.com')
    expect(pool.committed).toBe(true)
    expect(pool.rolledBack).toBe(false)
    expect(pool.released).toBe(true)
  })

  it('rejects an email already used by another portal account', async () => {
    const pool = new FakeWorkspacePool()
    pool.users.push({
      id: '20000000-0000-4000-8000-000000000002',
      email: 'support@yuxquant.com',
      display_name: 'Other user',
    })
    const { authStore, token } = authenticatedStore()
    app = await buildServer(testEnv, { authStore, pool: pool as never })

    const response = await app.inject({
      method: 'PATCH',
      url: `/api/workspace/clients/${clientId}`,
      headers: { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` },
      payload: { email: 'SUPPORT@yuxquant.com' },
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({ success: false, error: 'client_login_email_already_exists' })
    expect(pool.client.email).toBe('andresiq02@gmail.com')
    expect(pool.users[0].email).toBe('andresiq02@gmail.com')
    expect(pool.committed).toBe(false)
    expect(pool.rolledBack).toBe(true)
  })
})
