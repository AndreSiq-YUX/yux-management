import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import type { FastifyInstance } from 'fastify'
import pg from 'pg'
import { createContextAwarePool } from '../../../src/db/client.js'
import { buildServer, type AppJobQueue } from '../../../src/server.js'
import { loadEnv } from '../../../src/config/env.js'
import { createJobProcessor } from '../../../src/jobs/processor.js'
import { QUEUE_NAMES, createQueue, createRedisConnection, createWorker, type JobQueueClass } from '../../../src/jobs/queue.js'
import { createRoutedJobQueue } from '../../../src/jobs/router.js'
import { applyMigrations } from '../../../scripts/apply-migrations.js'
import { fixtureIds, fixturePassword, fixtureUsers, integrationRolePassword, provisionIntegrationServiceRoles, seedIntegrationFixtures } from './fixtures.js'
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
  request(role: TestRole, method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE', url: string, body?: unknown, headers?: Record<string, string>): Promise<TestResponse>
  rawRequest(method: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE', url: string, body: string, headers?: Record<string, string>): Promise<TestResponse>
  sql(text: string, values?: unknown[]): Promise<{ rows: any[]; rowCount: number | null }>
  workerTick(): Promise<void>
  restartApi(): Promise<void>
  stopRedis(): Promise<void>
  startRedis(): Promise<void>
  providerCalls(): Promise<ProviderCall[]>
  providerBaseUrl: string
  serviceDatabaseUrl(role: 'yux_api'|'yux_worker'|'yux_runtime'): string
  storageRoot: string
  listen(port?: number): Promise<string>
  close(): Promise<void>
}

export function getIntegrationDatabaseUrl() {
  const databaseUrl = process.env.YUX_INTEGRATION_DATABASE_URL
    || 'postgresql://yux_test:yux_test_password@127.0.0.1:55432/yux_test_integration'
  assertSafeIntegrationDatabase(databaseUrl)
  return databaseUrl
}

export async function createIntegrationRig(options: { corsOrigin?: string } = {}): Promise<IntegrationRig> {
  const databaseUrl = getIntegrationDatabaseUrl()
  const redisUrl = process.env.YUX_INTEGRATION_REDIS_URL
    || 'redis://:yux_test_redis_password@127.0.0.1:56379/0'
  const migrationPool = new pg.Pool({ connectionString: databaseUrl, max: 8 })
  await assertPersistentServices(migrationPool, redisUrl)
  const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src/db/migrations')
  await applyMigrations(migrationPool, migrationsDir, { log: () => undefined })
  await provisionIntegrationServiceRoles(migrationPool)
  await seedIntegrationFixtures(migrationPool)
  const apiPool = createContextAwarePool(new pg.Pool({ connectionString: serviceDatabaseUrl(databaseUrl, 'yux_api'), max: 8 }), 'api')
  const workerPool = createContextAwarePool(new pg.Pool({ connectionString: serviceDatabaseUrl(databaseUrl, 'yux_worker'), max: 4 }), 'worker')

  const redisConnection = createRedisConnection(redisUrl)
  const queue = createRoutedJobQueue({ connection: redisConnection, prefix: 'yux-integration' })
  await Promise.all(queue.queues().map(rawQueue => rawQueue.waitUntilReady()))
  await Promise.all(queue.queues().map(rawQueue => rawQueue.obliterate({ force: true })))
  const provider = await createTestProviderServer()
  const storageRoot = await mkdtemp(path.join(tmpdir(), 'yux-integration-knowledge-'))
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: databaseUrl,
    REDIS_URL: redisUrl,
    SESSION_COOKIE_NAME: 'yux_integration_session',
    SESSION_SECRET: 'integration-session-secret-32-characters-minimum',
    CORS_ORIGIN: options.corsOrigin ?? 'http://integration.test',
    N8N_CRM_WEBHOOK_URL: provider.baseUrl,
    N8N_WEBHOOK_SECRET: 'integration-webhook-secret',
    JINA_API_KEY: 'integration-jina-api-key',
    KNOWLEDGE_CURATION_ENABLED: 'false',
    KNOWLEDGE_STORAGE_DIR: storageRoot,
    ACTION_ENGINE_MUTATION_LEASE_SECRET: 'integration-mutation-lease-secret-32-chars',
    ACTION_ENGINE_TELEMETRY_REDACTION_KEY: 'integration-redaction-key-secret-32-chars',
    META_APP_SECRET: 'integration-meta-app-secret',
    META_WEBHOOK_VERIFY_TOKEN: 'integration-meta-verify-token',
    META_GRAPH_BASE_URL: provider.baseUrl,
    PROVIDER_SECRET_ENCRYPTION_KEY_B64: 'BwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwcHBwc=',
    YUX_AGENT_RUNTIME_URL: process.env.YUX_AGENT_RUNTIME_URL,
    YUX_AGENT_RUNTIME_TOKEN: process.env.YUX_AGENT_RUNTIME_TOKEN,
  })
  const appQueue: AppJobQueue = queue
  let app = await createApp(apiPool, appQueue, env)
  const cookies = new Map<TestRole, string>()

  return {
    ids: fixtureIds,
    async request(role, method, url, body, headers = {}) {
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
        headers: { ...headers, cookie },
        ...(body === undefined ? {} : { payload: body }),
      } as any)
      return { statusCode: response.statusCode, body: parseBody(response.body) }
    },
    async rawRequest(method, url, body, headers = {}) {
      const response = await app.inject({ method, url, payload: body, headers })
      return { statusCode: response.statusCode, body: parseBody(response.body) }
    },
    sql: (text, values) => migrationPool.query(text, values),
    async workerTick() {
      await appQueue.add('events.dispatchPending', { limit: 100, integrationTick: randomUUID() })
      const processor = createJobProcessor({ pool: workerPool, env, maintenanceQueue: appQueue })
      const workers = (Object.keys(QUEUE_NAMES) as JobQueueClass[]).map(queueClass => createWorker(
        QUEUE_NAMES[queueClass], processor, createRedisConnection(redisUrl), {
          prefix: 'yux-integration',
          concurrency: queueClass === 'interactive' || queueClass === 'external' ? 2 : 1,
        },
      ))
      try {
        await waitForQueuesToDrain(queue.queues(), 45_000)
      } finally {
        await Promise.all(workers.map(worker => worker.close()))
      }
    },
    async restartApi() {
      await app.close()
      cookies.clear()
      app = await createApp(apiPool, appQueue, env)
    },
    stopRedis: () => controlRedis('stop'),
    startRedis: () => controlRedis('start'),
    providerCalls: async () => provider.calls(),
    providerBaseUrl: provider.baseUrl,
    serviceDatabaseUrl: (role) => serviceDatabaseUrl(databaseUrl, role),
    storageRoot,
    listen: (port = 4000) => app.listen({ host: '127.0.0.1', port }),
    async close() {
      await app.close()
      await queue.close()
      await apiPool.end()
      await workerPool.end()
      await migrationPool.end()
      await provider.close()
      await rm(storageRoot, { recursive: true, force: true })
    },
  }
}

