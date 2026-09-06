import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceContextV1 } from '@/types/generated/workspace'

const journeySpy = vi.hoisted(() => vi.fn((_props: unknown) => <div>jornada-real</div>))
vi.mock('@/components/marketing-studio/StudioJourney', () => ({ StudioJourney: journeySpy }))

import { PortalMarketingStudioPage } from './PortalMarketingStudioPage'
import { usePlatformStore } from '@/stores/platformStore'

const workspaceContext: WorkspaceContextV1 = {
  schemaVersion: 1,
  organizationId: '00000000-0000-4000-8000-000000000001',
  contractId: '00000000-0000-4000-8000-000000000002',
  kind: 'client',
  role: 'client_admin',
  moduleKeys: ['marketing_studio'],
  canConfigure: true,
  missionCreation: { mode: 'conversation', reasonCode: null },
}

afterEach(() => {
  document.body.innerHTML = ''
  journeySpy.mockClear()
})

describe('PortalMarketingStudioPage', () => {
  it('entrega o contexto autenticado à jornada operacional', () => {
    usePlatformStore.setState({ isLoading: false, error: null, workspaceContext })
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root.render(<PortalMarketingStudioPage />))
    expect(journeySpy).toHaveBeenCalledWith(expect.objectContaining({ workspaceContext }), {})
    expect(document.body.textContent).toContain('jornada-real')
    act(() => root.unmount())
  })

  it('não consulta a jornada quando o módulo não pertence ao contrato', () => {
    usePlatformStore.setState({ isLoading: false, error: null, workspaceContext: { ...workspaceContext, moduleKeys: [] } })
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    act(() => root.render(<PortalMarketingStudioPage />))
    expect(document.body.textContent).toContain('Módulo não disponível')
    expect(journeySpy).not.toHaveBeenCalled()
    act(() => root.unmount())
  })
})
