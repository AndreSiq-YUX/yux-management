import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalCommercialAccountsPage, filterAndSortAccounts, groupLeadsByCompany } from './PortalCommercialAccountsPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import type { CrmLead } from '@/types/crm'

vi.mock('@/hooks/usePortalCrmContext', () => ({ usePortalCrmContext: vi.fn() }))

const organizationId = '11111111-1111-4111-8111-111111111111'
const makeLead = (id: string, company: string | undefined, value: number, updatedAt: string, status = 'open'): CrmLead => ({
  id, organizationId, pipelineId: 'p', stageId: 's', name: `Lead ${id}`, email: `${id}@example.com`, company, source: 'Manual', status, score: 1, value,
  createdAt: updatedAt, updatedAt, lastActivityAt: updatedAt,
} as CrmLead)

const leads = [
  makeLead('1', 'Clínica Alpha', 1000, '2026-10-01T10:00:00.000Z'),
  makeLead('2', ' clinica alpha ', 2000, '2026-10-10T10:00:00.000Z'),
  makeLead('3', 'Beta Ltda', 9000, '2026-09-01T10:00:00.000Z'),
  makeLead('4', undefined, 500, '2026-10-05T10:00:00.000Z'),
  makeLead('5', 'Zeta SA', 300, '2026-10-12T10:00:00.000Z'),
]

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter><PortalCommercialAccountsPage /></MemoryRouter>)
    await Promise.resolve()
  })
  return { container, root }
}

describe('PortalCommercialAccountsPage', () => {
  beforeEach(() => {
    vi.mocked(usePortalCrmContext).mockReturnValue({
      organization: { id: organizationId, name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      role: null, enabledModuleKeys: ['crm'], loading: false, error: null, pipelines: [], leads, tasks: [], reload: vi.fn().mockResolvedValue(undefined),
    })
  })
  afterEach(() => { document.body.innerHTML = '' })

  it('agrupa por empresa ignorando maiúsculas e acentos, e ordena', () => {
    const accounts = groupLeadsByCompany(leads)
    expect(accounts.map(account => [account.name, account.leads, account.openValue])).toEqual([
      ['Clínica Alpha', 2, 3000], ['Beta Ltda', 1, 9000], ['Zeta SA', 1, 300],
    ])
    expect(filterAndSortAccounts(accounts, '', 'value').map(account => account.name)).toEqual(['Beta Ltda', 'Clínica Alpha', 'Zeta SA'])
    expect(filterAndSortAccounts(accounts, '', 'name').map(account => account.name)).toEqual(['Beta Ltda', 'Clínica Alpha', 'Zeta SA'])
    expect(filterAndSortAccounts(accounts, '', 'leads')[0].name).toBe('Clínica Alpha')
    expect(filterAndSortAccounts(accounts, '', 'recent')[0].name).toBe('Zeta SA')
    expect(filterAndSortAccounts(accounts, 'CLINICA', 'value').map(account => account.name)).toEqual(['Clínica Alpha'])
  })

  it('lista todas as empresas, busca por nome e leva aos leads da empresa', async () => {
    const { container, root } = await render()
    const text = () => (container.textContent || '').replace(/\u00a0/g, ' ')

    expect(container.querySelector('h1')?.textContent).toBe('Empresas e contas')
    expect(text()).not.toContain('CNPJ')
    expect(text()).not.toContain('Cadastrar empresas')
    for (const name of ['Clínica Alpha', 'Beta Ltda', 'Zeta SA']) expect(text()).toContain(name)

    const link = container.querySelector<HTMLAnchorElement>('a[aria-label="Ver leads de Beta Ltda"]')!
    expect(link.getAttribute('href')).toBe('/portal/comercial/leads?company=Beta%20Ltda')

    const search = container.querySelector<HTMLInputElement>('#account-search')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'zeta')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(text()).toContain('Zeta SA')
    expect(text()).not.toContain('Beta Ltda')

    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'inexistente')
      search.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(text()).toContain('Nenhuma empresa encontrada')
    act(() => root.unmount())
  })

  it('mostra estado vazio honesto quando nenhum lead tem empresa', async () => {
    vi.mocked(usePortalCrmContext).mockReturnValue({
      organization: { id: organizationId, name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      role: null, enabledModuleKeys: ['crm'], loading: false, error: null, pipelines: [], leads: [makeLead('9', undefined, 0, '2026-10-01T10:00:00.000Z')], tasks: [], reload: vi.fn(),
    })
    const { container, root } = await render()
    expect(container.textContent).toContain('Nenhuma empresa nos seus leads ainda')
    act(() => root.unmount())
  })
})
