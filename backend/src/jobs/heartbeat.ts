import type pg from 'pg'

export function recordWorkerHeartbeat(pool: pg.Pool, input: {
  instanceId: string
  queueClasses: string[]
  startedAt: string
  metadata?: Record<string, unknown>
}) {
  return pool.query(
    `INSERT INTO public.worker_process_heartbeats (instance_id,queue_classes,started_at,last_seen_at,metadata)
     VALUES ($1,$2,$3,NOW(),$4)
     ON CONFLICT (instance_id) DO UPDATE SET queue_classes=EXCLUDED.queue_classes,last_seen_at=NOW(),metadata=EXCLUDED.metadata`,
    [input.instanceId, input.queueClasses, input.startedAt, input.metadata ?? {}],
  )
}
