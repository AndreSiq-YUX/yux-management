import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LandingPagesWorkspace } from './LandingPagesWorkspace'
import { PortalLandingPagesWorkspace } from './PortalLandingPagesWorkspace'
import { byText, click, render } from '@/components/portal-ui/__tests__/render'
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
  afterEach(() => {
    document.body.innerHTML = ''
  })

  const formFixture = {
    id: 'form-1',
    landingPageId: page.id,
    name: 'Formulário do site',
    submitLabel: 'Enviar',
    successMessage: 'Recebemos seus dados.',
    isActive: true,
    allowedOrigins: ['https://cliente.example.com'],
    hasPublicToken: true,
    submissionCount: 12,
    lastSubmissionAt: '2026-07-30T12:00:00.000Z',
    publicEndpoint: 'https://app.example.com/api/public/lead-forms/token/submissions',
    mappings: [],
    recentSubmissions: [],
    createdAt: '2026-07-30T10:00:00.000Z',
    updatedAt: '2026-07-30T12:00:00.000Z',
  }

  const renderPortal = async (pages: LandingPage[], props: Partial<React.ComponentProps<typeof PortalLandingPagesWorkspace>> = {}) => {
    const handlers = {
      onRequestChange: vi.fn().mockResolvedValue(undefined),
      onApprove: vi.fn().mockResolvedValue(undefined),
      onCreateLeadForm: vi.fn().mockResolvedValue(undefined),
      onToggleLeadForm: vi.fn().mockResolvedValue(undefined),
    }
    const view = await render(
      <PortalLandingPagesWorkspace
        contract={contract}
        pages={pages.map(sanitizeLandingPageForPortal)}
        {...handlers}
        {...props}
      />,
    )
    return { handlers, ...view }
  }

  const typeInto = async (field: HTMLTextAreaElement, value: string) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setter.call(field, value)
      field.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('renders client-safe landing pages with labelled metrics and no internal notes', async () => {
    const { container, handlers, unmount } = await renderPortal([page])

    expect(container.querySelector('h1')?.textContent).toBe('Landing pages')
    const text = container.textContent || ''
    expect(text).toContain('Botox Junho')
    expect(text).toContain('8,3%')
    expect(text).toContain('Visitas')
    expect(text).toContain('Conversão')
    expect(text).toContain('Ativo')
    expect(text).not.toContain('Ajustar headline interna')
    expect(text).not.toContain('Landing Pages do contrato')

    // Sem form: a captura de leads fica recolhida e só oferece ativar.
    const details = container.querySelector('details')!
    expect(details.hasAttribute('open')).toBe(false)
    expect(details.textContent).toContain('Captura de leads')
    await click(byText(details, 'button', 'Ativar captura de leads'))
    expect(handlers.onCreateLeadForm).toHaveBeenCalledWith('lp-1')

    await unmount()
  })

  it('shows an honest empty state when there are no pages', async () => {
    const { container, unmount } = await renderPortal([])
    expect(container.querySelector('h1')?.textContent).toBe('Landing pages')
    expect(container.textContent).toContain('Nenhuma landing page ainda')
    expect(container.textContent).toContain('Quando a YUX publicar uma página')
    await unmount()
  })

  it('offers "Aprovar" only when the page is awaiting approval and asks for confirmation', async () => {
    const { container, handlers, unmount } = await renderPortal([
      page,
      { ...page, id: 'lp-2', name: 'Página em análise', status: 'pending_approval' },
    ])

    const approveButtons = Array.from(container.querySelectorAll<HTMLButtonElement>('button[title="Aprovar publicação"]'))
    expect(approveButtons).toHaveLength(1)
    expect(container.textContent).toContain('Aguardando aprovação')

    await click(approveButtons[0])
    expect(handlers.onApprove).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Aprovar publicação')
    await click(byText(document.body, 'button', 'Aprovar publicação'))
    expect(handlers.onApprove).toHaveBeenCalledWith('lp-2')

    await unmount()
  })

  it('requires a message of at least 10 characters before sending the change request', async () => {
    const { handlers, unmount } = await renderPortal([page])

    await click(document.body.querySelector('button[title="Solicitar ajuste"]'))
    const send = byText(document.body, 'button', 'Enviar solicitação') as HTMLButtonElement
    const field = document.body.querySelector<HTMLTextAreaElement>('textarea')!
    expect(send.disabled).toBe(true)

    await typeInto(field, 'curto')
    expect(send.disabled).toBe(true)
    expect(document.body.textContent).toContain('Escreva pelo menos 10 caracteres')

    await typeInto(field, 'Trocar o título principal')
    expect(send.disabled).toBe(false)
    await click(send)
    expect(handlers.onRequestChange).toHaveBeenCalledWith('lp-1', 'Trocar o título principal')

    await unmount()
  })

  it('moves the technical lead capture into a collapsed section that links to external forms', async () => {
    const withForm: LandingPage = { ...page, forms: [formFixture] }
    const { container, handlers, unmount } = await renderPortal([withForm])

    const details = container.querySelector('details')!
    expect(details.hasAttribute('open')).toBe(false)
    const text = details.textContent || ''
    expect(text).toContain('Leads recebidos')
    expect(text).toContain('12')
    for (const technical of ['Endpoint', 'endpoint', 'token', 'Token', 'Origens permitidas', 'Mapeamento']) {
      expect(container.textContent).not.toContain(technical)
    }
    const link = Array.from(details.querySelectorAll<HTMLAnchorElement>('a')).find(anchor => anchor.textContent?.includes('instruções de instalação'))!
    expect(link.getAttribute('href')).toBe('/portal/marketing/formularios')

    await click(byText(details, 'button', 'Pausar captura'))
    expect(handlers.onToggleLeadForm).toHaveBeenCalledWith('form-1', false)

    await unmount()
  })
})
