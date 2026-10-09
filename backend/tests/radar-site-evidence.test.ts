import { expect, it, vi } from 'vitest'
import { collectRadarSiteEvidence } from '../src/modules/radar/site-evidence.js'
import { inspectRadarBusinessSite } from '../src/modules/radar/b2b-site-inspection.js'
it('records_fact_source_per_page_and_respects_page_limit', async () => {
  const inspect = vi.fn(async (url: string | null) => ({ status: 'verified_present' as const, checkedAt:'2026-10-08', finalUrl:url!, text:'Alfa contatos comerciais', emails:[], phones:[], html: '<a href="/contato">Contato</a><a href="/sobre">Sobre</a>' }))
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
