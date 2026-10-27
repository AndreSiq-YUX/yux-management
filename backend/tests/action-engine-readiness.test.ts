import { describe, expect, it } from 'vitest'
import { evaluateMissionReadiness, resourceClaimReadinessCheck, summarizeAutonomyHealth } from '../src/modules/action-engine/readiness.js'
import { REVENUE_RECOVERY_PACK_V0 } from '../src/modules/action-engine/packs/revenue-recovery-v0.js'

describe('Mission readiness economic limits', () => {
  it.each(['0', '0.00'])('accepts zero budget, hours and hourly cost (%s) for an internal no-spend plan', async zero => {
    const report = await evaluateMissionReadiness(readinessPool, { ...readinessInput, maxTotalCostBrl: zero, maxHumanHours: zero, humanHourlyRateBrl: zero })
    expect(report.checks).toContainEqual(expect.objectContaining({ code: 'mission_parameters_valid', status: 'pass' }))
    expect(report.ready).toBe(true)
  })

  it.each(['-1', '', 'NaN'])('rejects an invalid execution budget (%s)', async value => {
    const report = await evaluateMissionReadiness(readinessPool, { ...readinessInput, maxTotalCostBrl: value })
    expect(report.checks).toContainEqual(expect.objectContaining({ code: 'mission_parameters_invalid', status: 'block' }))
  })
})

const readinessInput = {
  organizationId: '00000000-0000-4000-8000-000000000001', targetRevenueBrl: '10000',
  deadlineAt: new Date(Date.now() + 86400000).toISOString(), maxTotalCostBrl: '1000', maxHumanHours: '8', humanHourlyRateBrl: '100',
  agentHarnessHealthy: true, mutationLeaseReady: true,
}
const readinessPool = {
  async query<T>(sql: string) {
    if (sql.includes('SELECT id, kind FROM public.organizations')) return { rows: [{ id: readinessInput.organizationId, kind: 'yux' }] as T[] }
    if (sql.includes('FROM public.crm_instances') || sql.includes('FROM public.memberships')) return { rows: [{ id: 'fixture' }] as T[] }
    if (sql.includes('COUNT(*)')) return { rows: [{ count: '1' }] as T[] }
    if (sql.includes('information_schema.tables')) return { rows: [{ available: true }] as T[] }
    if (sql.includes('FROM public.action_pack_versions')) return { rows: [{ content_hash: REVENUE_RECOVERY_PACK_V0.contentHash }] as T[] }
    if (sql.includes('FROM public.action_resource_claims') || sql.includes('FROM public.channel_connections')) return { rows: [] as T[] }
    throw new Error(`Unexpected readiness query: ${sql}`)
  },
}

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
