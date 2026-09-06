import { DEFAULT_QUEUE_NAME, QUEUE_NAMES, createBullMqJobId, createWorker, type JobQueueClass } from './jobs/queue.js'
import { createRoutedJobQueue } from './jobs/router.js'
import { acquireSchedulerLeadership, type SchedulerLeadership } from './jobs/scheduler-leadership.js'
import type { AppJobQueue } from './server.js'
import { createPool } from './db/client.js'
import { runWithDatabaseRequestContext } from './db/request-context.js'
import { loadEnv } from './config/env.js'
import { createJobProcessor } from './jobs/processor.js'
import { runCrmSequenceScheduler } from './modules/crm/scheduler.js'

const env = loadEnv()
const pool = createPool(env.DATABASE_URL)
const routedQueue = createRoutedJobQueue()
const maintenanceQueue: AppJobQueue = routedQueue
const processJob = createJobProcessor({ pool, env, maintenanceQueue })
const selectedQueueClasses = workerQueueClasses(env.YUX_WORKER_QUEUE_CLASS)
const queueConcurrency: Record<JobQueueClass, number> = {
  interactive: env.YUX_INTERACTIVE_CONCURRENCY ?? 2,
  ingestion: env.YUX_INGESTION_CONCURRENCY ?? 1,
  external: env.YUX_EXTERNAL_CONCURRENCY ?? 2,
  maintenance: env.YUX_MAINTENANCE_CONCURRENCY ?? 1,
}
const workers = selectedQueueClasses.map(queueClass => createWorker(QUEUE_NAMES[queueClass], processJob, undefined, {
  concurrency: queueConcurrency[queueClass],
  lockDuration: 120_000,
  stalledInterval: 30_000,
}))
if (env.YUX_DRAIN_LEGACY_QUEUE === true) {
  workers.push(createWorker(DEFAULT_QUEUE_NAME, processJob, undefined, { concurrency: 1, lockDuration: 120_000, stalledInterval: 30_000 }))
}
let schedulerLeadership: SchedulerLeadership | null = null
let schedulerActive = false
if (env.YUX_SCHEDULER_ENABLED !== false) {
  schedulerLeadership = await acquireSchedulerLeadership(pool)
  schedulerActive = Boolean(schedulerLeadership)
  if (!schedulerActive) {
    console.log('[worker] scheduler lock held by another process; timers disabled here')
  }
}
const schedulerIntervalMs = Number(process.env.CRM_SEQUENCE_SCHEDULER_INTERVAL_MS || 60_000)
const maintenanceIntervalMs = Number(process.env.TRACE_RETENTION_PURGE_INTERVAL_MS || 24 * 60 * 60 * 1_000)
const domainEventDispatchIntervalMs = Number(process.env.DOMAIN_EVENT_DISPATCH_INTERVAL_MS || 5_000)
const actionWaitIntervalMs = Number(process.env.ACTION_ENGINE_WAIT_INTERVAL_MS || 60_000)
const actionMetricsIntervalMs = Number(process.env.ACTION_ENGINE_METRICS_INTERVAL_MS || 5 * 60_000)
const campaignOptimizationIntervalMs = Number(process.env.CAMPAIGN_OPTIMIZATION_INTERVAL_MS || 60 * 60_000)
const missionLearningIntervalMs = Number(process.env.MISSION_LEARNING_INTERVAL_MS || 60 * 60_000)

const scheduler = schedulerActive ? setInterval(() => {
  void runWithDatabaseRequestContext({ role: 'yux_operator', organizationIds: [], serviceRole: 'worker' }, () => runCrmSequenceScheduler(pool, { crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL, crmWebhookSecret: env.N8N_WEBHOOK_SECRET })).catch((error) => {
    console.error('[worker] crm sequence scheduler failed', error)
  })
}, schedulerIntervalMs) : undefined

