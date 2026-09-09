import type { AppEnv } from '../../config/env.js'

type FetchLike = typeof fetch
type EmbeddingInputType = 'search_document' | 'search_query'

export type OpenRouterEmbeddingBatch = {
  model: string
  dimensions: number
  vectors: number[][]
  tokens: number
}

const DEFAULT_MODEL = 'qwen/qwen3-embedding-8b'
const DEFAULT_DIMENSIONS = 1024

export async function embedOpenRouterTexts(
  env: AppEnv,
  texts: string[],
  inputType: EmbeddingInputType,
  fetchImpl: FetchLike = fetch,
  signal?: AbortSignal,
): Promise<OpenRouterEmbeddingBatch> {
  if (!env.OPENROUTER_API_KEY) throw new Error('openrouter_api_key_required')
  const model = env.OPENROUTER_EMBEDDING_MODEL || DEFAULT_MODEL
  const dimensions = env.OPENROUTER_EMBEDDING_DIMENSIONS || DEFAULT_DIMENSIONS
  if (!texts.length) return { model, dimensions, vectors: [], tokens: 0 }
  const timeoutSignal = AbortSignal.timeout(env.OPENROUTER_EMBEDDING_TIMEOUT_MS || 45_000)
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
  const response = await fetchImpl('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      input: texts,
      input_type: inputType,
      dimensions,
      encoding_format: 'float',
      provider: { data_collection: 'deny' },
    }),
    signal: requestSignal,
  })
  if (!response.ok) throw new Error(`openrouter_embeddings_http_${response.status}`)
  const payload = await response.json() as { data?: Array<{ index?: number; embedding?: unknown }>; model?: string; usage?: { total_tokens?: number } }
  const ordered = [...(payload.data || [])].sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
  const vectors = ordered.map(item => {
    if (!Array.isArray(item.embedding) || item.embedding.length !== dimensions || item.embedding.some(value => typeof value !== 'number')) {
      throw new Error('invalid_openrouter_embedding_vector')
    }
    return item.embedding as number[]
  })
  if (vectors.length !== texts.length) throw new Error('invalid_openrouter_embedding_count')
  return { model: payload.model || model, dimensions, vectors, tokens: Number(payload.usage?.total_tokens || 0) }
}

export function embedPassages(env: AppEnv, texts: string[], fetchImpl?: FetchLike, signal?: AbortSignal) {
  return embedOpenRouterTexts(env, texts, 'search_document', fetchImpl, signal)
}
