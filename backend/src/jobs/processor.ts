import type { Job } from 'bullmq'
import type pg from 'pg'
import type { AppEnv } from '../config/env.js'
import { runWithDatabaseRequestContext } from '../db/request-context.js'
import type { AppJobQueue } from '../server.js'
import { jobRegistry, parseRegisteredJobData } from './registry.js'
import { isJobName, type JobName, type QueueJobData } from './queue.js'

export type WorkerResult = { ok: true }

export type JobProcessorDependencies = {
  pool: pg.Pool
  env: AppEnv
  maintenanceQueue: AppJobQueue
}

/**
 * Builds the dispatcher used by both the production worker and the persistent
 * integration rig. Keeping composition here prevents tests from silently
 * replacing a missing production dependency with a permissive fake.
 */
export function createJobProcessor(dependencies: JobProcessorDependencies) {
  const { pool, env, maintenanceQueue } = dependencies
  const tenantTails = new Map<string, Promise<void>>()

  return async function processJob(job: Job<QueueJobData, WorkerResult, string>): Promise<WorkerResult> {
    if (!isJobName(job.name)) throw new Error(`Unknown job name: ${job.name}`)
    const jobName = job.name
    const data = parseRegisteredJobData(jobName, job.data)
    const organizationId = organizationIdFromJob(data)
    const internalSystemJob = job.name.startsWith('events.')
      || job.name.startsWith('crm.sequence.')
      || job.name === 'email.send'
      || job.name === 'omnichannel.dispatchOutbound'
      || job.name === 'omnichannel.retryOutbound'
      || job.name === 'strategy.indexKnowledge'
      || jobRegistry[jobName].sandboxOnly
    return runWithDatabaseRequestContext({
      role: internalSystemJob || !organizationId ? 'yux_operator' : 'client_member',
      organizationIds: organizationId ? [organizationId] : [],
      serviceRole: 'worker',
    }, () => serializeTenantJob(tenantTails, concurrencyKey(jobName, data, organizationId), async () => {
      const controller = new AbortController()
      const timeoutMs = jobRegistry[jobName].timeoutMs
      const timer = setTimeout(() => controller.abort(new Error(`job_deadline_exceeded:${jobName}`)), timeoutMs)
      try {
        await Promise.race([
          jobRegistry[jobName].handler({
            pool,
            env,
            queue: maintenanceQueue,
            jobId: String(job.id ?? 'unknown'),
            signal: controller.signal,
          }, data),
          new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
        ])
        return { ok: true }
      } finally {
        clearTimeout(timer)
      }
    }))
  }
}

async function serializeTenantJob<T>(tails: Map<string, Promise<void>>, key: string | null, work: () => Promise<T>): Promise<T> {
  if (!key) return work()
  const previous = tails.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  const tail = previous.catch(() => undefined).then(() => current)
  tails.set(key, tail)
  await previous.catch(() => undefined)
  try {
    return await work()
  } finally {
    release()
    if (tails.get(key) === tail) tails.delete(key)
  }
}

function concurrencyKey(name: JobName, data: QueueJobData, organizationId: string | null) {
  const queueClass = jobRegistry[name].queueClass
  if (!organizationId || (queueClass !== 'external' && queueClass !== 'ingestion')) return null
  const body = data.body && typeof data.body === 'object' && !Array.isArray(data.body) ? data.body as QueueJobData : {}
  const provider = String(data.provider ?? body.provider ?? data.functionName ?? name.split('.')[0] ?? 'default')
  return `${queueClass}:${organizationId}:${provider}`
}

function organizationIdFromJob(data: QueueJobData) {
  const value = data.organizationId ?? data.organization_id
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_job_organization_context')
  }
  return value.toLowerCase()
}
