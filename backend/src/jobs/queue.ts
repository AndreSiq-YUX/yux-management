import { Queue, Worker, type JobsOptions, type Processor, type QueueOptions, type WorkerOptions } from 'bullmq'
import type { RedisOptions } from 'ioredis'
import { createHash } from 'node:crypto'

export const DEFAULT_QUEUE_NAME = 'yux-jobs'

export const JOB_NAMES = [
  'automation.dispatch',
  'automation.executeRun',
  'events.dispatchPending',
  'events.consume.automation',
  'events.consume.scoring',
  'events.consume.missionObserver',
  'action-engine.planMission',
  'action-engine.scheduleReadyActions',
  'action-engine.executeAction',
  'action-engine.reconcileProviderEffect',
  'action-engine.expireWaits',
  'action-engine.collectMetrics',
  'action-engine.campaignOptimizationCheckpoint',
  'action-engine.enforceRetention',
  'action-engine.evaluateMission',
  'action-engine.deliverDecisionNotification',
  'action-engine.dispatchDecisionNotifications',
  'crm.sequence.dispatchDue',
  'crm.sequence.processExecution',
  'omnichannel.processMessage',
  'omnichannel.dispatchOutbound',
  'omnichannel.retryOutbound',
  'omnichannel.requestScheduling',
  'omnichannel.simulateChannelEvent',
  'provider.functionInvoke',
  'provider.syncMetrics',
  'email.send',
  'strategy.adminChat',
  'radar.analyzeOpportunity',
  'company-intelligence.indexKnowledge',
  'company-intelligence.discoverWebsite',
  'proposal.convert',
  'maintenance.purgeExpiredTraces',
  'maintenance.refreshGoogleTokens',
] as const

export type JobName = (typeof JOB_NAMES)[number]

export type QueueJobData = Record<string, unknown>
export type RedisConnectionOptions = NonNullable<QueueOptions['connection']>

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5_000,
  },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
}

export function isJobName(name: string): name is JobName {
  return JOB_NAMES.includes(name as JobName)
}

export function createRedisConnection(
  redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379',
  options: RedisOptions = {},
): RedisConnectionOptions {
  const parsedUrl = new URL(redisUrl)

  return {
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : 6379,
    username: parsedUrl.username ? decodeURIComponent(parsedUrl.username) : undefined,
    password: parsedUrl.password ? decodeURIComponent(parsedUrl.password) : undefined,
    db: parsedUrl.pathname.length > 1 ? Number(parsedUrl.pathname.slice(1)) : undefined,
    tls: parsedUrl.protocol === 'rediss:' ? {} : undefined,
    maxRetriesPerRequest: null,
    ...options,
  } as RedisConnectionOptions
}

export function createQueue(
  queueName = DEFAULT_QUEUE_NAME,
  connection = createRedisConnection(),
  options: Omit<QueueOptions, 'connection'> = {},
): Queue<QueueJobData, unknown, string> {
  return new Queue<QueueJobData, unknown, string>(queueName, {
    defaultJobOptions,
    ...options,
    connection,
  })
}

export function createWorker<Result = unknown>(
  queueName: string,
  processor: Processor<QueueJobData, Result, string>,
  connection = createRedisConnection(),
  options: Omit<WorkerOptions, 'connection'> = {},
): Worker<QueueJobData, Result, string> {
  return new Worker<QueueJobData, Result, string>(queueName, processor, {
    ...options,
    connection,
  })
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(',')}]`
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableSerialize(item)}`)

    return `{${entries.join(',')}}`
  }

  return JSON.stringify(value)
}

export function createIdempotencyKey(name: JobName, data: QueueJobData): string {
  const hash = createHash('sha256').update(`${name}:${stableSerialize(data)}`).digest('hex')
  return createBullMqJobId(name, hash.slice(0, 32))
}

/**
 * BullMQ reserves `:` for its internal Redis keys and rejects custom job IDs
 * containing that character. Keep every ID produced by the application safe,
 * including dynamic segments such as ISO timestamps.
 */
export function createBullMqJobId(...segments: Array<string | number>): string {
  return segments
    .map((segment) => String(segment).replaceAll(':', '-'))
    .join('-')
}
