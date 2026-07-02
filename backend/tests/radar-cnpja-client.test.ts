import { describe, expect, it, vi } from 'vitest'
import { buildCnpjaCandidateSnippet, searchCnpjaAdvanced, testCnpjaProvider } from '../src/modules/radar/cnpjaClient.js'

describe('radar CNPJa client', () => {
  it('searches advanced company records and normalizes candidates', async () => {
    const fetchImpl = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({
        data: [
          {
            taxId: '12.345.678/0001-90',
            alias: 'Clinica Nova',
            company: { name: 'Clinica Nova LTDA' },
            founded: '2026-06-10',
            address: { city: 'Londrina', state: 'PR' },
            mainActivity: { text: 'Atividade medica ambulatorial' },
            emails: [{ address: 'contato@clinicanova.com.br' }],
            phones: [{ number: '(43) 99999-0000' }],
          },
        ],
      }),
    })) as unknown as typeof fetch

    const result = await searchCnpjaAdvanced({
      apiKey: 'cnpja-test-key',
      fetchImpl,
      city: 'Londrina',
      state: 'PR',
      cnaes: ['8630503'],
      openingFrom: '2026-06-01',
      limit: 5,
    })

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.cnpja.com/office/search?limit=5',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'cnpja-test-key' }),
      }),
    )
    expect(result).toEqual([
      expect.objectContaining({
        taxId: '12345678000190',
        tradeName: 'Clinica Nova',
        legalName: 'Clinica Nova LTDA',
        city: 'Londrina',
        state: 'PR',
      }),
    ])
    expect(buildCnpjaCandidateSnippet(result[0])).toContain('CNPJ 12345678000190')
  })

  it('validates provider credentials through office lookup', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ taxId: '37335118000180' }),
    })) as unknown as typeof fetch

    await expect(testCnpjaProvider('cnpja-test-key', { baseUrl: 'https://api.cnpja.com', officeLookupPath: '/office/:taxId' }, fetchImpl)).resolves.toEqual(
      expect.objectContaining({ ok: true }),
    )
    await expect(testCnpjaProvider(null)).resolves.toEqual(expect.objectContaining({ ok: false }))

    await searchCnpjaAdvanced({
      apiKey: 'cnpja-test-key',
      fetchImpl,
      config: { advancedSearchMethod: 'GET' },
      query: 'clinica',
      limit: 1,
    })
    expect(fetchImpl).toHaveBeenLastCalledWith(
      expect.stringContaining('/office/search?limit=1&query=clinica'),
      expect.objectContaining({ method: 'GET' }),
    )
  })
})
