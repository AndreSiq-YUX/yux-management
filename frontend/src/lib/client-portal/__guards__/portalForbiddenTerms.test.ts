import { describe, expect, it } from 'vitest'
import { PORTAL_FORBIDDEN_TERMS } from '../glossary'
import { listPortalSourceFiles, readTokens } from './portalSources'

/**
 * Exceções justificadas: `arquivo -> termos permitidos`.
 * Só entra aqui texto que o cliente NÃO vê (ex.: valor técnico enviado ao backend).
 */
const ALLOWLIST: Record<string, { terms: string[]; reason: string }> = {
  'components/navigation/Sidebar.tsx': {
    terms: ['YUX Hub'],
    reason: 'O menu é compartilhado com a equipe YUX: o nome "YUX Hub" só aparece no modo interno (mode === "internal"), nunca no portal do cliente.',
  },
}

interface Offender {
  file: string
  line: number
  term: string
  text: string
}

describe('Tarefa 2.5: termos proibidos nos textos do portal', () => {
  const files = listPortalSourceFiles()

  it('encontra os arquivos do portal para varrer', () => {
    expect(files.length).toBeGreaterThan(40)
    expect(files).toContain('pages/client-portal/PortalAccountSettingsPage.tsx')
    expect(files).toContain('components/navigation/Sidebar.tsx')
    expect(files.some(file => file.startsWith('components/portal-ui/'))).toBe(true)
  })

  it('não usa termos internos em textos visíveis (strings, templates e texto JSX)', () => {
    const offenders: Offender[] = []
    for (const file of files) {
      const allowed = ALLOWLIST[file]?.terms ?? []
      for (const token of readTokens(file)) {
        if (token.kind !== 'string' && token.kind !== 'jsx-text') continue
        for (const term of PORTAL_FORBIDDEN_TERMS) {
          if (allowed.includes(term)) continue
          if (token.text.includes(term)) {
            offenders.push({ file, line: token.line, term, text: token.text.trim().slice(0, 100) })
          }
        }
      }
    }
    expect(offenders.map(item => `${item.file}:${item.line} "${item.term}" -> ${item.text}`)).toEqual([])
  })

  it('toda exceção da lista tem justificativa', () => {
    for (const [file, entry] of Object.entries(ALLOWLIST)) {
      expect(entry.reason.trim().length, file).toBeGreaterThan(10)
    }
  })
})
