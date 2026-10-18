import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/services/backendAuthService', () => ({
  requestPasswordReset: vi.fn(),
}))

import { LoginPage } from './LoginPage'

afterEach(() => {
  document.body.innerHTML = ''
})

describe('LoginPage', () => {
  it('keeps "Lembrar de mim" visible but disabled and marked as pending', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    act(() => root.render(<MemoryRouter><LoginPage /></MemoryRouter>))

    const checkbox = container.querySelector<HTMLInputElement>('#remember-me')!
    expect(checkbox.disabled).toBe(true)
    expect(container.textContent).toContain('Lembrar de mim')
    expect(container.querySelector('[aria-label^="Pendente"]')).toBeTruthy()
    expect(container.textContent).toContain('Pendente')

    const describedBy = checkbox.getAttribute('aria-describedby')!
    const hint = container.querySelector(`#${describedBy}`)
    expect(hint?.textContent).toBe('Função em implantação')
    expect(hint?.className).toContain('sr-only')

    act(() => root.unmount())
  })
})
