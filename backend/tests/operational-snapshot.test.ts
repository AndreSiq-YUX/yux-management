import { describe, expect, it } from 'vitest'
import { selectCurrentWorkerHeartbeats } from '../src/modules/health/operational-snapshot.js'

const measuredAt = new Date('2026-09-09T12:00:00.000Z')

function heartbeat(instanceId: string, queueClasses: string[], lastSeenAt: string) {
  return {
    instance_id: instanceId,
    queue_classes: queueClasses,
    started_at: '2026-09-09T11:00:00.000Z',
    last_seen_at: lastSeenAt,
    metadata: {},
  }
}

describe('selectCurrentWorkerHeartbeats', () => {
  it('ignores a stale replaced worker when a fresh successor owns the same queue class', () => {
    const selected = selectCurrentWorkerHeartbeats([
      heartbeat('interactive-old', ['interactive'], '2026-09-09T11:50:00.000Z'),
      heartbeat('interactive-current', ['interactive'], '2026-09-09T11:59:50.000Z'),
      heartbeat('ingestion-current', ['ingestion'], '2026-09-09T11:59:49.000Z'),
      heartbeat('external-current', ['external'], '2026-09-09T11:59:48.000Z'),
      heartbeat('maintenance-current', ['maintenance'], '2026-09-09T11:59:47.000Z'),
    ], measuredAt)

    expect(selected.workers.map(worker => worker.instanceId)).not.toContain('interactive-old')
    expect(selected.workers).toHaveLength(4)
    expect(selected.workers.every(worker => worker.status === 'ok')).toBe(true)
    expect(selected.replacedHeartbeatCount).toBe(1)
  })

  it('reports a missing queue class instead of presenting partial worker coverage as healthy', () => {
    const selected = selectCurrentWorkerHeartbeats([
      heartbeat('interactive-current', ['interactive'], '2026-09-09T11:59:50.000Z'),
    ], measuredAt)

    expect(selected.workers).toEqual(expect.arrayContaining([
      expect.objectContaining({ instanceId: 'missing:ingestion', queueClasses: ['ingestion'], status: 'stale' }),
      expect.objectContaining({ instanceId: 'missing:external', queueClasses: ['external'], status: 'stale' }),
      expect.objectContaining({ instanceId: 'missing:maintenance', queueClasses: ['maintenance'], status: 'stale' }),
    ]))
  })
})
