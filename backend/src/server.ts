import cookie from '@fastify/cookie'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import Fastify from 'fastify'
import type pg from 'pg'
import { createPgAuthStore, registerAuthRoutes, type AuthStore } from './auth/routes.js'
import { loadEnv, type AppEnv } from './config/env.js'
import { createPool } from './db/client.js'
import { DEFAULT_QUEUE_NAME, createIdempotencyKey, createQueue, type JobName, type QueueJobData } from './jobs/queue.js'
import { registerAiAssistantRoutes } from './modules/ai-assistant/routes.js'
import { registerAutomationRoutes } from './modules/automations/routes.js'
import { registerCampaignRoutes } from './modules/campaigns/routes.js'
import { registerCrmRoutes } from './modules/crm/routes.js'
import { registerDataRoutes } from './modules/data/routes.js'
import { registerFunctionRoutes } from './modules/functions/routes.js'
import { registerFinanceRoutes } from './modules/finance/routes.js'
import { registerHealthRoutes } from './modules/health/routes.js'
import { registerLandingPageRoutes } from './modules/landing-pages/routes.js'
import { registerMarketingStudioRoutes } from './modules/marketing-studio/routes.js'
import { registerOmnichannelRoutes } from './modules/omnichannel/routes.js'
import { registerPlatformRoutes } from './modules/platform/routes.js'
import { registerProposalRoutes, registerPublicProposalRoutes } from './modules/proposals/routes.js'
import { registerReportRoutes } from './modules/reports/routes.js'
import { registerStrategyEngineRoutes } from './modules/strategy-engine/routes.js'
import { registerSupportRoutes } from './modules/support/routes.js'
import { registerPublicWebchatRoutes } from './modules/webchat/routes.js'
import { registerWorkspaceRoutes } from './modules/workspace/routes.js'

declare module 'fastify' {
  interface FastifyInstance {
    config: AppEnv
    pg: pg.Pool
    jobQueue: AppJobQueue
  }
}

export type AppJobQueue = {
  add(name: JobName, data: QueueJobData): Promise<{ id?: string | number | undefined }>
  close(): Promise<void>
}

type BuildServerOptions = {
  authStore?: AuthStore
  pool?: pg.Pool
  jobQueue?: AppJobQueue
}

export async function buildServer(env: AppEnv = loadEnv(), options: BuildServerOptions = {}) {
  const app = Fastify({ logger: env.NODE_ENV !== 'test', bodyLimit: 25 * 1024 * 1024 })
  const pool = options.pool ?? createPool(env.DATABASE_URL)
  const queue = options.jobQueue ?? createAppJobQueue()

  app.decorate('config', env)
  app.decorate('pg', pool)
  app.decorate('jobQueue', queue)
  app.decorate('authStore', options.authStore ?? createPgAuthStore(pool))
  app.addHook('onClose', async () => {
    await pool.end()
    await queue.close()
  })

  await app.register(helmet)
  await app.register(cookie, { secret: env.SESSION_SECRET })
  await app.register(cors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
  })

  await app.register(registerHealthRoutes, { prefix: '/api' })
  await app.register(registerAuthRoutes, { prefix: '/api/auth' })
  await app.register(registerPlatformRoutes, { prefix: '/api/platform' })
  await app.register(registerDataRoutes, { prefix: '/api/data' })
  await app.register(registerFunctionRoutes, { prefix: '/api/functions' })
  await app.register(registerCrmRoutes, { prefix: '/api/crm' })
  await app.register(registerAutomationRoutes, { prefix: '/api/automations' })
  await app.register(registerProposalRoutes, { prefix: '/api/proposals' })
  await app.register(registerPublicProposalRoutes, { prefix: '/api/public/proposals' })
  await app.register(registerPublicWebchatRoutes, { prefix: '/api/public/webchat' })
  await app.register(registerOmnichannelRoutes, { prefix: '/api/omnichannel' })
  await app.register(registerWorkspaceRoutes, { prefix: '/api/workspace' })
  await app.register(registerSupportRoutes, { prefix: '/api/support' })
  await app.register(registerFinanceRoutes, { prefix: '/api/finance' })
  await app.register(registerReportRoutes, { prefix: '/api/reports' })
  await app.register(registerMarketingStudioRoutes, { prefix: '/api/marketing-studio' })
  await app.register(registerStrategyEngineRoutes, { prefix: '/api/strategy-engine' })
  await app.register(registerAiAssistantRoutes, { prefix: '/api/ai-assistant' })
  await app.register(registerLandingPageRoutes, { prefix: '/api/landing-pages' })
  await app.register(registerCampaignRoutes, { prefix: '/api/campaigns' })

  return app
}

function createAppJobQueue(): AppJobQueue {
  const queue = createQueue()

  return {
    async add(name, data) {
      return queue.add(name, data, {
        jobId: createIdempotencyKey(name, data),
      })
    },
    async close() {
      await queue.close()
    },
  }
}
