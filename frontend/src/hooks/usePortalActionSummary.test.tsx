import { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { usePortalActionSummary } from './usePortalActionSummary'
import { usePlatformStore } from '@/stores/platformStore'
import { projectDeliveryService } from '@/services/projectDeliveryService'
import { financeService } from '@/services/financeService'

vi.mock('./usePortalCrmContext', () => ({
  usePortalCrmContext: () => ({
    tasks: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))
vi.mock('./usePortalMarketingContext', () => ({
  usePortalMarketingContext: () => ({
    reviews: [],
    creativeSuggestions: [],
    loading: false,
    error: null,
    reload: vi.fn(),
  }),
}))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))
let root: Root
let container: HTMLDivElement
function View() {
  const summary = usePortalActionSummary()
  return (
    <div>
      {summary.loading
        ? 'Carregando'
        : summary.approvals.map((a) => <span key={a.id}>{a.title}</span>)}
      {summary.actions.map((a) => (
        <a key={a.id} href={a.href}>
          {a.title}
        </a>
      ))}
    </div>
  )
}
beforeEach(() => {
  usePlatformStore.setState({
    organization: { id: 'org-a' } as never,
    activeContract: null,
    isLoading: false,
    enabledModuleKeys: ['projects'],
  })
  vi.spyOn(projectDeliveryService, 'list').mockResolvedValue({ projects: [] })
  vi.spyOn(projectDeliveryService, 'approvals').mockResolvedValue({
    approvals: [
      {
        id: 'approval-a',
        title: 'Revisar portal',
        status: 'pending',
        isClientVisible: true,
      } as never,
    ],
  })
  vi.spyOn(financeService, 'getPortalInvoices').mockResolvedValue([])
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})
const mount = async () => {
  await act(async () => {
    root.render(<View />)
    await flush()
    await flush()
  })
}
describe('portal project action summary', () => {
  it('loads the entire scoped approval queue without requiring a commercial contract', async () => {
    await mount()
    expect(projectDeliveryService.list).toHaveBeenCalledWith('org-a')
    expect(projectDeliveryService.approvals).toHaveBeenCalledWith('org-a')
    expect(financeService.getPortalInvoices).not.toHaveBeenCalled()
    expect(container.textContent).toContain('Revisar portal')
    expect(container.querySelector('a')?.getAttribute('href')).toBe(
      '/portal/projetos/projetos?tab=approvals'
    )
  })
  it('clears the project queue after the workspace is removed', async () => {
    await mount()
    await act(async () => {
      usePlatformStore.setState({ organization: null })
      await flush()
    })
    expect(container.textContent).not.toContain('Revisar portal')
  })
  it('does not request project resources when the module is disabled', async () => {
    usePlatformStore.setState({ enabledModuleKeys: [] })
    await mount()
    expect(projectDeliveryService.list).not.toHaveBeenCalled()
    expect(projectDeliveryService.approvals).not.toHaveBeenCalled()
  })
})
