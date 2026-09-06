import type { Job } from 'bullmq'
import type pg from 'pg'
import type { AppEnv } from '../config/env.js'
import { runWithDatabaseRequestContext } from '../db/request-context.js'
import type { AppJobQueue } from '../server.js'
import { jobRegistry, parseRegisteredJobData } from './registry.js'
import { isJobName, type QueueJobData } from './queue.js'

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
      || jobRegistry[jobName].sandboxOnly
    return runWithDatabaseRequestContext({
      role: internalSystemJob || !organizationId ? 'yux_operator' : 'client_member',
      organizationIds: organizationId ? [organizationId] : [],
      serviceRole: 'worker',
    }, async () => {
      await jobRegistry[jobName].handler({
        pool,
        env,
        queue: maintenanceQueue,
        jobId: String(job.id ?? 'unknown'),
      }, data)
      return { ok: true }
    })
  }
}

function organizationIdFromJob(data: QueueJobData) {
  const value = data.organizationId ?? data.organization_id
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error('invalid_job_organization_context')
  }
  return value.toLowerCase()
}
