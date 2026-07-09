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
    return this.sessionHash === sessionTokenHash ? this.user : null
  }
}

class FakePool {
  async query(sql: string) {
    if (sql.includes('FROM public.memberships')) {
      return { rows: [{ organization_id: 'org-1' }] }
    }
    if (sql.includes('FROM public.contract_modules')) {
      return { rows: [{ module_key: 'crm' }] }
    }
    return { rows: [], rowCount: 0 }
  }

  async end() {
    return undefined
  }
}

const noopQueue: AppJobQueue = {
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

describe('request context plugin', () => {
  it('keeps the context null without a session cookie', async () => {
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never, jobQueue: noopQueue })
    app.get('/test/context', async (request) => ({ ctx: request.ctx }))

    const response = await app.inject({ method: 'GET', url: '/test/context' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ctx: null })
  })

  it('loads role, memberships, and enabled modules once for a valid session', async () => {
    const authStore = new FakeAuthStore()
    const token = 'valid-session-token'
    authStore.sessionHash = hashSessionToken(token)
    authStore.user = {
      id: 'user-1',
      email: 'client@example.com',
      name: 'Client Admin',
      role: 'client_admin',
    }

    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue: noopQueue })
    app.get('/test/context', async (request) => ({ ctx: request.ctx }))

    const response = await app.inject({
      method: 'GET',
      url: '/test/context',
      headers: { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      ctx: {
        userId: 'user-1',
        role: 'client_admin',
        organizationIds: ['org-1'],
        enabledModuleKeys: ['crm'],
      },
    })
  })

  it('returns a sanitized response for unexpected errors', async () => {
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never, jobQueue: noopQueue })
    app.get('/test/error', async () => {
      throw new Error('database password leaked')
    })

    const response = await app.inject({ method: 'GET', url: '/test/error' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ error: 'internal_error' })
  })

})
