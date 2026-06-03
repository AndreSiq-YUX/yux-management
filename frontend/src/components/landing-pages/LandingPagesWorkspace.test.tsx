import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { LandingPagesWorkspace } from './LandingPagesWorkspace'
import { PortalLandingPagesWorkspace } from './PortalLandingPagesWorkspace'
import { sanitizeLandingPageForPortal } from '@/lib/landing-pages/landingPageRules'
import type { LandingPage } from '@/types/landingPage'
import type { ContractDetails } from '@/types/platform'

const page: LandingPage = {
  id: 'lp-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  name: 'Botox Junho',
  slug: 'botox-junho',
  status: 'active',
  previewUrl: 'https://preview.example.com/botox',
  thumbnailUrl: 'https://example.com/thumb.jpg',
  primaryCtaType: 'form',
  primaryCtaValue: 'Agendar avaliacao',
  visits: 1000,
  leads: 83,
  pendingApprovals: 1,
  internalNotes: 'Ajustar headline interna',
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T10:00:00.000Z',
  versions: [],
  forms: [],
}

const contract: ContractDetails = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  name: 'Contrato principal',
  status: 'active',
  startsAt: '2026-06-01',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
  package: null,
  modules: [],
}

describe('LandingPagesWorkspace', () => {
  it('renders metrics, cards, and internal landing page controls', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const handlers = {
      onRefresh: vi.fn(),
      onCreatePage: vi.fn(),
      onAddVersion: vi.fn(),
      onRequestChange: vi.fn(),
      onApprove: vi.fn(),
      onStatusChange: vi.fn(),
    }

    act(() => {
      root.render(<LandingPagesWorkspace pages={[page]} {...handlers} />)
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')
    expect(html).toContain('Landing Pages')
    expect(html).toContain('Botox Junho')
    expect(html).toContain('8.3%')
    expect(html).toContain('Ajustar headline interna')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Criar landing page"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Adicionar versao"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Solicitar ajuste"]')!.click()
      container.querySelector<HTMLButtonElement>('button[title="Aprovar publicacao"]')!.click()
    })

    expect(handlers.onCreatePage).toHaveBeenCalled()
    expect(handlers.onAddVersion).toHaveBeenCalledWith('lp-1')
    expect(handlers.onRequestChange).toHaveBeenCalledWith('lp-1')
    expect(handlers.onApprove).toHaveBeenCalledWith('lp-1')

    act(() => root.unmount())
  })
})

describe('PortalLandingPagesWorkspace', () => {
  it('renders client-safe landing pages without internal notes', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(
        <PortalLandingPagesWorkspace
          contract={contract}
          pages={[sanitizeLandingPageForPortal(page)]}
          onRequestChange={vi.fn()}
          onApprove={vi.fn()}
        />,
      )
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')
    expect(html).toContain('Landing Pages do contrato')
    expect(html).toContain('Botox Junho')
    expect(html).toContain('8.3%')
    expect(html).not.toContain('Ajustar headline interna')

    act(() => root.unmount())
  })
})
