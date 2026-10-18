import { describe, expect, it } from 'vitest'
import { PENDING_FEATURES, listPendingFeatures } from '../pendingFeatures'
import { listAllSourceFiles, readTokens } from './portalSources'

const REGISTRY_FILE = 'lib/client-portal/pendingFeatures.ts'
const CODE_PATTERN = /^B\d{1,3}$/

/** Códigos de pendência usados em código-fonte de produção (fora do registro e dos testes): `código -> arquivos`. */
function collectUsedCodes() {
  const used = new Map<string, Set<string>>()
  for (const file of listAllSourceFiles()) {
    if (file === REGISTRY_FILE) continue
    for (const token of readTokens(file)) {
      // `code="B7"`, `code: 'B7'`, `getPendingFeature('B6')`, `pendingCode="B3"`...
      if (token.kind === 'string' && CODE_PATTERN.test(token.text)) {
        const files = used.get(token.text) ?? new Set<string>()
        files.add(file)
        used.set(token.text, files)
      }
    }
  }
  return used
}

describe('Tarefa 2.6: uso do registro de pendências (B1…B26)', () => {
  const used = collectUsedCodes()

  it('todo código do registro aparece em ao menos uma tela', () => {
    const unused = Object.keys(PENDING_FEATURES).filter(code => !used.has(code))
    expect(unused, `Pendências sem selo em nenhuma tela: ${unused.join(', ')}`).toEqual([])
  })

  it('todo código usado nas telas existe no registro', () => {
    const unknown = [...used.keys()].filter(code => !(code in PENDING_FEATURES))
    expect(unknown, `Códigos usados sem registro: ${unknown.join(', ')}`).toEqual([])
  })

  it('imprime o checklist de pendências antes da liberação total', () => {
    const lines = listPendingFeatures().map(feature => {
      const files = [...(used.get(feature.code) ?? [])].sort().join(', ')
      return `[ ] ${feature.code} - ${feature.title} | telas: ${feature.screens.join(', ')} | usado em: ${files}`
    })
    console.info(`Checklist de pendências do portal (${lines.length}):\n${lines.join('\n')}`)
    expect(lines).toHaveLength(Object.keys(PENDING_FEATURES).length)
  })
})
