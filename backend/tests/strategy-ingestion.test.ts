import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const filesystemFailure = vi.hoisted(() => ({ root: '' }))

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...actual,
    mkdir: async (target: Parameters<typeof actual.mkdir>[0], options?: Parameters<typeof actual.mkdir>[1]) => {
      if (filesystemFailure.root && String(target).includes('unwritable-yux-volume')) {
        throw new Error('EACCES: strategy storage is not writable')
      }
      return actual.mkdir(target, options)
    },
  }
})

import {
  effectiveStrategyIngestionLimit,
  hasMeaningfulPdfText,
  STRATEGY_INGESTION_HARD_LIMIT_BYTES,
  uploadStrategyIngestion,
} from '../src/modules/strategy-engine/ingestion.js'
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

  it('marca a ingestão como falha recuperável quando o volume não permite criar a quarentena', async () => {
    filesystemFailure.root = '/unwritable-yux-volume'
    const queries: Array<{ sql: string; params?: unknown[] }> = []
    const pool = {
      query: vi.fn(async (sql: string, params?: unknown[]) => {
        queries.push({ sql, params })
        if (sql.includes("SET status='uploading'")) {
          return {
            rows: [{
              id: 'ingestion-1',
              organization_id: 'organization-1',
              byte_size: 3,
              mime_type: 'text/plain',
              status: 'uploading',
            }],
          }
        }
        return { rows: [] }
      }),
    }

    await expect(uploadStrategyIngestion(pool as never, {
      ingestionId: 'ingestion-1',
      payload: Readable.from(Buffer.from('abc')),
      storageRoot: filesystemFailure.root,
      maxBytes: 3,
    })).rejects.toThrow('strategy storage is not writable')

    const failureUpdate = queries.find(({ sql }) => sql.includes("SET status='failed'"))
    expect(failureUpdate?.params).toEqual([
      'ingestion-1',
      'EACCES: strategy storage is not writable',
    ])
    filesystemFailure.root = ''
  })
})
