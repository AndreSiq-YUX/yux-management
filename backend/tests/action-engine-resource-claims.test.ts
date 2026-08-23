import { describe, expect, it, vi } from 'vitest'
import {
  ResourceClaimConflict,
  acquireResourceClaim,
  assertFencingToken,
  releaseResourceClaims,
  renewResourceClaim,
} from '../src/modules/action-engine/resource-claims.js'

function client(rows: unknown[][]) {
  let index = 0
  return {
    query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: rows[index++] ?? [], rowCount: 1 })),
  }
}

const base = {
  organizationId: 'org-1', missionId: 'mission-1', missionLabel: 'Recuperar receita',
  resourceKey: 'crm.lead_population', scope: 'inactive_revenue_recovery', mode: 'exclusive' as const,
  ttlSeconds: 300,
}

describe('Mission resource claims', () => {
  it('serializes acquisition and reuses the same mission lease without changing its token', async () => {
    const db = client([[], [], [{ id: 'claim-1', mission_id: 'mission-1', fencing_token: '7' }], [{
      id: 'claim-1', organization_id: 'org-1', mission_id: 'mission-1', mission_label: 'Recuperar receita',
      resource_key: base.resourceKey, scope: base.scope, mode: 'exclusive', fencing_token: '7',
      lease_expires_at: '2026-08-22T12:05:00.000Z', last_renewed_at: '2026-08-22T12:00:00.000Z',
    }]])
    const result = await acquireResourceClaim(db as never, { ...base, now: new Date('2026-08-22T12:00:00.000Z') })
    expect(result.fencingToken).toBe(7n)
    expect(db.query.mock.calls[0]?.[0]).toContain('pg_advisory_xact_lock')
    expect(db.query.mock.calls.some(([sql]) => String(sql).includes('last_renewed_at'))).toBe(true)
  })

  it('rejects an incompatible active owner with a legible conflict', async () => {
    const db = client([[], [], [{
      id: 'claim-2', mission_id: 'mission-2', mission_label: 'Outra missão', mode: 'exclusive',
      lease_expires_at: '2026-08-22T12:04:00.000Z', fencing_token: '3',
    }]])
    await expect(acquireResourceClaim(db as never, { ...base, now: new Date('2026-08-22T12:00:00.000Z') }))
      .rejects.toMatchObject({
        message: 'resource_claim_conflict', ownerMissionId: 'mission-2', ownerMissionLabel: 'Outra missão',
      } satisfies Partial<ResourceClaimConflict>)
  })

  it('takes over an expired scope with a strictly newer fencing token', async () => {
    const db = client([[], [], [], [{ fencing_token: '12' }], [{
      id: 'claim-3', organization_id: 'org-1', mission_id: 'mission-1', mission_label: 'Recuperar receita',
      resource_key: base.resourceKey, scope: base.scope, mode: 'exclusive', fencing_token: '12',
      lease_expires_at: '2026-08-22T12:05:00.000Z', last_renewed_at: '2026-08-22T12:00:00.000Z',
    }]])
    const claim = await acquireResourceClaim(db as never, { ...base, now: new Date('2026-08-22T12:00:00.000Z') })
    expect(claim.fencingToken).toBe(12n)
    expect(db.query.mock.calls[4]?.[1]?.[6]).toBe('12')
  })

  it('renews and releases only the exact fencing token', async () => {
    const renewDb = client([[{ id: 'claim-1', organization_id: 'org-1', mission_id: 'mission-1', mission_label: 'M', resource_key: 'r', scope: 's', mode: 'exclusive', fencing_token: '9', lease_expires_at: '2026-08-22T12:05:00Z', last_renewed_at: '2026-08-22T12:00:00Z' }]])
    expect((await renewResourceClaim(renewDb as never, { claimId: 'claim-1', organizationId: 'org-1', missionId: 'mission-1', fencingToken: 9n, ttlSeconds: 300 })).fencingToken).toBe(9n)
    const staleDb = client([[]])
    await expect(assertFencingToken(staleDb as never, { organizationId: 'org-1', missionId: 'mission-1', resourceKey: 'r', scope: 's', fencingToken: 8n }))
      .rejects.toThrowError('resource_claim_stale_fencing_token')
    const releaseDb = client([[]])
    await releaseResourceClaims(releaseDb as never, 'mission-1', 'org-1')
    expect(releaseDb.query).toHaveBeenCalledWith(expect.stringContaining('released_at = NOW()'), ['mission-1', 'org-1'])
  })
})
