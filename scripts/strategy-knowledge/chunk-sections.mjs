#!/usr/bin/env node
import {
  detectSectionKey,
  estimateTokens,
  normalizeText,
  parseArgs,
  readJsonl,
  requireArg,
  sha256,
  splitTextByMaxChars,
  stableRecordId,
  writeJsonl,
} from './_shared.mjs'

async function main() {
  const args = parseArgs()
  const input = requireArg(args, 'input')
  const out = requireArg(args, 'out')
  const maxChars = Number(args.maxChars || 2800)
  const overlapChars = Number(args.overlapChars || 200)
  const pages = await readJsonl(input)
  const chunks = []

  for (const page of pages) {
    const text = normalizeText(page.cleanText || page.ocrText || '')
    if (!text) continue
    const sectionKey = detectSectionKey(text, `page-${page.pageNumber || chunks.length + 1}`)
    const pageChunks = splitTextByMaxChars(text, maxChars, overlapChars)
    pageChunks.forEach((chunkText, chunkIndex) => {
      const chunkHash = sha256(`${page.pageHash || page.sourceHash}:${chunkIndex}:${chunkText}`)
      chunks.push({
        chunkId: stableRecordId(page.sourceHash, page.pageNumber, chunkIndex, chunkHash),
        documentId: page.documentId,
        sourceHash: page.sourceHash,
        sourceTitle: page.sourceTitle,
        pageNumber: page.pageNumber,
        pageHash: page.pageHash,
        sectionKey,
        chunkIndex,
        chunkHash,
        chunkText,
        tokenEstimate: estimateTokens(chunkText),
        sourceScope: page.sourceScope || 'internal',
        visibility: page.visibility || 'internal_only',
        allowedAgentProfileKeys: page.allowedAgentProfileKeys || [],
        stageTags: page.stageTags || [],
        retrievalTags: [...new Set([sectionKey, ...(page.retrievalTags || [])])],
        humanReviewStatus: page.humanReviewStatus || 'pending',
        metadata: {
          ...(page.metadata || {}),
          chunkingTool: 'chunk-sections.mjs',
          maxChars,
          overlapChars,
        },
      })
    })
  }

  await writeJsonl(out, chunks)
  console.log(`wrote ${chunks.length} chunks to ${out}`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
