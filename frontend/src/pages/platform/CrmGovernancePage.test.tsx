import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { CrmGovernancePage } from './CrmGovernancePage'

describe('CrmGovernancePage', () => {
  it('shows contracted CRM governance controls for YUX admins', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<CrmGovernancePage />)
    })

    expect(container.innerHTML).toContain('Governanca CRM')
    expect(container.innerHTML).toContain('Instancias por contrato')
    expect(container.innerHTML).toContain('Limites de vendedores')
    expect(container.innerHTML).toContain('Blueprint setorial')
  })
})
