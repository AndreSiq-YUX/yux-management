import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkItemsDailyQueue } from './WorkItemsDailyQueue'
import { workItemsService, type WorkItem } from '@/services/workItemsService'
import { useAuthStore } from '@/stores/authStore'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('WorkItemsDailyQueue', () => {
  it('agrupa fontes sem duplicar e exige evidência e minutos para concluir', async () => {
    const item = {
      sourceType: 'mission_human_task', sourceId: '60000000-0000-4000-8000-000000000001',
      title: 'Conferir resultado', status: 'pending', dueAt: new Date().toISOString(),
      assigneeId: 'user-1', missionId: '80000000-0000-4000-8000-000000000001',
      organizationId: '10000000-0000-4000-8000-000000000001', version: '2026-09-05T10:00:00.000Z',
    } satisfies WorkItem
    const list = vi.spyOn(workItemsService, 'list').mockResolvedValue({ items: [item] })
    const complete = vi.spyOn(workItemsService, 'complete').mockResolvedValue({ status: 'completed', version: '2026-09-05T10:01:00.000Z' })
    useAuthStore.setState({ user: { id: 'user-1', name: 'Operador', email: 'op@example.test', role: 'manager' } })
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><WorkItemsDailyQueue organizationId={item.organizationId} /></MemoryRouter>)
      await Promise.resolve()
    })
    expect(list).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain('Meu trabalho diário')
    expect(container.textContent).toContain('Hoje (1)')
    expect(container.textContent).toContain('Bloqueadas (0)')
    expect(container.textContent).toContain('Aguardando aprovação (0)')
    expect(container.textContent?.match(/Conferir resultado/g)).toHaveLength(1)

    const begin = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Concluir'))
    await act(async () => begin?.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const textarea = container.querySelector('textarea')!
    const minutes = container.querySelector('input[type="number"]')!
    await act(async () => {
      setNativeValue(textarea, 'Relatório revisado')
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      setNativeValue(minutes, '18')
      minutes.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const submit = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Registrar conclusão'))
    await act(async () => {
      submit?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      await Promise.resolve()
    })
    expect(complete).toHaveBeenCalledWith(item, { evidence: { note: 'Relatório revisado' }, minutesSpent: 18 })
    act(() => root.unmount())
  })
})

function setNativeValue(element: Element, value: string) {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(element, value)
}
