import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from '../src/server.js'
import type { AppJobQueue } from '../src/server.js'

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'http://localhost:3000',
}

let app: FastifyInstance | undefined
const pool = { query: async () => ({ rows: [{ ok: 1 }] }), end: async () => undefined }
const queue: AppJobQueue = { add: async () => ({ id: 'job-1' }), close: async () => undefined }

afterEach(async () => {
  await app?.close()
  app = undefined
})

describe('health routes', () => {
  it('returns health status', async () => {
    app = await buildServer(testEnv, { pool: pool as never, jobQueue: queue, redisPing: async () => 'PONG' })

    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok', service: 'yux-backend-api' })
  })

  it('returns readiness status', async () => {
    app = await buildServer(testEnv, { pool: pool as never, jobQueue: queue, redisPing: async () => 'PONG' })

    const response = await app.inject({ method: 'GET', url: '/api/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ready', service: 'yux-backend-api' })
  })
})
