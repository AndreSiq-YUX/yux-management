import { describe, expect, it } from 'vitest'
import { cleanKnowledgeSections } from '../src/modules/company-intelligence/knowledge-cleanup.js'
import { chunkKnowledgeText, locateTextSections } from '../src/modules/company-intelligence/text-extraction.js'

describe('knowledge cleanup and provenance', () => {
  it('removes repeated boilerplate but preserves operational and compliance content', () => {
    const repeated = 'A YUX ajuda empresas a estruturar crescimento com processos comerciais previsíveis.'
    const result = cleanKnowledgeSections([
      { locator: 'page:1', body: repeated },
      { locator: 'page:2', body: repeated },
      { locator: 'page:3', body: 'Usamos cookies. Gerenciar consentimento e aceitar todos os cookies.' },
      { locator: 'page:4', body: 'Política de garantia: nenhum resultado comercial é garantido.' },
      { locator: 'page:5', body: 'Contato: comercial@yux.com.br' },
    ])

    expect(result.cleanSections.map(item => item.locator)).toEqual(['page:1', 'page:4', 'page:5'])
    expect(result.removed).toEqual(expect.arrayContaining([
      expect.objectContaining({ locator: 'page:2', reason: 'duplicate' }),
      expect.objectContaining({ locator: 'page:3', reason: 'cookie_banner' }),
    ]))
  })

  it('assigns stable paragraph locators to sections and chunks', () => {
    const body = '# Empresa\n\nPrimeiro parágrafo útil.\n\nSegundo parágrafo útil.'
    expect(locateTextSections(body).map(item => item.locator)).toEqual(['paragraph:1', 'paragraph:2', 'paragraph:3'])
    expect(chunkKnowledgeText(body, 'Empresa')[0].sourceLocator).toMatch(/^paragraphs:/)
  })
})
