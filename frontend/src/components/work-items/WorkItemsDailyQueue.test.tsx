import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkItemsDailyQueue, matchesQueueFilter } from './WorkItemsDailyQueue'
import { workItemsService, type WorkItem } from '@/services/workItemsService'
import { useAuthStore } from '@/stores/authStore'
import type { CrmTaskListItem } from '@/types/crm'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

const baseItem = {
  sourceType: 'mission_human_task', sourceId: '60000000-0000-4000-8000-000000000001',
  title: 'Conferir resultado', status: 'pending', dueAt: new Date().toISOString(),
  assigneeId: 'user-1', missionId: '80000000-0000-4000-8000-000000000001',
  organizationId: '10000000-0000-4000-8000-000000000001', version: '2026-09-05T10:00:00.000Z',
} satisfies WorkItem

const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()

async function render(node: React.ReactNode) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter>{node}</MemoryRouter>)
    await Promise.resolve()
    await Promise.resolve()
  })
  return { container, root }
}

const buttonByText = (container: HTMLElement, text: string) => [...container.querySelectorAll('button')].find(button => button.textContent?.includes(text))

describe('WorkItemsDailyQueue', () => {
  it('mostra uma só fila com filtros rápidos e exige evidência e minutos para concluir', async () => {
    const list = vi.spyOn(workItemsService, 'list').mockResolvedValue({ items: [baseItem] })
    const complete = vi.spyOn(workItemsService, 'complete').mockResolvedValue({ status: 'completed', version: '2026-09-05T10:01:00.000Z' })
    useAuthStore.setState({ user: { id: 'user-1', name: 'Operador', email: 'op@example.test', role: 'manager' } })
    const { container, root } = await render(<WorkItemsDailyQueue organizationId={baseItem.organizationId} />)

    expect(list).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Fila de tarefas')
    for (const label of ['Hoje', 'Atrasadas', 'Todas']) expect(buttonByText(container, label), label).toBeTruthy()
    expect(buttonByText(container, 'Hoje')?.textContent).toContain('(1)')
    expect(container.textContent?.match(/Conferir resultado/g)).toHaveLength(1)

    await act(async () => buttonByText(container, 'Concluir')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const textarea = container.querySelector('textarea')!
    const minutes = container.querySelector('input[type="number"]')!
    await act(async () => {
      setNativeValue(textarea, 'Relatório revisado')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      setNativeValue(minutes, '18')
      minutes.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      buttonByText(container, 'Registrar conclusão')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(complete).toHaveBeenCalledWith(baseItem, { evidence: { note: 'Relatório revisado' }, minutesSpent: 18 })
    act(() => root.unmount())
  })

  it('separa Hoje, Atrasadas e Todas na mesma lista', async () => {
    const today = { ...baseItem, sourceId: 'today', title: 'Ligar hoje', dueAt: new Date().toISOString(), sourceType: 'project_task' as const, missionId: null }
    const overdue = { ...baseItem, sourceId: 'late', title: 'Cobrar retorno', dueAt: daysFromNow(-3), sourceType: 'project_task' as const, missionId: null }
    const later = { ...baseItem, sourceId: 'later', title: 'Revisar contrato', dueAt: daysFromNow(5), sourceType: 'project_task' as const, missionId: null }
    vi.spyOn(workItemsService, 'list').mockResolvedValue({ items: [today, overdue, later] })
    const { container, root } = await render(<WorkItemsDailyQueue organizationId={baseItem.organizationId} />)

    // Sem escolha, abre em "Hoje".
    expect(container.textContent).toContain('Ligar hoje')
    expect(container.textContent).not.toContain('Cobrar retorno')

    await act(async () => buttonByText(container, 'Atrasadas')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(container.textContent).toContain('Cobrar retorno')
    expect(container.textContent).not.toContain('Ligar hoje')

    await act(async () => buttonByText(container, 'Todas')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    for (const title of ['Ligar hoje', 'Cobrar retorno', 'Revisar contrato']) expect(container.textContent).toContain(title)
    expect(buttonByText(container, 'Todas')?.getAttribute('aria-pressed')).toBe('true')
    act(() => root.unmount())
  })

  it('junta as tarefas comerciais: mostra o lead, cancela e lista as concluídas para reabrir', async () => {
    const crmItem = { ...baseItem, sourceType: 'crm_task' as const, sourceId: 'task-1', title: 'Ligar para a Ana', missionId: null, dueAt: daysFromNow(1) }
    vi.spyOn(workItemsService, 'list').mockResolvedValue({ items: [crmItem] })
    const crmTasks: CrmTaskListItem[] = [
      { id: 'task-1', organizationId: baseItem.organizationId, leadId: 'lead-1', title: 'Ligar para a Ana', status: 'pending', dueAt: crmItem.dueAt, leadName: 'Ana Lead', leadCompany: 'Clínica Alpha' },
      { id: 'task-2', organizationId: baseItem.organizationId, leadId: 'lead-2', title: 'Enviar proposta', status: 'completed', dueAt: daysFromNow(-1), leadName: 'Bruno Lead' },
    ]
    const onStatus = vi.fn().mockResolvedValue(undefined)
    const { container, root } = await render(
      <WorkItemsDailyQueue organizationId={baseItem.organizationId} crmTasks={crmTasks} onCrmTaskStatusChange={onStatus} initialFilter="all" />,
    )

    expect(container.textContent).toContain('Ana Lead · Clínica Alpha')
    await act(async () => buttonByText(container, 'Cancelar')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onStatus).toHaveBeenCalledWith('task-1', 'cancelled')

    await act(async () => buttonByText(container, 'Concluídas')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(container.textContent).toContain('Enviar proposta')
    await act(async () => buttonByText(container, 'Reabrir')?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(onStatus).toHaveBeenCalledWith('task-2', 'pending')
    act(() => root.unmount())
  })

  it('classifica prazos pelo dia local', () => {
    const now = new Date(2026, 9, 17, 15, 0, 0)
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour, 0, 0).toISOString()
    expect(matchesQueueFilter({ ...baseItem, dueAt: at(17, 9) }, 'today', now)).toBe(true)
    expect(matchesQueueFilter({ ...baseItem, dueAt: at(16, 23) }, 'overdue', now)).toBe(true)
    expect(matchesQueueFilter({ ...baseItem, dueAt: at(18, 8) }, 'today', now)).toBe(false)
    expect(matchesQueueFilter({ ...baseItem, dueAt: null }, 'all', now)).toBe(true)
    expect(matchesQueueFilter({ ...baseItem, dueAt: at(10, 8), status: 'blocked' }, 'overdue', now)).toBe(false)
  })
})

function setNativeValue(element: Element, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
}
