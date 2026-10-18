import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardLayout } from './DashboardLayout'
import { resolvePlatformMode } from './platformMode'

const storeMocks = vi.hoisted(() => ({
  initializeForUser: vi.fn(async () => undefined),
  setMode: vi.fn(),
  refreshBadges: vi.fn(async () => undefined),
  state: {} as Record<string, unknown>,
}))

const defaultPlatformState = () => ({
  initializeForUser: storeMocks.initializeForUser,
  setMode: storeMocks.setMode,
  error: null as string | null,
  isLoading: false,
  mode: 'internal',
  organization: null as { id: string } | null,
  activeContract: null as { id: string } | null,
  enabledModuleKeys: [] as string[],
})

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', role: 'admin' },
  }),
}))

vi.mock('@/stores/platformStore', () => ({
  usePlatformStore: (selector: (state: Record<string, unknown>) => unknown) => selector(storeMocks.state),
}))

vi.mock('@/stores/portalBadgeStore', () => ({
  usePortalBadgeStore: (selector: (state: Record<string, unknown>) => unknown) => selector({ refresh: storeMocks.refreshBadges }),
}))

vi.mock('@/components/navigation/Sidebar', () => ({
  Sidebar: ({ mobileOpen }: { mobileOpen?: boolean }) => <div data-testid="sidebar" data-open={String(Boolean(mobileOpen))} />,
}))
vi.mock('@/components/navigation/Header', () => ({
  Header: ({ onOpenMenu }: { onOpenMenu?: () => void }) => <button type="button" onClick={onOpenMenu}>menu</button>,
}))

describe('DashboardLayout platform context', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    storeMocks.initializeForUser.mockClear()
    storeMocks.setMode.mockClear()
    storeMocks.refreshBadges.mockClear()
    storeMocks.state = defaultPlatformState()
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('derives a stable mode for each application surface', () => {
    expect(resolvePlatformMode('/dashboard')).toBe('internal')
    expect(resolvePlatformMode('/portal/missoes')).toBe('portal')
    expect(resolvePlatformMode('/client-workspaces/org-1/missoes')).toBe('client_workspace')
  })

  it('leaves selected client workspace initialization to its child layout', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/client-workspaces/org-1/missoes']}>
          <DashboardLayout />
        </MemoryRouter>,
      )
    })

    expect(storeMocks.setMode).toHaveBeenCalledWith('client_workspace')
    expect(storeMocks.initializeForUser).not.toHaveBeenCalled()

    await act(async () => root.unmount())
  })

  it('still initializes the authenticated context on internal routes', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardLayout />
        </MemoryRouter>,
      )
    })

    expect(storeMocks.setMode).toHaveBeenCalledWith('internal')
    expect(storeMocks.initializeForUser).toHaveBeenCalledWith('user-1', 'admin')

    await act(async () => root.unmount())
  })

  it('loads the menu counters once per organization in the portal', async () => {
    storeMocks.state = {
      ...defaultPlatformState(),
      mode: 'portal',
      organization: { id: 'org-1' },
      activeContract: { id: 'contract-1' },
      enabledModuleKeys: ['projects', 'finance'],
    }
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/portal']}>
          <DashboardLayout />
        </MemoryRouter>,
      )
    })

    expect(storeMocks.refreshBadges).toHaveBeenCalledTimes(1)
    expect(storeMocks.refreshBadges).toHaveBeenCalledWith('org-1', 'contract-1', ['projects', 'finance'])

    await act(async () => root.unmount())
  })

  it('does not load portal counters in the internal Hub or while the context is stale', async () => {
    const root = createRoot(container)
    storeMocks.state = { ...defaultPlatformState(), organization: { id: 'yux' } }

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardLayout />
        </MemoryRouter>,
      )
    })
    expect(storeMocks.refreshBadges).not.toHaveBeenCalled()
    await act(async () => root.unmount())

    // Rota do portal, mas o store ainda guarda o contexto do Hub.
    const staleRoot = createRoot(container)
    await act(async () => {
      staleRoot.render(
        <MemoryRouter initialEntries={['/portal']}>
          <DashboardLayout />
        </MemoryRouter>,
      )
    })
    expect(storeMocks.refreshBadges).not.toHaveBeenCalled()
    await act(async () => staleRoot.unmount())
  })

  it('opens the mobile menu from the header and shows the retry screen on platform errors', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardLayout />
        </MemoryRouter>,
      )
    })
    const sidebar = container.querySelector('[data-testid="sidebar"]')!
    expect(sidebar.getAttribute('data-open')).toBe('false')
    await act(async () => {
      container.querySelector('button')!.click()
    })
    expect(sidebar.getAttribute('data-open')).toBe('true')
    await act(async () => root.unmount())

    storeMocks.state = { ...defaultPlatformState(), error: 'Falha ao carregar.' }
    const errorRoot = createRoot(container)
    await act(async () => {
      errorRoot.render(
        <MemoryRouter initialEntries={['/dashboard']}>
          <DashboardLayout />
        </MemoryRouter>,
      )
    })
    expect(container.textContent).toContain('Contexto da plataforma indisponível')
    expect(container.textContent).toContain('Falha ao carregar.')
    const retry = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Tentar novamente')!
    await act(async () => retry.click())
    expect(storeMocks.initializeForUser).toHaveBeenCalledWith('user-1', 'admin')
    await act(async () => errorRoot.unmount())
  })
})
