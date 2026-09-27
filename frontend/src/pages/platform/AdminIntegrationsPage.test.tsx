import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adminPlatformService } from '@/services/adminPlatformService'
import { AdminIntegrationsPage } from './AdminIntegrationsPage'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('AdminIntegrationsPage', () => {
  it('offers secure Serper and Brave Place credential flows with explicit paid-test warning', async () => {
    vi.spyOn(adminPlatformService, 'getProviderConnections').mockResolvedValue([])
    const root = createRoot(document.body.appendChild(document.createElement('div')))
    await act(async () => {
      root.render(<AdminIntegrationsPage />)
      await new Promise(resolve => setTimeout(resolve, 0))
    })
    expect(document.body.textContent).toContain('Serper Places')
    expect(document.body.textContent).toContain('Brave Place Search')
    expect(document.body.textContent).toContain('O teste de conexão consome uma consulta')
    root.unmount()
  })
})
