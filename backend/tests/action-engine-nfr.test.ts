import { describe, expect, it } from 'vitest'
import { buildActionEngineNfrSnapshot } from '../src/modules/action-engine/operations-health.js'

describe('Action Engine NFR telemetry', () => {
  it('reports p95/p99 and SLO state with no payload fields', () => {
    const snapshot = buildActionEngineNfrSnapshot({
      planningLatencyMs: [100,200,300,400,500,600,700,800,900,1000],
      executionLatencyMs: [10,20,30,40,50], executorAvailable: [true,true,true,false],
    })
    expect(snapshot.planningLatencyMs).toMatchObject({ p95: 1000, p99: 1000 })
    expect(snapshot.executorAvailability).toBe(0.75)
    expect(JSON.stringify(snapshot)).not.toMatch(/email|phone|payload|prompt/i)
  })
})
