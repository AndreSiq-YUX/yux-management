import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore } from '../src/auth/routes.js'
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

const authStore: AuthStore = {
  async findActiveUserByEmail() {
    return null
  },
  async createSession() {
    return undefined
  },
  async deleteSession() {
    return undefined
  },
  async findUserBySession() {
    return null
  },
}

const pool = {
  async query() {
    return { rows: [] }
  },
  async end() {
    return undefined
  },
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

describe('rate limiting', () => {
  it('rejects the eleventh login attempt from the same IP', async () => {
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue })

    const responses = []
    for (let index = 0; index < 11; index += 1) {
      responses.push(await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: {},
      }))
    }

    expect(responses.slice(0, 10).map((response) => response.statusCode)).toEqual(Array(10).fill(400))
    expect(responses[10].statusCode).toBe(429)
  })
})