function serviceDatabaseUrl(databaseUrl: string, role: 'yux_api'|'yux_worker'|'yux_runtime') {
  const url = new URL(databaseUrl)
  url.username = role
  url.password = integrationRolePassword
  return url.toString()
}

async function createApp(pool: pg.Pool, jobQueue: AppJobQueue, env: ReturnType<typeof loadEnv>): Promise<FastifyInstance> {
  const app = await buildServer(env, {
    pool,
    jobQueue,
    closePoolOnClose: false,
    closeQueueOnClose: false,
    redisPing: async () => 'PONG',
  })
  app.addHook('onError', async (_request, _reply, error) => {
    const statusCode = (error as { statusCode?: number }).statusCode
    if (!statusCode || statusCode >= 500) console.error('[integration-api-error]', error)
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

async function waitForQueuesToDrain(queues: Array<ReturnType<typeof createQueue>>, timeoutMs: number) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    const counts = await Promise.all(queues.map(queue => queue.getJobCounts('waiting', 'active', 'delayed', 'prioritized', 'failed')))
    const failedQueueIndex = counts.findIndex(count => count.failed > 0)
    if (failedQueueIndex >= 0) {
      const [failed] = await queues[failedQueueIndex]!.getFailed(0, 0)
      throw new Error(`integration_job_failed:${failed?.name}:${failed?.failedReason}`)
    }
    if (counts.every(count => count.waiting + count.active + count.delayed + count.prioritized === 0)) return
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
