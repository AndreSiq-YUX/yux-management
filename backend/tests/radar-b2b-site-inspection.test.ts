import { describe, expect, it, vi } from 'vitest'
import { inspectRadarBusinessSite } from '../src/modules/radar/b2b-site-inspection.js'
import { inspectRadarCandidateBusinessSite } from '../src/modules/radar/repository.js'
import type { AuthUser } from '../src/auth/routes.js'

const admin = { id: '00000000-0000-4000-8000-000000000001', role: 'yux_admin' } as AuthUser

class SitePool {
  queries: string[] = []
  async connect() { return { query: this.query.bind(this), release() {} } }
  async query(sql: string, _params: unknown[] = []) {
    this.queries.push(sql)
    if (sql.includes("kind = 'yux'")) return { rows: [{ allowed: true }] }
    if (sql.includes('FROM public.radar_candidate_records candidate')) return { rows: [{
      id: 'candidate', organization_id: 'org', campaign_id: 'campaign', campaign_type: 'regional_b2b',
      title: 'Cozinha Central Alfa', source_type: 'cnpja_advanced_search', status: 'pending_review',
      normalized_payload: { cnaes: ['5620101'], websiteUrl: 'https://alfa.example', city: 'Belo Horizonte', state: 'MG' },
      target_cnaes: ['5620101'], configuration_revision: 1,
      search_configuration: { qualification: { includeAnyTerms: ['cozinha industrial'], productTerms: ['massas'] } },
    }] }
    if (sql.includes('SELECT * FROM public.radar_candidate_records')) return { rows: [{
      id: 'candidate', organization_id: 'org', campaign_id: 'campaign', status: 'pending_review',
      normalized_payload: { cnaes: ['5620101'], websiteUrl: 'https://alfa.example' },
    }] }
    if (sql.includes('FROM public.radar_campaigns')) return { rows: [{ configuration_revision: 1 }] }
    return { rows: [] }
  }
}

describe('Radar B2B public website inspection', () => {
  it('extracts only observed public facts with a source URL', async () => {
    const get = vi.fn(async () => ({ status: 200, contentType: 'text/html', body: `
      <html><title>Cozinha Alfa</title><body><h1>Cozinha industrial</h1>
      <p>Fornecemos refeições corporativas para empresas. Ligue (31) 3333-4444 ou escreva para contato@alfa.example.</p>
      <script>not-a-contact@script.example</script></body></html>` }))
    const result = await inspectRadarBusinessSite('https://alfa.example', {
      resolve: async () => ['8.8.8.8'], get,
    })
    expect(result.status).toBe('verified_present')
    expect(result.text).toContain('refeições corporativas')
    expect(result.emails).toEqual(['contato@alfa.example'])
    expect(result.emails).not.toContain('not-a-contact@script.example')
    expect(result.finalUrl).toBe('https://alfa.example/')
  })

  it('blocks private addresses and redirects before sending a request', async () => {
    const get = vi.fn(async (url:URL) => url.pathname==='/robots.txt'?{status:404}:{ status: 302, location: 'http://127.0.0.1/internal' })
    const options = { resolve: async () => ['8.8.8.8'], get }
    expect((await inspectRadarBusinessSite('http://127.0.0.1', options)).status).toBe('blocked')
    expect(get).not.toHaveBeenCalled()
    expect((await inspectRadarBusinessSite('https://alfa.example', options)).status).toBe('blocked')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('respects a public robots.txt block and does not fetch the homepage', async () => {
    const get = vi.fn(async (url: URL) => url.pathname === '/robots.txt'
      ? { status: 200, contentType: 'text/plain', body: 'User-agent: *\nDisallow: /' }
      : { status: 200, contentType: 'text/html', body: '<h1>Cozinha industrial</h1>' })
    const result = await inspectRadarBusinessSite('https://alfa.example', {
      resolve: async () => ['8.8.8.8'], get,
    })
    expect(result.status).toBe('blocked')
    expect(result.reason).toBe('robots_disallow')
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('does not attach content from a different company after a cross-domain redirect', async () => {
    const get = vi.fn(async (url: URL) => url.pathname === '/robots.txt'
      ? { status: 404, contentType: 'text/plain' }
      : { status: 302, location: 'https://different.example/' })
    const result = await inspectRadarBusinessSite('https://alfa.example', {
      resolve: async () => ['8.8.8.8'], get,
    })
    expect(result.status).toBe('unknown')
    expect(result.reason).toBe('external_redirect')
    expect(get).toHaveBeenCalledTimes(2)
  })

  it('keeps missing or failing sites unknown instead of declaring no site', async () => {
    expect((await inspectRadarBusinessSite(null)).status).toBe('unknown')
    const result = await inspectRadarBusinessSite('https://alfa.example', {
      resolve: async () => ['8.8.8.8'], get: async () => ({ status: 503, contentType: 'text/html', body: '' }),
    })
    expect(result.status).toBe('unknown')
  })
  it('rechecks_robots_after_a_redirect_to_a_disallowed_path',async()=>{
    const get=vi.fn(async(url:URL)=>url.pathname==='/robots.txt'?{status:200,contentType:'text/plain',body:'User-agent: *\nDisallow: /private'}:{status:302,location:'/private'})
    const result=await inspectRadarBusinessSite('https://alfa.example',{resolve:async()=>['8.8.8.8'],get})
    expect(result.reason).toBe('robots_disallow');expect(get).toHaveBeenCalledTimes(2)
  })

  it('persists a review classification and source evidence without contacting anyone', async () => {
    const pool = new SitePool()
    const inspect = vi.fn(async () => ({ status: 'verified_present' as const, checkedAt: '2026-09-30T00:00:00.000Z',
      finalUrl: 'https://alfa.example/', text: 'Cozinha Central Alfa: cozinha industrial e refeições corporativas com massas.',
      emails: ['contato@alfa.example'], phones: ['3133334444'] }))
    const result = await inspectRadarCandidateBusinessSite(pool as never, admin,
      { organizationId: 'org', candidateId: 'candidate' }, { inspect })
    expect(result.review.targetStatus).toBe('confirmed')
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.radar_b2b_reviews'))).toBe(true)
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.radar_b2b_evidence'))).toBe(true)
    expect(pool.queries.some(sql => sql.includes('radar_outreach_events'))).toBe(false)
  })
})
