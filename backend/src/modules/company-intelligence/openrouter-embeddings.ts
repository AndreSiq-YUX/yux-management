import type { AppEnv } from '../../config/env.js'

type FetchLike = typeof fetch
type EmbeddingInputType = 'search_document' | 'search_query'

export type OpenRouterEmbeddingBatch = {
  model: string
  dimensions: number
  vectors: number[][]
  tokens: number
}

const DEFAULT_MODEL = 'google/gemini-embedding-2'
const DEFAULT_DIMENSIONS = 768
export const OPENROUTER_EMBEDDING_BATCH_SIZE = 32

function isFreeOpenRouterModel(model: string) {
  return model === 'openrouter/free' || model.endsWith(':free')
}

function assertOpenRouterModelApproved(env: AppEnv, model: string) {
  if (isFreeOpenRouterModel(model)) return
  const approved = new Set(
    (env.OPENROUTER_ALLOWED_PAID_MODELS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
  if (!approved.has(model)) throw new Error(`paid_openrouter_model_not_approved:${model}`)
}

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
  assertOpenRouterModelApproved(env, model)
  if (!texts.length) return { model, dimensions, vectors: [], tokens: 0 }
  const vectors: number[][] = []
  let tokens = 0
  let resolvedModel: string | null = null
  for (let offset = 0; offset < texts.length; offset += OPENROUTER_EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(offset, offset + OPENROUTER_EMBEDDING_BATCH_SIZE)
    const timeoutSignal = AbortSignal.timeout(env.OPENROUTER_EMBEDDING_TIMEOUT_MS || 45_000)
    const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal
    const response = await fetchImpl('https://openrouter.ai/api/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: batch,
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
    const batchVectors = ordered.map(item => {
      if (!Array.isArray(item.embedding) || item.embedding.length !== dimensions || item.embedding.some(value => typeof value !== 'number')) {
        throw new Error('invalid_openrouter_embedding_vector')
      }
      return item.embedding as number[]
    })
    if (batchVectors.length !== batch.length) throw new Error('invalid_openrouter_embedding_count')
    const batchModel = payload.model || model
    if (resolvedModel && batchModel !== resolvedModel) throw new Error('openrouter_embedding_model_changed')
    vectors.push(...batchVectors)
    tokens += Number(payload.usage?.total_tokens || 0)
    resolvedModel = batchModel
  }
  return { model: resolvedModel || model, dimensions, vectors, tokens }
}

export function embedPassages(env: AppEnv, texts: string[], fetchImpl?: FetchLike, signal?: AbortSignal) {
  return embedOpenRouterTexts(env, texts, 'search_document', fetchImpl, signal)
}
