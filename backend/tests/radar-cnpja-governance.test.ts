import { describe, expect, it, vi } from 'vitest'
import { runRadarCnpjaAdvancedSearch } from '../src/modules/radar/repository.js'
import type { AuthUser } from '../src/auth/routes.js'

const admin = { id: '00000000-0000-4000-8000-000000000001', role: 'yux_admin' } as AuthUser
const operator = { ...admin, role: 'yux_operator' } as AuthUser
const organizationId = '00000000-0000-4000-8000-000000000002'
const campaignId = '00000000-0000-4000-8000-000000000003'

class PoolFixture {
  used = 0
  pendingUsed = 0
  failCandidateWrite = false
  regional = false
  regionalCursor: { next_token: string | null; completed: boolean; running_until: null } | null = null
  queries: string[] = []
  async connect() { return { query: this.query.bind(this), release() {} } }
  async query(sql: string, params: unknown[] = []) {
    this.queries.push(sql)
    if (sql === 'BEGIN') { this.pendingUsed = 0; return { rows: [] } }
    if (sql === 'COMMIT') { this.used += this.pendingUsed; this.pendingUsed = 0; return { rows: [] } }
    if (sql === 'ROLLBACK') { this.pendingUsed = 0; return { rows: [] } }
    if (sql.includes("kind = 'yux'")) return { rows: [{ allowed: true }] }
    if (sql.includes('FROM public.radar_data_sources')) return { rows: [{
      id: '00000000-0000-4000-8000-000000000004', organization_id: null,
      source_key: 'cnpja_advanced_search', source_type: 'cnpja_advanced_search', display_name: 'CNPJa',
      enabled: true, is_paid: true, requires_secret: true, terms_notes: 'fixture',
      default_cost_per_unit: '0.025', rate_limit_per_day: 10,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }] }
    if (sql.includes('FROM public.platform_provider_connections')) return { rows: [{
      id: '00000000-0000-4000-8000-000000000005', status: 'active', public_config: {},
    }] }
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [{ id: campaignId, daily_limit: 10, budget_limit: '1.00',
      campaign_type: this.regional ? 'regional_b2b' : 'local_niche', target_states: this.regional ? ['MG', 'SP', 'PR'] : [] }] }
    if (sql.includes('FROM public.radar_regional_discovery_cursors')) return { rows: this.regionalCursor ? [this.regionalCursor] : [] }
    if (sql.includes('INSERT INTO public.radar_regional_discovery_cursors')) return { rows: [] }
    if (sql.includes('UPDATE public.radar_regional_discovery_cursors')) {
      if (sql.includes('pages_processed')) this.regionalCursor = { next_token: params[3] as string | null,
        completed: params[4] as boolean, running_until: null }
      return { rows: [] }
    }
    if (sql.includes('FROM public.radar_source_usage_counters')) return { rows: [{ units: this.used, estimated_cost: this.used * 0.025 }] }
    if (sql.includes('INSERT INTO public.radar_source_usage_counters')) { this.pendingUsed++; return { rows: [] } }
    if (sql.includes('INSERT INTO public.radar_enrichment_runs')) return { rows: [{ id: '00000000-0000-4000-8000-000000000006' }] }
    if (sql.includes('INSERT INTO public.radar_candidate_records') && this.failCandidateWrite) throw new Error('candidate_write_failed')
    return { rows: [] }
  }
}

describe('CNPJa search governance', () => {
  it('reserves one paid request even when the provider returns zero companies', async () => {
    const pool = new PoolFixture()
    const search = vi.fn(async () => [])
    const result = await runRadarCnpjaAdvancedSearch(pool as never, admin, {
      organizationId, campaignId, city: 'Curitiba', limit: 10, secretKeyMaterial: 'fixture',
    }, { loadSecret: async () => 'fixture', search })
    expect(result.candidates).toEqual([])
    expect(search).toHaveBeenCalledTimes(1)
    expect(pool.used).toBe(1)
    expect(pool.queries.some(sql => sql.includes('pg_advisory_xact_lock'))).toBe(true)
  })

  it('rejects operators before loading the paid credential or reserving quota', async () => {
    const pool = new PoolFixture()
    const search = vi.fn(async () => [])
    const loadSecret = vi.fn(async () => 'fixture')
    await expect(runRadarCnpjaAdvancedSearch(pool as never, operator, {
      organizationId, campaignId, state: 'PR', limit: 1, secretKeyMaterial: 'fixture',
    }, { loadSecret, search })).rejects.toMatchObject({ statusCode: 403 })
    expect(loadSecret).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
    expect(pool.used).toBe(0)
  })

  it('keeps the credit reservation after a provider response when candidate persistence fails', async () => {
    const pool = new PoolFixture()
    pool.failCandidateWrite = true
    const search = vi.fn(async () => [{ taxId: '12345678000190', tradeName: 'Empresa Exemplo',
      cnaes: [], websiteStatus: 'unknown' as const, rawPayload: {} }])
    await expect(runRadarCnpjaAdvancedSearch(pool as never, admin, {
      organizationId, campaignId, state: 'PR', limit: 1, secretKeyMaterial: 'fixture',
    }, { loadSecret: async () => 'fixture', search })).rejects.toThrow('candidate_write_failed')
    expect(search).toHaveBeenCalledTimes(1)
    expect(pool.used).toBe(1)
  })

  it('resumes regional discovery by state and searches both primary and secondary CNAEs', async () => {
    const pool = new PoolFixture()
    pool.regional = true
    const searchPage = vi.fn(async (input: { token?: string }) => ({ candidates: [],
      nextToken: input.token ? undefined : 'next-page' }))
    const input = { organizationId, campaignId, regionalState: 'MG' as const, limit: 10, secretKeyMaterial: 'fixture' }
    const first = await runRadarCnpjaAdvancedSearch(pool as never, admin, input,
      { loadSecret: async () => 'fixture', searchPage: searchPage as never })
    expect(first.nextToken).toBe('next-page')
    expect(searchPage).toHaveBeenCalledWith(expect.objectContaining({ state: 'MG', cnaes: ['5620101'], includeSecondaryActivities: true }))
    const second = await runRadarCnpjaAdvancedSearch(pool as never, admin, input,
      { loadSecret: async () => 'fixture', searchPage: searchPage as never })
    expect(second.completed).toBe(true)
    expect(searchPage).toHaveBeenLastCalledWith(expect.objectContaining({ token: 'next-page' }))
    expect(pool.used).toBe(2)
  })
})
