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
import { refreshExpiringGoogleTokens } from './jobs/handlers/google-token-refresh.js'
import { handleAutomationDispatch, handleAutomationRun } from './jobs/handlers/automation.js'
import { handleEmailSend } from './jobs/handlers/email.js'
import { handleDomainEventDelivery, handleDomainEventDispatch } from './jobs/handlers/domain-events.js'
import { handleRadarOpportunityAnalysis } from './jobs/handlers/radar.js'
import { handleKnowledgeIndexing } from './jobs/handlers/company-intelligence.js'

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
    await processSequenceExecution(pool, executionId, {
      crmWebhookUrl: env.N8N_CRM_WEBHOOK_URL,
      crmWebhookSecret: env.N8N_WEBHOOK_SECRET,
      emailJobQueue: maintenanceQueue,
      whatsappJobQueue: maintenanceQueue,
    })
    return { ok: true }
  }

  if (job.name === 'proposal.convert') { await handleProposalConversion(pool, job.data.proposalId); return { ok: true } }
  if (job.name === 'automation.dispatch') { await handleAutomationDispatch(pool, env, job.data); return { ok: true } }
  if (job.name === 'events.dispatchPending') { await handleDomainEventDispatch(pool, maintenanceQueue, job.data); return { ok: true } }
  if (job.name === 'events.consume.automation' || job.name === 'events.consume.scoring') {
    await handleDomainEventDelivery(pool, env, job.data, maintenanceQueue)
    return { ok: true }
  }
  if (job.name === 'automation.executeRun') { await handleAutomationRun(pool, env, job.data); return { ok: true } }
  if (job.name === 'email.send') { await handleEmailSend(pool, job.data); return { ok: true } }
  if (job.name === 'provider.functionInvoke') { await handleProviderFunction(pool, job.data); return { ok: true } }
  if (job.name === 'omnichannel.processMessage') { await handleInboundMessage(pool, env, job.data, maintenanceQueue); return { ok: true } }
  if (job.name === 'omnichannel.dispatchOutbound' || job.name === 'omnichannel.retryOutbound') { await handleOutboundMessage(pool, job.data); return { ok: true } }
  if (job.name === 'strategy.adminChat') { await handleStrategyAdminChat(pool, env, job.data); return { ok: true } }
  if (job.name === 'radar.analyzeOpportunity') { await handleRadarOpportunityAnalysis(pool, env, job.data); return { ok: true } }
  if (job.name === 'company-intelligence.indexKnowledge') { await handleKnowledgeIndexing(pool, job.data); return { ok: true } }
  if (job.name === 'maintenance.purgeExpiredTraces') { await purgeExpiredTraces(pool); return { ok: true } }
  if (job.name === 'maintenance.refreshGoogleTokens') { await refreshExpiringGoogleTokens(pool, env); return { ok: true } }

  throw new Error(`No handler registered for ${job.name}`)
  })
}

const env = loadEnv()
const pool = createPool(env.DATABASE_URL)
const worker = createWorker(DEFAULT_QUEUE_NAME, processJob)
const maintenanceQueue = createQueue(DEFAULT_QUEUE_NAME)
const schedulerIntervalMs = Number(process.env.CRM_SEQUENCE_SCHEDULER_INTERVAL_MS || 60_000)
const maintenanceIntervalMs = Number(process.env.TRACE_RETENTION_PURGE_INTERVAL_MS || 24 * 60 * 60 * 1_000)
const domainEventDispatchIntervalMs = Number(process.env.DOMAIN_EVENT_DISPATCH_INTERVAL_MS || 5_000)

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

const googleTokenRefreshIntervalMs = Number(process.env.GOOGLE_TOKEN_REFRESH_INTERVAL_MS || 30 * 60 * 1_000)

function scheduleGoogleTokenRefresh() {
  // One job per interval window keeps the schedule idempotent across restarts.
  const window = Math.floor(Date.now() / googleTokenRefreshIntervalMs)
  return maintenanceQueue.add('maintenance.refreshGoogleTokens', { window }, { jobId: `maintenance-google-token-refresh:${window}` })
}

void scheduleGoogleTokenRefresh().catch((error) => console.error('[worker] google token refresh scheduling failed', error))
const googleTokenRefreshScheduler = setInterval(() => {
  void scheduleGoogleTokenRefresh().catch((error) => console.error('[worker] google token refresh scheduling failed', error))
}, googleTokenRefreshIntervalMs)

function scheduleDomainEventDispatch() {
  const window = Math.floor(Date.now() / domainEventDispatchIntervalMs)
  return maintenanceQueue.add('events.dispatchPending', { window, limit: 100 }, { jobId: `events-dispatch:${window}` })
}

void scheduleDomainEventDispatch().catch((error) => console.error('[worker] domain event dispatch scheduling failed', error))
const domainEventDispatchScheduler = setInterval(() => {
  void scheduleDomainEventDispatch().catch((error) => console.error('[worker] domain event dispatch scheduling failed', error))
}, domainEventDispatchIntervalMs)

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
