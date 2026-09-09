import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { QUEUE_NAMES, createQueue, createRedisConnection, type JobQueueClass } from '../../jobs/queue.js'
import { getOutboxOperationalSnapshot } from '../events/repository.js'
import { resolveEffectiveProviderCredential } from '../platform/provider-credentials.js'

export type WorkerHeartbeatRow = {
  instance_id: string
  queue_classes: string[]
  started_at: Date | string
  last_seen_at: Date | string
  metadata: Record<string, unknown>
}

export type CurrentWorkerHeartbeat = {
  instanceId: string
  queueClasses: JobQueueClass[]
  status: 'ok' | 'stale'
  startedAt: string | null
  lastSeenAt: string | null
  metadata: Record<string, unknown>
}

const WORKER_STALE_AFTER_MS = 90_000

export function selectCurrentWorkerHeartbeats(
  rows: WorkerHeartbeatRow[],
  measuredAt: Date,
  staleAfterMs = WORKER_STALE_AFTER_MS,
) {
  const queueClasses = Object.keys(QUEUE_NAMES) as JobQueueClass[]
  const latestByQueueClass = new Map<JobQueueClass, WorkerHeartbeatRow>()

  for (const row of rows) {
    for (const queueClass of row.queue_classes) {
      if (!queueClasses.includes(queueClass as JobQueueClass)) continue
      const typedQueueClass = queueClass as JobQueueClass
      const current = latestByQueueClass.get(typedQueueClass)
      if (!current || new Date(row.last_seen_at).getTime() > new Date(current.last_seen_at).getTime()) {
        latestByQueueClass.set(typedQueueClass, row)
      }
    }
  }

  const currentInstances = new Map<string, { row: WorkerHeartbeatRow; queueClasses: JobQueueClass[] }>()
  for (const queueClass of queueClasses) {
    const row = latestByQueueClass.get(queueClass)
    if (!row) continue
    const instance = currentInstances.get(row.instance_id) ?? { row, queueClasses: [] }
    instance.queueClasses.push(queueClass)
    currentInstances.set(row.instance_id, instance)
  }

  const workers: CurrentWorkerHeartbeat[] = [...currentInstances.entries()].map(([instanceId, current]) => {
    const lastSeenAt = new Date(current.row.last_seen_at)
    return {
      instanceId,
      queueClasses: current.queueClasses,
      status: measuredAt.getTime() - lastSeenAt.getTime() > staleAfterMs ? 'stale' : 'ok',
      startedAt: new Date(current.row.started_at).toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
      metadata: current.row.metadata,
    }
  })

  for (const queueClass of queueClasses) {
    if (latestByQueueClass.has(queueClass)) continue
    workers.push({
      instanceId: `missing:${queueClass}`,
      queueClasses: [queueClass],
      status: 'stale',
      startedAt: null,
      lastSeenAt: null,
      metadata: { reason: 'worker_queue_class_missing' },
    })
  }

  return {
    workers,
    heartbeatRowCount: rows.length,
    replacedHeartbeatCount: Math.max(0, rows.length - currentInstances.size),
  }
}

