import { describe, expect, it } from 'vitest'
import { resourceClaimReadinessCheck, summarizeAutonomyHealth } from '../src/modules/action-engine/readiness.js'

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

describe('Autonomy operational health', () => {
  it('blocks autonomous mutations while an external effect is unresolved', () => {
    expect(summarizeAutonomyHealth([], 1)).toEqual({
      status: 'blocked',
      warnings: [{ code: 'external_effect_unresolved', message: expect.stringContaining('aguardam reconciliação') }],
    })
  })

  it('reports provider degradation without leaking unrelated readiness details', () => {
    expect(summarizeAutonomyHealth([
      { status: 'warn', code: 'ads_provider_degraded', message: 'Provedor com latência elevada.' },
      { status: 'block', code: 'contract_invalid', message: 'Contrato indisponível.' },
    ], 0)).toEqual({
      status: 'degraded',
      warnings: [{ code: 'ads_provider_degraded', message: 'Provedor com latência elevada.' }],
    })
  })
})
