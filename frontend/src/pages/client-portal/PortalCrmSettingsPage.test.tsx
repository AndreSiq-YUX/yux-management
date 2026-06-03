import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { PortalCrmSettingsPage } from './PortalCrmSettingsPage'

describe('PortalCrmSettingsPage', () => {
  it('shows client admin CRM controls inside contracted limits', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<PortalCrmSettingsPage />)
    })

    expect(container.innerHTML).toContain('Configuracoes do CRM')
    expect(container.innerHTML).toContain('Assentos contratados')
    expect(container.innerHTML).toContain('Equipes comerciais')
    expect(container.innerHTML).toContain('Convites e papeis')
  })
})
