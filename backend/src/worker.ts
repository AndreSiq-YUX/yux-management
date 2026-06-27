import type { Job } from 'bullmq'
import { DEFAULT_QUEUE_NAME, createWorker, isJobName, type QueueJobData } from './jobs/queue.js'
import { createPool } from './db/client.js'
import { loadEnv } from './config/env.js'
import { processSequenceExecution, runCrmSequenceScheduler } from './modules/crm/scheduler.js'

type WorkerResult = {
  ok: true
}

async function processJob(job: Job<QueueJobData, WorkerResult, string>): Promise<WorkerResult> {
  if (!isJobName(job.name)) {
    throw new Error(`Unknown job name: ${job.name}`)
  }

  if (job.name === 'crm.sequence.dispatchDue') {
    await runCrmSequenceScheduler(pool, { crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL })
    return { ok: true }
  }

  if (job.name === 'crm.sequence.processExecution') {
    const executionId = job.data.executionId
    if (typeof executionId !== 'string') throw new Error('executionId is required')
    await processSequenceExecution(pool, executionId, { crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL })
    return { ok: true }
  }

  if (job.name === 'proposal.convert') return { ok: true }
  if (job.name.startsWith('omnichannel.')) return { ok: true }

  return { ok: true }
}

const env = loadEnv()
const pool = createPool(env.DATABASE_URL)
const worker = createWorker(DEFAULT_QUEUE_NAME, processJob)
const schedulerIntervalMs = Number(process.env.CRM_SEQUENCE_SCHEDULER_INTERVAL_MS || 60_000)

const scheduler = setInterval(() => {
  void runCrmSequenceScheduler(pool, { crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL }).catch((error) => {
    console.error('[worker] crm sequence scheduler failed', error)
  })
}, schedulerIntervalMs)

worker.on('completed', (job) => {
  console.log(`[worker] completed ${job.name}#${job.id ?? 'unknown'}`)
})

worker.on('failed', (job, error) => {
  console.error(`[worker] failed ${job?.name ?? 'unknown'}#${job?.id ?? 'unknown'}`, error)
})

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.log(`[worker] received ${signal}, shutting down`)
  clearInterval(scheduler)
  await worker.close()
  await pool.end()
  process.exit(0)
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM')
})

process.on('SIGINT', () => {
  void shutdown('SIGINT')
})
