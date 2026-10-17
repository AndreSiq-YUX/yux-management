import { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { ProjectDeliveryManager } from './ProjectDeliveryManager'
import { backendDataService } from '@/services/backendDataService'
import type { Project, ProjectDeliverable } from '@/types/project'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const deliverable: ProjectDeliverable = {
  id: 'delivery-a',
  projectId: 'project-a',
  title: 'Apresentação',
  description: 'Descrição preservada',
  externalUrl: 'https://example.com/arquivo',
  dueDate: '2026-11-10',
  phaseId: 'phase-a',
  status: 'draft',
  isClientVisible: false,
  createdAt: '',
  updatedAt: '',
}
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  )
  vi.spyOn(backendDataService, 'getProjectDeliverables').mockResolvedValue({
    deliverables: [deliverable],
  })
  vi.spyOn(backendDataService, 'getProjectApprovalRequests').mockResolvedValue({
    approvals: [],
  })
  vi.spyOn(backendDataService, 'getProjectTimeline').mockResolvedValue({
    entries: [],
  })
  vi.spyOn(backendDataService, 'getProjectPhases').mockResolvedValue({
    phases: [{ id: 'phase-a', name: 'Design' }],
  })
  vi.spyOn(backendDataService, 'updateProjectDeliverable').mockResolvedValue({})
  vi.spyOn(backendDataService, 'createApprovalRequest').mockResolvedValue({})
  vi.spyOn(toast, 'error').mockImplementation(() => '')
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
const mount = async () => {
  await act(async () => {
    root.render(
      <ProjectDeliveryManager project={{ id: 'project-a' } as Project} />
    )
    await flush()
    await flush()
  })
}
const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)!
const click = async (text: string) => {
  await act(async () => {
    button(text).click()
    await flush()
  })
}

describe('ProjectDeliveryManager', () => {
  it('edits and saves the full delivery without dropping its deadline, phase or link', async () => {
    await mount()
    await click('Editar')
    expect(
      container.querySelector<HTMLInputElement>('#delivery-url')?.value
    ).toBe(deliverable.externalUrl)
    expect(
      container.querySelector<HTMLInputElement>('#delivery-due')?.value
    ).toBe('2026-11-10')
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
    })
    expect(backendDataService.updateProjectDeliverable).toHaveBeenCalledWith(
      'project-a',
      'delivery-a',
      expect.objectContaining({
        title: 'Apresentação',
        description: 'Descrição preservada',
        externalUrl: deliverable.externalUrl,
        phaseId: 'phase-a',
        dueDate: '2026-11-10',
        isClientVisible: false,
      })
    )
    expect(container.querySelector('form')).toBeNull()
  })
  it('retains form fields when saving fails', async () => {
    vi.mocked(backendDataService.updateProjectDeliverable).mockRejectedValue(
      new Error('offline')
    )
    await mount()
    await click('Editar')
    await act(async () => {
      container
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      await flush()
    })
    expect(
      container.querySelector<HTMLTextAreaElement>('#delivery-description')
        ?.value
    ).toBe('Descrição preservada')
    expect(container.querySelector('fieldset')?.disabled).toBe(false)
  })
  it('sends one atomic approval request and locks repeat submissions', async () => {
    let resolve!: (value: unknown) => void
    vi.mocked(backendDataService.createApprovalRequest).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    await mount()
    await click('Solicitar aprovação')
    expect(button('Enviando...').disabled).toBe(true)
    expect(backendDataService.createApprovalRequest).toHaveBeenCalledOnce()
    expect(backendDataService.updateProjectDeliverable).not.toHaveBeenCalled()
    await act(async () => {
      resolve({})
      await flush()
    })
  })
  it('disables edit and approval actions when a client decision is pending', async () => {
    vi.mocked(backendDataService.getProjectApprovalRequests).mockResolvedValue({
      approvals: [
        {
          id: 'approval-a',
          targetType: 'deliverable',
          targetId: 'delivery-a',
          status: 'pending',
        },
      ],
    })
    await mount()
    expect(button('Aguardando cliente').disabled).toBe(true)
    expect(button('Editar').disabled).toBe(true)
  })
  it('offers retry when the delivery workspace could not load', async () => {
    vi.mocked(backendDataService.getProjectDeliverables).mockRejectedValueOnce(
      new Error('offline')
    )
    await mount()
    expect(container.querySelector('[role="alert"]')).toBeTruthy()
    expect(container.textContent).not.toContain('Nenhuma entrega cadastrada')
    await click('Tentar novamente')
    expect(container.textContent).toContain('Apresentação')
  })
})
