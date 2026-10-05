import { describe, expect, it, vi } from 'vitest'
import { assertLicensedBraveRetention, selectBraveBusinessMatch } from '../src/modules/radar/licensed-brave.js'
import { confirmRadarBraveSuggestion, enrichRadarCandidateWithLicensedBrave } from '../src/modules/radar/repository.js'
import type { AuthUser } from '../src/auth/routes.js'

const admin = { id: '00000000-0000-4000-8000-000000000001', role: 'yux_admin' } as AuthUser
const org = '00000000-0000-4000-8000-000000000002'
const campaign = '00000000-0000-4000-8000-000000000003'
const candidateId = '00000000-0000-4000-8000-000000000004'

class FixturePool {
  licensed = false
  queries: string[] = []
  candidate = { id: candidateId, organization_id: org, campaign_id: campaign, campaign_type: 'regional_b2b',
    source_type: 'cnpja_advanced_search', title: 'Cozinha Central Alfa LTDA', status: 'pending_review',
    normalized_payload: { cnpj: '12345678000190', tradeName: 'Cozinha Central Alfa LTDA', city: 'Belo Horizonte', state: 'MG' },
    raw_payload: {}, dedupe_key: 'cnpj:12345678000190', source_url: null, snippet: null,
    created_at: '2026-09-30T00:00:00.000Z', updated_at: '2026-09-30T00:00:00.000Z' }
  async connect() { return { query: this.query.bind(this), release() {} } }
  async query(sql: string, params: unknown[] = []) {
    this.queries.push(sql)
    if (sql.includes("kind = 'yux'")) return { rows: [{ allowed: true }] }
    if (sql.includes('FROM public.radar_candidate_records candidate')) return { rows: [this.candidate] }
    if (sql.includes('FROM public.platform_provider_connections')) return { rows: [{ id: 'provider', status: 'active',
      public_config: this.licensed ? { retentionLicensed: true,
        credentialPurpose: 'licensed_retention' } : { storagePolicy: 'transient_only' } }] }
    if (sql.includes('FROM public.radar_data_sources')) return { rows: [{ id: 'source', organization_id: null,
      source_key: 'brave_place_search', source_type: 'brave_place_search', display_name: 'Brave', enabled: true,
      is_paid: true, requires_secret: true, default_cost_per_unit: '0.01', rate_limit_per_day: 10 }] }
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [{ daily_limit: 10, budget_limit: '1.00', configuration_revision: 1 }] }
    if (sql.includes('FROM public.radar_source_usage_counters')) return { rows: [{ units: 0, estimated_cost: 0 }] }
    if (sql.includes('SELECT * FROM public.radar_candidate_records')) return { rows: [this.candidate] }
    if (sql.includes('UPDATE public.radar_candidate_records')) return { rows: [{ ...this.candidate,
      normalized_payload: JSON.parse(params[2] as string) }] }
    return { rows: [] }
  }
}

