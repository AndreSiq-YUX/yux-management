#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { basename, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { mkdir, readdir, stat } from 'node:fs/promises'
import { parseArgs, readJsonl, requireArg, sha256, writeJsonl } from './_shared.mjs'

const execFileAsync = promisify(execFile)

async function fileHash(path) {
  const { readFile } = await import('node:fs/promises')
  return sha256(await readFile(path))
}

async function renderPdf(input, outDir, dpi) {
  await mkdir(outDir, { recursive: true })
  const prefix = join(outDir, 'page')
  await execFileAsync('pdftoppm', ['-png', '-r', String(dpi), input, prefix], {
    maxBuffer: 1024 * 1024 * 20,
    windowsHide: true,
  })
  return (await readdir(outDir))
    .filter(name => /^page-\d+\.png$/i.test(name))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0))
    .map(name => join(outDir, name))
}

async function main() {
  const args = parseArgs()
  const input = requireArg(args, 'input')
  const out = requireArg(args, 'out')
  const pagesJsonl = args.pages
  const outDir = args.outDir || '.strategy-work/page-images'
  const dpi = Number(args.dpi || 160)

  let imagePaths = []
  try {
    imagePaths = await renderPdf(input, outDir, dpi)
  } catch (error) {
    if (!pagesJsonl) {
      throw new Error(`Unable to render PDF images and no --pages fallback was provided. Original error: ${error.message}`)
    }
    console.warn(`pdftoppm unavailable; writing planned asset references only. ${error.message}`)
  }

  const pages = pagesJsonl ? await readJsonl(pagesJsonl) : []
  const pageCount = Math.max(imagePaths.length, pages.length)
  const sourceHash = pages[0]?.sourceHash || sha256(resolve(input))
  const records = []

  for (let index = 0; index < pageCount; index += 1) {
    const imagePath = imagePaths[index]
    const page = pages[index] || {}
    const storagePath = imagePath ? imagePath.replace(/\\/g, '/') : `${outDir.replace(/\\/g, '/')}/page-${index + 1}.png`
    const assetHash = imagePath ? await fileHash(imagePath) : sha256(`${sourceHash}:${index + 1}:${storagePath}`)
    const stats = imagePath ? await stat(imagePath) : null
    records.push({
      documentId: page.documentId || sourceHash.slice(0, 32),
      sourceHash,
      sourceTitle: page.sourceTitle || basename(input),
      pageNumber: page.pageNumber || index + 1,
      pageHash: page.pageHash,
      assetType: 'page_image',
      assetHash,
      storagePath,
      mimeType: 'image/png',
      sourceScope: page.sourceScope || 'internal',
      visibility: page.visibility || 'internal_only',
      allowedAgentProfileKeys: page.allowedAgentProfileKeys || [],
      stageTags: page.stageTags || [],
      retrievalTags: page.retrievalTags || ['page-image'],
      humanReviewStatus: page.humanReviewStatus || 'pending',
      metadata: {
        generated: Boolean(imagePath),
        byteSize: stats?.size || null,
        imageTool: imagePath ? 'pdftoppm' : 'planned-reference',
        dpi,
      },
    })
  }

  await writeJsonl(out, records)
  console.log(`wrote ${records.length} page image assets to ${out}`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
