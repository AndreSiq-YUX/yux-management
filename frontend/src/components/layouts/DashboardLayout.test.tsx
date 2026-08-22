import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardLayout } from './DashboardLayout'
import { resolvePlatformMode } from './platformMode'

const storeMocks = vi.hoisted(() => ({
  initializeForUser: vi.fn(async () => undefined),
  setMode: vi.fn(),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: () => ({
    user: { id: 'user-1', role: 'admin' },
  }),
}))

vi.mock('@/stores/platformStore', () => ({
  usePlatformStore: (selector: (state: Record<string, unknown>) => unknown) => selector({
    initializeForUser: storeMocks.initializeForUser,
    setMode: storeMocks.setMode,
    error: null,
    isLoading: false,
  }),
}))

vi.mock('@/components/navigation/Sidebar', () => ({ Sidebar: () => null }))
vi.mock('@/components/navigation/Header', () => ({ Header: () => null }))

describe('DashboardLayout platform context', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    storeMocks.initializeForUser.mockClear()
    storeMocks.setMode.mockClear()
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
})
