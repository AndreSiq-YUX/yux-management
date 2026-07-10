import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'

const env = {
  NODE_ENV: 'test' as const, PORT: 4000, DATABASE_URL: 'postgresql://test', REDIS_URL: 'redis://test',
  SESSION_COOKIE_NAME: 'yux_session', SESSION_SECRET: 'a'.repeat(32), CORS_ORIGIN: 'http://localhost:3000',
}

const queue: AppJobQueue = { add: async () => ({ id: 'job-1' }), close: async () => undefined }
let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

describe('health routes', () => {
  it('reports ready only when PostgreSQL and Redis respond', async () => {
    const pool = { query: async () => ({ rows: [{ '?column?': 1 }] }), end: async () => undefined }
    app = await buildServer(env, { pool: pool as never, jobQueue: queue, redisPing: async () => 'PONG' })
    expect((await app.inject('/api/health/ready')).statusCode).toBe(200)
  })

  it('reports unavailable when Redis is down while liveness remains available', async () => {
    const pool = { query: async () => ({ rows: [] }), end: async () => undefined }
    app = await buildServer(env, { pool: pool as never, jobQueue: queue, redisPing: async () => { throw new Error('redis_down') } })
    expect((await app.inject('/api/health/live')).statusCode).toBe(200)
    expect((await app.inject('/api/ready')).statusCode).toBe(503)
  })
})