describe('licensed Brave business enrichment', () => {
  it('requires explicit licensed retention but no contract reference', () => {
    expect(() => assertLicensedBraveRetention({ storagePolicy: 'transient_only' })).toThrow('radar_brave_retention_license_required')
    expect(() => assertLicensedBraveRetention({ retentionLicensed: true, licenseReference: '' })).toThrow('radar_brave_retention_license_required')
    expect(() => assertLicensedBraveRetention({ retentionLicensed: true, licenseReference: 'contract-1',
      credentialPurpose: 'preview' })).toThrow('radar_brave_retention_license_required')
    expect(() => assertLicensedBraveRetention({ retentionLicensed: true, licenseReference: 'contract-1',
      credentialPurpose: 'licensed_retention' })).not.toThrow()
    expect(() => assertLicensedBraveRetention({ retentionLicensed: true,
      credentialPurpose: 'licensed_retention' })).not.toThrow()
    expect(() => assertLicensedBraveRetention({ retentionLicensed: true, licenseReference: '',
      credentialPurpose: 'licensed_retention' })).not.toThrow()
    for (const retentionLicensed of [false, undefined, 'true']) {
      expect(() => assertLicensedBraveRetention({ retentionLicensed, licenseReference: 'contract-1',
        credentialPurpose: 'licensed_retention' })).toThrow('radar_brave_retention_license_required')
    }
  })

  it('matches a unique business identity but never an ambiguous or different-city result', () => {
    const candidate = { name: 'Cozinha Central Alfa LTDA', city: 'Belo Horizonte', state: 'MG' }
    const exact = { name: 'Cozinha Central Alfa', address: 'Rua A, Belo Horizonte - MG', sourceUrl: 'https://example.com/place/1',
      websiteUrl: 'https://alfa.example', websiteStatus: 'unverified' as const, provider: 'brave_place_search' as const,
      observedAt: '2026-09-30T00:00:00.000Z', storagePolicy: 'transient_only' as const }
    expect(selectBraveBusinessMatch(candidate, [exact])).toEqual(exact)
    expect(selectBraveBusinessMatch(candidate, [{ ...exact, address: 'Rua A, Belo Horizonte, Minas Gerais' }])).not.toBeNull()
    expect(selectBraveBusinessMatch(candidate, [exact, { ...exact, sourceUrl: 'https://example.com/place/2' }])).toBeNull()
    expect(selectBraveBusinessMatch(candidate, [{ ...exact, address: 'Curitiba - PR' }])).toBeNull()
    expect(selectBraveBusinessMatch(candidate, [{ ...exact, name: 'Restaurante Alfa' }])).toBeNull()
  })

  it('does not load the key, charge or call Brave without a licensed-retention contract', async () => {
    const pool = new FixturePool()
    const loadSecret = vi.fn(async () => 'key')
    const search = vi.fn(async () => [])
    await expect(enrichRadarCandidateWithLicensedBrave(pool as never, admin,
      { organizationId: org, candidateId, secretKeyMaterial: 'fixture' }, { loadSecret, search }))
      .rejects.toThrow('radar_brave_retention_license_required')
    expect(loadSecret).not.toHaveBeenCalled()
    expect(search).not.toHaveBeenCalled()
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.radar_source_usage_counters'))).toBe(false)
  })

  it('stores only a uniquely matched licensed result with source evidence', async () => {
    const pool = new FixturePool()
    pool.licensed = true
    const search = vi.fn(async () => [{ provider: 'brave_place_search' as const, name: 'Cozinha Central Alfa',
      address: 'Rua A, Belo Horizonte - MG', websiteUrl: 'https://alfa.example', websiteStatus: 'unverified' as const,
      phone: '3133334444', sourceUrl: 'https://example.com/place/1', observedAt: '2026-09-30T00:00:00.000Z',
      storagePolicy: 'transient_only' as const }])
    const result = await enrichRadarCandidateWithLicensedBrave(pool as never, admin,
      { organizationId: org, candidateId, secretKeyMaterial: 'fixture' },
      { loadSecret: async () => 'licensed-key', search: search as never })
    expect(result.matched).toBe(true)
    expect(result.candidate?.normalizedPayload).toMatchObject({ websiteUrl: 'https://alfa.example', phoneRaw: '3133334444' })
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.radar_b2b_evidence'))).toBe(true)
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.radar_source_usage_counters'))).toBe(true)
  })

  it('retains ambiguous licensed suggestions for human matching, without attaching their contacts first', async () => {
    const pool = new FixturePool()
    pool.licensed = true
    const places = [{ provider: 'brave_place_search' as const, name: 'Cozinha Alfa Matriz',
      address: 'Rua A, Belo Horizonte - MG', websiteUrl: 'https://alfa.example', websiteStatus: 'unverified' as const,
      phone: '3133334444', sourceUrl: 'https://example.com/place/1', observedAt: '2026-09-30T00:00:00.000Z',
      storagePolicy: 'transient_only' as const }]
    const result = await enrichRadarCandidateWithLicensedBrave(pool as never, admin,
      { organizationId: org, candidateId, secretKeyMaterial: 'fixture' },
      { loadSecret: async () => 'licensed-key', search: vi.fn(async () => places) as never })
    expect(result.matched).toBe(false)
    expect(result.suggestions).toHaveLength(1)
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.radar_b2b_evidence'))).toBe(false)
    pool.candidate.normalized_payload = { ...pool.candidate.normalized_payload, braveSuggestions: places,
      braveMatchStatus: 'review' } as typeof pool.candidate.normalized_payload
    const confirmed = await confirmRadarBraveSuggestion(pool as never, admin, {
      organizationId: org, candidateId, sourceUrl: 'https://example.com/place/1',
    })
    expect(confirmed.candidate.normalizedPayload).toMatchObject({
      websiteUrl: 'https://alfa.example', braveMatchStatus: 'manual_matched',
    })
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.radar_b2b_evidence'))).toBe(true)
  })
})
