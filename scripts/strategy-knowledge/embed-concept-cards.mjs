#!/usr/bin/env node
import { parseArgs, readJson, requireArg, sha256, writeJsonl } from './_shared.mjs'

function cardText(card) {
  return [
    card.concept,
    card.category,
    card.problemSolved,
    ...(card.triggerSignals || []),
    ...(card.diagnosisQuestions || []),
    ...(card.decisionRules || []),
    ...(card.recommendedActions || []),
    ...(card.retrievalTags || []),
  ].join('\n')
}

function mockEmbedding(text, dimensions) {
  const values = new Array(dimensions).fill(0)
  for (let index = 0; index < dimensions; index += 1) {
    const hash = sha256(`${index}:${text}`)
    const integer = Number.parseInt(hash.slice(0, 8), 16)
    values[index] = Number(((integer / 0xffffffff) * 2 - 1).toFixed(8))
  }
  return values
}

function isFreeOpenRouterModel(model) {
  return model === 'openrouter/free' || model.endsWith(':free')
}

function assertOpenRouterModelApproved(model) {
  if (isFreeOpenRouterModel(model)) return
  const approved = new Set(
    (process.env.OPENROUTER_ALLOWED_PAID_MODELS || '')
      .split(',')
      .map(value => value.trim())
      .filter(Boolean),
  )
  if (!approved.has(model)) throw new Error(`paid_openrouter_model_not_approved:${model}`)
}

async function openrouterEmbedding(text, model, dimensions) {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is required when --provider openrouter')
  assertOpenRouterModelApproved(model)
  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [text],
      input_type: 'search_document',
      dimensions,
      encoding_format: 'float',
      provider: { data_collection: 'deny' },
    }),
  })
  if (!response.ok) {
    throw new Error(`OpenRouter embeddings request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const embedding = body?.data?.[0]?.embedding
  if (!Array.isArray(embedding) || embedding.length !== dimensions || embedding.some(value => typeof value !== 'number')) {
    throw new Error('OpenRouter response did not include a valid embedding vector')
  }
  return embedding
}

async function main() {
  const args = parseArgs()
  const input = requireArg(args, 'input')
  const out = requireArg(args, 'out')
  const provider = args.provider || 'mock'
  if (!['mock', 'openrouter'].includes(provider)) {
    throw new Error(`unsupported_embedding_provider:${provider}; use mock or openrouter`)
  }
  const model = args.model || (provider === 'openrouter'
    ? (process.env.OPENROUTER_EMBEDDING_MODEL || 'qwen/qwen3-embedding-8b')
    : 'mock-hash-embedding')
  const dimensions = Number(args.dimensions || (provider === 'openrouter'
    ? (process.env.OPENROUTER_EMBEDDING_DIMENSIONS || 1024)
    : 1536))
  if (!Number.isInteger(dimensions) || dimensions < 1) throw new Error('dimensions must be a positive integer')
  const cards = await readJson(input)
  if (!Array.isArray(cards)) throw new Error('input must be a JSON array of concept cards')

  const rows = []
  for (const card of cards) {
    const text = cardText(card)
    const embedding = provider === 'openrouter'
      ? await openrouterEmbedding(text, model, dimensions)
      : mockEmbedding(text, dimensions)
    rows.push({
      concept: card.concept,
      category: card.category,
      contentHash: sha256(text),
      embeddingModel: model,
      embeddingDimensions: embedding.length,
      embeddingValues: embedding,
      provider,
      metadata: {
        sourceVisibility: card.visibility,
        allowedAgentProfileKeys: card.allowedAgentProfileKeys,
      },
    })
  }

  await writeJsonl(out, rows)
  console.log(`wrote ${rows.length} card embeddings to ${out}`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
