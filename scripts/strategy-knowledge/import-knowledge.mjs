#!/usr/bin/env node
import { createRequire } from 'node:module'
import { parseArgs, readJson, readJsonl, requireArg, sha256 } from './_shared.mjs'

const backendRequire = createRequire(new URL('../../backend/package.json', import.meta.url))
const { Pool } = backendRequire('pg')

function env(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function snakeCard(card) {
  return {
    concept: card.concept,
    category: card.category,
    source_scope: card.sourceScope,
    visibility: card.visibility,
    problem_solved: card.problemSolved,
    trigger_signals: card.triggerSignals || [],
    diagnosis_questions: card.diagnosisQuestions || [],
    decision_rules: card.decisionRules || [],
    anti_patterns: card.antiPatterns || [],
    recommended_actions: card.recommendedActions || [],
    allowed_agent_profile_keys: card.allowedAgentProfileKeys || [],
    stage_tags: card.stageTags || [],
    retrieval_tags: card.retrievalTags || [],
    yux_modules: card.yuxModules || [],
    requires_human_review: card.requiresHumanReview,
    human_review_status: card.requiresHumanReview ? 'pending' : 'approved',
    quality_score: card.qualityScore ?? null,
    metadata: card.metadata || {},
  }
}

function assertIdentifier(value) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new Error(`Invalid SQL identifier: ${value}`)
  return value
}

function normalizeSelect(select) {
  return select.split(',').map(column => assertIdentifier(column.trim())).join(', ')
}

function normalizeConflict(onConflict) {
  return onConflict.split(',').map(column => assertIdentifier(column.trim()))
}

function normalizeValue(column, value) {
  if (value === undefined) return null
  if ((column === 'metadata' || column === 'embedding_values') && value !== null) return JSON.stringify(value)
  return value
}

async function upsertRows(db, table, rows, onConflict, select = 'id') {
  if (!rows.length) return []
  const tableName = assertIdentifier(table)
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))].map(assertIdentifier)
  const conflictColumns = normalizeConflict(onConflict)
  const returning = normalizeSelect(select)
  const values = []
  const placeholders = rows.map(row => {
    const rowPlaceholders = columns.map(column => {
      values.push(normalizeValue(column, row[column]))
      return `$${values.length}`
    })
    return `(${rowPlaceholders.join(', ')})`
  })
  const updateColumns = columns.filter(column => !conflictColumns.includes(column))
  const updateSet = updateColumns.length
    ? updateColumns.map(column => `${column} = EXCLUDED.${column}`).join(', ')
    : `${conflictColumns[0]} = EXCLUDED.${conflictColumns[0]}`

  const sql = `
    INSERT INTO public.${tableName} (${columns.join(', ')})
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (${conflictColumns.join(', ')}) DO UPDATE SET ${updateSet}
    RETURNING ${returning}
  `
  const result = await db.query(sql, values)
  return result.rows
}

