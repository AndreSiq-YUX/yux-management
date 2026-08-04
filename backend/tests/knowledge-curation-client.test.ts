import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { curateKnowledgeWithRuntime } from '../src/modules/company-intelligence/runtime-curation.js'

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
})
