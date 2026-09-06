import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlatformStore } from '@/stores/platformStore'

vi.mock('@/hooks/usePortalMarketingContext', () => ({ usePortalMarketingContext: () => ({
  loading: false, error: null, brandProfile: null, knowledgeDocuments: [], knowledgeMatches: [], productsServices: [], settings: null,
}) }))
vi.mock('@/services/companyIntelligenceService', () => ({ companyIntelligenceService: { listKnowledge: vi.fn(async () => []) } }))
vi.mock('@/components/company-intelligence/KnowledgeLibrary', () => ({ KnowledgeLibrary: () => <div>biblioteca</div> }))
vi.mock('@/components/company-intelligence/KnowledgeCreateDialog', () => ({ KnowledgeCreateDialog: () => null }))
vi.mock('@/components/growth-workspace/KnowledgeReadinessPanel', () => ({ KnowledgeReadinessPanel: () => <div>prontidão</div> }))
vi.mock('@/components/client-portal/PortalJourneyPage', () => ({ PortalJourneyPage: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }))

import { PortalKnowledgeBasePage } from './PortalKnowledgeBasePage'

afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

describe('PortalKnowledgeBasePage', () => {
  it('orienta o próximo passo e preserva o retorno à conversa da missão em viewport estreito', async () => {
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
    expect(document.body.textContent).toContain('Enviar → Processar → Revisar → Publicar → Ver uso')
    expect(document.body.textContent).toContain('Acervo da empresa')
    expect(document.body.textContent).toContain('Metodologia estratégica')
    expect(document.body.querySelector<HTMLAnchorElement>('a[href*="missoes/conversas"]')?.getAttribute('href')).toContain(conversationId)
    expect(document.body.querySelector('[aria-label="Percurso do conhecimento"]')?.className).toContain('border')
    act(() => root.unmount())
  })
})
