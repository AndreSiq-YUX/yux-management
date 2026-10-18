import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlatformStore } from '@/stores/platformStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/hooks/usePortalMarketingContext', () => ({ usePortalMarketingContext: () => ({
  loading: false, error: null, brandProfile: null, knowledgeDocuments: [], knowledgeMatches: [], productsServices: [], settings: null,
}) }))
vi.mock('@/services/companyIntelligenceService', () => ({ companyIntelligenceService: { listKnowledge: vi.fn(async () => []) } }))
vi.mock('@/components/company-intelligence/KnowledgeLibrary', () => ({ KnowledgeLibrary: () => <div>biblioteca</div> }))
vi.mock('@/components/company-intelligence/KnowledgeCreateDialog', () => ({ KnowledgeCreateDialog: () => null }))

import { PortalKnowledgeBasePage } from './PortalKnowledgeBasePage'

afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

describe('PortalKnowledgeBasePage', () => {
  it('mostra a biblioteca antes de tudo, barra de progresso compacta e preserva o retorno à conversa da missão', async () => {
    usePlatformStore.setState({
      organization: { id: '00000000-0000-4000-8000-000000000001', name: 'Empresa' } as never,
      activeContract: { id: '00000000-0000-4000-8000-000000000002' } as never,
    })
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 })
    const conversationId = '00000000-0000-4000-8000-000000000003'
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => {
      root.render(<MemoryRouter initialEntries={[`/portal/empresa/conhecimento?returnToKind=conversation&returnToId=${conversationId}`]}><PortalKnowledgeBasePage /></MemoryRouter>)
      await Promise.resolve()
    })
    const text = document.body.textContent!
    expect(document.querySelector('h1')?.textContent).toBe('Base de conhecimento')
    expect(document.body.querySelector<HTMLAnchorElement>('a[href*="missoes/conversas"]')?.getAttribute('href')).toContain(conversationId)
    expect(text).toContain('Retornar à missão')

    const progress = document.body.querySelector('section[aria-label="Progresso do conhecimento"]')!
    expect(progress.querySelector('[role="progressbar"]')).not.toBeNull()
    expect(progress.textContent).toContain('Próximo passo: Enviar')
    expect(text).toContain('Biblioteca da empresa')
    expect(text).not.toContain('Prontidao da base')

    // Cartão de metodologia e indicador "Busca IA" foram removidos.
    expect(text).not.toContain('Metodologia estratégica')
    expect(text).not.toContain('Doutrina')
    expect(text).not.toContain('Busca IA')
    expect(text).not.toContain('Enviar → Processar')
    act(() => root.unmount())
  })
})