function scheduleTraceRetentionPurge() {
  const day = new Date().toISOString().slice(0, 10)
  return Promise.all([
    maintenanceQueue.add('maintenance.purgeExpiredTraces', { scheduledFor: day }, { jobId: createBullMqJobId('maintenance-purge-traces', day) }),
    maintenanceQueue.add('action-engine.enforceRetention', { scheduledFor: day }, { jobId: createBullMqJobId('action-engine-retention', day) }),
  ])
}

if (schedulerActive) void scheduleTraceRetentionPurge().catch((error) => console.error('[worker] trace retention scheduling failed', error))
const maintenanceScheduler = schedulerActive ? setInterval(() => {
  void scheduleTraceRetentionPurge().catch((error) => console.error('[worker] trace retention scheduling failed', error))
}, maintenanceIntervalMs) : undefined

const googleTokenRefreshIntervalMs = Number(process.env.GOOGLE_TOKEN_REFRESH_INTERVAL_MS || 30 * 60 * 1_000)

function scheduleGoogleTokenRefresh() {
  // One job per interval window keeps the schedule idempotent across restarts.
  const window = Math.floor(Date.now() / googleTokenRefreshIntervalMs)
  return maintenanceQueue.add('maintenance.refreshGoogleTokens', { window }, { jobId: createBullMqJobId('maintenance-google-token-refresh', window) })
}

if (schedulerActive) void scheduleGoogleTokenRefresh().catch((error) => console.error('[worker] google token refresh scheduling failed', error))
const googleTokenRefreshScheduler = schedulerActive ? setInterval(() => {
  void scheduleGoogleTokenRefresh().catch((error) => console.error('[worker] google token refresh scheduling failed', error))
}, googleTokenRefreshIntervalMs) : undefined

function scheduleDomainEventDispatch() {
  const window = Math.floor(Date.now() / domainEventDispatchIntervalMs)
  return maintenanceQueue.add('events.dispatchPending', { window, limit: 100 }, { jobId: createBullMqJobId('events-dispatch', window) })
}

if (schedulerActive) void scheduleDomainEventDispatch().catch((error) => console.error('[worker] domain event dispatch scheduling failed', error))
const domainEventDispatchScheduler = schedulerActive ? setInterval(() => {
  void scheduleDomainEventDispatch().catch((error) => console.error('[worker] domain event dispatch scheduling failed', error))
}, domainEventDispatchIntervalMs) : undefined

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

if (schedulerActive) void scheduleActionEngineMaintenance().catch((error) => console.error('[worker] action engine scheduling failed', error))
const actionEngineScheduler = schedulerActive ? setInterval(() => {
  void scheduleActionEngineMaintenance().catch((error) => console.error('[worker] action engine scheduling failed', error))
}, Math.min(actionWaitIntervalMs, actionMetricsIntervalMs)) : undefined

for (const worker of workers) {
  worker.on('completed', (job) => console.log(`[worker] completed ${job.name}#${job.id ?? 'unknown'}`))
  worker.on('failed', (job, error) => console.error(`[worker] failed ${job?.name ?? 'unknown'}#${job?.id ?? 'unknown'}`, error))
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[worker] received ${signal}, shutting down`)
  if (scheduler) clearInterval(scheduler)
  if (maintenanceScheduler) clearInterval(maintenanceScheduler)
  if (googleTokenRefreshScheduler) clearInterval(googleTokenRefreshScheduler)
  if (domainEventDispatchScheduler) clearInterval(domainEventDispatchScheduler)
  if (actionEngineScheduler) clearInterval(actionEngineScheduler)
  await Promise.all(workers.map(worker => worker.close()))
  await schedulerLeadership?.release()
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

function workerQueueClasses(value: string | undefined): JobQueueClass[] {
  const requested = (value || 'all').split(',').map(item => item.trim()).filter(Boolean)
  if (requested.includes('all')) return Object.keys(QUEUE_NAMES) as JobQueueClass[]
  const valid = requested.filter((item): item is JobQueueClass => Object.prototype.hasOwnProperty.call(QUEUE_NAMES, item))
  if (!valid.length || valid.length !== requested.length) throw new Error('YUX_WORKER_QUEUE_CLASS contains an unsupported queue class')
  return [...new Set(valid)]
}
