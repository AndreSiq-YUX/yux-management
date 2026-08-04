import { createHash } from 'node:crypto'
import type { LocatedSection } from './text-extraction.js'

export type RemovedKnowledgeBlock = {
  locator: string
  reason: 'duplicate' | 'cookie_banner' | 'navigation' | 'empty'
  contentHash: string
}

export type CleanKnowledgeResult = {
  cleanSections: LocatedSection[]
  removed: RemovedKnowledgeBlock[]
  metrics: {
    inputSections: number
    retainedSections: number
    removedSections: number
    retainedCharacters: number
  }
}

const protectedTerms = /\b(pre[cç]o|valor|garantia|legal|pol[ií]tica|privacidade|seguran[cç]a|contato|telefone|e-?mail|faq|pergunta|produto|servi[cç]o)\b/i
const cookieTerms = /\b(aceitar todos os cookies|prefer[eê]ncias de cookies|usamos cookies|gerenciar consentimento)\b/i
const navigationTerms = /^(in[ií]cio|home|sobre|servi[cç]os|produtos|blog|contato)(\s*[|>•·/-]\s*(in[ií]cio|home|sobre|servi[cç]os|produtos|blog|contato)){2,}$/i

export function cleanKnowledgeSections(sections: LocatedSection[]): CleanKnowledgeResult {
  const seen = new Set<string>()
  const cleanSections: LocatedSection[] = []
  const removed: RemovedKnowledgeBlock[] = []

  for (const section of sections) {
    const body = normalize(section.body)
    const contentHash = createHash('sha256').update(body.toLocaleLowerCase('pt-BR')).digest('hex')
    let reason: RemovedKnowledgeBlock['reason'] | undefined
    if (!body) reason = 'empty'
    else if (!protectedTerms.test(body) && cookieTerms.test(body)) reason = 'cookie_banner'
    else if (!protectedTerms.test(body) && navigationTerms.test(body)) reason = 'navigation'
    else if (body.length >= 30 && seen.has(contentHash)) reason = 'duplicate'

    if (reason) removed.push({ locator: section.locator, reason, contentHash })
    else {
      cleanSections.push({ ...section, body })
      if (body.length >= 30) seen.add(contentHash)
    }
  }

  return {
    cleanSections,
    removed,
    metrics: {
      inputSections: sections.length,
      retainedSections: cleanSections.length,
      removedSections: removed.length,
      retainedCharacters: cleanSections.reduce((total, item) => total + item.body.length, 0),
    },
  }
}

function normalize(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}
