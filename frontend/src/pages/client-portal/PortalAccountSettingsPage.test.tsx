import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { byText, click, flush, render } from '@/components/portal-ui/__tests__/render'
import { PortalAccountSettingsPage } from './PortalAccountSettingsPage'
import * as backendAuthService from '@/services/backendAuthService'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'

const logout = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'user-1', name: 'Ana Souza', email: 'ana@empresa.com', role: 'client' },
    logout,
  })
  usePlatformStore.setState({ role: { key: 'client_admin', name: 'Admin', scope: 'client', permissions: [] } as never })
  vi.spyOn(toast, 'success').mockImplementation(() => '')
  vi.spyOn(toast, 'error').mockImplementation(() => '')
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  logout.mockClear()
})

describe('PortalAccountSettingsPage', () => {
  it('shows the user data with a friendly role and the pending blocks (B7)', async () => {
    const { container, unmount } = await render(<PortalAccountSettingsPage />)
    const text = container.textContent ?? ''

    expect(container.querySelector('h1')?.textContent).toBe('Minha conta')
    expect(text).toContain('Ana Souza')
    expect(text).toContain('ana@empresa.com')
    expect(text).toContain('Administrador da conta')
    expect(text).not.toContain('client_admin')
    expect(text).toContain('Notificações')
    expect(text).toContain('Sessões ativas')
    expect(container.querySelectorAll('[aria-label^="Pendente: Notificações e sessões"]')).toHaveLength(2)
    expect(text).not.toContain('Escopo desta area')
    await unmount()
  })

  it('requests a password reset for the user e-mail and confirms with a toast', async () => {
    const reset = vi.spyOn(backendAuthService, 'requestPasswordReset').mockResolvedValue({ ok: true })
    const { container, unmount } = await render(<PortalAccountSettingsPage />)

    await click(byText(container, 'button', 'Redefinir senha'))
    await flush()

    expect(reset).toHaveBeenCalledWith('ana@empresa.com')
    expect(toast.success).toHaveBeenCalledWith('Enviamos um link para o seu e-mail.')
    await unmount()
  })

  it('does not confirm when the reset request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(backendAuthService, 'requestPasswordReset').mockRejectedValue(new Error('offline'))
    const { container, unmount } = await render(<PortalAccountSettingsPage />)

    await click(byText(container, 'button', 'Redefinir senha'))
    await flush()

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalled()
    await unmount()
  })

  it('logs out with "Sair"', async () => {
    const { container, unmount } = await render(<PortalAccountSettingsPage />)

    await click(byText(container, 'button', 'Sair'))

    expect(logout).toHaveBeenCalledTimes(1)
    await unmount()
  })
})
