import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmMembersPanel } from './CrmMembersPanel'
import { CrmSeatUsagePanel } from './CrmSeatUsagePanel'
import { CrmTeamsPanel } from './CrmTeamsPanel'
import { summarizeSeatUsage } from './governanceDisplay'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmGovernanceContext, CrmInstance } from '@/types/crm'

vi.mock('@/services/crmGovernanceService', () => ({
  crmGovernanceService: {
    getActiveInstanceForOrganization: vi.fn(),
    getGovernanceContext: vi.fn(),
    inviteMember: vi.fn(),
  },
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const instance: CrmInstance = {
  id: 'instance-1', organizationId, contractId: 'c', status: 'active', sellerSeatLimit: 2, managerSeatLimit: 1, adminSeatLimit: 1,
  maxPipelineCount: 3, maxCustomFieldCount: 20, maxAutomationCount: 5, allowClientPipelineCustomization: true,
  allowClientFieldCustomization: true, allowClientCategoryCustomization: true, defaultAssignmentMode: 'queue', createdAt: '', updatedAt: '',
}
const member = (id: string, role: 'seller' | 'manager' | 'client_admin', status: 'active' | 'invited' | 'disabled', displayName: string) => ({
  id, crmInstanceId: 'instance-1', userId: `user-${id}`, role, status, displayName, email: `${id}@example.com`, createdAt: '', updatedAt: '',
})
const context: CrmGovernanceContext = {
  instance,
  currentMember: member('adm', 'client_admin', 'active', 'Dora Admin'),
  members: [
    member('adm', 'client_admin', 'active', 'Dora Admin'),
    member('sel1', 'seller', 'active', 'Vera Vendas'),
    member('sel2', 'seller', 'disabled', 'Caio Antigo'),
    member('man', 'manager', 'invited', 'Gabi Gerente'),
  ],
  teams: [{ id: 'team-1', crmInstanceId: 'instance-1', name: 'Time Sul', description: 'Região Sul', assignmentMode: 'round_robin', isActive: true, createdAt: '', updatedAt: '' }],
  teamMemberships: [
    { id: 'tm1', teamId: 'team-1', memberId: 'man', role: 'manager', createdAt: '' },
    { id: 'tm2', teamId: 'team-1', memberId: 'sel1', role: 'seller', createdAt: '' },
  ],
}

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<><CrmMembersPanel /><CrmTeamsPanel /><CrmSeatUsagePanel /></>)
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  })
  return { container, root }
}

describe('painéis de governança do CRM', () => {
  beforeEach(() => {
    usePlatformStore.setState({
      organization: { id: organizationId, name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      isLoading: false,
    })
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(instance)
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue(context)
  })
  afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

  it('conta vagas como canAddCrmMember: desativados não ocupam vaga', () => {
    expect(summarizeSeatUsage(instance, context.members!).map(row => [row.label, row.used, row.limit, row.free])).toEqual([
      ['Vendedores', 1, 2, 1], ['Gerentes', 1, 1, 0], ['Administradores', 1, 1, 0],
    ])
  })

  it('mostra pessoas, equipes e vagas reais com uma única consulta', async () => {
    const { container, root } = await render()
    const text = (container.textContent || '').replace(/\u00a0/g, ' ')

    expect(crmGovernanceService.getGovernanceContext).toHaveBeenCalledTimes(1)
    expect(crmGovernanceService.getActiveInstanceForOrganization).toHaveBeenCalledWith(organizationId)

    // Pessoas: nome, e-mail, papel em português e situação.
    for (const expected of ['Dora Admin', '(você)', 'Vera Vendas', 'sel1@example.com', 'Administrador', 'Vendedor', 'Gerente', 'Convite pendente', 'Desativado', 'Ativo']) {
      expect(text, expected).toContain(expected)
    }
    // Equipes.
    for (const expected of ['Time Sul', 'Região Sul', 'Rodízio entre vendedores', 'Gabi Gerente']) expect(text, expected).toContain(expected)
    // Vagas reais, sem "0 / 0" fixo.
    expect(text).toContain('1 / 2 em uso')
    expect(text).toContain('1 / 1 em uso')
    expect(text).not.toContain('0 / 0')
    expect(text).toContain('Vagas livres: 1 vendedor, 0 gerentes, 0 administradores.')
    act(() => root.unmount())
  })

  it('mantém "Convidar pessoa" visível e pendente, sem simular o convite', async () => {
    const { container, root } = await render()
    const invite = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Convidar pessoa'))!
    expect(invite.textContent).toContain('Pendente')
    await act(async () => { invite.click() })
    expect(container.textContent).toContain('em implantação')
    expect(crmGovernanceService.inviteMember).not.toHaveBeenCalled()
    act(() => root.unmount())
  })

  it('avisa quando todas as vagas estão ocupadas', async () => {
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue({
      ...context,
      instance: { ...instance, sellerSeatLimit: 1 },
      members: context.members,
    })
    const { container, root } = await render()
    expect(container.textContent).toContain('Todas as vagas contratadas estão em uso')
    expect(container.textContent).toContain('Completo')
    act(() => root.unmount())
  })

  it('mostra estado vazio quando o CRM ainda não foi publicado', async () => {
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(null)
    const { container, root } = await render()
    expect(container.textContent).toContain('O CRM ainda não foi publicado')
    expect(container.textContent).not.toContain('0 / 0')
    act(() => root.unmount())
  })

  it('mostra erro com nova tentativa quando a consulta falha', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockRejectedValueOnce(new Error('falha'))
    const { container, root } = await render()
    expect(container.textContent).toContain('Não foi possível carregar as pessoas')
    const retry = [...container.querySelectorAll('button')].find(button => button.textContent === 'Tentar novamente')!
    await act(async () => { retry.click(); for (let i = 0; i < 6; i += 1) await Promise.resolve() })
    expect(container.textContent).toContain('Vera Vendas')
    act(() => root.unmount())
  })
})
