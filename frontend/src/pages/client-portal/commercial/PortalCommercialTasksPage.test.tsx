import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalCommercialTasksPage, newTaskDisabledReason } from './PortalCommercialTasksPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { workItemsService, type WorkItem } from '@/services/workItemsService'
import type { CrmLead, CrmPipeline, CrmTaskListItem } from '@/types/crm'

vi.mock('@/hooks/usePortalCrmContext', () => ({ usePortalCrmContext: vi.fn() }))
vi.mock('@/services/crmService', () => ({ crmService: { patchTask: vi.fn(), createLeadTask: vi.fn() } }))

const organizationId = '11111111-1111-4111-8111-111111111111'
const organization = { id: organizationId, name: 'Cliente', slug: 'cliente', kind: 'client' as const, createdAt: '', updatedAt: '' }
const pipeline: CrmPipeline = { id: 'pipeline-1', organizationId, crmInstanceId: 'instance-1', name: 'Comercial', isDefault: true, isActive: true, stages: [] }
const lead = {
  id: 'lead-1', organizationId, pipelineId: 'pipeline-1', stageId: 'stage-1', name: 'Ana Lead', email: 'ana@example.com', company: 'Alpha',
  source: 'Manual', status: 'open', score: 10, createdAt: '', updatedAt: '',
} as CrmLead
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
const task = (overrides: Partial<CrmTaskListItem>): CrmTaskListItem => ({
  id: 'task-1', organizationId, leadId: 'lead-1', title: 'Ligar para a Ana', status: 'pending', dueAt: daysFromNow(2), leadName: 'Ana Lead', leadCompany: 'Alpha', ...overrides,
})
const workItem = (overrides: Partial<WorkItem>): WorkItem => ({
  sourceType: 'crm_task', sourceId: 'task-1', title: 'Ligar para a Ana', status: 'pending', dueAt: daysFromNow(2), assigneeId: null, missionId: null, organizationId, version: 'v1', ...overrides,
})

function mockContext(overrides: Partial<ReturnType<typeof usePortalCrmContext>> = {}) {
  vi.mocked(usePortalCrmContext).mockReturnValue({
    organization, role: null, enabledModuleKeys: ['crm'], loading: false, error: null,
    pipelines: [pipeline], leads: [lead], tasks: [], reload: vi.fn().mockResolvedValue(undefined), ...overrides,
  })
}

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter><PortalCommercialTasksPage /></MemoryRouter>)
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  })
  return { container, root }
}

const buttonByText = (container: HTMLElement, text: string) => [...container.querySelectorAll('button')].find(button => button.textContent?.includes(text))

describe('PortalCommercialTasksPage', () => {
  beforeEach(() => {
    vi.spyOn(workItemsService, 'list').mockResolvedValue({
      items: [
        workItem({ sourceId: 'task-1', title: 'Ligar para a Ana', dueAt: daysFromNow(2) }),
        workItem({ sourceId: 'task-2', title: 'Cobrar proposta', dueAt: daysFromNow(-2) }),
      ],
    })
  })
  afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('reúne tudo em uma só fila com os filtros Hoje, Atrasadas e Todas e a ação Nova tarefa no cabeçalho', async () => {
    mockContext({ tasks: [task({}), task({ id: 'task-2', title: 'Cobrar proposta', dueAt: daysFromNow(-2), leadName: 'Bruno' })] })
    const { container, root } = await render()

    expect(container.querySelector('h1')?.textContent).toBe('Tarefas e follow-ups')
    expect(container.textContent).toContain('Fila de tarefas')
    expect(container.textContent).not.toContain('Central de tarefas')
    expect(container.textContent).not.toContain('Meu trabalho diário')
    expect(container.querySelectorAll('#task-queue-title')).toHaveLength(1)

    const filters = container.querySelector('[aria-label="Filtros rápidos"]')!
    expect([...filters.querySelectorAll('button')].map(button => button.textContent?.replace(/\s*\(\d+\)/, ''))).toEqual(['Hoje', 'Atrasadas', 'Todas', 'Concluídas'])

    // Nada vence hoje: abre em Atrasadas, onde está a tarefa vencida.
    expect(container.textContent).toContain('Cobrar proposta')
    expect(container.textContent).not.toContain('Ligar para a Ana')
    await act(async () => { buttonByText(container, 'Todas')?.click() })
    expect(container.textContent).toContain('Ligar para a Ana')
    expect(container.textContent).toContain('Cobrar proposta')

    const header = container.querySelector('header')!
    const newTask = [...header.querySelectorAll('button')].find(button => button.textContent?.includes('Nova tarefa'))!
    expect(newTask).toBeTruthy()
    expect((newTask as HTMLButtonElement).disabled).toBe(false)
    act(() => root.unmount())
  })

  it('quando Nova tarefa está desabilitada, mostra o motivo em texto', async () => {
    mockContext({ leads: [], tasks: [] })
    const { container, root } = await render()

    const newTask = [...container.querySelectorAll('header button')].find(button => button.textContent?.includes('Nova tarefa')) as HTMLButtonElement
    expect(newTask.disabled).toBe(true)
    const reasonId = newTask.getAttribute('aria-describedby')!
    expect(document.getElementById(reasonId)?.textContent).toContain('Cadastre ao menos um lead')
    act(() => root.unmount())
  })

  it('explica cada motivo possível de bloqueio', () => {
    const ok = { loading: false, organizationId, pipelineCount: 1, crmInstanceId: 'i', leadCount: 1 }
    expect(newTaskDisabledReason(ok)).toBeNull()
    expect(newTaskDisabledReason({ ...ok, loading: true })).toContain('Carregando')
    expect(newTaskDisabledReason({ ...ok, organizationId: undefined })).toContain('Escolha uma empresa')
    expect(newTaskDisabledReason({ ...ok, pipelineCount: 0 })).toContain('Funis')
    expect(newTaskDisabledReason({ ...ok, crmInstanceId: undefined })).toContain('equipe YUX')
    expect(newTaskDisabledReason({ ...ok, leadCount: 0 })).toContain('ao menos um lead')
  })
})
