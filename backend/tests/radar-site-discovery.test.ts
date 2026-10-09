import { expect, it, vi } from 'vitest'
import { discoverRadarBusinessPresence, matchRadarBusinessIdentity } from '../src/modules/radar/site-discovery.js'
const identity = { name: 'Empresa Alfa', cnpj: '12345678000190', city: 'Curitiba', state: 'PR', address: 'Rua Azul 123', phone: '4133334444' }
it('rejects_same_name_and_city_without_corroboration', () => {
  expect(matchRadarBusinessIdentity(identity, 'Empresa Alfa Curitiba PR')).toBe('review')
  expect(matchRadarBusinessIdentity(identity, 'Empresa Alfa Curitiba PR Rua Azul 123')).toBe('confirmed')
})
it('distinguishes_group_from_branch', () => {
  expect(matchRadarBusinessIdentity(identity, 'Empresa Alfa Curitiba PR CNPJ 12.345.678/0002-70')).toBe('review')
  expect(matchRadarBusinessIdentity(identity, 'CNPJ 12.345.678/0001-90')).toBe('confirmed')
})
it('finds_official_site_when_registry_has_no_url', async () => {
  const search = vi.fn().mockResolvedValue([{ url: 'https://alfa.example', title: 'Empresa Alfa', snippets: ['12.345.678/0001-90'], observedAt: '2026-10-08' }])
  const result = await discoverRadarBusinessPresence(identity, { maxSearchQueriesPerCandidate: 3, webSearchEnabled: true }, { search })
  expect(result.websiteUrl).toBe('https://alfa.example/')
  expect(result.association).toBe('confirmed')
  expect(search).toHaveBeenCalledTimes(1)
})
it('returns_search_limit_without_guessing_missing_website', async () => {
  const search = vi.fn().mockResolvedValue([])
  const result = await discoverRadarBusinessPresence(identity, { maxSearchQueriesPerCandidate: 1, webSearchEnabled: true }, { search })
  expect(result.websiteUrl).toBeUndefined()
  expect(result.association).toBe('not_found_in_consulted_sources')
  expect(search).toHaveBeenCalledTimes(1)
})
it('preserves_partial_results_on_rate_limit', async () => {
  const search = vi.fn().mockResolvedValueOnce([{ url: 'https://uncertain.example', title: 'Empresa Alfa', snippets: ['Curitiba PR'], observedAt: '2026-10-08' }]).mockRejectedValue(new Error('rate_limit'))
  const result = await discoverRadarBusinessPresence(identity, { maxSearchQueriesPerCandidate: 3, webSearchEnabled: true }, { search })
  expect(result.suggestions).toHaveLength(1)
  expect(result.limitations).toContain('rate_limit')
})
