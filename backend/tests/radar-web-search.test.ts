import { expect, it, vi } from 'vitest'
import { searchRadarWeb } from '../src/modules/radar/web-search.js'
it('uses_brazilian_web_search_with_extra_snippets_without_following_redirects', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ web: { results: [{ url: 'https://alfa.example', title: 'Alfa', description: '<b>Brasil</b>', extra_snippets: ['Contato'] }] } }) })
  const results = await searchRadarWeb({ apiKey: 'fixture', query: 'Empresa Alfa', limit: 5, fetchImpl })
  expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('country')).toBe('BR')
  expect(fetchImpl.mock.calls[0][1].redirect).toBe('error')
  expect(results[0].snippets).toEqual(['Brasil','Contato'])
})
