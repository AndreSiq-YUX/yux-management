import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { SRC_ROOT } from './portalSources'

const read = (file: string) => readFileSync(path.join(SRC_ROOT, file), 'utf8')

describe('Fase 12: impressão dos relatórios usa ganchos estáveis', () => {
  it('menu lateral, gaveta do celular e cabeçalho somem na impressão por classe', () => {
    const sidebar = read('components/navigation/Sidebar.tsx')
    expect(sidebar).toMatch(/<aside[^>]*print:hidden/)
    expect(sidebar).toMatch(/DialogPrimitive\.Overlay[^>]*print:hidden/)
    expect(sidebar).toMatch(/id=\{MOBILE_NAV_ID\}[\s\S]*?print:hidden/)
    expect(read('components/navigation/Header.tsx')).toMatch(/<header[^>]*print:hidden/)
  })

  it('o layout zera recuo e margens ao imprimir', () => {
    const layout = read('components/layouts/DashboardLayout.tsx')
    expect(layout).toContain('print:pl-0')
    expect(layout).toContain('print:py-0')
  })

  it('o CSS de impressão do relatório não depende de seletores genéricos do layout', () => {
    const reports = read('components/reports/PortalReportsWorkspace.tsx')
    const css = /const PRINT_CSS = `([\s\S]*?)`/.exec(reports)?.[1] ?? ''
    expect(css).not.toMatch(/\baside\b|\bnav\b|\bmain\b|header|lg:pl-64/)
    expect(reports).toMatch(/print:hidden/)
  })
})
