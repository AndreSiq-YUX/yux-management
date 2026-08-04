import type { AppEnv } from '../../config/env.js'

type FetchLike = typeof fetch

export type JinaEmbeddingBatch = {
  model: string
  dimensions: number
  vectors: number[][]
  tokens: number
}

export async function embedJinaTexts(env: AppEnv, texts: string[], task: 'retrieval.passage' | 'retrieval.query', fetchImpl: FetchLike = fetch): Promise<JinaEmbeddingBatch> {
  if (!env.JINA_API_KEY) throw new Error('jina_api_key_required')
  if (!texts.length) return { model: env.JINA_EMBEDDING_MODEL || 'jina-embeddings-v3', dimensions: env.JINA_EMBEDDING_DIMENSIONS || 1024, vectors: [], tokens: 0 }
  const model = env.JINA_EMBEDDING_MODEL || 'jina-embeddings-v3'
  const dimensions = env.JINA_EMBEDDING_DIMENSIONS || 1024
  const response = await fetchImpl('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.JINA_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, task, normalized: true, embedding_type: 'float', dimensions, input: texts }),
  })
  if (!response.ok) throw new Error(`jina_embeddings_http_${response.status}`)
  const payload = await response.json() as { data?: Array<{ index?: number; embedding?: unknown }>; model?: string; usage?: { total_tokens?: number } }
  const ordered = [...(payload.data || [])].sort((left, right) => Number(left.index || 0) - Number(right.index || 0))
  const vectors = ordered.map(item => {
    if (!Array.isArray(item.embedding) || item.embedding.length !== dimensions || item.embedding.some(value => typeof value !== 'number')) throw new Error('invalid_jina_embedding_vector')
    return item.embedding as number[]
  })
  if (vectors.length !== texts.length) throw new Error('invalid_jina_embedding_count')
  return { model: payload.model || model, dimensions, vectors, tokens: Number(payload.usage?.total_tokens || 0) }
}

export function embedPassages(env: AppEnv, texts: string[], fetchImpl?: FetchLike) {
  return embedJinaTexts(env, texts, 'retrieval.passage', fetchImpl)
}
