import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { expect, it } from 'vitest'
import { QUEUE_NAMES, createBullMqJobId, createRedisConnection, createWorker } from '../../src/jobs/queue.js'
import { createRoutedJobQueue } from '../../src/jobs/router.js'
import { acquireSchedulerLeadership } from '../../src/jobs/scheduler-leadership.js'
import { getIntegrationDatabaseUrl } from './support/rig.js'

const redisUrl = process.env.YUX_INTEGRATION_REDIS_URL
  || 'redis://:yux_test_redis_password@127.0.0.1:56379/0'

it('isola atendimento de ingestão ocupada e preserva identidade externa após reinício', async () => {
  const prefix = `queue-isolation-${randomUUID()}`
  const connection = createRedisConnection(redisUrl)
  const router = createRoutedJobQueue({ connection, prefix })
  let releaseIngestion!: () => void
  const ingestionGate = new Promise<void>(resolve => { releaseIngestion = resolve })
  let ingestionStarted!: () => void
  const started = new Promise<void>(resolve => { ingestionStarted = resolve })
  const externalCalls: string[] = []
  const ingestionWorker = createWorker(QUEUE_NAMES.ingestion, async () => {
    ingestionStarted()
    await ingestionGate
    return { ok: true }
  }, connection, { prefix, concurrency: 1 })
  const interactiveWorker = createWorker(QUEUE_NAMES.interactive, async () => ({ ok: true }), connection, { prefix, concurrency: 2 })
  let externalWorker = createWorker(QUEUE_NAMES.external, async job => {
    externalCalls.push(String((job.data.body as Record<string, unknown>)?.intentId || ''))
    await new Promise(resolve => setTimeout(resolve, 150))
    return { ok: true }
  }, connection, { prefix, concurrency: 2 })

  try {
    await Promise.all([...router.queues().map(queue => queue.waitUntilReady()), ingestionWorker.waitUntilReady(), interactiveWorker.waitUntilReady(), externalWorker.waitUntilReady()])
    const organizationA = randomUUID()
    const organizationB = randomUUID()
    await router.add('company-intelligence.indexKnowledge', {
      organizationId: organizationA,
      sourceId: randomUUID(),
      documentId: randomUUID(),
    }, { jobId: createBullMqJobId('isolation-ingestion', randomUUID()) })
    await started

    const interactiveCompleted = onceCompleted(interactiveWorker)
    const interactiveQueuedAt = Date.now()
    await router.add('automation.dispatch', { organizationId: organizationB, reason: 'queue-isolation' }, {
      jobId: createBullMqJobId('isolation-interactive', randomUUID()),
    })
    await interactiveCompleted
    expect(Date.now() - interactiveQueuedAt).toBeLessThan(5_000)

    const intentId = randomUUID()
    const providerJobId = createBullMqJobId('provider-intent', intentId)
    const providerData = {
      organizationId: organizationA,
      requestedBy: 'queue-isolation',
      functionName: 'execute-ad-provider-mutation',
      body: {
        organizationId: organizationA,
        action: 'pause_campaign',
        campaignId: randomUUID(),
        providerConnectionId: randomUUID(),
        intentId,
        requestPayload: {},
      },
    }
    const providerCompleted = onceCompleted(externalWorker)
    await Promise.all([
      router.add('provider.functionInvoke', providerData, { jobId: providerJobId }),
      router.add('provider.functionInvoke', providerData, { jobId: providerJobId }),
    ])
    await providerCompleted
    expect(externalCalls).toEqual([intentId])

    await externalWorker.close()
    externalWorker = createWorker(QUEUE_NAMES.external, async job => {
      externalCalls.push(String((job.data.body as Record<string, unknown>)?.intentId || ''))
      return { ok: true }
    }, connection, { prefix, concurrency: 2 })
    await externalWorker.waitUntilReady()
    await new Promise(resolve => setTimeout(resolve, 200))
    expect(externalCalls).toEqual([intentId])
    releaseIngestion()
  } finally {
    releaseIngestion()
    await Promise.all([ingestionWorker.close(), interactiveWorker.close(), externalWorker.close()])
    await router.close()
  }
})

function onceCompleted<Result>(worker: ReturnType<typeof createWorker<Result>>) {
  return new Promise<void>((resolve, reject) => {
    worker.once('completed', () => resolve())
    worker.once('failed', (_job, error) => reject(error))
  })
}

it('elege um único scheduler e transfere liderança após liberação', async () => {
  const firstPool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 1 })
  const secondPool = new pg.Pool({ connectionString: getIntegrationDatabaseUrl(), max: 1 })
  try {
    const first = await acquireSchedulerLeadership(firstPool)
    expect(first).not.toBeNull()
    expect(await acquireSchedulerLeadership(secondPool)).toBeNull()
    await first?.release()
    const successor = await acquireSchedulerLeadership(secondPool)
    expect(successor).not.toBeNull()
    await successor?.release()
  } finally {
    await firstPool.end()
    await secondPool.end()
  }
})
