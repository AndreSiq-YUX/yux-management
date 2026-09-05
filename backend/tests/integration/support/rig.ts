import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { promisify } from 'node:util'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { buildServer, type AppJobQueue } from '../../../src/server.js'
import { loadEnv } from '../../../src/config/env.js'
import { createJobProcessor } from '../../../src/jobs/processor.js'
import { DEFAULT_QUEUE_NAME, createIdempotencyKey, createQueue, createRedisConnection, createWorker, type JobName, type QueueJobData } from '../../../src/jobs/queue.js'
import { applyMigrations } from '../../../scripts/apply-migrations.js'
import { fixtureIds, fixturePassword, fixtureUsers, seedIntegrationFixtures } from './fixtures.js'
import { createTestProviderServer, type ProviderCall } from './provider-server.js'

const execFileAsync = promisify(execFile)

export type TestRole = keyof typeof fixtureUsers
export type TestResponse = { statusCode: number; body: any }

export type IntegrationRig = {
  ids: {
    organizationA: string
    organizationB: string
    internalOrg: string
    contractA: string
    contractB: string
    documentA: string
    missionA: string
  }
  request(role: TestRole, method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE', url: string, body?: unknown): Promise<TestResponse>
  sql(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>
  workerTick(): Promise<void>
  restartApi(): Promise<void>
  stopRedis(): Promise<void>
  startRedis(): Promise<void>
  providerCalls(): Promise<ProviderCall[]>
  close(): Promise<void>
}

export async function createIntegrationRig(): Promise<IntegrationRig> {
  const databaseUrl = process.env.YUX_INTEGRATION_DATABASE_URL
    || 'postgresql://yux_test:yux_test_password@127.0.0.1:55432/yux_test_integration'
  const redisUrl = process.env.YUX_INTEGRATION_REDIS_URL
    || 'redis://:yux_test_redis_password@127.0.0.1:56379/0'
  assertSafeIntegrationDatabase(databaseUrl)

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 8 })
  await assertPersistentServices(pool, redisUrl)
  const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src/db/migrations')
  await applyMigrations(pool, migrationsDir, { log: () => undefined })
  await seedIntegrationFixtures(pool)

  const queue = createQueue(DEFAULT_QUEUE_NAME, createRedisConnection(redisUrl), { prefix: 'yux-integration' })
  await queue.waitUntilReady()
  await queue.obliterate({ force: true })
  const provider = await createTestProviderServer()
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    SESSION_COOKIE_NAME: 'yux_integration_session',
    SESSION_SECRET: 'integration-session-secret-32-characters-minimum',
    CORS_ORIGIN: 'http://integration.test',
    N8N_CRM_WEBHOOK_URL: provider.baseUrl,
    N8N_WEBHOOK_SECRET: 'integration-webhook-secret',
    KNOWLEDGE_CURATION_ENABLED: 'false',
    ACTION_ENGINE_MUTATION_LEASE_SECRET: 'integration-mutation-lease-secret-32-chars',
    ACTION_ENGINE_TELEMETRY_REDACTION_KEY: 'integration-redaction-key-secret-32-chars',
  })
  const appQueue: AppJobQueue = {
    add(name: JobName, data: QueueJobData, options?: { delay?: number; jobId?: string }) {
      return queue.add(name, data, {
        jobId: options?.jobId ?? createIdempotencyKey(name, data),
        ...(options?.delay !== undefined ? { delay: options.delay } : {}),
      })
    },
    close: async () => { await queue.close() },
  }
  let app = await createApp(pool, appQueue, env)
  const cookies = new Map<TestRole, string>()

  return {
    ids: fixtureIds,
    async request(role, method, url, body) {
      let cookie = cookies.get(role)
      if (!cookie) {
        const user = fixtureUsers[role]
        const login = await app.inject({
          method: 'POST',
          url: '/api/auth/login',
          payload: { email: user.email, password: fixturePassword },
        })
        if (login.statusCode !== 200) throw new Error(`integration_login_failed:${role}:${login.statusCode}:${login.body}`)
        const setCookieHeader = login.headers['set-cookie']
        cookie = (Array.isArray(setCookieHeader) ? setCookieHeader[0] : setCookieHeader)?.split(';', 1)[0]
        if (!cookie) throw new Error(`integration_cookie_missing:${role}`)
        cookies.set(role, cookie)
      }
      const response = await app.inject({
        method,
        url,
        headers: { cookie },
        ...(body === undefined ? {} : { payload: body }),
      } as any)
      return { statusCode: response.statusCode, body: parseBody(response.body) }
    },
    sql: (text, values) => pool.query(text, values),
    async workerTick() {
      const processor = createJobProcessor({ pool, env, maintenanceQueue: appQueue })
      const worker = createWorker(DEFAULT_QUEUE_NAME, processor, createRedisConnection(redisUrl), {
        prefix: 'yux-integration',
        concurrency: 1,
      })
      try {
        await waitForQueueToDrain(queue, 45_000)
      } finally {
        await worker.close()
      }
    },
    async restartApi() {
      await app.close()
      cookies.clear()
      app = await createApp(pool, appQueue, env)
    },
    stopRedis: () => controlRedis('stop'),
    startRedis: () => controlRedis('start'),
    providerCalls: async () => provider.calls(),
    async close() {
      await app.close()
      await queue.close()
      await pool.end()
      await provider.close()
    },
  }
}

async function createApp(pool: pg.Pool, jobQueue: AppJobQueue, env: ReturnType<typeof loadEnv>): Promise<FastifyInstance> {
  const app = await buildServer(env, {
    pool,
    jobQueue,
    closePoolOnClose: false,
    closeQueueOnClose: false,
    redisPing: async () => 'PONG',
  })
  await app.ready()
  return app
}

async function assertPersistentServices(pool: pg.Pool, redisUrl: string) {
  const database = await pool.query<{ name: string }>('SELECT current_database() AS name')
  if (!database.rows[0]?.name.startsWith('yux_test_')) throw new Error('integration_database_name_must_start_with_yux_test_')
  const queue = createQueue('yux-integration-probe', createRedisConnection(redisUrl), { prefix: 'yux-integration-probe' })
  try { await queue.waitUntilReady() } finally { await queue.close() }
}

function assertSafeIntegrationDatabase(databaseUrl: string) {
  const parsed = new URL(databaseUrl)
  const databaseName = parsed.pathname.replace(/^\//, '')
  if (!databaseName.startsWith('yux_test_')) throw new Error('unsafe_integration_database_name')
  if (!['127.0.0.1', 'localhost', 'postgres'].includes(parsed.hostname)) throw new Error('unsafe_integration_database_host')
}

async function waitForQueueToDrain(queue: ReturnType<typeof createQueue>, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized', 'failed')
    if (counts.failed > 0) {
      const [failed] = await queue.getFailed(0, 0)
      throw new Error(`integration_job_failed:${failed?.name}:${failed?.failedReason}`)
    }
    if (counts.waiting + counts.active + counts.delayed + counts.prioritized === 0) return
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  throw new Error('integration_worker_tick_timeout')
}

async function controlRedis(action: 'start' | 'stop') {
  const project = process.env.YUX_INTEGRATION_COMPOSE_PROJECT
  if (!project) throw new Error('integration_redis_control_requires_YUX_INTEGRATION_COMPOSE_PROJECT')
  const composeFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../docker-compose.integration.yml')
  await execFileAsync('docker', ['compose', '--project-name', project, '-f', composeFile, action, 'redis'])
}

function parseBody(body: string) {
  if (!body) return null
  try { return JSON.parse(body) } catch { return body }
}
