import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import { effectiveStrategyIngestionLimit, hasMeaningfulPdfText, STRATEGY_INGESTION_HARD_LIMIT_BYTES } from '../src/modules/strategy-engine/ingestion.js'
import { extractKnowledgeText } from '../src/modules/company-intelligence/text-extraction.js'

describe('strategy ingestion boundaries', () => {
  it('não trata o marcador de página do parser como texto extraído', () => {
    expect(hasMeaningfulPdfText('\n\n-- 1 of 1 --\n\n')).toBe(false)
    expect(hasMeaningfulPdfText('Conteúdo estratégico válido\n\n-- 1 of 1 --')).toBe(true)
  })

  it('limita a configuração efetiva ao teto de 50 MiB', () => {
    expect(effectiveStrategyIngestionLimit()).toBe(STRATEGY_INGESTION_HARD_LIMIT_BYTES)
    expect(effectiveStrategyIngestionLimit(10)).toBe(10 * 1024 * 1024)
    expect(effectiveStrategyIngestionLimit(200)).toBe(STRATEGY_INGESTION_HARD_LIMIT_BYTES)
  })

  it('preserva os números reais das páginas do PDF', async () => {
    const pdf = await PDFDocument.create()
    const font = await pdf.embedFont(StandardFonts.Helvetica)
    pdf.addPage().drawText('Conteudo verificavel da primeira pagina', { font })
    pdf.addPage().drawText('Conteudo verificavel da segunda pagina', { font })
    const extracted = await extractKnowledgeText({ content: Buffer.from(await pdf.save()), mimeType: 'application/pdf', title: 'Guia' })
    expect(extracted.sections.map(section => section.locator)).toEqual(['page:1', 'page:2'])
    expect(extracted.chunks.map(chunk => chunk.sourceLocator)).toEqual(['page:1:chunk:1', 'page:2:chunk:1'])
  })
})
