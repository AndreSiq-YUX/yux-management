import { describe, expect, it, vi } from 'vitest'
import { searchRadarPlaces, testRadarPlaceProvider } from '../src/modules/radar/place-providers.js'

describe('radar local place providers', () => {
  it('queries Serper Places for a Brazilian city and keeps absent websites unknown', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ places: [{
      title: 'Empresa A', address: 'Rua A, Curitiba, PR', phoneNumber: '4133334444',
      rating: 4.8, ratingCount: 22,
    }] }) })) as unknown as typeof fetch
    const results = await searchRadarPlaces({ provider: 'serper_places', apiKey: 'fixture',
      query: 'clínicas', city: 'Curitiba', state: 'PR', limit: 3, fetchImpl })

    expect(fetchImpl).toHaveBeenCalledWith('https://google.serper.dev/places', expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'X-API-KEY': 'fixture' }),
      body: JSON.stringify({ q: 'clínicas em Curitiba PR Brasil', gl: 'br', hl: 'pt-br', num: 3 }),
    }))
    expect(results).toEqual([expect.objectContaining({ name: 'Empresa A', websiteStatus: 'unknown',
      rating: 4.8, reviewCount: 22, storagePolicy: 'transient_only', provider: 'serper_places' })])
    expect(results[0]).not.toHaveProperty('providerId')
  })

  it('queries Brave Place Search in Brazil and does not expose ephemeral IDs', async () => {
    const mockFetch = vi.fn(async (_url: string, _options: RequestInit) => ({ ok: true, json: async () => ({ results: [{
      id: 'loc-expires', title: 'Empresa B', url: 'https://example.test',
      postal_address: { displayAddress: 'Rua B, Curitiba' },
      contact: { telephone: '4133335555', email: 'contato@example.test' },
      rating: { ratingValue: 4.6, reviewCount: 14 },
      profiles: [{ name: 'Instagram', url: 'https://instagram.com/empresa_b' }],
    }] }) }))
    const fetchImpl = mockFetch as unknown as typeof fetch
    const results = await searchRadarPlaces({ provider: 'brave_place_search', apiKey: 'fixture',
      query: 'clínicas', city: 'Curitiba', state: 'PR', limit: 2, fetchImpl })

    const [url, options] = mockFetch.mock.calls[0]
    expect(url).toContain('https://api.search.brave.com/res/v1/local/place_search?')
    expect(new URL(url as string).searchParams.get('country')).toBe('BR')
    expect(new URL(url as string).searchParams.get('count')).toBe('2')
    expect((options?.headers as Record<string, string>)['X-Subscription-Token']).toBe('fixture')
    expect(results).toEqual([expect.objectContaining({ name: 'Empresa B', websiteUrl: 'https://example.test/',
      websiteStatus: 'unverified', phone: '4133335555', rating: 4.6, reviewCount: 14,
      instagramUrl: 'https://instagram.com/empresa_b', storagePolicy: 'transient_only' })])
    expect(JSON.stringify(results)).not.toContain('loc-expires')
  })

  it('rejects batches above ten before making an external request', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    await expect(searchRadarPlaces({ provider: 'brave_place_search', apiKey: 'fixture',
      query: 'clínicas', city: 'Curitiba', state: 'PR', limit: 11, fetchImpl })).rejects.toThrow('radar_batch_limit_exceeded')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('tests a provider with one small request and reports failure without leaking its key', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ message: 'bad fixture-key' }) })) as unknown as typeof fetch
    const result = await testRadarPlaceProvider('serper_places', 'fixture-key', fetchImpl)
    expect(result).toEqual({ ok: false, message: 'Provedor retornou HTTP 401.' })
    expect(JSON.stringify(result)).not.toContain('fixture-key')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
