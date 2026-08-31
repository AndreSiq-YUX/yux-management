import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PortalMissionDetailPage } from './PortalMissionDetailPage'

const platformState = {
  organization: { id: 'org-1' },
  role: {
    key: 'client_member',
    name: 'Cliente leitura',
    scope: 'client',
    permissions: ['action_engine.read'],
  },
}

const authState = { user: { role: 'admin' } }

vi.mock('@/stores/platformStore', () => ({
  usePlatformStore: (selector: (state: typeof platformState) => unknown) => selector(platformState),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState),
}))

vi.mock('@/hooks/usePortalWorkspacePath', () => ({
  usePortalWorkspacePath: () => (href = '/portal') => href,
}))

vi.mock('@/components/action-engine/MissionDetailWorkspace', () => ({
  MissionDetailWorkspace: ({ canWrite }: { canWrite: boolean }) => <p>{canWrite ? 'can-write' : 'read-only'}</p>,
}))

describe('PortalMissionDetailPage', () => {
  it('preserves YUX admin write access inside a read-only client workspace', () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => {
      root.render(
        <MemoryRouter initialEntries={['/portal/missoes/mission-1']}>
          <Routes>
            <Route path="/portal/missoes/:missionId" element={<PortalMissionDetailPage />} />
          </Routes>
        </MemoryRouter>,
      )
    })

    expect(container.textContent).toContain('can-write')
    act(() => root.unmount())
  })
})
