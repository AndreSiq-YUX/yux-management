import type { Buffer } from 'node:buffer'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

export type ExtractedKnowledge = {
  title: string
  body: string
  sections: LocatedSection[]
  chunks: Array<{ title?: string; body: string; tokenCount: number; sourceLocator: string }>
}

export type LocatedSection = {
  locator: string
  heading?: string
  body: string
}

export async function extractKnowledgeText(input: {
  content: Buffer
  mimeType: string
  title: string
}): Promise<ExtractedKnowledge> {
  let body = ''
  if (input.mimeType === 'text/plain' || input.mimeType === 'text/markdown') {
    body = input.content.toString('utf8')
  } else if (input.mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: input.content })
    try {
      body = (await parser.getText()).text
    } finally {
      await parser.destroy()
    }
  } else if (input.mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    body = (await mammoth.extractRawText({ buffer: input.content })).value
  } else {
    throw domainError(400, 'unsupported_knowledge_file_type')
  }

  const normalized = normalizeText(body)
  if (normalized.length < 10) throw domainError(422, 'knowledge_text_extraction_empty')
  const sections = locateTextSections(normalized)
  return { title: input.title.trim(), body: normalized, sections, chunks: chunkKnowledgeText(normalized, input.title) }
}

export function extractManualKnowledge(title: string, body: string): ExtractedKnowledge {
  const normalized = normalizeText(body)
  if (normalized.length < 10) throw domainError(422, 'knowledge_text_too_short')
  const sections = locateTextSections(normalized)
  return { title: title.trim(), body: normalized, sections, chunks: chunkKnowledgeText(normalized, title) }
}

export function locateTextSections(body: string): LocatedSection[] {
  return body.split(/\n{2,}/).map(item => item.trim()).filter(Boolean).map((paragraph, index) => ({
    locator: `paragraph:${index + 1}`,
    heading: /^#{1,6}\s+/.test(paragraph) ? paragraph.replace(/^#{1,6}\s+/, '').slice(0, 200) : undefined,
    body: paragraph,
  }))
}

export function chunkKnowledgeText(body: string, fallbackTitle: string, maxChars = 4_000, overlap = 300) {
  const paragraphs = body.split(/\n{2,}/).map(item => item.trim()).filter(Boolean)
  const chunks: Array<{ title?: string; body: string; tokenCount: number; sourceLocator: string }> = []
  let current = ''
  let currentTitle = fallbackTitle.trim()
  let startParagraph = 1
  let paragraphIndex = 0

  const push = () => {
    const value = current.trim()
    if (!value) return
    chunks.push({ title: currentTitle || fallbackTitle, body: value, tokenCount: estimateTokens(value), sourceLocator: `paragraphs:${startParagraph}-${Math.max(startParagraph, paragraphIndex)}` })
    current = value.slice(Math.max(0, value.length - overlap)).trim()
    startParagraph = Math.max(1, paragraphIndex)
  }

  for (const paragraph of paragraphs) {
    paragraphIndex += 1
    if (/^#{1,6}\s+/.test(paragraph)) currentTitle = paragraph.replace(/^#{1,6}\s+/, '').slice(0, 200)
    if (paragraph.length > maxChars) {
      if (current) push()
      let offset = 0
      while (offset < paragraph.length) {
        const slice = paragraph.slice(offset, offset + maxChars).trim()
        if (slice) chunks.push({ title: currentTitle, body: slice, tokenCount: estimateTokens(slice), sourceLocator: `paragraph:${paragraphIndex}:chars:${offset + 1}-${offset + slice.length}` })
        offset += Math.max(1, maxChars - overlap)
      }
      current = ''
      continue
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (candidate.length > maxChars) push()
    current = current ? `${current}\n\n${paragraph}` : paragraph
  }
  if (current.trim()) {
    const value = current.trim()
    chunks.push({ title: currentTitle || fallbackTitle, body: value, tokenCount: estimateTokens(value), sourceLocator: `paragraphs:${startParagraph}-${Math.max(startParagraph, paragraphIndex)}` })
  }
  return chunks.filter((chunk, index) => index === 0 || chunk.body !== chunks[index - 1].body)
}

function normalizeText(value: string) {
  return value
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 4))
}

function domainError(statusCode: number, message: string) {
  return Object.assign(new Error(message), { statusCode })
}
