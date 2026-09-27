import { describe, expect, it, vi } from 'vitest'
import { runRadarCnpjaAdvancedSearch } from '../src/modules/radar/repository.js'
import type { AuthUser } from '../src/auth/routes.js'

const admin = { id: '00000000-0000-4000-8000-000000000001', role: 'yux_admin' } as AuthUser
const organizationId = '00000000-0000-4000-8000-000000000002'
const campaignId = '00000000-0000-4000-8000-000000000003'

class PoolFixture {
  used = 0
  queries: string[] = []
  async connect() { return { query: this.query.bind(this), release() {} } }
  async query(sql: string, _params: unknown[] = []) {
    this.queries.push(sql)
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
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [{ id: campaignId, daily_limit: 10, budget_limit: '1.00' }] }
    if (sql.includes('FROM public.radar_source_usage_counters')) return { rows: [{ units: this.used, estimated_cost: this.used * 0.025 }] }
    if (sql.includes('INSERT INTO public.radar_source_usage_counters')) { this.used++; return { rows: [] } }
    if (sql.includes('INSERT INTO public.radar_enrichment_runs')) return { rows: [{ id: '00000000-0000-4000-8000-000000000006' }] }
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
})
