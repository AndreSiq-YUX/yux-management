#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { extname, basename } from 'node:path'
import { promisify } from 'node:util'
import { readFile } from 'node:fs/promises'
import { normalizeText, parseArgs, requireArg, sha256, writeJsonl } from './_shared.mjs'

const execFileAsync = promisify(execFile)

async function extractPdfText(input) {
  try {
    const { stdout } = await execFileAsync('pdftotext', ['-layout', input, '-'], {
      maxBuffer: 1024 * 1024 * 200,
      windowsHide: true,
    })
    return stdout
  } catch (error) {
    throw new Error(
      `Unable to extract PDF text. Install Poppler/pdftotext or pass a .txt/.md file for this step. Original error: ${error.message}`,
    )
  }
}

async function main() {
  const args = parseArgs()
  const input = requireArg(args, 'input')
  const out = requireArg(args, 'out')
  const title = args.title || basename(input)
  const file = await readFile(input)
  const extension = extname(input).toLowerCase()
  const documentType = extension === '.pdf' ? 'pdf' : extension === '.md' ? 'markdown' : 'text'

  const rawText = documentType === 'pdf' ? await extractPdfText(input) : file.toString('utf8')
  const pages = rawText.split('\f').map(normalizeText).filter(Boolean)
  const sourceHash = sha256(file)

  const records = pages.map((text, index) => ({
    documentId: sourceHash.slice(0, 32),
    sourceTitle: title,
    sourceHash,
    documentType,
    originalFilename: basename(input),
    pageNumber: index + 1,
    pageHash: sha256(`${sourceHash}:${index + 1}:${text}`),
    ocrText: text,
    metadata: {
      extractionTool: documentType === 'pdf' ? 'pdftotext' : 'node-readFile',
      sourcePath: input,
      pageCount: pages.length,
    },
  }))

  await writeJsonl(out, records)
  console.log(`wrote ${records.length} pages to ${out}`)
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