async function main() {
  const args = parseArgs()
  const db = new Pool({ connectionString: env('DATABASE_URL') })
  const pagesPath = args.documents
  const chunksPath = args.chunks
  const assetsPath = args.assets
  const cardsPath = args.cards
  const embeddingsPath = args.cardEmbeddings

  const pages = pagesPath ? await readJsonl(pagesPath) : []
  const chunks = chunksPath ? await readJsonl(chunksPath) : []
  const assets = assetsPath ? await readJsonl(assetsPath) : []
  const cards = cardsPath ? await readJson(cardsPath) : []
  const cardEmbeddings = embeddingsPath ? await readJsonl(embeddingsPath) : []

  const documentsByHash = new Map()
  for (const page of pages) {
    if (!documentsByHash.has(page.sourceHash)) {
      documentsByHash.set(page.sourceHash, {
        source_scope: page.sourceScope || 'internal',
        visibility: page.visibility || 'internal_only',
        document_type: page.documentType || 'pdf',
        source_title: page.sourceTitle || page.originalFilename || page.sourceHash,
        source_hash: page.sourceHash,
        original_filename: page.originalFilename || null,
        page_count: pages.filter(item => item.sourceHash === page.sourceHash).length,
        human_review_status: page.humanReviewStatus || 'pending',
        metadata: page.metadata || {},
      })
    }
  }

  const documentRows = await upsertRows(
    db,
    'yux_strategy_source_documents',
    [...documentsByHash.values()],
    'source_hash',
    'id, source_hash',
  )
  const documentIds = new Map(documentRows.map(row => [row.source_hash, row.id]))

  const pageRows = pages.map(page => ({
    document_id: documentIds.get(page.sourceHash),
    page_number: page.pageNumber,
    page_hash: page.pageHash || sha256(`${page.sourceHash}:${page.pageNumber}:${page.cleanText || page.ocrText || ''}`),
    ocr_text: page.ocrText || null,
    clean_text: page.cleanText || null,
    image_storage_path: page.imageStoragePath || null,
    metadata: page.metadata || {},
  })).filter(row => row.document_id)
  const importedPages = await upsertRows(db, 'yux_strategy_source_pages', pageRows, 'document_id,page_number', 'id, document_id, page_number, page_hash')
  const pageIds = new Map(importedPages.map(row => [`${row.document_id}:${row.page_number}`, row.id]))

  const chunkRows = chunks.map(chunk => {
    const documentId = documentIds.get(chunk.sourceHash)
    return {
      document_id: documentId,
      page_id: pageIds.get(`${documentId}:${chunk.pageNumber}`) || null,
      section_key: chunk.sectionKey || 'section',
      chunk_index: chunk.chunkIndex || 0,
      chunk_hash: chunk.chunkHash,
      chunk_text: chunk.chunkText,
      token_estimate: chunk.tokenEstimate || 0,
      source_scope: chunk.sourceScope || 'internal',
      visibility: chunk.visibility || 'internal_only',
      allowed_agent_profile_keys: chunk.allowedAgentProfileKeys || [],
      stage_tags: chunk.stageTags || [],
      retrieval_tags: chunk.retrievalTags || [],
      human_review_status: chunk.humanReviewStatus || 'pending',
      metadata: chunk.metadata || {},
    }
  }).filter(row => row.document_id)
  await upsertRows(db, 'yux_strategy_source_chunks', chunkRows, 'document_id,chunk_hash')

  const assetRows = assets.map(asset => {
    const documentId = documentIds.get(asset.sourceHash)
    return {
      document_id: documentId,
      page_id: pageIds.get(`${documentId}:${asset.pageNumber}`) || null,
      asset_type: asset.assetType || 'page_image',
      asset_hash: asset.assetHash,
      storage_path: asset.storagePath,
      mime_type: asset.mimeType || null,
      source_scope: asset.sourceScope || 'internal',
      visibility: asset.visibility || 'internal_only',
      allowed_agent_profile_keys: asset.allowedAgentProfileKeys || [],
      stage_tags: asset.stageTags || [],
      retrieval_tags: asset.retrievalTags || [],
      human_review_status: asset.humanReviewStatus || 'pending',
      metadata: asset.metadata || {},
    }
  }).filter(row => row.document_id && row.asset_hash && row.storage_path)
  await upsertRows(db, 'yux_strategy_source_assets', assetRows, 'asset_hash')

  const cardRows = cards.map(snakeCard)
  const importedCards = await upsertRows(db, 'yux_strategy_concept_cards', cardRows, 'concept,category', 'id, concept, category')
  const cardIds = new Map(importedCards.map(row => [`${row.concept}:${row.category}`, row.id]))

  const embeddingRows = cardEmbeddings.map(item => ({
    card_id: cardIds.get(`${item.concept}:${item.category}`),
    embedding_model: item.embeddingModel,
    embedding_dimensions: item.embeddingDimensions,
    embedding_values: item.embeddingValues,
    content_hash: item.contentHash,
    metadata: item.metadata || {},
  })).filter(row => row.card_id)
  await upsertRows(db, 'yux_strategy_card_embeddings', embeddingRows, 'card_id,embedding_model,content_hash')

  console.log(JSON.stringify({
    documents: documentRows.length,
    pages: pageRows.length,
    chunks: chunkRows.length,
    assets: assetRows.length,
    cards: cardRows.length,
    cardEmbeddings: embeddingRows.length,
  }, null, 2))

  await db.end()
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
