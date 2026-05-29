import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { ModuleSurfacePage } from './ModuleSurfacePage'
import { usePlatformStore } from '@/stores/platformStore'
import type { ContractDetails } from '@/types/platform'

const activeContract: ContractDetails = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  status: 'active',
  name: 'Contrato ativo',
  startsAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  package: null,
  modules: [],
}

function renderPage(pathname: string, moduleKey = 'finance') {
  const container = document.createElement('div')
  const root = createRoot(container)

  act(() => {
    root.render(
      <MemoryRouter initialEntries={[pathname]}>
        <ModuleSurfacePage moduleKey={moduleKey} />
      </MemoryRouter>,
    )
  })

  const html = container.innerHTML

  act(() => {
    root.unmount()
  })

  return html
}

describe('ModuleSurfacePage', () => {
  it('blocks portal module routes without an active contract', () => {
    usePlatformStore.setState({
      isLoading: false,
      activeContract: null,
      enabledModuleKeys: ['finance'],
    })

    const html = renderPage('/portal/finance')

    expect(html).toContain('Nenhum contrato ativo encontrado para este usuario.')
    expect(html).not.toContain('Este modulo esta habilitado no contrato')
  })

  it('blocks portal module routes when the module is not enabled by contract', () => {
    usePlatformStore.setState({
      isLoading: false,
      activeContract,
      enabledModuleKeys: ['projects'],
    })

    const html = renderPage('/portal/finance')

    expect(html).toContain('Modulo nao habilitado neste contrato.')
    expect(html).not.toContain('Este modulo esta habilitado no contrato')
  })

  it('keeps internal module routes independent from portal contract state', () => {
    usePlatformStore.setState({
      isLoading: false,
      activeContract: null,
      enabledModuleKeys: [],
    })

    const html = renderPage('/finance')

    expect(html).toContain('Superficie operacional do YUX OS.')
    expect(html).toContain('Sem registros operacionais neste modulo.')
  })
})