export async function buildOperationalSnapshot(pool: pg.Pool, env: AppEnv, fetchImpl: typeof fetch = fetch) {
  const measuredAt = new Date()
  const [heartbeats, outbox, queues, harness, usage] = await Promise.all([
    pool.query<WorkerHeartbeatRow>(
      `SELECT instance_id,queue_classes,started_at,last_seen_at,metadata FROM public.worker_process_heartbeats ORDER BY last_seen_at DESC`,
    ),
    getOutboxOperationalSnapshot(pool),
    queueSnapshot(env.REDIS_URL, measuredAt),
    harnessSnapshot(env, fetchImpl),
    pool.query<{provider_key:string;model:string|null;reported_usage:Record<string,unknown>;cost_brl:string|null;measurement_status:string;measurement_reason:string|null;created_at:Date|string}>(
      `SELECT DISTINCT ON (provider_key) provider_key,model,reported_usage,cost_brl::text,measurement_status,measurement_reason,created_at
         FROM public.provider_usage_events ORDER BY provider_key,created_at DESC`,
    ),
  ])
  const workerSelection = selectCurrentWorkerHeartbeats(heartbeats.rows, measuredAt)
  const workers = workerSelection.workers
  const [jina,smtp] = await Promise.all([
    resolveEffectiveProviderCredential(pool,env,'jina_ai'),
    resolveEffectiveProviderCredential(pool,env,'smtp2go'),
  ])
  const providers = [
    {provider:'jina_ai',configured:jina.configured,source:jina.source,verifiedAt:null},
    {provider:'smtp2go',configured:smtp.configured,source:smtp.source,verifiedAt:null},
    providerConfiguration('agent_harness', env.YUX_AGENT_RUNTIME_TOKEN),
  ]
  const degraded = workers.some(worker => worker.status === 'stale') || harness.status !== 'ok'
    || queues.some(queue => queue.status !== 'ok' || (queue.oldestPendingAgeMs !== null && queue.oldestPendingAgeMs > 5_000))
    || outbox.abandonedLeases > 0
  return {
    status: degraded ? 'degraded' : 'ok',
    measuredAt: measuredAt.toISOString(),
    windows: { workerHeartbeatSeconds: 30, workerStaleAfterSeconds: 90, interactiveMaxWaitTargetMs: 5_000 },
    workers,
    workerHistory: {
      heartbeatRowCount: workerSelection.heartbeatRowCount,
      replacedHeartbeatCount: workerSelection.replacedHeartbeatCount,
    },
    queues,
    outbox,
    harness,
    providers,
    usage: usage.rows.length ? usage.rows.map(row => ({
      provider:row.provider_key,model:row.model,reportedUsage:row.reported_usage,
      costBrl:row.cost_brl,measurementStatus:row.measurement_status,reason:row.measurement_reason,
      measuredAt:new Date(row.created_at).toISOString(),
    })) : [{ provider:'all',model:null,reportedUsage:{},costBrl:null,measurementStatus:'unavailable',reason:'no_usage_reported',measuredAt:null }],
  }
}

async function queueSnapshot(redisUrl: string, now: Date) {
  const connection = createRedisConnection(redisUrl)
  return Promise.all((Object.entries(QUEUE_NAMES) as Array<[JobQueueClass,string]>).map(async ([queueClass,name]) => {
    const queue = createQueue(name, connection)
    try {
      const [counts, waiting, delayed] = await Promise.all([
        queue.getJobCounts('waiting','active','delayed','failed','prioritized'),
        queue.getWaiting(0,0),
        queue.getDelayed(0,0),
      ])
      const oldest = [...waiting,...delayed].map(job => job.timestamp).filter(Number.isFinite).sort((a,b)=>a-b)[0]
      return { queueClass,name,status:'ok',counts,oldestPendingAgeMs:oldest === undefined ? null : Math.max(0,now.getTime()-oldest),reason:null }
    } catch {
      return { queueClass,name,status:'unavailable',counts:null,oldestPendingAgeMs:null,reason:'redis_unavailable' }
    } finally { await queue.close() }
  }))
}

async function harnessSnapshot(env: AppEnv, fetchImpl: typeof fetch) {
  if (!env.YUX_AGENT_RUNTIME_URL || !env.YUX_AGENT_RUNTIME_TOKEN) return { status:'unavailable',reason:'not_configured',checkedAt:null }
  const signal = AbortSignal.timeout(3_000)
  try {
    const response = await fetchImpl(`${env.YUX_AGENT_RUNTIME_URL.replace(/\/$/,'')}/health`, {
      headers:{Authorization:`Bearer ${env.YUX_AGENT_RUNTIME_TOKEN}`},signal,
    })
    return { status:response.ok?'ok':'failed',reason:response.ok?null:`http_${response.status}`,checkedAt:new Date().toISOString() }
  } catch { return { status:'failed',reason:'unreachable',checkedAt:new Date().toISOString() } }
}

function providerConfiguration(provider: string, value?: string) {
  return { provider,configured:Boolean(value),source:value?'environment':'none',verifiedAt:null }
}
