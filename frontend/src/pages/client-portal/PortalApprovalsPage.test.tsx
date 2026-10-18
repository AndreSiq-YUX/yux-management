import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createRoot, Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalApprovalsPage } from './PortalApprovalsPage'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const summary = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  reload: vi.fn(),
}))

vi.mock('@/hooks/usePortalActionSummary', () => ({
  usePortalActionSummary: () => summary.current,
}))

vi.mock('@/hooks/usePortalWorkspacePath', () => ({
  usePortalWorkspacePath: () => (href = '/portal') => href,
}))

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

const baseSummary = () => ({
  actions: [
    {
      id: 'project-approvals',
      kind: 'approval',
      priority: 'critical',
      title: '2 aprovações de projeto pendentes',
      description: 'Resumo',
      href: '/portal/projetos/projetos?tab=approvals',
    },
    {
      id: 'content-reviews',
      kind: 'marketing',
      priority: 'high',
      title: '3 conteúdos aguardando revisão',
      description: 'Conteúdos do Marketing Studio precisam de aprovação.',
      href: '/portal/marketing/studio',
    },
    {
      id: 'crm-overdue',
      kind: 'commercial',
      priority: 'critical',
      title: '1 follow-up atrasado',
      description: 'Não é aprovação',
      href: '/portal/comercial/tarefas',
    },
  ],
  approvals: [
    {
      id: 'a1',
      projectId: 'p 1',
      title: 'Logotipo final',
      status: 'pending',
      submittedAt: hoursAgo(50),
      instructions: 'Confira as cores.',
    },
    { id: 'a2', projectId: 'p1', title: 'Já decidida', status: 'approved', submittedAt: hoursAgo(80) },
    { id: 'a3', projectId: 'p2', title: 'Manual de marca', status: 'pending', submittedAt: hoursAgo(5) },
  ],
  loading: false,
  error: null as string | null,
  reload: summary.reload,
})

let root: Root
let container: HTMLDivElement
beforeEach(() => {
  summary.current = baseSummary()
  summary.reload.mockClear()
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})
const mount = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <PortalApprovalsPage />
      </MemoryRouter>,
    )
    await flush()
  })
}
const chip = (text: string) =>
  [...container.querySelectorAll<HTMLButtonElement>('[role="group"] button')].find((b) => b.textContent?.startsWith(text))!
const cards = () => [...container.querySelectorAll('ul[aria-label="Fila de aprovações"] > li')]

describe('PortalApprovalsPage', () => {
  it('lists the queue first, without navigation cards or a back-to-overview button', async () => {
    await mount()
    expect(container.textContent).not.toContain('Voltar para Visão Geral')
    expect(container.textContent).not.toContain('Fila consolidada')
    // 2 aprovações de projeto pendentes + 1 ação de conteúdo (o resumo "project-approvals" e o follow-up ficam de fora).
    expect(cards()).toHaveLength(3)
    expect(container.textContent).toContain('3 aguardando você')
    expect(container.textContent).not.toContain('Já decidida')
    expect(container.textContent).not.toContain('follow-up atrasado')
    expect(container.textContent).not.toContain('2 aprovações de projeto pendentes')
  })

  it('shows type, module, wait time and a link to the module screen for each item', async () => {
    await mount()
    const first = cards()[0]
    // A mais antiga primeiro.
    expect(first.textContent).toContain('Logotipo final')
    expect(first.textContent).toContain('Projetos e entregas')
    expect(first.textContent).toContain('enviada há 2 dias')
    expect(first.querySelector('a')!.getAttribute('href')).toBe('/portal/projetos/projetos?projectId=p%201&tab=approvals')
    const content = cards()[2]
    expect(content.textContent).toContain('Marketing Studio')
    expect(content.querySelector('a')!.getAttribute('href')).toBe('/portal/marketing/studio')
  })

  it('offers filter chips only for the types present, with counts, and filters the queue', async () => {
    await mount()
    expect(chip('Todas').textContent).toContain('3')
    expect(chip('Entregas').textContent).toContain('2')
    expect(chip('Conteúdos').textContent).toContain('1')
    expect(chip('Landing pages')).toBeUndefined()
    expect(chip('Propostas')).toBeUndefined()

    await act(async () => {
      chip('Conteúdos').click()
      await flush()
    })
    expect(chip('Conteúdos').getAttribute('aria-pressed')).toBe('true')
    expect(cards()).toHaveLength(1)
    expect(cards()[0].textContent).toContain('conteúdos aguardando revisão')

    await act(async () => {
      chip('Todas').click()
      await flush()
    })
    expect(cards()).toHaveLength(3)
  })

  it('hides the chips when there is a single type', async () => {
    summary.current = { ...baseSummary(), actions: [] }
    await mount()
    expect(container.querySelector('[role="group"]')).toBeNull()
    expect(cards()).toHaveLength(2)
  })

  it('shows the honest empty state', async () => {
    summary.current = { ...baseSummary(), actions: [], approvals: [] }
    await mount()
    expect(container.textContent).toContain('Nenhuma aprovação pendente')
    expect(container.textContent).toContain('aparecem nesta fila')
  })

  it('shows a loading skeleton', async () => {
    summary.current = { ...baseSummary(), loading: true }
    await mount()
    expect(container.querySelector('[role="status"]')?.textContent).toContain('Carregando aprovações')
    expect(cards()).toHaveLength(0)
  })

  it('shows an error with retry that reloads the data', async () => {
    summary.current = { ...baseSummary(), actions: [], approvals: [], error: 'falha' }
    await mount()
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível carregar suas aprovações')
    await act(async () => {
      const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Tentar novamente')!
      retry.click()
      await flush()
    })
    expect(summary.reload).toHaveBeenCalledTimes(1)
  })

  it('keeps the items and warns when only part of the data failed', async () => {
    summary.current = { ...baseSummary(), error: 'falha parcial' }
    await mount()
    expect(cards()).toHaveLength(3)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Algumas aprovações')
  })
})
