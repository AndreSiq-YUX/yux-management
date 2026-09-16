import type { AppEnv } from '../../config/env.js'
import { legacyEmbeddingConfiguration, type EmbeddingConfiguration } from '../platform/llm-runtime-config.js'

type FetchLike = typeof fetch
type EmbeddingInputType = 'search_document' | 'search_query'
export type OpenRouterEmbeddingBatch = { provider?: 'openrouter' | 'openai_direct'; model: string; dimensions: number; vectors: number[][]; tokens: number }
export const OPENROUTER_DEFAULT_EMBEDDING_MODEL = 'qwen/qwen3-embedding-8b'
export const OPENROUTER_DEFAULT_EMBEDDING_DIMENSIONS = 1024
export const OPENROUTER_EMBEDDING_BATCH_SIZE = 32

class EmbeddingAuthorizationError extends Error {}

export async function embedOpenRouterTexts(
  env: AppEnv, texts: string[], inputType: EmbeddingInputType,
  fetchImpl: FetchLike = fetch, signal?: AbortSignal, configuration?: EmbeddingConfiguration,
): Promise<OpenRouterEmbeddingBatch> {
  const config = configuration || legacyEmbeddingConfiguration(env)
  const dimensions = config.dimensions
  let lastError: unknown
  for (const attempt of config.attempts) {
    if (!attempt.approved) throw new EmbeddingAuthorizationError('paid_openrouter_model_not_approved:' + attempt.model)
    // Each provider attempt starts the complete logical batch from zero.
    const vectors: number[][] = []
    let tokens = 0
    let resolvedModel: string | null = null
    try {
      if (attempt.credentialError) throw new Error(attempt.credentialError)
      if (!attempt.apiKey) throw new Error(attempt.provider + '_api_key_required')
      for (let offset = 0; offset < texts.length; offset += OPENROUTER_EMBEDDING_BATCH_SIZE) {
        signal?.throwIfAborted()
        const batch = texts.slice(offset, offset + OPENROUTER_EMBEDDING_BATCH_SIZE)
        const timeoutSignal = AbortSignal.timeout(env.OPENROUTER_EMBEDDING_TIMEOUT_MS || 45_000)
        const response = await fetchImpl(attempt.baseUrl + '/embeddings', {
          method: 'POST', headers: { Authorization: 'Bearer ' + attempt.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: attempt.model, input: batch, dimensions, encoding_format: 'float',
            ...(attempt.provider === 'openrouter' ? { input_type: inputType, provider: { data_collection: 'deny' } } : {}),
          }), signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
        })
        if ([401, 403].includes(response.status)) throw new EmbeddingAuthorizationError(attempt.provider + '_embeddings_http_' + response.status)
        if (!response.ok) throw new Error(attempt.provider + '_embeddings_http_' + response.status)
        const payload = await response.json() as { data?: Array<{ index?: number; embedding?: unknown }>; model?: string; usage?: { total_tokens?: number } }
        const ordered = [...(payload.data || [])].sort((a, b) => Number(a.index || 0) - Number(b.index || 0))
        const batchVectors = ordered.map(item => {
          if (!Array.isArray(item.embedding) || item.embedding.length !== dimensions || item.embedding.some(value => typeof value !== 'number' || !Number.isFinite(value))) throw new Error('invalid_openrouter_embedding_vector')
          return item.embedding as number[]
        })
        if (batchVectors.length !== batch.length) throw new Error('invalid_openrouter_embedding_count')
        const batchModel = payload.model || attempt.model
        if (resolvedModel && batchModel !== resolvedModel) throw new Error('openrouter_embedding_model_changed')
        resolvedModel = batchModel
        vectors.push(...batchVectors)
        tokens += Number(payload.usage?.total_tokens || 0)
      }
      return { provider: attempt.provider, model: resolvedModel || attempt.model, dimensions, vectors, tokens }
    } catch (error) {
      if (error instanceof EmbeddingAuthorizationError || signal?.aborted) throw error
      lastError = error
    }
  }
  throw lastError || new Error('llm_embedding_route_unavailable')
}

export function embedPassages(env: AppEnv, texts: string[], fetchImpl?: FetchLike, signal?: AbortSignal, configuration?: EmbeddingConfiguration) {
  return embedOpenRouterTexts(env, texts, 'search_document', fetchImpl, signal, configuration)
}
