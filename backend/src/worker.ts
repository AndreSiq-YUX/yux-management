import type { Job } from 'bullmq'
import { DEFAULT_QUEUE_NAME, createQueue, createWorker, isJobName, type QueueJobData } from './jobs/queue.js'
import { createPool } from './db/client.js'
import { runWithDatabaseRequestContext } from './db/request-context.js'
import { loadEnv } from './config/env.js'
import { processSequenceExecution, runCrmSequenceScheduler } from './modules/crm/scheduler.js'
import { handleInboundMessage, handleOutboundMessage } from './jobs/handlers/omnichannel.js'
import { handleProposalConversion } from './jobs/handlers/proposals.js'
import { handleProviderFunction } from './jobs/handlers/providers.js'
import { handleStrategyAdminChat } from './jobs/handlers/strategy.js'
import { purgeExpiredTraces } from './jobs/handlers/maintenance.js'

type WorkerResult = {
  ok: true
}

async function processJob(job: Job<QueueJobData, WorkerResult, string>): Promise<WorkerResult> {
  return runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [] }, async () => {
  if (!isJobName(job.name)) {
    throw new Error(`Unknown job name: ${job.name}`)
  }

  if (job.name === 'crm.sequence.dispatchDue') {
    await runCrmSequenceScheduler(pool, { crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL, crmWebhookSecret: env.N8N_WEBHOOK_SECRET })
    return { ok: true }
  }

  if (job.name === 'crm.sequence.processExecution') {
    const executionId = job.data.executionId
    if (typeof executionId !== 'string') throw new Error('executionId is required')
    await processSequenceExecution(pool, executionId, { crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL, crmWebhookSecret: env.N8N_WEBHOOK_SECRET })
    return { ok: true }
  }

  if (job.name === 'proposal.convert') { await handleProposalConversion(pool, job.data.proposalId); return { ok: true } }
  if (job.name === 'provider.functionInvoke') { await handleProviderFunction(pool, job.data); return { ok: true } }
  if (job.name === 'omnichannel.processMessage') { await handleInboundMessage(pool, env, job.data); return { ok: true } }
  if (job.name === 'omnichannel.dispatchOutbound' || job.name === 'omnichannel.retryOutbound') { await handleOutboundMessage(pool, job.data); return { ok: true } }
  if (job.name === 'strategy.adminChat') { await handleStrategyAdminChat(pool, env, job.data); return { ok: true } }
  if (job.name === 'maintenance.purgeExpiredTraces') { await purgeExpiredTraces(pool); return { ok: true } }

  throw new Error(`No handler registered for ${job.name}`)
  })
}

const env = loadEnv()
const pool = createPool(env.DATABASE_URL)
const worker = createWorker(DEFAULT_QUEUE_NAME, processJob)
const maintenanceQueue = createQueue(DEFAULT_QUEUE_NAME)
const schedulerIntervalMs = Number(process.env.CRM_SEQUENCE_SCHEDULER_INTERVAL_MS || 60_000)
const maintenanceIntervalMs = Number(process.env.TRACE_RETENTION_PURGE_INTERVAL_MS || 24 * 60 * 60 * 1_000)

const scheduler = setInterval(() => {
  void runWithDatabaseRequestContext({ role: 'yux_admin', organizationIds: [] }, () => runCrmSequenceScheduler(pool, { crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL, crmWebhookSecret: env.N8N_WEBHOOK_SECRET })).catch((error) => {
    console.error('[worker] crm sequence scheduler failed', error)
  })
}, schedulerIntervalMs)

function scheduleTraceRetentionPurge() {
  const day = new Date().toISOString().slice(0, 10)
  return maintenanceQueue.add('maintenance.purgeExpiredTraces', { scheduledFor: day }, { jobId: `maintenance-purge-traces:${day}` })
}

void scheduleTraceRetentionPurge().catch((error) => console.error('[worker] trace retention scheduling failed', error))
const maintenanceScheduler = setInterval(() => {
  void scheduleTraceRetentionPurge().catch((error) => console.error('[worker] trace retention scheduling failed', error))
}, maintenanceIntervalMs)

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
