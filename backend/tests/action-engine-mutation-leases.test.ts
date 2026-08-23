import { describe, expect, it, vi } from 'vitest'
import {
  consumeMutationLease,
  issueMutationLease,
  signMutationLease,
  verifyMutationLease,
  type MutationLeaseClaims,
} from '../src/modules/action-engine/mutation-leases.js'

const secret = 'lease-secret-that-is-longer-than-thirty-two-bytes'
const claims: MutationLeaseClaims = {
  leaseId: '00000000-0000-4000-8000-000000000001', missionId: 'mission-1', actionRunId: 'run-1',
  attemptId: 'attempt-1', capabilityKey: 'email.send', capabilityVersion: 1,
  capabilityDefinitionHash: 'a'.repeat(64), fencingToken: '7', effect: 'external',
  issuedAt: '2026-08-22T12:00:00.000Z', expiresAt: '2026-08-22T12:00:30.000Z',
}

describe('short-lived mutation leases', () => {
  it('verifies the exact scope before expiry and rejects every mismatch', () => {
    const token = signMutationLease(claims, secret)
    expect(verifyMutationLease(token, secret, claims, new Date('2026-08-22T12:00:29.999Z'))).toEqual(claims)
    expect(() => verifyMutationLease(token, secret, claims, new Date('2026-08-22T12:00:30.000Z'))).toThrowError('mutation_lease_expired')
    for (const field of ['missionId','actionRunId','attemptId','capabilityDefinitionHash','fencingToken'] as const) {
      expect(() => verifyMutationLease(token, secret, { ...claims, [field]: `${claims[field]}-wrong` }, new Date('2026-08-22T12:00:01Z')))
        .toThrowError('mutation_lease_scope_mismatch')
    }
  })

  it('caps issuance at 30 seconds and consumes a lease only once', async () => {
    const issuedRow = { id: claims.leaseId }
    const issueDb = { query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: [issuedRow] })) }
    const issued = await issueMutationLease(issueDb as never, secret, {
      organizationId: 'org-1', ...claims, leaseId: undefined, issuedAt: undefined, expiresAt: undefined,
      ttlSeconds: 120, now: new Date('2026-08-22T12:00:00.000Z'),
    })
    expect(issued.claims.expiresAt).toBe('2026-08-22T12:00:30.000Z')

    let consumed = false
    const consumeDb = { query: vi.fn(async (_sql: string, _params?: unknown[]) => ({ rows: consumed ? [] : (consumed = true, [{ id: claims.leaseId }]) })) }
    await expect(consumeMutationLease(consumeDb as never, { token: issued.token, secret, expected: issued.claims, organizationId: 'org-1', now: new Date('2026-08-22T12:00:01Z') })).resolves.toBeUndefined()
    await expect(consumeMutationLease(consumeDb as never, { token: issued.token, secret, expected: issued.claims, organizationId: 'org-1', now: new Date('2026-08-22T12:00:02Z') })).rejects.toThrowError('mutation_lease_replayed_or_revoked')
  })
})
