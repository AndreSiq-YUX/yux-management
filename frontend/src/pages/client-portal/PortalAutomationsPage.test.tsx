import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'

const automationPageSpy = vi.hoisted(() => vi.fn((_props: unknown) => <div>workspace-real</div>))

vi.mock('@/pages/automations/AutomationsPage', () => ({
  AutomationsPage: automationPageSpy,
}))

import { PortalAutomationsPage } from './PortalAutomationsPage'
import { usePlatformStore } from '@/stores/platformStore'

const organizationId = '00000000-0000-4000-8000-000000000001'
const workspaceContext: WorkspaceContextV1 = {
  schemaVersion: 1,
  organizationId,
  kind: 'client',
  contractId: '00000000-0000-4000-8000-000000000002',
  role: 'client_admin',
  moduleKeys: ['automations'],
  canConfigure: true,
  missionCreation: { mode: 'conversation', reasonCode: null },
}

afterEach(() => {
  document.body.innerHTML = ''
  automationPageSpy.mockClear()
})

describe('PortalAutomationsPage', () => {
  it('passes the authenticated workspace context and requested section to the real editor', () => {
    usePlatformStore.setState({ isLoading: false, error: null, workspaceContext })
    const root = createRoot(document.body.appendChild(document.createElement('div')))

    act(() => root.render(<PortalAutomationsPage section="Templates" />))

    expect(automationPageSpy.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      workspaceContext,
      initialSection: 'Templates',
    }))
    expect(document.body.textContent).toContain('workspace-real')
    act(() => root.unmount())
  })

  it('does not mount automation data access when the module is outside the workspace contract', () => {
    usePlatformStore.setState({
      isLoading: false,
      error: null,
      workspaceContext: { ...workspaceContext, moduleKeys: [] },
    })
    const root = createRoot(document.body.appendChild(document.createElement('div')))

    act(() => root.render(<PortalAutomationsPage section="Automacoes" />))

    expect(automationPageSpy).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain('Modulo nao disponivel')
    act(() => root.unmount())
  })
})
