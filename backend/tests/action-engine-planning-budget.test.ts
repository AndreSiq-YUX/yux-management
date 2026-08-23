import { describe, expect, it, vi } from 'vitest'
import {
  evaluatePlanningReservation,
  shouldRunSpecialist,
  type PlanningCycleBudget,
  type PlanningUsage,
} from '../src/modules/action-engine/planning-cycle.js'
import {
  createPlanningArtifactCacheKey,
  getCachedArtifact,
} from '../src/modules/action-engine/planning-artifact-cache.js'

const budget: PlanningCycleBudget = {
  maxCalls: 3, maxInputTokens: 10_000, maxOutputTokens: 2_000, maxCostBrl: '5', maxLatencyMs: 30_000,
}
const usage: PlanningUsage = { calls: 1, inputTokens: 2_000, outputTokens: 500, costBrl: '1', latencyMs: 5_000 }

describe('bounded mission planning', () => {
  it('accepts the exact boundary and rejects every exceeded dimension', () => {
    expect(evaluatePlanningReservation(budget, usage, {
      calls: 2, inputTokens: 8_000, outputTokens: 1_500, costBrl: '4', latencyMs: 25_000,
    })).toMatchObject({ allowed: true })
    for (const [field, value] of Object.entries({ calls: 3, inputTokens: 8_001, outputTokens: 1_501, costBrl: '4.01', latencyMs: 25_001 })) {
      const estimate = { calls: 0, inputTokens: 0, outputTokens: 0, costBrl: '0', latencyMs: 0, [field]: value }
      expect(evaluatePlanningReservation(budget, usage, estimate)).toMatchObject({ allowed: false, reason: `planning_budget_${field}_exhausted` })
    }
  })

  it('skips specialists deterministically when the predicate is false or a valid artifact exists', () => {
    expect(shouldRunSpecialist({ requiredWhen: { field: 'channels', includes: 'email' }, context: { channels: ['human_task'] }, artifactValid: false })).toBe(false)
    expect(shouldRunSpecialist({ requiredWhen: { field: 'channels', includes: 'email' }, context: { channels: ['email'] }, artifactValid: true })).toBe(false)
    expect(shouldRunSpecialist({ requiredWhen: { field: 'channels', includes: 'email' }, context: { channels: ['email'] }, artifactValid: false })).toBe(true)
  })

  it('keys cache by tenant, context, pack, profile version and relevant input', async () => {
    const base = { organizationId: 'org-1', contextHash: 'a'.repeat(64), packKey: 'revenue_recovery', packVersion: '0.1.0', specialistProfile: 'copywriter', specialistVersion: 2, relevantInput: { channel: 'email' } }
    const key = createPlanningArtifactCacheKey(base)
    expect(createPlanningArtifactCacheKey({ ...base, organizationId: 'org-2' })).not.toBe(key)
    expect(createPlanningArtifactCacheKey({ ...base, specialistVersion: 3 })).not.toBe(key)
    expect(createPlanningArtifactCacheKey({ ...base, contextHash: 'b'.repeat(64) })).not.toBe(key)
    const db = { query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [{ artifact: { subject: 'Olá' }, artifact_schema: 'email_copy', artifact_version: 1 }] })) }
    await expect(getCachedArtifact(db as never, { ...base, cacheKey: key, artifactSchema: 'email_copy', artifactVersion: 1 })).resolves.toEqual({ subject: 'Olá' })
    expect(db.query.mock.calls[0]?.[1]?.[0]).toBe('org-1')
  })
})
