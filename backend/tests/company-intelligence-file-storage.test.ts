import { describe, expect, it } from 'vitest'
import { resolveKnowledgeStoragePath, validateKnowledgeFile } from '../src/modules/company-intelligence/file-storage.js'
import { chunkKnowledgeText, extractManualKnowledge } from '../src/modules/company-intelligence/text-extraction.js'

describe('company knowledge file safety and extraction', () => {
  it('rejects paths outside the configured storage root', () => {
    expect(() => resolveKnowledgeStoragePath('../../outside.pdf')).toThrow('invalid_knowledge_storage_path')
  })

  it('accepts utf-8 text and rejects binary content declared as text', async () => {
    await expect(validateKnowledgeFile(Buffer.from('Documento seguro'), 'text/plain')).resolves.toBe('text/plain')
    await expect(validateKnowledgeFile(Buffer.from([0, 1, 2]), 'text/plain')).rejects.toThrow('invalid_knowledge_text_file')
  })

  it('normalizes and chunks manual knowledge without losing content', () => {
    const source = `# Estratégia\n\n${'Diagnóstico comercial e próximo passo. '.repeat(180)}`
    const extracted = extractManualKnowledge('Estratégia YUX', source)
    expect(extracted.chunks.length).toBeGreaterThan(1)
    expect(extracted.chunks.every(chunk => chunk.body.length <= 4_000)).toBe(true)
    expect(extracted.body).toContain('Diagnóstico comercial')
    expect(chunkKnowledgeText('Texto pequeno mas válido.', 'Teste')).toHaveLength(1)
  })
})
