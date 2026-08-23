import { describe, expect, it } from 'vitest'
import { resourceClaimReadinessCheck } from '../src/modules/action-engine/readiness.js'

describe('Mission readiness resource ownership', () => {
  it('returns a deep-linkable blocker without exposing another tenant', () => {
    expect(resourceClaimReadinessCheck({
      missionId: 'mission-2', missionLabel: 'Campanha de agosto', leaseExpiresAt: '2026-08-22T12:05:00.000Z',
    })).toEqual({
      status: 'block', code: 'resource_claim_conflict',
      message: 'O recurso está reservado pela missão “Campanha de agosto” até 2026-08-22T12:05:00.000Z.',
      fixHref: '/missions/mission-2',
    })
    expect(resourceClaimReadinessCheck(null)).toMatchObject({ status: 'pass', code: 'resource_claim_available' })
  })
})
