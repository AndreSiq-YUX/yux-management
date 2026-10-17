import { act } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createRoot, Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { PortalProjectsPage } from './PortalProjectsPage'
import { usePlatformStore } from '@/stores/platformStore'
import {
  projectDeliveryService,
  ProjectDeliverySnapshot,
} from '@/services/projectDeliveryService'
import type { Project } from '@/types/project'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
const organizationId = 'org-a'
const project = (id = 'project-a'): Project =>
  ({
    id,
    name: `Projeto ${id}`,
    status: 'ACTIVE',
    progress: 50,
    expectedEndDate: '2026-12-31',
  }) as Project
const snapshot = (title = 'Entrega A'): ProjectDeliverySnapshot => ({
  tasks: [],
  phases: [],
  timeline: [],
  deliverables: [
    {
      id: 'delivery-a',
      title,
      status: 'in_review',
      isClientVisible: true,
      externalUrl: 'https://example.com/arquivo',
    } as never,
  ],
  approvals: [
    {
      id: 'approval-a',
      targetId: 'delivery-a',
      title,
      status: 'pending',
      submittedAt: '2026-10-15',
    } as never,
  ],
})
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  usePlatformStore.setState({
    organization: { id: organizationId } as never,
    activeContract: null,
    isLoading: false,
  })
  vi.spyOn(projectDeliveryService, 'list').mockResolvedValue({
    projects: [project(), project('project-b')],
  })
  vi.spyOn(projectDeliveryService, 'details').mockResolvedValue(snapshot())
  vi.spyOn(projectDeliveryService, 'decide').mockResolvedValue({
    success: true,
  })
  vi.spyOn(toast, 'error').mockImplementation(() => '')
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
const mount = async (url = '/') => {
  await act(async () => {
    root.render(
      <MemoryRouter
        initialEntries={[url]}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <PortalProjectsPage />
      </MemoryRouter>
    )
    await flush()
    await flush()
  })
}
const button = (text: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent === text)!
const click = async (text: string) => {
  await act(async () => {
    const target = button(text)
    if (target.getAttribute('role') === 'tab')
      target.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, button: 0 })
      )
    else target.click()
    await flush()
  })
}
const setComment = async (value: string) => {
  await act(async () => {
    const input = container.querySelector('textarea')!
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value'
    )!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('PortalProjectsPage', () => {
  it('opens the project and approvals tab specified by the consolidated queue', async () => {
    await mount('/portal/projetos/projetos?projectId=project-b&tab=approvals')
    expect(projectDeliveryService.details).toHaveBeenCalledWith(
      organizationId,
      'project-b'
    )
    expect(button('Aprovações (1)').getAttribute('aria-selected')).toBe('true')
    expect(container.querySelector('textarea')).toBeTruthy()
  })
  it('loads the workspace through scoped routes without requiring a commercial contract', async () => {
    await mount()
    expect(projectDeliveryService.list).toHaveBeenCalledWith(organizationId)
    expect(projectDeliveryService.details).toHaveBeenCalledWith(
      organizationId,
      'project-a'
    )
    expect(container.textContent).toContain('Em Andamento')
    expect(container.textContent).toContain('1 aprovação aguardando você')
  })
  it('does not show old project details while a new selection is loading', async () => {
    let resolve!: (value: ProjectDeliverySnapshot) => void
    vi.mocked(projectDeliveryService.details).mockImplementation(
      async (_org, id) =>
        id === 'project-a'
          ? snapshot()
          : new Promise((done) => {
              resolve = done
            })
    )
    await mount()
    await click('Entregas (1)')
    expect(container.textContent).toContain('Entrega A')
    await act(async () => {
      container.querySelectorAll<HTMLButtonElement>('aside button')[1].click()
      await flush()
    })
    expect(container.textContent).not.toContain('Entrega A')
    expect(container.textContent).toContain('Carregando acompanhamento')
    await act(async () => {
      resolve(snapshot('Entrega B'))
      await flush()
    })
    await click('Entregas (1)')
    expect(container.textContent).toContain('Entrega B')
  })
  it('ignores an old organization response after switching workspace', async () => {
    let resolve!: (value: { projects: Project[] }) => void
    vi.mocked(projectDeliveryService.list).mockImplementation(async (org) =>
      org === organizationId
        ? new Promise((done) => {
            resolve = done
          })
        : { projects: [project('new-org')] }
    )
    await mount()
    await act(async () => {
      usePlatformStore.setState({ organization: { id: 'org-b' } as never })
      await flush()
      await flush()
    })
    await act(async () => {
      resolve({ projects: [project('old-org')] })
      await flush()
    })
    expect(container.textContent).toContain('Projeto new-org')
    expect(container.textContent).not.toContain('Projeto old-org')
  })
  it('shows retry after list failure instead of claiming no projects exist', async () => {
    vi.mocked(projectDeliveryService.list).mockRejectedValueOnce(
      new Error('offline')
    )
    await mount()
    expect(container.textContent).toContain(
      'Não foi possível carregar seus projetos'
    )
    expect(container.textContent).not.toContain('Seus projetos aparecerão aqui')
    await click('Tentar novamente')
    expect(container.textContent).toContain('Projeto project-a')
  })
  it('requires a comment for adjustments and retains it after a failed submission', async () => {
    await mount()
    await click('Aprovações (1)')
    await click('Solicitar ajustes')
    expect(projectDeliveryService.decide).not.toHaveBeenCalled()
    await setComment('Ajustar contraste')
    vi.mocked(projectDeliveryService.decide).mockRejectedValueOnce(
      new Error('offline')
    )
    await click('Solicitar ajustes')
    expect(projectDeliveryService.decide).toHaveBeenCalledWith(
      organizationId,
      'project-a',
      'approval-a',
      'changes_requested',
      'Ajustar contraste'
    )
    expect(container.querySelector('textarea')?.value).toBe('Ajustar contraste')
    expect(button('Solicitar ajustes').disabled).toBe(false)
  })
  it('shows the artifact in the approval card and refreshes both decision and delivery', async () => {
    await mount()
    await click('Aprovações (1)')
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      'https://example.com/arquivo'
    )
    const approved = snapshot()
    approved.approvals[0].status = 'approved'
    approved.deliverables[0].status = 'approved'
    vi.mocked(projectDeliveryService.details).mockResolvedValue(approved)
    await click('Aprovar')
    expect(projectDeliveryService.details).toHaveBeenCalledTimes(2)
    expect(container.querySelector('textarea')).toBeNull()
    expect(container.textContent).toContain('Aprovado')
    await click('Entregas (1)')
    expect(container.textContent).toContain('Aprovado')
  })
  it('locks all decision buttons until the current request finishes', async () => {
    let resolve!: (value: { success: boolean }) => void
    vi.mocked(projectDeliveryService.decide).mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done
        })
    )
    await mount()
    await click('Aprovações (1)')
    await click('Aprovar')
    expect(container.querySelector('fieldset')?.disabled).toBe(true)
    await act(async () => {
      button('Solicitar ajustes').click()
      await flush()
    })
    expect(projectDeliveryService.decide).toHaveBeenCalledTimes(1)
    await act(async () => {
      resolve({ success: true })
      await flush()
    })
  })
})
