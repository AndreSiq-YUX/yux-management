import { act } from 'react'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/components/portal-ui/__tests__/render'
import { usePlatformStore } from '@/stores/platformStore'

const service = vi.hoisted(() => ({
  getProfile: vi.fn(),
  listRepresentedBusinesses:vi.fn().mockResolvedValue([]),
  getBrand: vi.fn(),
  updateProfile: vi.fn(),
  updateBrand: vi.fn(),
}))
vi.mock('@/services/companyIntelligenceService', () => ({ companyIntelligenceService: service }))
vi.mock('@/hooks/usePortalMarketingContext', () => ({
  usePortalMarketingContext: () => ({
    loading: false,
    error: null,
    activeContract: { id: 'contract-1', value: 9999, package: { name: 'Pacote' } },
    organization: { id: 'org-1', name: 'Empresa A' },
    brandProfile: { visualIdentity: { logoUrl: 'https://example.com/logo.svg', colors: [], typography: [], designStyle: '', imageryStyle: '', graphicElements: [] } },
    productsServices: [{ id: 'p1', name: 'Consultoria', description: 'Descrição', status: 'active' }],
    knowledgeDocuments: [],
    settings: null,
  }),
}))

import { PortalBrandVoicePage } from './PortalBrandVoicePage'
import { PortalCompanyProfilePage } from './PortalCompanyProfilePage'

beforeEach(()=>{usePlatformStore.setState({role:{key:'client_admin'} as never,workspaceContext:{canConfigure:true} as never})})
afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

describe('Páginas Perfil da empresa e Marca e tom de voz', () => {
  it('Perfil: sem valor do contrato, com medidor, "Preencher com o site" aberto (perfil vazio) e logo da marca', async () => {
    usePlatformStore.setState({ organization: { id: 'org-1', name: 'Empresa A' } as never })
    service.getProfile.mockResolvedValue({
      organizationId: 'org-1', legalName: '', tradeName: '', description: '', industry: '', positioning: '',
      differentiators: [], emails: [], phones: [], address: {}, businessHours: {}, serviceRegions: [], socialLinks: {},
    })
    const { container, unmount } = await render(<PortalCompanyProfilePage />)
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('h1')?.textContent).toBe('Perfil da empresa')
    expect(container.textContent).toContain('Perfil 0% completo')
    expect(container.textContent).not.toContain('Valor contratado')
    expect(container.textContent).not.toContain('Contexto carregado')
    expect(container.querySelector('#website-onboarding-max-pages')).not.toBeNull()
    expect(container.querySelector('img[alt="Logo da empresa"]')).not.toBeNull()
    await unmount()
  })

  it('Perfil: com perfil preenchido, "Preencher com o site" começa recolhido', async () => {
    usePlatformStore.setState({ organization: { id: 'org-1', name: 'Empresa A' } as never })
    service.getProfile.mockResolvedValue({
      organizationId: 'org-1', legalName: 'A Ltda', tradeName: 'A', description: 'Descrição', industry: 'Serviços', positioning: 'Posição',
      differentiators: ['x'], emails: ['a@a.com'], phones: ['1'], address: { street: 'R', city: 'C', state: 'SP' },
      businessHours: {}, serviceRegions: ['SP'], socialLinks: { instagram: '@a' }, websiteUrl: 'https://a.com',
    })
    const { container, unmount } = await render(<PortalCompanyProfilePage />)
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('#website-onboarding-max-pages')).toBeNull()
    expect(container.querySelector('button[aria-expanded="false"]')).not.toBeNull()
    await unmount()
  })

  it('Marca: título igual ao menu, sem "Guardrails" nem "Diretrizes carregadas"', async () => {
    usePlatformStore.setState({ organization: { id: 'org-1', name: 'Empresa A' } as never, activeContract: { id: 'contract-1' } as never })
    service.getBrand.mockResolvedValue(null)
    const { container, unmount } = await render(<PortalBrandVoicePage />)
    await act(async () => { await Promise.resolve() })
    expect(container.querySelector('h1')?.textContent).toBe('Marca e tom de voz')
    expect(container.querySelector('[aria-label="Cartão da marca"]')).not.toBeNull()
    expect(container.textContent).toContain('O que usar e o que evitar')
    expect(container.textContent).not.toContain('Guardrails')
    expect(container.textContent).not.toContain('Diretrizes carregadas')
    await unmount()
  })
})
