import { describe, expect, it, vi } from 'vitest'
import { runRadarPlacePreview } from '../src/modules/radar/repository.js'
import type { AuthUser } from '../src/auth/routes.js'

const admin = { id: '00000000-0000-4000-8000-000000000001', role: 'yux_admin' } as AuthUser
const operator = { ...admin, role: 'yux_operator' } as AuthUser
const organizationId = '00000000-0000-4000-8000-000000000002'
const campaignId = '00000000-0000-4000-8000-000000000003'
const sourceId = '00000000-0000-4000-8000-000000000004'
const providerId = '00000000-0000-4000-8000-000000000005'

class PoolFixture {
  enabled = false
  cost = 0.01
  internal = true
  used = 0
  orgUsed = 0
  queries: string[] = []

  async connect() { return { query: this.query.bind(this), release() {} } }

  async query(sql: string, _params: unknown[] = []) {
    this.queries.push(sql)
    if (sql.includes("kind = 'yux'")) return { rows: [{ allowed: this.internal }] }
    if (sql.includes('FROM public.radar_data_sources')) return { rows: [{
      id: sourceId, organization_id: null, source_key: 'brave_place_search', source_type: 'brave_place_search',
      display_name: 'Brave Place', enabled: this.enabled, is_paid: true, requires_secret: true,
      terms_notes: 'transient', default_cost_per_unit: String(this.cost), rate_limit_per_day: 10,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }] }
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [{ id: campaignId, daily_limit: 10, budget_limit: '1.00' }] }
    if (sql.includes('FROM public.platform_provider_connections')) return { rows: [{ id: providerId, status: 'active' }] }
    if (sql.includes('FROM public.radar_source_usage_counters')) return { rows: [{
      units: sql.includes('campaign_id = $2') ? this.used : this.orgUsed,
      estimated_cost: this.used * 0.01,
    }] }
    if (sql.includes('INSERT INTO public.radar_source_usage_counters')) { this.used++; return { rows: [] } }
    return { rows: [] }
  }
}

const request = { organizationId, campaignId, sourceType: 'brave_place_search' as const,
  query: 'clínicas', city: 'Curitiba', state: 'PR', limit: 2, secretKeyMaterial: 'fixture' }

describe('radar transient place preview', () => {
  it('stops before external lookup when the source is disabled', async () => {
    const pool = new PoolFixture()
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(runRadarPlacePreview(pool as never, admin, request, { fetchImpl, loadSecret: async () => 'fixture' }))
      .rejects.toMatchObject({ message: 'radar_source_disabled' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(pool.queries.some(sql => sql.includes('FROM public.platform_provider_connections'))).toBe(false)
  })

  it('rejects another organization and a non-admin role', async () => {
    const pool = new PoolFixture()
    pool.enabled = true
    pool.internal = false
    await expect(runRadarPlacePreview(pool as never, admin, request)).rejects.toMatchObject({ statusCode: 403 })
    pool.internal = true
    await expect(runRadarPlacePreview(pool as never, operator, request)).rejects.toMatchObject({ statusCode: 403 })
    expect(pool.queries.some(sql => sql.includes('FROM public.platform_provider_connections'))).toBe(false)
  })

  it('does not search if a source was enabled without approved cost', async () => {
    const pool = new PoolFixture()
    pool.enabled = true
    pool.cost = 0
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(runRadarPlacePreview(pool as never, admin, request, { fetchImpl, loadSecret: async () => 'fixture' }))
      .rejects.toMatchObject({ message: 'radar_source_cost_approval_required' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('blocks an organization that used the source quota in another campaign', async () => {
    const pool = new PoolFixture()
    pool.enabled = true
    pool.orgUsed = 10
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(runRadarPlacePreview(pool as never, admin, request, { fetchImpl, loadSecret: async () => 'fixture' }))
      .rejects.toMatchObject({ message: 'source_limit_exceeded' })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('shows results transiently, counting one request without writing candidate or company data', async () => {
    const pool = new PoolFixture()
    pool.enabled = true
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ results: [{
      id: 'ephemeral', title: 'Empresa Exemplo', url: 'https://example.test',
    }] }) })) as unknown as typeof fetch
    const result = await runRadarPlacePreview(pool as never, admin, request,
      { fetchImpl, loadSecret: async () => 'fixture' })
    expect(result.places).toEqual([expect.objectContaining({ name: 'Empresa Exemplo', storagePolicy: 'transient_only' })])
    expect(pool.used).toBe(1)
    expect(pool.queries.join(' ')).not.toMatch(/INSERT INTO public\.radar_(candidate_records|company_records|enrichment_runs)/)
    expect(JSON.stringify(result)).not.toContain('ephemeral')
  })
})
