import { expect, it, vi } from 'vitest'
import { searchRadarWeb } from '../src/modules/radar/web-search.js'
it('normalizes Google organic results without treating knowledge-graph or unsafe URLs as confirmed companies',async()=>{
  const fetchImpl=vi.fn(async(_input:unknown,_init?:RequestInit)=>new Response(JSON.stringify({organic:[{link:'https://embrare.com.br/',title:'Embrare',snippet:'Empresa brasileira de refeições',position:1},{link:'javascript:alert(1)',title:'invalid'}],knowledgeGraph:{website:'https://other.example'}})))
  const results=await searchRadarWeb({provider:'serper_web_search',apiKey:'fixture',query:'Empresa Brasileira de Refeicoes',limit:5,fetchImpl})
  expect(String(fetchImpl.mock.calls[0][0])).toBe('https://google.serper.dev/search')
  expect(JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))).toMatchObject({q:'Empresa Brasileira de Refeicoes',gl:'br',hl:'pt-br',num:5})
  expect(results).toEqual([expect.objectContaining({url:'https://embrare.com.br/',provider:'serper_web_search',query:'Empresa Brasileira de Refeicoes',position:1})])
})
it('uses_brazilian_web_search_with_extra_snippets_without_following_redirects', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ web: { results: [{ url: 'https://alfa.example', title: 'Alfa', description: '<b>Brasil</b>', extra_snippets: ['Contato'] }] } }) })
  const results = await searchRadarWeb({ apiKey: 'fixture', query: 'Empresa Alfa', limit: 5, fetchImpl })
  expect(new URL(String(fetchImpl.mock.calls[0][0])).searchParams.get('country')).toBe('BR')
  expect(fetchImpl.mock.calls[0][1].redirect).toBe('error')
  expect(results[0].snippets).toEqual(['Brasil','Contato'])
})
