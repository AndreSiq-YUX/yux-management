import { expect, it, vi } from 'vitest'
import { collectRadarSiteEvidence } from '../src/modules/radar/site-evidence.js'
import { inspectRadarBusinessSite } from '../src/modules/radar/b2b-site-inspection.js'
it('deduplicates redirected contact pages while reserving a slot for another useful page',async()=>{
  const requests:string[]=[]
  const pages=await collectRadarSiteEvidence('https://alfa.example/',{maxPagesPerCandidate:3,maxAttemptsPerCandidate:5},{inspect:async target=>{
    requests.push(target!)
    return{status:'verified_present',checkedAt:'2026-10-14',finalUrl:target!.endsWith('/contato')?'https://alfa.example/contato/':target!,
      text:'Informações institucionais públicas suficientes para contato.',emails:[],phones:[],
      html:'<a href="/contato">Contato</a><a href="/contato/">Contato</a><a href="/sobre">Sobre</a>'}
  }})
  expect(pages.map(page=>page.url)).toEqual(['https://alfa.example/','https://alfa.example/contato/','https://alfa.example/sobre'])
  expect(requests).toEqual(['https://alfa.example/','https://alfa.example/contato','https://alfa.example/sobre'])
})
it.each(['http://alfa.example/','https://alfa.example/'])('continues public contact-page reading on the validated HTTPS redirect destination from %s',async original=>{
  const requests:string[]=[]
  const pages=await collectRadarSiteEvidence(original,{maxPagesPerCandidate:2},{inspect:async target=>{
    requests.push(target!);return {status:'verified_present',checkedAt:'2026-10-14',finalUrl:target===original?'https://www.alfa.example/':target!,
      text:'Informações institucionais suficientes sobre fornecedores.',emails:[],phones:[],
      html:'<a href="/fornecedores">Fornecedores</a><a href="https://unrelated.example/contato">Outra empresa</a>'}
  }})
  expect(pages.map(page=>page.url)).toEqual(['https://www.alfa.example/','https://www.alfa.example/fornecedores'])
  expect(requests).toEqual([original,'https://www.alfa.example/fornecedores'])
})
it('prioritizes supplier and institutional pages rather than recruitment', async () => {
  const inspect = vi.fn(async (url:string|null) => ({status:'verified_present' as const,checkedAt:'2026-10-12',finalUrl:url!,
    text:'Informações públicas suficientes da empresa',emails:[],phones:[],html:'<a href="/contato-vagas">Vagas</a><a href="/fornecedores">Fornecedores</a><a href="/a-empresa">A empresa</a><a href="/solucoes">Soluções</a>'}))
  const result = await collectRadarSiteEvidence('https://alfa.example/',{maxPagesPerCandidate:3},{inspect})
  expect(result.map(page=>new URL(page.url).pathname)).toEqual(['/','/fornecedores','/a-empresa'])
})
it('records_fact_source_per_page_and_respects_page_limit', async () => {
  const inspect = vi.fn(async (url: string | null) => ({ status: 'verified_present' as const, checkedAt:'2026-10-08', finalUrl:url!, text:'Empresa Alfa informações e contatos comerciais públicos', emails:[], phones:[], html: '<a href="/contato">Contato</a><a href="/sobre">Sobre</a>' }))
  const pages = await collectRadarSiteEvidence('https://alfa.example', { maxPagesPerCandidate: 2 }, { inspect })
  expect(pages).toHaveLength(2)
  expect(pages[1].url).toBe('https://alfa.example/contato')
  expect(inspect).toHaveBeenCalledTimes(2)
})
it('checks_robots_per_path_before_reading_contacts', async () => {
  const get = vi.fn(async (url: URL) => url.pathname === '/robots.txt' ? { status:200, contentType:'text/plain', body:'User-agent: *\nDisallow: /privado' } : { status:200, contentType:'text/html', body:'Privado' })
  const result = await inspectRadarBusinessSite('https://alfa.example/privado/contato', { resolve: async () => ['93.184.216.34'], get })
  expect(result.reason).toBe('robots_disallow')
  expect(get).toHaveBeenCalledTimes(1)
})
it('does not count a failed read as a useful page, but bounds total attempts',async()=>{
  const inspect=vi.fn(async(url:string|null)=>url!.endsWith('/fornecedores')
    ?{status:'unknown' as const,checkedAt:'2026-10-12',finalUrl:url!,reason:'timeout',emails:[],phones:[]}
    :{status:'verified_present' as const,checkedAt:'2026-10-12',finalUrl:url!,text:'Informações institucionais públicas suficientes',emails:[],phones:[],
      html:'<a href="/fornecedores">Fornecedores</a><a href="/contato">Contato</a><a href="/sobre">Sobre</a>'})
  const pages=await collectRadarSiteEvidence('https://alfa.example/',{maxPagesPerCandidate:2},{inspect})
  expect(pages.filter(page=>!page.limitation)).toHaveLength(2)
  expect(pages).toHaveLength(3)
  const bounded=await collectRadarSiteEvidence('https://alfa.example/',{maxPagesPerCandidate:2,maxAttemptsPerCandidate:2},{inspect})
  expect(bounded).toHaveLength(2)
  expect(bounded.filter(page=>!page.limitation)).toHaveLength(1)
})
