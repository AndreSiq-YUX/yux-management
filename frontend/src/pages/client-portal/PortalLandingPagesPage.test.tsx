import { act } from 'react-dom/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { byText, click, render } from '@/components/portal-ui/__tests__/render'
import { PortalLandingPagesPage } from './PortalLandingPagesPage'

const mocks = vi.hoisted(() => ({
  getPortalLandingPages: vi.fn(),
  requestLandingPageChange: vi.fn(),
  approveLandingPage: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: Object.assign(vi.fn(), { success: mocks.toastSuccess, error: vi.fn() }),
}))

vi.mock('@/services/landingPageService', () => ({
  landingPageService: {
    getPortalLandingPages: mocks.getPortalLandingPages,
    requestLandingPageChange: mocks.requestLandingPageChange,
    approveLandingPage: mocks.approveLandingPage,
    createPublicLeadForm: vi.fn(),
    updatePublicLeadForm: vi.fn(),
  },
}))

const storeState = {
  activeContract: { id: 'contract-1', clientId: 'client-1', name: 'Contrato principal' },
  isLoading: false,
}
vi.mock('@/stores/platformStore', () => ({
  usePlatformStore: (selector: (state: typeof storeState) => unknown) => selector(storeState),
}))

vi.mock('@/hooks/usePortalWorkspacePath', () => ({
  usePortalWorkspacePath: () => (href = '/portal') => href,
}))

const pendingPage = {
  id: 'lp-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  name: 'Botox Junho',
  slug: 'botox-junho',
  status: 'pending_approval',
  primaryCtaType: 'form',
  primaryCtaValue: 'Agendar avaliação',
  visits: 100,
  leads: 5,
  pendingApprovals: 1,
  createdAt: '2026-06-03T10:00:00.000Z',
  updatedAt: '2026-06-03T10:00:00.000Z',
  versions: [],
  forms: [],
}

beforeEach(() => {
  mocks.getPortalLandingPages.mockReset().mockResolvedValue([pendingPage])
  mocks.requestLandingPageChange.mockReset().mockResolvedValue({})
  mocks.approveLandingPage.mockReset().mockResolvedValue({})
  mocks.toastSuccess.mockReset()
})

afterEach(() => {
  document.body.innerHTML = ''
})

const typeInto = async (field: HTMLTextAreaElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('PortalLandingPagesPage', () => {
  it('sends the typed message (not a fixed text) when asking for a change', async () => {
    const { unmount } = await render(<PortalLandingPagesPage />)

    await click(document.body.querySelector('button[title="Solicitar ajuste"]'))
    await typeInto(document.body.querySelector('textarea')!, 'Trocar a foto principal por outra')
    await click(byText(document.body, 'button', 'Enviar solicitação'))

    expect(mocks.requestLandingPageChange).toHaveBeenCalledWith({
      landingPageId: 'lp-1',
      message: 'Trocar a foto principal por outra',
    })
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Solicitação de ajuste enviada')
    await unmount()
  })

  it('approves only after the confirmation dialog', async () => {
    const { unmount } = await render(<PortalLandingPagesPage />)

    await click(document.body.querySelector('button[title="Aprovar publicação"]'))
    expect(mocks.approveLandingPage).not.toHaveBeenCalled()
    await click(byText(document.body, 'button', 'Aprovar publicação'))

    expect(mocks.approveLandingPage).toHaveBeenCalledWith(expect.objectContaining({ landingPageId: 'lp-1', status: 'approved' }))
    await unmount()
  })

  it('shows the empty state when the contract has no pages', async () => {
    mocks.getPortalLandingPages.mockResolvedValue([])
    const { container, unmount } = await render(<PortalLandingPagesPage />)
    expect(container.textContent).toContain('Nenhuma landing page ainda')
    await unmount()
  })
})
