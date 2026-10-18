import { act } from 'react-dom/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { render } from '@/components/portal-ui/__tests__/render'
import { usePlatformStore } from '@/stores/platformStore'
import { PortalCompanyUsersPage } from './PortalCompanyUsersPage'

vi.mock('@/services/crmGovernanceService', () => ({
  crmGovernanceService: { getActiveInstanceForOrganization: vi.fn(), getGovernanceContext: vi.fn(), inviteMember: vi.fn() },
}))

afterEach(() => {
  vi.clearAllMocks()
  document.body.innerHTML = ''
  usePlatformStore.setState({ enabledModuleKeys: [] })
})

describe('PortalCompanyUsersPage', () => {
  it('sem CRM mostra "Gestão da equipe" como pendente (B4) e não lista ninguém', async () => {
    usePlatformStore.setState({ enabledModuleKeys: ['finance'] })
    const { container, unmount } = await render(<PortalCompanyUsersPage />)
    expect(container.querySelector('h1')?.textContent).toBe('Equipe')
    expect(container.textContent).toContain('Gestão da equipe')
    expect(container.querySelector('[aria-label^="Pendente"]')).not.toBeNull()
    expect(container.textContent).toContain('em implantação')
    expect(container.textContent).not.toContain('Pessoas e papéis')
    expect(container.querySelector('table, ul li[data-user]')).toBeNull()
    await unmount()
  })

  it('com CRM contratado mostra pessoas, equipes e vagas reais do CRM', async () => {
    const instance = {
      id: 'instance-1', organizationId: 'org-1', contractId: 'c', status: 'active', sellerSeatLimit: 2, managerSeatLimit: 1, adminSeatLimit: 1,
      maxPipelineCount: 3, maxCustomFieldCount: 20, maxAutomationCount: 5, allowClientPipelineCustomization: true,
      allowClientFieldCustomization: true, allowClientCategoryCustomization: true, defaultAssignmentMode: 'queue', createdAt: '', updatedAt: '',
    } as const
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(instance)
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue({
      instance,
      members: [{ id: 'm1', crmInstanceId: 'instance-1', userId: 'u1', role: 'seller', status: 'active', displayName: 'Vera Vendas', email: 'vera@example.com', createdAt: '', updatedAt: '' }],
      teams: [], teamMemberships: [],
    })
    usePlatformStore.setState({
      enabledModuleKeys: ['crm'], isLoading: false,
      organization: { id: 'org-1', name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
    })
    const { container, unmount } = await render(<PortalCompanyUsersPage />)
    await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve() })
    expect(container.textContent).toContain('Pessoas e papéis')
    expect(container.textContent).toContain('Vera Vendas')
    expect(container.textContent).toContain('Equipes comerciais')
    expect(container.textContent).toContain('Vagas contratadas')
    expect(container.textContent).toContain('1 / 2 em uso')
    expect(container.textContent).not.toContain('Gestão da equipe')
    await unmount()
  })
})
