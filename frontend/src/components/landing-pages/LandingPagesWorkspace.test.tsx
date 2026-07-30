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
    const onCreateLeadForm = vi.fn().mockResolvedValue(undefined)

    act(() => {
      root.render(
        <PortalLandingPagesWorkspace
          contract={contract}
          pages={[sanitizeLandingPageForPortal(page)]}
          onRequestChange={vi.fn()}
          onApprove={vi.fn()}
          onCreateLeadForm={onCreateLeadForm}
        />,
      )
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')
    expect(html).toContain('Landing Pages do contrato')
    expect(html).toContain('Botox Junho')
    expect(html).toContain('8.3%')
    expect(html).toContain('Ativar captura de leads')
    expect(html).not.toContain('Ajustar headline interna')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[type="button"]')!.click()
    })
    expect(onCreateLeadForm).toHaveBeenCalledWith('lp-1')

    act(() => root.unmount())
  })

  it('shows a configured public form and exposes its management controls', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onRotateLeadFormToken = vi.fn().mockResolvedValue(undefined)
    const onToggleLeadForm = vi.fn().mockResolvedValue(undefined)
    const onUpdateLeadFormFields = vi.fn().mockResolvedValue(undefined)
    const portalPage = sanitizeLandingPageForPortal({
      ...page,
      forms: [{
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
        mappings: [
          { id: 'map-1', formId: 'form-1', fieldName: 'name', crmFieldKey: 'name', required: true, createdAt: '2026-07-30T10:00:00.000Z', updatedAt: '2026-07-30T10:00:00.000Z' },
          { id: 'map-2', formId: 'form-1', fieldName: 'email', crmFieldKey: 'email', required: true, createdAt: '2026-07-30T10:00:00.000Z', updatedAt: '2026-07-30T10:00:00.000Z' },
        ],
        recentSubmissions: [{
          id: 'submission-1',
          leadId: 'lead-1',
          name: 'Maria Silva',
          email: 'maria@example.com',
          status: 'processed',
          source: 'google',
          language: 'pt-BR',
          profile: 'decisor',
          country: 'BR',
          utmCampaign: 'campanha-julho',
          consentCode: 'lead_capture',
          consentVersion: '2.1',
          privacyPolicyVersion: '2026-07',
          fitScore: 82,
          intentScore: 67,
          crmContactId: 'crm-maria-1',
          createdAt: '2026-07-30T12:00:00.000Z',
        }],
        createdAt: '2026-07-30T10:00:00.000Z',
        updatedAt: '2026-07-30T12:00:00.000Z',
      }],
    })

    act(() => {
      root.render(
        <PortalLandingPagesWorkspace
          contract={contract}
          pages={[portalPage]}
          onRequestChange={vi.fn()}
          onApprove={vi.fn()}
          onRotateLeadFormToken={onRotateLeadFormToken}
          onToggleLeadForm={onToggleLeadForm}
          onUpdateLeadFormFields={onUpdateLeadFormFields}
        />,
      )
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')
    expect(html).toContain('Captura de leads por formulário')
    expect(html).toContain('Submissões')
    expect(html).toContain('12')
    expect(html).toContain('Maria Silva')
    expect(html).toContain('maria@example.com')
    expect(html).toContain('Campos configurados para este cliente')
    expect(html).toContain('Perfil: decisor')
    expect(html).toContain('Fit: 82')
    expect(html).toContain('Intenção: 67')
    expect(html).toContain('Consentimento: lead_capture v2.1')
    expect(html).toContain('CRM: crm-maria-1')
    expect(html).toContain('Configurar campos')
    expect(html).toContain('Gerar novo endpoint')
    expect(html).toContain('Pausar captura')

    const rotateButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes('Gerar novo endpoint'))
    const toggleButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes('Pausar captura'))
    act(() => {
      rotateButton!.click()
      toggleButton!.click()
    })
    expect(onRotateLeadFormToken).toHaveBeenCalledWith('form-1')
    expect(onToggleLeadForm).toHaveBeenCalledWith('form-1', false)

    const configureButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes('Configurar campos'))
    await act(async () => {
      configureButton!.click()
    })
    expect(container.innerHTML).toContain('Mapeamento personalizado')

    const saveButton = Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button => button.textContent?.includes('Salvar campos'))
    await act(async () => {
      saveButton!.click()
    })
    expect(onUpdateLeadFormFields).toHaveBeenCalledWith('form-1', [
      { fieldName: 'name', crmFieldKey: 'name', required: true },
      { fieldName: 'email', crmFieldKey: 'email', required: true },
    ])

    act(() => root.unmount())
  })
})
