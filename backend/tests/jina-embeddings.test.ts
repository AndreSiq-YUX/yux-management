import { describe, expect, it, vi } from 'vitest'
import type { AppEnv } from '../src/config/env.js'
import { embedPassages } from '../src/modules/company-intelligence/jina-embeddings.js'

describe('Jina embeddings', () => {
  it('embeds passages with the configured retrieval task and validates dimensions', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body))
      expect(body).toMatchObject({ model: 'jina-embeddings-v3', task: 'retrieval.passage', normalized: true, dimensions: 3, input: ['texto A', 'texto B'] })
      return { ok: true, json: async () => ({ model: 'jina-embeddings-v3', data: [{ index: 1, embedding: [0, 1, 0] }, { index: 0, embedding: [1, 0, 0] }], usage: { total_tokens: 8 } }) }
    })
    const result = await embedPassages({ JINA_API_KEY: 'secret', JINA_EMBEDDING_MODEL: 'jina-embeddings-v3', JINA_EMBEDDING_DIMENSIONS: 3 } as AppEnv, ['texto A', 'texto B'], fetchImpl as never)
    expect(result.vectors).toEqual([[1, 0, 0], [0, 1, 0]])
    expect(result.tokens).toBe(8)
  })

  it('rejects malformed vectors', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 0] }] }) }))
    await expect(embedPassages({ JINA_API_KEY: 'secret', JINA_EMBEDDING_DIMENSIONS: 3 } as AppEnv, ['texto'], fetchImpl as never)).rejects.toThrow('invalid_jina_embedding_vector')
  })
})
