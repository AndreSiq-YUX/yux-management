import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { curateKnowledgeWithRuntime, extractCompanyProfileInBatches } from '../src/modules/company-intelligence/runtime-curation.js'

afterEach(() => vi.unstubAllGlobals())

describe('knowledge runtime curation client', () => {
  it('sends tenant scope and validates grounded facts', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body).toMatchObject({ organization_id: 'org-1', client_id: 'client-1', contract_id: 'contract-1' })
      return { ok: true, json: async () => ({ summary: 'Resumo', facts: [{ statement: 'Fato', category: 'company', evidence_excerpt: 'Trecho', source_locator: 'paragraph:1', confidence: 0.9, usefulness: 0.8, agent_profiles: [], sensitivity: 'public' }], discarded: [], warnings: [], provider: 'openrouter', model: 'test' }) }
    }))
    const result = await curateKnowledgeWithRuntime({ YUX_AGENT_RUNTIME_URL: 'http://runtime:8080', YUX_AGENT_RUNTIME_TOKEN: 'token' } as AppEnv, {
      organizationId: 'org-1', clientId: 'client-1', contractId: 'contract-1', sections: [{ locator: 'paragraph:1', body: 'Trecho' }],
    })
    expect(result.facts[0].statement).toBe('Fato')
  })

  it('extracts website suggestions in small batches', async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { pages: Array<{ url: string }> }
      return {
        ok: true,
        json: async () => ({
          suggestions: body.pages.map((page, index) => ({
            suggestion_kind: 'profile', field_path: `field-${page.url}`, suggested_value: page.url,
            evidence_excerpt: `evidence-${index}`, source_url: page.url, confidence: 0.9,
          })),
          warnings: [], provider: 'openrouter', model: 'test',
        }),
      }
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await extractCompanyProfileInBatches(runtimeEnv(), {
      organizationId: 'org-1',
      pages: Array.from({ length: 4 }, (_, index) => ({ url: `https://example.com/${index}`, title: `Page ${index}`, content: 'Conteudo'.repeat(100) })),
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(result.suggestions).toHaveLength(4)
    expect(result.successfulBatches).toBe(2)
    for (const [, init] of fetchMock.mock.calls) {
      const body = JSON.parse(String(init.body)) as { pages: Array<{ content: string }> }
      expect(body.pages.length).toBeLessThanOrEqual(3)
      expect(body.pages.reduce((total, page) => total + page.content.length, 0)).toBeLessThanOrEqual(60_000)
    }
  })

  it('isolates a failed batch and preserves successful page suggestions', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { pages: Array<{ url: string }> }
      if (body.pages.length > 1 || body.pages[0].url.endsWith('/bad')) {
        return { ok: false, status: 500, text: async () => '{"detail":"website_extraction_failed"}' }
      }
      return {
        ok: true,
        json: async () => ({ suggestions: [{
          suggestion_kind: 'profile', field_path: 'description', suggested_value: 'Empresa',
          evidence_excerpt: 'Empresa', source_url: body.pages[0].url, confidence: 0.9,
        }], warnings: [], provider: 'openrouter', model: 'test' }),
      }
    }))

    const result = await extractCompanyProfileInBatches(runtimeEnv(), {
      organizationId: 'org-1',
      pages: [
        { url: 'https://example.com/ok', title: 'Ok', content: 'Empresa' },
        { url: 'https://example.com/bad', title: 'Bad', content: 'Falha' },
      ],
    })

    expect(result.suggestions).toHaveLength(1)
    expect(result.failedPageUrls).toEqual(['https://example.com/bad'])
    expect(result.warnings).toContain('website_page_extraction_failed:https://example.com/bad:agent_runtime_500:website_extraction_failed')
  })
})

function runtimeEnv() {
  return { YUX_AGENT_RUNTIME_URL: 'http://runtime:8080', YUX_AGENT_RUNTIME_TOKEN: 'token' } as AppEnv
}
