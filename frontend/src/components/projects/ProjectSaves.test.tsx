import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { backendDataService as service } from '@/services/backendDataService'
import type { Project } from '@/types/project'
import { ProjectTaskManager } from './ProjectTaskManager'
import { ProjectNotifications } from './ProjectNotifications'
import { ProjectProgressCalculator } from './ProjectProgressCalculator'
import { ProjectFormModal } from './ProjectFormModal'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const project = { id: 'project-a', progress: 0 } as Project
const flush = () => new Promise(resolve => setTimeout(resolve, 0))
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(service, 'getUsers').mockResolvedValue({ data: [] })
  vi.spyOn(service, 'getProjectTasks').mockResolvedValue({ tasks: [] })
  vi.spyOn(service, 'getProjectPhases').mockResolvedValue({ phases: [] })
  vi.spyOn(service, 'getProjectById').mockResolvedValue({ project: { ...project, notificationRules: { 'deadline-7d': false } } })
  vi.spyOn(service, 'updateProject').mockResolvedValue({ project })
  vi.spyOn(service, 'createProjectTask').mockResolvedValue({})
  vi.spyOn(service, 'updateProjectPhase').mockResolvedValue({})
  vi.spyOn(toast, 'error').mockImplementation(() => '')
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const mount = async (element: React.ReactNode) => {
  await act(async () => { root.render(element); await flush(); await flush() })
}
const button = (text: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === text)!
const click = async (element: HTMLElement) => { await act(async () => { element.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true })); element.click(); await flush() }) }
const fill = async (selector: string, value: string) => {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>(selector)!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await flush()
  })
}

describe('project form persistence', () => {
  it('retains a failed task draft and prevents duplicate requests while retrying', async () => {
    vi.mocked(service.createProjectTask).mockRejectedValueOnce(new Error('offline'))
    await mount(<ProjectTaskManager project={project} />)
    await click(button('Nova Tarefa'))
    await fill('#task-title', 'Análise de vendas')
    await fill('#task-hours', '0')
    await click(button('Criar Tarefa'))
    expect(document.querySelector<HTMLInputElement>('#task-title')!.value).toBe('Análise de vendas')
    expect(document.querySelector<HTMLInputElement>('#task-hours')!.value).toBe('0')
    let finish!: () => void
    vi.mocked(service.createProjectTask).mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({}) }))
    const save = button('Criar Tarefa')
    await act(async () => { save.click(); save.click(); await flush() })
    expect(service.createProjectTask).toHaveBeenCalledTimes(2)
    expect(service.createProjectTask).toHaveBeenLastCalledWith('project-a', expect.objectContaining({ estimatedHours: 0, dueDate: null, assignedTo: null, phaseId: null }))
    expect(button('Salvando...').disabled).toBe(true)
    await act(async () => { finish(); await flush() })
    expect(document.querySelector('#task-title')).toBeNull()
  })

  it('saves an edited phase budget and cleared dates without leaving the phases tab', async () => {
    vi.mocked(service.getProjectPhases).mockResolvedValue({ phases: [{ id: 'phase-a', name: 'Descoberta', budget: 500, status: 'planning', startDate: '2026-11-01', endDate: '2026-11-20' }] })
    await mount(<ProjectTaskManager project={project} />)
    await click(button('Fases (1)'))
    await click(document.querySelector('[aria-label="Editar fase Descoberta"]')!)
    await fill('#phase-budget', '0')
    await fill('#phase-start-date', '')
    await fill('#phase-end-date', '')
    await click(button('Atualizar Fase'))
    expect(service.updateProjectPhase).toHaveBeenCalledWith('project-a', 'phase-a', expect.objectContaining({ budget: 0, startDate: null, endDate: null }))
    expect(button('Fases (1)').getAttribute('aria-selected')).toBe('true')
  })

  it('reloads alert switches and keeps the previous value if saving fails', async () => {
    await mount(<ProjectNotifications project={project} />)
    const toggle = document.querySelector<HTMLElement>('#deadline-7d')!
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    vi.mocked(service.updateProject).mockRejectedValueOnce(new Error('offline'))
    await click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(toast.error).toHaveBeenCalledWith('Não foi possível salvar as preferências de alertas')
    await click(toggle)
    expect(service.updateProject).toHaveBeenLastCalledWith('project-a', expect.objectContaining({ notificationRules: expect.objectContaining({ 'deadline-7d': true }) }))
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  it('finishes calculating progress when the project has no tasks or phases', async () => {
    await mount(<ProjectProgressCalculator project={project} />)
    expect(container.textContent).toContain('Calculadora de Progresso')
    expect(container.textContent).not.toContain('Calculando progresso...')
  })

  it('submits an existing planned project with cents and its original past start date', async () => {
    const clientId = '20000000-0000-4000-8000-000000000001'
    vi.spyOn(service, 'getClients').mockResolvedValue({ data: [{ id: clientId, companyName: 'Empresa A' }] })
    const onClose = vi.fn()
    await mount(<ProjectFormModal isOpen onClose={onClose} onSave={async () => {}} project={{
      ...project, name: 'Projeto planejado', description: 'Descrição do projeto planejado', clientId,
      status: 'PLANNING', priority: 'MEDIUM', type: 'WEBSITE', startDate: '2026-10-01', expectedEndDate: '2026-10-31', budget: 0.29, currency: 'BRL',
    }} />)
    await act(async () => { document.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); await flush() })
    expect(service.updateProject).toHaveBeenCalledWith('project-a', expect.objectContaining({ budget: 0.29, startDate: '2026-10-01', status: 'PLANNING' }))
    expect(onClose).toHaveBeenCalled()
  })
})
