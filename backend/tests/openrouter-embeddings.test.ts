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
    const result = await embedPassages({ OPENROUTER_API_KEY: 'secret', OPENROUTER_ALLOWED_PAID_MODELS: 'qwen/qwen3-embedding-8b', OPENROUTER_EMBEDDING_MODEL: 'qwen/qwen3-embedding-8b', OPENROUTER_EMBEDDING_DIMENSIONS: 3 } as AppEnv, ['texto A', 'texto B'], fetchImpl as never)
    expect(result.vectors).toEqual([[1, 0, 0], [0, 1, 0]])
    expect(result.tokens).toBe(8)
  })

  it('uses Qwen 1024 dimensions when embedding settings are omitted', async () => {
    const vector = Array.from({ length: 1024 }, (_, index) => index === 0 ? 1 : 0)
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toMatchObject({
        model: 'qwen/qwen3-embedding-8b',
        input_type: 'search_document',
        dimensions: 1024,
      })
      return { ok: true, json: async () => ({ data: [{ index: 0, embedding: vector }] }) }
    })
    const result = await embedPassages({
      OPENROUTER_API_KEY: 'secret',
      OPENROUTER_ALLOWED_PAID_MODELS: 'qwen/qwen3-embedding-8b',
    } as AppEnv, ['texto'], fetchImpl as never)
    expect(result.model).toBe('qwen/qwen3-embedding-8b')
    expect(result.dimensions).toBe(1024)
    expect(result.vectors).toEqual([vector])
  })

  it('uses the query input type for retrieval questions', async () => {
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      expect(JSON.parse(String(init.body))).toMatchObject({ input_type: 'search_query' })
      return { ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 0] }] }) }
    })
    await embedOpenRouterTexts({ OPENROUTER_API_KEY: 'secret', OPENROUTER_ALLOWED_PAID_MODELS: 'google/gemini-embedding-2', OPENROUTER_EMBEDDING_MODEL: 'google/gemini-embedding-2', OPENROUTER_EMBEDDING_DIMENSIONS: 2 } as AppEnv, ['consulta'], 'search_query', fetchImpl as never)
  })

  it('divide coleções grandes em lotes preservando ordem e uso total', async () => {
    const inputs = Array.from({ length: 65 }, (_, index) => `texto ${index}`)
    const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { input: string[] }
      return {
        ok: true,
        json: async () => ({
          model: 'qwen/qwen3-embedding-8b',
          data: body.input.map((text, index) => ({ index, embedding: [Number(text.split(' ')[1]), 1] })),
          usage: { total_tokens: body.input.length * 2 },
        }),
      }
    })

    const result = await embedPassages(
      { OPENROUTER_API_KEY: 'secret', OPENROUTER_ALLOWED_PAID_MODELS: 'google/gemini-embedding-2', OPENROUTER_EMBEDDING_MODEL: 'google/gemini-embedding-2', OPENROUTER_EMBEDDING_DIMENSIONS: 2 } as AppEnv,
      inputs,
      fetchImpl as never,
    )

    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(fetchImpl.mock.calls.map(([, init]) => (JSON.parse(String(init?.body)) as { input: string[] }).input.length)).toEqual([32, 32, 1])
    expect(result.vectors[0]).toEqual([0, 1])
    expect(result.vectors[64]).toEqual([64, 1])
    expect(result.tokens).toBe(130)
  })

  it('rejects malformed vectors', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ data: [{ index: 0, embedding: [1, 0] }] }) }))
    await expect(embedPassages({ OPENROUTER_API_KEY: 'secret', OPENROUTER_ALLOWED_PAID_MODELS: 'google/gemini-embedding-2', OPENROUTER_EMBEDDING_MODEL: 'google/gemini-embedding-2', OPENROUTER_EMBEDDING_DIMENSIONS: 3 } as AppEnv, ['texto'], fetchImpl as never)).rejects.toThrow('invalid_openrouter_embedding_vector')
  })

  it('rejects an unapproved paid model before making a request', async () => {
    const fetchImpl = vi.fn()
    await expect(embedPassages({
      OPENROUTER_API_KEY: 'secret',
      OPENROUTER_EMBEDDING_MODEL: 'openai/gpt-4.1-mini',
    } as AppEnv, ['texto'], fetchImpl as never)).rejects.toThrow('paid_openrouter_model_not_approved:openai/gpt-4.1-mini')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('allows a free embedding model without a paid allowlist', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ model: 'liquid/lfm-2.5-embedding-350m:free', data: [{ index: 0, embedding: [1, 0] }] }),
    }))
    const result = await embedPassages({
      OPENROUTER_API_KEY: 'secret',
      OPENROUTER_EMBEDDING_MODEL: 'liquid/lfm-2.5-embedding-350m:free',
      OPENROUTER_EMBEDDING_DIMENSIONS: 2,
    } as AppEnv, ['texto neutro'], fetchImpl as never)
    expect(result.model).toBe('liquid/lfm-2.5-embedding-350m:free')
  })
})
