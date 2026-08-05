import { describe, expect, it } from 'vitest'
import { discoverCompanyWebsite, rankSameOriginLinks } from '../src/modules/company-intelligence/website-discovery.js'

describe('website discovery', () => {
  it('prioritizes useful same-origin pages and ignores assets and external links', () => {
    const links = rankSameOriginLinks(new URL('https://example.com/'), [
      'https://other.test/sobre', '/blog/post', '/servicos', '/logo.png', '/sobre',
    ])
    expect(links.slice(0, 2)).toEqual(expect.arrayContaining(['https://example.com/servicos', 'https://example.com/sobre']))
    expect(links).not.toContain('https://other.test/sobre')
  })

  it('maps a dominant canonical-host alias back to the requested public domain', () => {
    const links = rankSameOriginLinks(new URL('https://yux.com.br/'), [
      'https://wordpress.internal-host.test/sobre',
      'https://wordpress.internal-host.test/servicos',
      'https://wordpress.internal-host.test/contato',
      'https://other.test/sobre',
    ])

    expect(links).toEqual(expect.arrayContaining([
      'https://yux.com.br/sobre',
      'https://yux.com.br/servicos',
      'https://yux.com.br/contato',
    ]))
    expect(links).not.toContain('https://other.test/sobre')
  })

  it('rejects private hosts before sending them to the reader', async () => {
    await expect(discoverCompanyWebsite('http://intranet.test', {
      resolveHost: async () => ['10.0.0.2'],
      readPage: async () => { throw new Error('must_not_run') },
    })).rejects.toThrow('private_company_website_url')
  })

  it('crawls a bounded set with partial failure tolerance', async () => {
    const pages = await discoverCompanyWebsite('https://example.com', {
      maxPages: 3,
      resolveHost: async () => ['93.184.216.34'],
      readPage: async url => {
        if (url.endsWith('/contato')) throw new Error('unavailable')
        return { title: url, url, content: 'Conteudo util da empresa', emails: [], phones: [], links: url.endsWith('/') ? ['/sobre', '/contato'] : [], ctaTerms: [] }
      },
    })
    expect(pages.pages).toHaveLength(2)
    expect(pages.failedPages).toBe(1)
  })
})
