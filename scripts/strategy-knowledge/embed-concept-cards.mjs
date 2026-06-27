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

async function jinaEmbedding(text, model) {
  const apiKey = process.env.JINA_API_KEY
  if (!apiKey) throw new Error('JINA_API_KEY is required when --provider jina')
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [text],
    }),
  })
  if (!response.ok) {
    throw new Error(`Jina embeddings request failed: ${response.status} ${await response.text()}`)
  }
  const body = await response.json()
  const embedding = body?.data?.[0]?.embedding
  if (!Array.isArray(embedding)) throw new Error('Jina response did not include data[0].embedding')
  return embedding
}

async function main() {
  const args = parseArgs()
  const input = requireArg(args, 'input')
  const out = requireArg(args, 'out')
  const provider = args.provider || 'mock'
  const model = args.model || (provider === 'jina' ? 'jina-embeddings-v4' : 'mock-hash-embedding')
  const dimensions = Number(args.dimensions || 1536)
  const cards = await readJson(input)
  if (!Array.isArray(cards)) throw new Error('input must be a JSON array of concept cards')

  const rows = []
  for (const card of cards) {
    const text = cardText(card)
    const embedding = provider === 'jina' ? await jinaEmbedding(text, model) : mockEmbedding(text, dimensions)
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
