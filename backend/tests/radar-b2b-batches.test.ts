import { describe, expect, it, vi } from 'vitest'
import type pg from 'pg'
import type { AppEnv } from '../src/config/env.js'
import { handleRadarRegionalDiscovery, handleRadarRegionalVerification } from '../src/jobs/handlers/radar.js'

const payload = { organizationId: 'org', campaignId: 'campaign', requestedBy: 'admin' }
const env = { SESSION_SECRET: 'test-secret' } as AppEnv

class BatchPool {
  configuration: unknown = { batch: { maxPagesPerScope: 3 } }
  states = ['MG','SP','PR']
  completedKeys: string[] = []
  queries: Array<{sql:string;params:unknown[]}> = []
  candidates: Array<{ id: string; normalized_payload: Record<string, unknown> }> = []
  async query(sql: string, params: unknown[] = []) {
    this.queries.push({sql,params})
    if (sql.includes('FROM app_users')) return { rows: [{ id: 'admin', email: 'admin@example.com',
      display_name: 'Admin', role: 'yux_admin' }] }
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [{ id: 'campaign', target_states: this.states,
      configuration_revision: 1, search_configuration: this.configuration }] }
    if (sql.includes('FROM public.radar_regional_discovery_cursors')) return { rows: this.completedKeys.map(scope_key => ({scope_key})) }
    if (sql.includes('FROM public.radar_candidate_records')) return { rows: this.candidates }
    throw new Error(`Unexpected query: ${sql}`)
  }
}

describe('Radar regional B2B batches', () => {
  it('uses configured cities, page size and query cap rather than fixed states', async () => {
    const pool = new BatchPool()
    pool.states = ['BA']
    pool.configuration = { cities: [{city:'Salvador',state:'BA'},{city:'Feira de Santana',state:'BA'}],
      batch: {pageSize:4,maxPagesPerScope:5,maxQueriesPerBatch:3} }
    const discover = vi.fn(async (_pool: unknown, _user: unknown, _input: unknown) => ({ candidates:[],issues:[],completed:false }))
    await handleRadarRegionalDiscovery(pool as never, env, payload, undefined, { discover: discover as never })
    expect(discover).toHaveBeenCalledTimes(3)
    expect(discover.mock.calls[0][2]).toMatchObject({regionalState:'BA',regionalCity:'Salvador',limit:4,expectedRevision:1})
    expect(discover.mock.calls[1][2]).toMatchObject({regionalCity:'Feira de Santana'})
  })
  it('skips completed regions before applying the query cap so later regions can progress', async () => {
    const pool = new BatchPool()
    pool.states = ['BA','SC']
    pool.completedKeys = ['v1:BA:all']
    pool.configuration = { batch:{maxQueriesPerBatch:1} }
    const discover = vi.fn(async (_pool: unknown, _user: unknown, _input: unknown) => ({ candidates:[],issues:[],completed:false }))
    await handleRadarRegionalDiscovery(pool as never, env, payload, undefined, { discover: discover as never })
    expect(discover).toHaveBeenCalledTimes(1)
    expect(discover.mock.calls[0][2]).toMatchObject({regionalState:'SC'})
  })
  it('honors disabled Brave and the configured verification limit without outreach', async () => {
    const pool = new BatchPool()
    pool.configuration = {sources:{enrichWithBrave:false,inspectWebsite:false},batch:{verificationLimit:3}}
    pool.candidates = [{id:'company',normalized_payload:{}}]
    const enrich = vi.fn()
    const inspect = vi.fn(async () => ({}))
    await handleRadarRegionalVerification(pool as never, env, payload, undefined, { enrich: enrich as never, inspect: inspect as never })
    expect(enrich).not.toHaveBeenCalled()
    expect(inspect).toHaveBeenCalledTimes(1)
    expect(pool.queries.find(item => item.sql.includes('FROM public.radar_candidate_records'))?.params).toEqual(['org','campaign',1,3])
  })
  it('rejects obsolete queued jobs before calling a provider', async () => {
    const pool = new BatchPool()
    const discover = vi.fn()
    await expect(handleRadarRegionalDiscovery(pool as never, env, {...payload,configurationRevision:2}, undefined,
      {discover:discover as never})).rejects.toThrow('radar_campaign_configuration_changed')
    expect(discover).not.toHaveBeenCalled()
  })
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
    const inspect = vi.fn(async () => ({ site: { status: 'verified_present' }, review: { targetStatus: 'review' } }))
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
