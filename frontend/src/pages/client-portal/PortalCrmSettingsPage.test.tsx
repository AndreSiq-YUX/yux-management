import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/components/portal-ui/__tests__/render'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { usePlatformStore } from '@/stores/platformStore'
import { PortalCrmSettingsPage } from './PortalCrmSettingsPage'

vi.mock('@/services/crmGovernanceService', () => ({
  crmGovernanceService: { getActiveInstanceForOrganization: vi.fn(), getGovernanceContext: vi.fn(), inviteMember: vi.fn() },
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const instance = {
  id: 'instance-1', organizationId, contractId: 'c', status: 'active', sellerSeatLimit: 3, managerSeatLimit: 1, adminSeatLimit: 1,
  maxPipelineCount: 3, maxCustomFieldCount: 20, maxAutomationCount: 5, allowClientPipelineCustomization: true,
  allowClientFieldCustomization: true, allowClientCategoryCustomization: true, defaultAssignmentMode: 'queue', createdAt: '', updatedAt: '',
} as const

describe('PortalCrmSettingsPage', () => {
  beforeEach(() => {
    usePlatformStore.setState({
      organization: { id: organizationId, name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      isLoading: false,
    })
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(instance)
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue({
      instance, members: [{ id: 'm1', crmInstanceId: 'instance-1', userId: 'u1', role: 'seller', status: 'active', displayName: 'Vera Vendas', createdAt: '', updatedAt: '' }],
      teams: [], teamMemberships: [],
    })
  })
  afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

  it('mostra vagas, pessoas e equipes reais dentro dos limites contratados', async () => {
    const { container, unmount } = await render(<PortalCrmSettingsPage />)
    await act(async () => { for (let i = 0; i < 6; i += 1) await Promise.resolve() })

    expect(container.innerHTML).toContain('Configuracoes do CRM')
    expect(container.textContent).toContain('Vagas contratadas')
    expect(container.textContent).toContain('Equipes comerciais')
    expect(container.textContent).toContain('Pessoas e papéis')
    expect(container.textContent).toContain('Vera Vendas')
    expect(container.textContent).toContain('1 / 3 em uso')
    await unmount()
  })
})
