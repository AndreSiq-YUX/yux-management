import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePlatformStore } from '@/stores/platformStore'

const service = vi.hoisted(() => ({
  getTeams: vi.fn(),
  getQueues: vi.fn(),
  getRules: vi.fn(),
  getTeamMembers: vi.fn(),
  createTeam: vi.fn(),
  createQueue: vi.fn(),
  updateTeam: vi.fn(),
  updateQueue: vi.fn(),
}))

vi.mock('@/services/omnichannelService', () => ({ omnichannelService: service }))

import { PortalHandoffQueuesPage } from './PortalHandoffQueuesPage'

const setAccess = (permissions: string[]) => usePlatformStore.setState({
  organization: { id: 'org-1' } as never,
  role: { key: 'client_admin', name: 'Admin da conta', scope: 'client', permissions } as never,
})

async function renderPage() {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => root.render(<MemoryRouter><PortalHandoffQueuesPage /></MemoryRouter>))
  await act(async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve()
  })
  return { container, root }
}

const buttonByText = (container: HTMLElement, text: string) =>
  Array.from(container.querySelectorAll('button')).find(button => button.textContent?.trim() === text)

beforeEach(() => {
  service.getTeams.mockResolvedValue([
    { id: 'team-1', name: 'Atendimento Sorriso', availability_mode: 'business_hours', is_active: true },
    { id: 'team-2', name: 'Vendas', availability_mode: 'always_on', is_active: false },
  ])
  service.getTeamMembers.mockImplementation(async (teamId: string) =>
    teamId === 'team-1' ? [{ id: 'm1', user_id: 'u1', users: { id: 'u1', name: 'Mariana Costa' } }] : [])
  service.getQueues.mockResolvedValue([
    { id: 'queue-1', name: 'Recepção', team_id: 'team-1', strategy: 'round_robin', sla_settings: { firstResponseMinutes: 10 }, is_active: true, omnichannel_teams: { id: 'team-1', name: 'Atendimento Sorriso' } },
    { id: 'queue-2', name: 'Comercial', team_id: null, strategy: 'least_busy', sla_settings: {}, is_active: false },
  ])
  service.getRules.mockResolvedValue([{ id: 'rule-1', name: 'Falar com pessoa', priority: 1, is_enabled: true }])
  service.updateQueue.mockResolvedValue({})
  service.updateTeam.mockResolvedValue({})
})

afterEach(() => {
  document.body.innerHTML = ''
  Object.values(service).forEach(mock => mock.mockReset())
  usePlatformStore.setState({ role: null, organization: null, mode: 'internal' })
})

describe('PortalHandoffQueuesPage', () => {
  it('lists teams, members, queues and strategies in Portuguese, read-only without permission', async () => {
    setAccess([])
    const { container, root } = await renderPage()
    const text = container.textContent || ''

    expect(container.querySelector('h1')?.textContent).toBe('Filas e transferência para atendente')
    expect(text).not.toContain('Filas e Handoff')
    expect(text).toContain('Atendimento Sorriso')
    expect(text).toContain('Mariana Costa')
    expect(text).toContain('Em horário comercial')
    expect(text).toContain('Sempre disponível')
    expect(text).toContain('Recepção')
    expect(text).toContain('Rodízio entre atendentes')
    expect(text).toContain('Quem está com menos conversas')
    expect(text).toContain('10 min para a primeira resposta')
    expect(text).toContain('Sem equipe')
    expect(text).toContain('Falar com pessoa')
    expect(text).not.toContain('round_robin')
    expect(text).not.toContain('business_hours')
    expect(text).toContain('Quem administra a conta altera a configuração')
    expect(buttonByText(container, 'Criar equipe')).toBeUndefined()
    expect(buttonByText(container, 'Desativar fila')).toBeUndefined()
    expect(container.querySelector('select')).toBeNull()

    act(() => root.unmount())
  })

  it('shows configuration controls for users who can configure and saves through the service', async () => {
    setAccess(['omnichannel.configure'])
    const { container, root } = await renderPage()

    expect(container.textContent).not.toContain('Quem administra a conta altera a configuração')
    expect(buttonByText(container, 'Criar equipe')).toBeTruthy()
    expect(buttonByText(container, 'Criar fila')).toBeTruthy()

    await act(async () => {
      buttonByText(container, 'Ativar fila')!.click()
      await Promise.resolve()
    })
    expect(service.updateQueue).toHaveBeenCalledWith('queue-2', { isActive: true })

    const strategy = container.querySelector<HTMLSelectElement>('select option[value="priority"]')!.parentElement as HTMLSelectElement
    await act(async () => {
      strategy.value = 'priority'
      strategy.dispatchEvent(new Event('change', { bubbles: true }))
      await Promise.resolve()
    })
    expect(service.updateQueue).toHaveBeenCalledWith(expect.any(String), { strategy: 'priority' })

    act(() => root.unmount())
  })

  it('shows honest empty states when there are no teams or queues', async () => {
    service.getTeams.mockResolvedValue([])
    service.getQueues.mockResolvedValue([])
    service.getRules.mockResolvedValue([])
    setAccess([])
    const { container, root } = await renderPage()
    const text = container.textContent || ''

    expect(text).toContain('Nenhuma equipe ainda')
    expect(text).toContain('Nenhuma fila ainda')
    expect(text).toContain('Nenhuma regra de transferência')

    act(() => root.unmount())
  })

  it('shows a clear error when the data cannot be loaded', async () => {
    service.getTeams.mockRejectedValue(new Error('boom'))
    setAccess([])
    const { container, root } = await renderPage()

    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar')
    expect(container.textContent).not.toContain('boom')

    act(() => root.unmount())
  })
})
