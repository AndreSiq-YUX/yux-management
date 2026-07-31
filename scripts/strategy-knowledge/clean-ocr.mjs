#!/usr/bin/env node
import { normalizeText, parseArgs, readJsonl, requireArg, sha256, writeJsonl } from './_shared.mjs'

function repeatedLines(records) {
  const counts = new Map()
  for (const record of records) {
    const seen = new Set()
    for (const line of normalizeText(record.ocrText || record.cleanText || '').split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.length > 120) continue
      seen.add(trimmed)
    }
    for (const line of seen) counts.set(line, (counts.get(line) || 0) + 1)
  }
  const threshold = Math.max(3, Math.ceil(records.length * 0.6))
  return new Set([...counts.entries()].filter(([, count]) => count >= threshold).map(([line]) => line))
}

function cleanPageText(text, noisyLines) {
  return normalizeText(text)
    .split('\n')
    .filter(line => !noisyLines.has(line.trim()))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function main() {
  const args = parseArgs()
  const input = requireArg(args, 'input')
  const out = requireArg(args, 'out')
  const records = await readJsonl(input)
  const noisyLines = repeatedLines(records)

  const cleaned = records.map(record => {
    const cleanText = cleanPageText(record.ocrText || record.cleanText || '', noisyLines)
    return {
      ...record,
      cleanText,
      cleanTextHash: sha256(cleanText),
      metadata: {
        ...(record.metadata || {}),
        removedRepeatedLines: noisyLines.size,
        cleaningTool: 'clean-ocr.mjs',
      },
    }
  })

  await writeJsonl(out, cleaned)
  console.log(`wrote ${cleaned.length} cleaned pages to ${out}`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
