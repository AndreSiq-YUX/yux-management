import type { Queue } from 'bullmq'
import { enqueueRegisteredJob, jobRegistry } from './registry.js'
import {
  QUEUE_NAMES,
  createQueue,
  createRedisConnection,
  type JobName,
  type JobQueueClass,
  type QueueJobData,
  type RedisConnectionOptions,
} from './queue.js'

type RoutedQueueOptions = {
  connection?: RedisConnectionOptions
  prefix?: string
}

export type RoutedJobQueue = {
  add(name: JobName, data: QueueJobData, options?: { delay?: number; jobId?: string }): Promise<{ id?: string | number }>
  close(): Promise<void>
  getQueue(queueClass: JobQueueClass): Queue<QueueJobData, unknown, string>
  queues(): Array<Queue<QueueJobData, unknown, string>>
}

export function createRoutedJobQueue(options: RoutedQueueOptions = {}): RoutedJobQueue {
  const connection = options.connection ?? createRedisConnection()
  const queues = new Map<JobQueueClass, Queue<QueueJobData, unknown, string>>()
  for (const [queueClass, queueName] of Object.entries(QUEUE_NAMES) as Array<[JobQueueClass, string]>) {
    queues.set(queueClass, createQueue(queueName, connection, options.prefix ? { prefix: options.prefix } : {}))
  }
  return {
    add(name, data, jobOptions) {
      return enqueueRegisteredJob(requiredQueue(queues, jobRegistry[name].queueClass), name, data, jobOptions)
    },
    async close() {
      await Promise.all([...queues.values()].map(queue => queue.close()))
    },
    getQueue(queueClass) {
      return requiredQueue(queues, queueClass)
    },
    queues: () => [...queues.values()],
  }
}

function requiredQueue(
  queues: Map<JobQueueClass, Queue<QueueJobData, unknown, string>>,
  queueClass: JobQueueClass,
) {
  const queue = queues.get(queueClass)
  if (!queue) throw new Error(`job_queue_unavailable:${queueClass}`)
  return queue
}
