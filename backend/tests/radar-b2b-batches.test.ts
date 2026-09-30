import { describe, expect, it, vi } from 'vitest'
import type pg from 'pg'
import type { AppEnv } from '../src/config/env.js'
import { handleRadarRegionalDiscovery, handleRadarRegionalVerification } from '../src/jobs/handlers/radar.js'

const payload = { organizationId: 'org', campaignId: 'campaign', requestedBy: 'admin' }
const env = { SESSION_SECRET: 'test-secret' } as AppEnv

class BatchPool {
  candidates: Array<{ id: string; normalized_payload: Record<string, unknown> }> = []
  async query(sql: string) {
    if (sql.includes('FROM app_users')) return { rows: [{ id: 'admin', email: 'admin@example.com',
      display_name: 'Admin', role: 'yux_admin' }] }
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [{ id: 'campaign', target_states: ['MG', 'SP', 'PR'] }] }
    if (sql.includes('FROM public.radar_candidate_records')) return { rows: this.candidates }
    throw new Error(`Unexpected query: ${sql}`)
  }
}

describe('Radar regional B2B batches', () => {
  it('visits all three states fairly and stops completed states', async () => {
    const pool = new BatchPool()
    const calls: string[] = []
    const discover = vi.fn(async (_pool, _user, input) => {
      calls.push(input.regionalState)
      return { candidates: [{ id: `${input.regionalState}-${calls.length}` }], issues: [],
        completed: input.regionalState === 'MG' || calls.filter(state => state === input.regionalState).length === 2 }
    })
    const result = await handleRadarRegionalDiscovery(pool as unknown as pg.Pool, env, payload,
      undefined, { discover: discover as never })
    expect(calls).toEqual(['MG', 'SP', 'PR', 'SP', 'PR'])
    expect(result.summary.MG).toEqual({ pages: 1, candidates: 1, status: 'completed' })
    expect(result.summary.SP).toEqual({ pages: 2, candidates: 2, status: 'completed' })
    expect(result.interrupted).toBe(false)
  })

  it('verifies public business sites without starting outreach', async () => {
    const pool = new BatchPool()
    pool.candidates = [
      { id: 'existing-site', normalized_payload: { websiteUrl: 'https://example.com' } },
      { id: 'brave-match', normalized_payload: {} },
    ]
    const enrich = vi.fn(async () => ({ matched: true,
      candidate: { normalizedPayload: { websiteUrl: 'https://matched.example' } } }))
    const inspect = vi.fn(async () => ({ site: { status: 'verified_present' }, review: { kitchenStatus: 'review' } }))
    const result = await handleRadarRegionalVerification(pool as unknown as pg.Pool, env, payload,
      undefined, { enrich: enrich as never, inspect: inspect as never })
    expect(enrich).toHaveBeenCalledTimes(1)
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(result.summary).toEqual({ inspected: 2, matched: 1, needsReview: 0, errors: 0 })
  })

  it('rejects jobs queued by an admin who is no longer active', async () => {
    const pool = new BatchPool()
    pool.query = async () => ({ rows: [] })
    await expect(handleRadarRegionalDiscovery(pool as unknown as pg.Pool, env, payload))
      .rejects.toThrow('radar_batch_admin_not_active')
  })
})
