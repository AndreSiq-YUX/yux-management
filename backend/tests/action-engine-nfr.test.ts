import { describe, expect, it } from 'vitest'
import { buildActionEngineNfrSnapshot, buildMissionConversationHealthSnapshot } from '../src/modules/action-engine/operations-health.js'

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

describe('Mission conversation operational telemetry', () => {
  it('reports safe funnel, readiness, latency and usage metrics without message content', () => {
    const snapshot = buildMissionConversationHealthSnapshot([
      { status: 'converted', createdAt: '2026-08-31T12:00:00Z', updatedAt: '2026-08-31T12:04:00Z', firstAgentAt: '2026-08-31T12:00:02Z', confirmedAt: '2026-08-31T12:02:00Z', firstPlanAt: '2026-08-31T12:03:00Z', userTurns: 2, agentTurns: 2, questionCount: 1, totalTokens: 1200, processingFailures: 0, missionId: 'mission-1', missionCostBrl: '12.5', readinessStatus: 'ready_for_plan' },
      { status: 'blocked', createdAt: '2026-08-31T13:00:00Z', updatedAt: '2026-08-31T13:02:00Z', firstAgentAt: '2026-08-31T13:00:04Z', userTurns: 1, agentTurns: 1, questionCount: 0, totalTokens: 500, processingFailures: 1, readinessStatus: 'needs_configuration' },
    ])
    expect(snapshot.acceptedToFirstAgentMessageLatencyMs).toMatchObject({ p50: 2000, p95: 4000, withinSlo: true })
    expect(snapshot.conversion).toEqual({ converted: 1, rate: 0.5 })
    expect(snapshot.readiness).toEqual({ needs_configuration: 1, ready_for_plan: 1 })
    expect(snapshot.usage).toMatchObject({ totalTokens: 1700, averageConvertedMissionCostBrl: 12.5, averageConversationCostBrl: null })
    expect(JSON.stringify(snapshot)).not.toMatch(/prompt|payload|email|phone/i)
  })
})
