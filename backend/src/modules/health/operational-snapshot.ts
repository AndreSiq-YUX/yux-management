import type pg from 'pg'
import type { AppEnv } from '../../config/env.js'
import { QUEUE_NAMES, createQueue, createRedisConnection, type JobQueueClass } from '../../jobs/queue.js'
import { getOutboxOperationalSnapshot } from '../events/repository.js'
import { resolveEffectiveProviderCredential } from '../platform/provider-credentials.js'

export async function buildOperationalSnapshot(pool: pg.Pool, env: AppEnv, fetchImpl: typeof fetch = fetch) {
  const measuredAt = new Date()
  const [heartbeats, outbox, queues, harness, usage] = await Promise.all([
    pool.query<{ instance_id:string;queue_classes:string[];started_at:Date|string;last_seen_at:Date|string;metadata:Record<string,unknown> }>(
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
  const workers = heartbeats.rows.map(row => {
    const lastSeenAt = new Date(row.last_seen_at)
    return {
      instanceId: row.instance_id,
      queueClasses: row.queue_classes,
      status: measuredAt.getTime() - lastSeenAt.getTime() > 90_000 ? 'stale' : 'ok',
      startedAt: new Date(row.started_at).toISOString(),
      lastSeenAt: lastSeenAt.toISOString(),
      metadata: row.metadata,
    }
  })
  if (!workers.length) workers.push({ instanceId:'none',queueClasses:[],status:'stale',startedAt:measuredAt.toISOString(),lastSeenAt:measuredAt.toISOString(),metadata:{} })
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
