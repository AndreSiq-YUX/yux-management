import { describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { embedOpenRouterTexts, embedPassages } from '../src/modules/company-intelligence/openrouter-embeddings.js'

describe('OpenRouter embeddings', () => {
  it('embeds passages with Qwen, the document input type and configured dimensions', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body).toEqual({
        model: 'qwen/qwen3-embedding-8b', input: ['texto A', 'texto B'], input_type: 'search_document',
        dimensions: 3, encoding_format: 'float', provider: { data_collection: 'deny' },
      })
      return { ok: true, json: async () => ({ model: 'qwen/qwen3-embedding-8b', data: [{ index: 1, embedding: [0, 1, 0] }, { index: 0, embedding: [1, 0, 0] }], usage: { total_tokens: 8 } }) }
    })
    const result = await embedPassages({ OPENROUTER_API_KEY: 'secret', OPENROUTER_EMBEDDING_MODEL: 'qwen/qwen3-embedding-8b', OPENROUTER_EMBEDDING_DIMENSIONS: 3 } as AppEnv, ['texto A', 'texto B'], fetchImpl as never)
    expect(result.vectors).toEqual([[1, 0, 0], [0, 1, 0]])
    expect(result.tokens).toBe(8)
  })

  it('uses the query input type for retrieval questions', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toMatchObject({ input_type: 'search_query' })
      return { ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 0] }] }) }
    })
    await embedOpenRouterTexts({ OPENROUTER_API_KEY: 'secret', OPENROUTER_EMBEDDING_DIMENSIONS: 2 } as AppEnv, ['consulta'], 'search_query', fetchImpl as never)
  })

  it('rejects malformed vectors', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 0] }] }) }))
    await expect(embedPassages({ OPENROUTER_API_KEY: 'secret', OPENROUTER_EMBEDDING_DIMENSIONS: 3 } as AppEnv, ['texto'], fetchImpl as never)).rejects.toThrow('invalid_openrouter_embedding_vector')
  })
})
