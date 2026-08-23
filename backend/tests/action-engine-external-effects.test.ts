import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { markExternalEffectDispatched, reserveExternalEffect } from '../src/modules/action-engine/external-effects.js'

const organizationId = '00000000-0000-4000-8000-000000000001'
const missionId = '00000000-0000-4000-8000-000000000002'
const runId = '00000000-0000-4000-8000-000000000003'
const effectId = '00000000-0000-4000-8000-000000000004'
const now = '2026-08-22T12:00:00.000Z'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: effectId, organization_id: organizationId, mission_id: missionId, plan_id: null, run_id: runId,
    attempt_id: null, capability_key: 'email.message.queue', capability_version: 1, provider_key: 'email',
    provider_idempotency_key: 'effect-key', request_hash: 'a'.repeat(64), request_metadata: {}, status: 'reserved',
    provider_reference: null, outcome_evidence: {}, last_error_code: null, next_reconcile_at: null,
    reconciliation_deadline_at: '2026-08-22T12:15:00.000Z', dispatched_at: null, resolved_at: null,
    created_at: now, updated_at: now, ...overrides,
  }
}

function poolWithResponses(...responses: Array<{ rows: any[] }>) {
  const query = vi.fn(async (sql: string) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
    const response = responses.shift()
    if (!response) throw new Error(`unexpected_query:${sql.slice(0, 40)}`)
    return response
  })
  return { query, async connect() { return { query, release() {} } } }
}

describe('Action Engine external effect intent', () => {
  it('defines tenant-protected append-only state storage', () => {
    const migration = readFileSync(resolve(process.cwd(), 'src/db/migrations/0130_action_engine_safety_foundation.sql'), 'utf8')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.action_external_effects')
    expect(migration).toContain("'reserved','dispatched','confirmed_created','confirmed_failed','unknown','reconciling','manual_review'")
    expect(migration).toContain('UNIQUE (organization_id, capability_key, capability_version, provider_idempotency_key)')
    expect(migration).toContain('action_external_effect_events_append_only')
    expect(migration).toContain("'action_external_effects','action_external_effect_events','action_incidents'")
    expect(migration).toContain('FORCE ROW LEVEL SECURITY')
  })

  it('persists a reservation and its event before provider dispatch', async () => {
    const pool = poolWithResponses({ rows: [row({ created: true })] }, { rows: [] })
    const result = await reserveExternalEffect(pool as never, {
      organizationId, missionId, runId, capabilityKey: 'email.message.queue', capabilityVersion: 1,
      providerKey: 'email', providerIdempotencyKey: 'effect-key', requestHash: 'a'.repeat(64),
      reconciliationDeadlineAt: '2026-08-22T12:15:00.000Z',
    })

    expect(result.created).toBe(true)
    expect(result.effect.status).toBe('reserved')
    const calls = pool.query.mock.calls.map(([sql]) => String(sql))
    expect(calls.findIndex((sql) => sql.includes('INSERT INTO public.action_external_effects')))
      .toBeLessThan(calls.findIndex((sql) => sql.includes('INSERT INTO public.action_external_effect_events')))
  })

  it('returns the same reservation for a duplicate key and rejects changed intent', async () => {
    const duplicatePool = poolWithResponses({ rows: [row({ created: false })] })
    const duplicate = await reserveExternalEffect(duplicatePool as never, {
      organizationId, missionId, runId, capabilityKey: 'email.message.queue', capabilityVersion: 1,
      providerKey: 'email', providerIdempotencyKey: 'effect-key', requestHash: 'a'.repeat(64),
      reconciliationDeadlineAt: '2026-08-22T12:15:00.000Z',
    })
    expect(duplicate).toMatchObject({ created: false, effect: { id: effectId } })

    const conflictPool = poolWithResponses({ rows: [row({ created: false, request_hash: 'b'.repeat(64) })] })
    await expect(reserveExternalEffect(conflictPool as never, {
      organizationId, missionId, runId, capabilityKey: 'email.message.queue', capabilityVersion: 1,
      providerKey: 'email', providerIdempotencyKey: 'effect-key', requestHash: 'a'.repeat(64),
      reconciliationDeadlineAt: '2026-08-22T12:15:00.000Z',
    })).rejects.toThrowError('external_effect_idempotency_conflict')
  })

  it('records dispatched only after a reserved effect is loaded under lock', async () => {
    const dispatchedRow = row({ status: 'dispatched', dispatched_at: now })
    const pool = poolWithResponses({ rows: [row()] }, { rows: [dispatchedRow] }, { rows: [] })
    const effect = await markExternalEffectDispatched(pool as never, { effectId, organizationId })
    expect(effect.status).toBe('dispatched')
    expect(pool.query.mock.calls.some(([sql]) => String(sql).includes('FOR UPDATE'))).toBe(true)
  })
})

