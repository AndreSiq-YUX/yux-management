import { DEFAULT_QUEUE_NAME, createBullMqJobId, createQueue, createWorker } from './jobs/queue.js'
import { createPool } from './db/client.js'
import { runWithDatabaseRequestContext } from './db/request-context.js'
import { loadEnv } from './config/env.js'
import { createJobProcessor } from './jobs/processor.js'
import { runCrmSequenceScheduler } from './modules/crm/scheduler.js'

const env = loadEnv()
const pool = createPool(env.DATABASE_URL)
const maintenanceQueue = createQueue(DEFAULT_QUEUE_NAME)
const processJob = createJobProcessor({ pool, env, maintenanceQueue })
const worker = createWorker(DEFAULT_QUEUE_NAME, processJob)
const schedulerIntervalMs = Number(process.env.CRM_SEQUENCE_SCHEDULER_INTERVAL_MS || 60_000)
const maintenanceIntervalMs = Number(process.env.TRACE_RETENTION_PURGE_INTERVAL_MS || 24 * 60 * 60 * 1_000)
const domainEventDispatchIntervalMs = Number(process.env.DOMAIN_EVENT_DISPATCH_INTERVAL_MS || 5_000)
const actionWaitIntervalMs = Number(process.env.ACTION_ENGINE_WAIT_INTERVAL_MS || 60_000)
const actionMetricsIntervalMs = Number(process.env.ACTION_ENGINE_METRICS_INTERVAL_MS || 5 * 60_000)
const campaignOptimizationIntervalMs = Number(process.env.CAMPAIGN_OPTIMIZATION_INTERVAL_MS || 60 * 60_000)
const missionLearningIntervalMs = Number(process.env.MISSION_LEARNING_INTERVAL_MS || 60 * 60_000)

const scheduler = setInterval(() => {
  void runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [] }, () => runCrmSequenceScheduler(pool, { crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL, crmWebhookSecret: env.N8N_WEBHOOK_SECRET })).catch((error) => {
    console.error('[worker] crm sequence scheduler failed', error)
  })
}, schedulerIntervalMs)

function scheduleTraceRetentionPurge() {
  const day = new Date().toISOString().slice(0, 10)
  return Promise.all([
    maintenanceQueue.add('maintenance.purgeExpiredTraces', { scheduledFor: day }, { jobId: createBullMqJobId('maintenance-purge-traces', day) }),
    maintenanceQueue.add('action-engine.enforceRetention', { scheduledFor: day }, { jobId: createBullMqJobId('action-engine-retention', day) }),
  ])
}

void scheduleTraceRetentionPurge().catch((error) => console.error('[worker] trace retention scheduling failed', error))
const maintenanceScheduler = setInterval(() => {
  void scheduleTraceRetentionPurge().catch((error) => console.error('[worker] trace retention scheduling failed', error))
}, maintenanceIntervalMs)

const googleTokenRefreshIntervalMs = Number(process.env.GOOGLE_TOKEN_REFRESH_INTERVAL_MS || 30 * 60 * 1_000)

function scheduleGoogleTokenRefresh() {
  // One job per interval window keeps the schedule idempotent across restarts.
  const window = Math.floor(Date.now() / googleTokenRefreshIntervalMs)
  return maintenanceQueue.add('maintenance.refreshGoogleTokens', { window }, { jobId: createBullMqJobId('maintenance-google-token-refresh', window) })
}

void scheduleGoogleTokenRefresh().catch((error) => console.error('[worker] google token refresh scheduling failed', error))
const googleTokenRefreshScheduler = setInterval(() => {
  void scheduleGoogleTokenRefresh().catch((error) => console.error('[worker] google token refresh scheduling failed', error))
}, googleTokenRefreshIntervalMs)

function scheduleDomainEventDispatch() {
  const window = Math.floor(Date.now() / domainEventDispatchIntervalMs)
  return maintenanceQueue.add('events.dispatchPending', { window, limit: 100 }, { jobId: createBullMqJobId('events-dispatch', window) })
}

void scheduleDomainEventDispatch().catch((error) => console.error('[worker] domain event dispatch scheduling failed', error))
const domainEventDispatchScheduler = setInterval(() => {
  void scheduleDomainEventDispatch().catch((error) => console.error('[worker] domain event dispatch scheduling failed', error))
}, domainEventDispatchIntervalMs)

function scheduleActionEngineMaintenance() {
  const waitWindow = Math.floor(Date.now() / actionWaitIntervalMs)
  const metricWindow = Math.floor(Date.now() / actionMetricsIntervalMs)
  const optimizationWindow = Math.floor(Date.now() / campaignOptimizationIntervalMs)
  const learningWindow = Math.floor(Date.now() / missionLearningIntervalMs)
  return Promise.all([
    maintenanceQueue.add('action-engine.expireWaits', { window: waitWindow, limit: 100 }, { jobId: createBullMqJobId('action-engine-expire-waits', waitWindow) }),
    maintenanceQueue.add('action-engine.collectMetrics', { window: metricWindow }, { jobId: createBullMqJobId('action-engine-collect-metrics', metricWindow) }),
    maintenanceQueue.add('action-engine.campaignOptimizationCheckpoint', { window: optimizationWindow }, { jobId: createBullMqJobId('action-engine-campaign-optimization', optimizationWindow) }),
    maintenanceQueue.add('action-engine.generateLearning', { window: learningWindow, limit: 50 }, { jobId: createBullMqJobId('action-engine-generate-learning', learningWindow) }),
    maintenanceQueue.add('action-engine.dispatchDecisionNotifications', { window: waitWindow, limit: 100 }, { jobId: createBullMqJobId('action-engine-decision-dispatch', waitWindow) }),
  ])
}

void scheduleActionEngineMaintenance().catch((error) => console.error('[worker] action engine scheduling failed', error))
const actionEngineScheduler = setInterval(() => {
  void scheduleActionEngineMaintenance().catch((error) => console.error('[worker] action engine scheduling failed', error))
}, Math.min(actionWaitIntervalMs, actionMetricsIntervalMs))

worker.on('completed', (job) => {
  console.log(`[worker] completed ${job.name}#${job.id ?? 'unknown'}`)
})

worker.on('failed', (job, error) => {
  console.error(`[worker] failed ${job?.name ?? 'unknown'}#${job?.id ?? 'unknown'}`, error)
})

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[worker] received ${signal}, shutting down`)
  clearInterval(scheduler)
  clearInterval(maintenanceScheduler)
  clearInterval(googleTokenRefreshScheduler)
  clearInterval(domainEventDispatchScheduler)
  clearInterval(actionEngineScheduler)
  await worker.close()
  await maintenanceQueue.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})
