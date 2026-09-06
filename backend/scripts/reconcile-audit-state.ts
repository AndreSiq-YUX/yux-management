import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Queue } from 'bullmq'
import { createPool } from '../src/db/client.js'
import { runWithDatabaseRequestContext } from '../src/db/request-context.js'
import { DEFAULT_QUEUE_NAME, isJobName, createQueue, createRedisConnection, type QueueJobData } from '../src/jobs/queue.js'
import { createRoutedJobQueue } from '../src/jobs/router.js'
import {
  applyReconciliationManifest,
  buildReconciliationManifest,
  RECONCILIATION_MAX_BATCH,
  type FailedQueueJob,
  type ReconciliationQueueAccess,
} from '../src/modules/reconciliation/state-reconciliation.js'

type CliOptions = {
  mode: 'dry-run' | 'apply'
  limit: number
  output?: string
  manifest?: string
  approvedHash?: string
  cutoffHours: number
}

export async function runReconciliationCli(argv = process.argv.slice(2)) {
  const options = parseArgs(argv)
  const pool = createPool(process.env.MIGRATOR_DATABASE_URL || process.env.DATABASE_URL)
  const queues = new BullMqReconciliationAccess()
  try {
    return await runWithDatabaseRequestContext(
      { role: 'yux_operator', organizationIds: [], serviceRole: 'worker' },
      async () => {
        if (options.mode === 'dry-run') {
          const now = new Date()
          const manifest = await buildReconciliationManifest(pool, {
            limit: options.limit,
            cutoffAt: new Date(now.getTime() - options.cutoffHours * 60 * 60 * 1_000),
            now,
            queue: queues,
          })
          await writeFile(path.resolve(options.output!), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
          return {
            mode: options.mode, output: path.resolve(options.output!), manifestHash: manifest.manifestHash,
            itemCount: manifest.items.length,
          }
        }
        const manifest = JSON.parse(await readFile(path.resolve(options.manifest!), 'utf8')) as unknown
        return {
          mode: options.mode,
          ...(await applyReconciliationManifest(pool, manifest, {
            approvedHash: options.approvedHash!, limit: options.limit, queue: queues,
            appliedBy: process.env.YUX_RECONCILIATION_OPERATOR || 'cli-operator',
          })),
        }
      },
    )
  } finally {
    await queues.close()
    await pool.end()
  }
}

class BullMqReconciliationAccess implements ReconciliationQueueAccess {
  private readonly connection = createRedisConnection()
  private readonly routed = createRoutedJobQueue({ connection: this.connection })
  private readonly legacy = createQueue(DEFAULT_QUEUE_NAME, this.connection)
  private readonly sources = new Map<string, { queueClass: string; queue: Queue<QueueJobData, unknown, string> }>()

  constructor() {
    this.sources.set(`legacy/${DEFAULT_QUEUE_NAME}`, { queueClass: 'legacy', queue: this.legacy })
    for (const queueClass of ['interactive','ingestion','external','maintenance'] as const) {
      const queue = this.routed.getQueue(queueClass)
      this.sources.set(`${queueClass}/${queue.name}`, { queueClass, queue })
    }
  }

  async scanFailed(limit: number) {
    const jobs: FailedQueueJob[] = []
    for (const [queueName, source] of this.sources) {
      const failed = await source.queue.getFailed(0, Math.max(0, limit - 1))
      for (const job of failed) jobs.push(this.toSnapshot(queueName, source.queueClass, job))
    }
    return jobs.sort((left, right) => (left.finishedOn ?? 0) - (right.finishedOn ?? 0) || left.id.localeCompare(right.id))
  }

  async getFailed(queueName: string, id: string) {
    const source = this.sources.get(queueName)
    if (!source) return null
    const job = await source.queue.getJob(id)
    if (!job || await job.getState() !== 'failed') return null
    return this.toSnapshot(queueName, source.queueClass, job)
  }

  enqueue(name: string, data: Record<string, unknown>, jobId: string) {
    if (!isJobName(name)) throw new Error('reconciliation_job_name_not_registered')
    return this.routed.add(name, data, { jobId })
  }

  async close() {
    await Promise.all([this.routed.close(), this.legacy.close()])
  }

  private toSnapshot(queueName: string, queueClass: string, job: {
    id?: string; name: string; data: QueueJobData; attemptsMade: number; finishedOn?: number; failedReason?: string
  }): FailedQueueJob {
    return {
      queueName, queueClass, id: job.id ?? '', name: job.name, data: job.data,
      attemptsMade: job.attemptsMade, ...(job.finishedOn ? { finishedOn: job.finishedOn } : {}),
      ...(job.failedReason ? { failedReason: job.failedReason } : {}),
    }
  }
}

function parseArgs(argv: string[]): CliOptions {
  const allowed = new Set(['--dry-run','--apply','--limit','--output','--manifest','--approved-hash','--cutoff-hours'])
  const flags = new Map<string, string | true>()
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]!
    if (!value.startsWith('--')) throw new Error(`reconciliation_argument_invalid:${value}`)
    if (!allowed.has(value)) throw new Error(`reconciliation_argument_unknown:${value}`)
    if (flags.has(value)) throw new Error(`reconciliation_argument_duplicate:${value}`)
    if (['--dry-run','--apply'].includes(value)) flags.set(value, true)
    else {
      const next = argv[index + 1]
      if (!next || next.startsWith('--')) throw new Error(`reconciliation_argument_value_required:${value}`)
      flags.set(value, next)
      index += 1
    }
  }
  const apply = flags.has('--apply')
  if (apply && flags.has('--dry-run')) throw new Error('reconciliation_mode_conflict')
  const limit = integerFlag(flags, '--limit', apply ? undefined : RECONCILIATION_MAX_BATCH)
  if (limit === undefined || limit < 1 || limit > RECONCILIATION_MAX_BATCH) throw new Error('reconciliation_limit_must_be_between_1_and_20')
  const cutoffHours = integerFlag(flags, '--cutoff-hours', 24)!
  if (cutoffHours < 1 || cutoffHours > 24 * 365) throw new Error('reconciliation_cutoff_hours_invalid')
  if (apply) {
    const manifest = stringFlag(flags, '--manifest')
    const approvedHash = stringFlag(flags, '--approved-hash')
    if (!manifest || !approvedHash || !/^[a-f0-9]{64}$/.test(approvedHash)) throw new Error('reconciliation_apply_requires_manifest_approved_hash_and_limit')
    return { mode: 'apply', limit, manifest, approvedHash, cutoffHours }
  }
  const output = stringFlag(flags, '--output')
  if (!output) throw new Error('reconciliation_dry_run_requires_output')
  return { mode: 'dry-run', limit, output, cutoffHours }
}

function stringFlag(flags: Map<string, string | true>, key: string) {
  const value = flags.get(key)
  return typeof value === 'string' && value.trim() ? value : undefined
}

function integerFlag(flags: Map<string, string | true>, key: string, fallback?: number) {
  const value = stringFlag(flags, key)
  if (value === undefined) return fallback
  const parsed = Number(value)
  return Number.isInteger(parsed) ? parsed : undefined
}

const isDirectRun = process.argv[1] ? path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) : false
if (isDirectRun) {
  const result = await runReconciliationCli()
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
}
