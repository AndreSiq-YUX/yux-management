import { describe, expect, it, vi } from 'vitest'
import { buildCnpjaCandidateSnippet, searchCnpjaAdvanced, testCnpjaProvider } from '../src/modules/radar/cnpjaClient.js'

describe('radar CNPJa client', () => {
  it('searches advanced company records and normalizes candidates', async () => {
    const fetchImpl = vi.fn(async (url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => url.includes('servicodados.ibge.gov.br')
        ? [{ id: 4113700, nome: 'Londrina' }]
        : ({
        records: [
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
      'https://api.cnpja.com/office?limit=5&status.id.in=2&address.municipality.in=4113700&address.state.in=PR&founded.gte=2026-06-01&mainActivity.id.in=8630503',
      expect.objectContaining({
        method: 'GET',
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
      expect.stringContaining('/office?limit=1&status.id.in=2&names.in=clinica'),
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('keeps a product-neutral dossier and never treats a missing website as no website', async () => {
    const fetchImpl = vi.fn(async (url: string) => ({
      ok: true,
      json: async () => url.includes('servicodados.ibge.gov.br')
        ? [{ id: 4106902, nome: 'Curitiba' }]
        : ({ records: [{
        taxId: '12.345.678/0001-90', alias: 'Empresa Exemplo', company: { name: 'Empresa Exemplo Ltda' },
        status: { text: 'Ativa' }, founded: '2026-06-10',
        address: { street: 'Rua das Flores', number: '42', district: 'Centro', city: 'Curitiba', state: 'PR', zip: '80000000' },
        mainActivity: { id: '6201501', text: 'Desenvolvimento de software' },
        sideActivities: [{ id: '6202300', text: 'Consultoria em tecnologia' }],
        emails: [{ address: 'contato@exemplo.test' }], phones: [{ area: '41', number: '999999999' }],
        members: [{ person: { name: 'Não persistir sócio' } }],
      }] }),
    })) as unknown as typeof fetch

    const [candidate] = await searchCnpjaAdvanced({ apiKey: 'fixture', city: 'Curitiba', state: 'PR', limit: 1, fetchImpl })
    expect(candidate).toMatchObject({
      address: 'Rua das Flores, 42, Centro, Curitiba/PR, 80000000',
      registrationStatus: 'Ativa', cnaeMain: 'Desenvolvimento de software',
      cnaes: ['6201501', '6202300'], websiteStatus: 'unknown',
      phone: '41999999999',
    })
    expect(candidate.rawPayload).not.toHaveProperty('members')
    expect(buildCnpjaCandidateSnippet(candidate)).toContain('Ativa')
    expect(buildCnpjaCandidateSnippet(candidate)).toContain('Rua das Flores, 42')
  })

  it('fails closed before charging CNPJa when city cannot be resolved', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => [{ id: 4113700, nome: 'Londrina' }] })) as unknown as typeof fetch
    await expect(searchCnpjaAdvanced({ apiKey: 'fixture', city: 'Cidade Inexistente', state: 'PR', fetchImpl })).rejects.toThrow('cnpja_municipality_not_found')
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})
