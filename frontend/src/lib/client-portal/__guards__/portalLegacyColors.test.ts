import { describe, expect, it } from 'vitest'
import { listPortalSourceFiles, readTokens } from './portalSources'

/** Cores do estilo antigo (azul/roxo e cinzas soltos) que não podem voltar: use os tokens `yx-*`. */
const LEGACY_COLORS = ['#2563EB', '#141821', '#050816', '#f4f4f4', '#635BFF']

/** Dados fictícios removidos na Fase 1 (Tarefa 1.1): identificadores e textos fixos. */
const FAKE_IDENTIFIERS = ['demoRows', 'fallbackAssets', 'fallbackInspirations']
const FAKE_STRINGS = ['Atualizado agora']
const FAKE_NUMBERS = ['0.98']

/**
 * Exceções justificadas: `arquivo -> itens permitidos`.
 */
const ALLOWLIST: Record<string, { items: string[]; reason: string }> = {}

describe('Fase 12: sem cores antigas nem dados fictícios nos arquivos do portal', () => {
  const files = listPortalSourceFiles()

  it('não usa cores hexadecimais do estilo antigo', () => {
    const offenders: string[] = []
    for (const file of files) {
      const allowed = ALLOWLIST[file]?.items ?? []
      for (const token of readTokens(file)) {
        if (token.kind !== 'string' && token.kind !== 'jsx-text') continue
        const text = token.text.toLowerCase()
        for (const color of LEGACY_COLORS) {
          if (!allowed.includes(color) && text.includes(color.toLowerCase())) offenders.push(`${file}:${token.line} ${color}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('não traz identificadores nem textos de dados fictícios', () => {
    const offenders: string[] = []
    for (const file of files) {
      const allowed = ALLOWLIST[file]?.items ?? []
      for (const token of readTokens(file)) {
        const hit =
          (token.kind === 'identifier' && FAKE_IDENTIFIERS.includes(token.text)) ||
          ((token.kind === 'string' || token.kind === 'jsx-text') && FAKE_STRINGS.some(text => token.text.includes(text))) ||
          (token.kind === 'number' && FAKE_NUMBERS.includes(token.text))
        if (hit && !allowed.includes(token.text.trim())) offenders.push(`${file}:${token.line} ${token.text.trim().slice(0, 60)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('toda exceção da lista tem justificativa', () => {
    for (const [file, entry] of Object.entries(ALLOWLIST)) {
      expect(entry.reason.trim().length, file).toBeGreaterThan(10)
    }
  })
})
