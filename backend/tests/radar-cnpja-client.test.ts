import { describe, expect, it, vi } from 'vitest'
import { buildCnpjaCandidateSnippet, lookupCnpjaOffice, searchCnpjaAdvanced, searchCnpjaAdvancedPage, testCnpjaProvider } from '../src/modules/radar/cnpjaClient.js'

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
            company: { name: 'Clinica Nova LTDA',equity:50000,nature:{text:'Sociedade Empresária Limitada'},size:{text:'Microempresa'} },
            updated:'2026-10-01T10:00:00Z',
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
        capital:50000,legalNature:'Sociedade Empresária Limitada',registeredSize:'Microempresa',registryUpdatedAt:'2026-10-01T10:00:00Z',
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

  it('returns a cursor and finds industrial kitchens with CNAE as a secondary activity', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ records: [{ taxId: '12345678000190', alias: 'Cozinha Central',
        mainActivity: { id: 5611201, text: 'Restaurantes' }, sideActivities: [{ id: 5620101, text: 'Refeições para empresas' }],
        address: { state: 'MG', city: 'Belo Horizonte' } }], next: 'pagina-2' }),
    })) as unknown as typeof fetch
    const page = await searchCnpjaAdvancedPage({ apiKey: 'fixture', state: 'MG', cnaes: ['5620-1/01'],
      includeSecondaryActivities: true, limit: 10, fetchImpl })
    expect(page.nextToken).toBe('pagina-2')
    expect(page.candidates[0].cnaes).toEqual(['5611201', '5620101'])
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('activities.id.in=5620101'), expect.anything())
    await searchCnpjaAdvancedPage({ apiKey: 'fixture', token: 'pagina-2', limit: 10, fetchImpl })
    expect(fetchImpl).toHaveBeenLastCalledWith('https://api.cnpja.com/office?token=pagina-2', expect.anything())
  })

  it('continues with the token alone and preserves the whole inherited page for overflow', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      records: Array.from({length:10}, (_, i) => ({taxId:String(12345678000100+i), alias:`Empresa ${i}`})), next:'page-3',
    }), {status:200})) as typeof fetch
    const page = await searchCnpjaAdvancedPage({apiKey:'fixture',token:'page-2',limit:3,city:'Curitiba',state:'PR',
      query:'empresas',cnaes:['5620101'],excludedNameTerms:['restaurante'],openingFrom:'2020-01-01',fetchImpl})
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledWith('https://api.cnpja.com/office?token=page-2',expect.anything())
    expect(page.candidates).toHaveLength(10)
    expect(page.nextToken).toBe('page-3')
  })

  it.each([400,422])('identifies a confirmed HTTP %i validation rejection without conflating it with transport failures', async status => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({message:'request validation failed'}), {status})) as typeof fetch
    await expect(searchCnpjaAdvancedPage({apiKey:'fixture',fetchImpl})).rejects.toMatchObject({statusCode:status,requestRejected:true})
  })

  it.each([429,500,503])('keeps HTTP %i outside confirmed validation rejections', async status => {
    const fetchImpl = vi.fn(async () => new Response('{}',{status})) as typeof fetch
    const error = await searchCnpjaAdvancedPage({apiKey:'fixture',fetchImpl}).catch(error => error)
    expect(error.statusCode).toBe(status)
    expect(error.requestRejected).not.toBe(true)
  })

  it('does not turn a lost network response into a confirmed rejection', async () => {
    const failure = new TypeError('fetch failed')
    const fetchImpl = vi.fn(async () => {throw failure}) as typeof fetch
    await expect(searchCnpjaAdvancedPage({apiKey:'fixture',fetchImpl})).rejects.toBe(failure)
  })

  it('keeps the official constraints in the diagnostic without disclosing credentials or pagination tokens', async () => {
    const apiKey='fixture-api-secret-value',token='private-page-token-value'
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({code:400,message:'request validation failed',
      constraints:[`token ${token} is invalid`,'limit must not be combined with token',`authorization ${apiKey} is invalid`],
      headers:{Authorization:apiKey},secret:'ignored-nested-data',
    }),{status:400})) as typeof fetch
    const error=await searchCnpjaAdvancedPage({apiKey,token,fetchImpl}).catch(error=>error)
    expect(error.message).toContain('request validation failed')
    expect(error.message).toContain('token [redigido] is invalid')
    expect(error.message).toContain('limit must not be combined with token')
    expect(error.message).toContain('HTTP 400')
    expect(error.message).not.toContain(apiKey)
    expect(error.message).not.toContain(token)
    expect(error.message).not.toContain('ignored-nested-data')
    expect(error).toMatchObject({statusCode:400,requestRejected:true})
  })

  it('redacts secrets before bounding diagnostics and ignores non-string constraints',async()=>{
    const apiKey='secret-before-truncation-'.repeat(30)
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({message:`invalid ${apiKey}`,
      constraints:[{value:apiKey},null,42,...Array.from({length:40},()=>`invalid ${apiKey} ${'x'.repeat(500)}`)],
    }),{status:422})) as typeof fetch
    const error=await searchCnpjaAdvancedPage({apiKey,fetchImpl}).catch(error=>error)
    expect(error.message).toContain('[redigido]')
    expect(error.message).not.toContain('secret-before-truncation-')
    expect(error.message.length).toBeLessThan(2000)
    expect(error.message).not.toContain('[object Object]')
  })

  it('also preserves constraints safely when validating credentials through office lookup',async()=>{
    const apiKey='lookup-api-secret-value'
    const fetchImpl=vi.fn(async()=>new Response(JSON.stringify({message:'request validation failed',
      constraints:[`invalid authorization ${apiKey}`,'taxId must have 14 digits'],
    }),{status:400})) as typeof fetch
    const error=await lookupCnpjaOffice({apiKey,taxId:'123',fetchImpl}).catch(error=>error)
    expect(error.message).toContain('taxId must have 14 digits')
    expect(error.message).not.toContain(apiKey)
  })
})
