import { expect, it, vi } from 'vitest'
import { compareRadarBusinessIdentity, discoverRadarBusinessPresence, matchRadarBusinessIdentity, isRadarReferenceUrl } from '../src/modules/radar/site-discovery.js'
const identity = { name: 'Empresa Alfa', cnpj: '12345678000190', city: 'Curitiba', state: 'PR', address: 'Rua Azul 123', phone: '4133334444' }
it('continues the plain-name lookup on an unused provider despite historical usage elsewhere',async()=>{
  const requests:Array<{query:string;source?:string}>=[]
  const result=await discoverRadarBusinessPresence(identity,{maxSearchQueriesPerCandidate:5,webSearchEnabled:true,localSearchOrder:'disabled',webSearchProviders:['serper_web_search','brave_web_search']} as never,{
    initialQueries:5,searchCapacity:()=>({bySource:{serper_web_search:{used:5,remaining:0},brave_web_search:{used:0,remaining:5}},totalRemaining:null}),
    search:async(query:string,source?:string)=>{requests.push({query,source});return[{url:'https://alfa.example/',title:identity.name,snippets:[identity.cnpj],observedAt:'2026-10-19'}]},
  } as never)
  expect(requests).toEqual([{query:'Empresa Alfa',source:'brave_web_search'}])
  expect(result.websiteUrl).toBe('https://alfa.example/')
})
it('can defer local research until web research fails to find a credible website',async()=>{
  const local=vi.fn(async()=>[])
  const result=await discoverRadarBusinessPresence(identity,{maxSearchQueriesPerCandidate:3,webSearchEnabled:true,localSearchOrder:'after_web_if_needed'} as never,
    {local,search:async()=>[{url:'https://alfa.example/',title:'Empresa Alfa',snippets:['12.345.678/0001-90'],observedAt:'2026-10-15'}]})
  expect(result.websiteUrl).toBe('https://alfa.example/')
  expect(local).not.toHaveBeenCalled()
})
it('can disable local research without disabling web research',async()=>{
  const local=vi.fn(async()=>[])
  await discoverRadarBusinessPresence(identity,{maxSearchQueriesPerCandidate:3,webSearchEnabled:true,localSearchOrder:'disabled'} as never,{local,search:async()=>[]})
  expect(local).not.toHaveBeenCalled()
})
it('reserves room for a complementary local query when web results are exhausted',async()=>{
  const local=vi.fn(async()=>[{url:'https://alfa.example/',title:'Empresa Alfa',snippets:['12.345.678/0001-90'],observedAt:'2026-10-15'}]),search=vi.fn(async()=>[])
  const result=await discoverRadarBusinessPresence(identity,{maxSearchQueriesPerCandidate:3,webSearchEnabled:true,localSearchOrder:'after_web_if_needed'},{local,search})
  expect(local).toHaveBeenCalledTimes(1)
  expect(search).toHaveBeenCalledTimes(2)
  expect(result.queries).toBe(3)
})
it('starts with the plain business name and prioritizes an institutional brand candidate before directories',async()=>{
  const search=vi.fn(async(_query:string)=>[{url:'https://unknown.example/cnpj/12345678000190',title:'Empresa Alfa',snippets:[identity.cnpj],observedAt:'2026-10-13'},
    {url:'https://brand.example/',title:'Marca Beta — Empresa Alfa',snippets:['Soluções empresariais'],observedAt:'2026-10-13'}])
  const result=await discoverRadarBusinessPresence(identity,{maxSearchQueriesPerCandidate:3,webSearchEnabled:true},{search})
  expect(search.mock.calls[0][0]).toBe('Empresa Alfa')
  expect(result.suggestions[0].url).toBe('https://brand.example/')
  expect(result.websiteUrl).toBeUndefined()
})
it('corroborates structured street and number without an obsolete registry phone', () => {
  expect(compareRadarBusinessIdentity({ ...identity, address:'Avenida das Flores, 11200, Distrito, Curitiba/PR, 80000000' },
    'Empresa Alfa — Av. das Flores, 11200 - sala 4 — Curitiba/PR. Telefone (41) 99999-0000')).toMatchObject({ association:'confirmed',scope:'establishment' })
  expect(matchRadarBusinessIdentity(identity, 'Empresa Alfa Curitiba PR Rua Azul 124')).toBe('review')
  expect(isRadarReferenceUrl('https://cadastroempresa.com.br/fornecedor/alfa')).toBe(true)
  expect(matchRadarBusinessIdentity({...identity,name:'Alfa Tech Serviços Ltda'},'AlfaTech — Curitiba PR — R. Azul, 123')).toBe('confirmed')
})
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
