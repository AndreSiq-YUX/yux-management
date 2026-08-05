import { describe, expect, it, vi } from 'vitest'
import { inspectWebsiteVisualIdentity } from '../src/modules/company-intelligence/website-visual-identity.js'

describe('website visual identity', () => {
  it('extracts a logo, recurring colors and typography from public HTML and CSS', async () => {
    const fetchImpl = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input)
      const body = url.endsWith('/brand.css')
        ? ':root{--brand:#5519ff;--accent:#13c296}.button{background:#5519ff;color:#13c296;font-family:"Sora",sans-serif}'
        : '<html><head><link rel="stylesheet" href="/brand.css"><link rel="icon" href="/favicon.svg"></head><body><img class="brand-logo" src="/logo.svg" alt="YUX logo"><div style="color:#5519ff;font-family:Inter,sans-serif"></div></body></html>'
      return {
        ok: true,
        status: 200,
        headers: { get: () => null },
        text: async () => body,
      }
    })

    const result = await inspectWebsiteVisualIdentity('https://yux.test', {
      fetchImpl: fetchImpl as never,
      resolveHost: async () => ['93.184.216.34'],
    })

    expect(result.logoUrl).toBe('https://yux.test/logo.svg')
    expect(result.colors).toEqual(expect.arrayContaining(['#5519ff', '#13c296']))
    expect(result.typography).toEqual(expect.arrayContaining(['Inter', 'Sora']))
    expect(result.evidenceText).toContain('Cores detectadas no site')
  })
})
