import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPendingFeature } from '@/lib/client-portal/pendingFeatures'
import { useAuthStore } from '@/stores/authStore'
import { usePortalBadgeStore } from '@/stores/portalBadgeStore'
import { Header } from './Header'
import { byText, click, keydown, pathname, renderAt, seedPlatform } from './testUtils'

const logout = vi.fn(async () => undefined)

const bell = (root: ParentNode) => root.querySelector('button[aria-label^="Notificações"]')!
const userButton = (root: ParentNode) => root.querySelector('button[aria-label^="Menu do usuário"]')!

describe('Header', () => {
  beforeEach(() => {
    logout.mockClear()
    seedPlatform()
    useAuthStore.setState({
      user: { id: 'u1', name: 'Mariana Costa', email: 'm@aurora.com', role: 'client' },
      logout,
    })
    usePortalBadgeStore.setState({ pendingApprovals: 0, dueInvoices: [], loadedFor: undefined })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows breadcrumbs without repeating labels', async () => {
    const { container, unmount } = await renderAt('/portal/relatorios', <Header />)

    const crumbs = container.querySelector('nav[aria-label="Trilha de navegação"]')!
    expect(crumbs.textContent).toBe('Portal do ClienteResultadosRelatórios')
    await unmount()

    const finance = await renderAt('/portal/financeiro', <Header />)
    expect(finance.container.querySelector('nav[aria-label="Trilha de navegação"]')?.textContent).toBe('Portal do ClienteFinanceiro')
    await finance.unmount()
  })

  it('has a menu button that calls the drawer opener', async () => {
    const onOpenMenu = vi.fn()
    const { container, unmount } = await renderAt('/portal', <Header onOpenMenu={onOpenMenu} />)

    const button = container.querySelector('button[aria-label="Abrir menu"]')!
    expect(button.getAttribute('aria-expanded')).toBe('false')
    await click(button)
    expect(onOpenMenu).toHaveBeenCalledTimes(1)
    await unmount()
  })

  it('shows the pending explanation when the search is used and never pretends to search', async () => {
    const { container, unmount } = await renderAt('/portal', <Header />)

    const search = byText(container, 'button', 'Buscar…Pendente')!
    expect(search).not.toBeNull()
    expect(container.querySelector('[role="status"]')).toBeNull()

    await click(search)
    expect(container.querySelector('[role="status"]')?.textContent).toBe(getPendingFeature('B11').clientMessage)
    expect(container.querySelector('input[type="search"]')).toBeNull()

    await click(search)
    expect(container.querySelector('[role="status"]')).toBeNull()
    await unmount()
  })

  it('shows no number on the bell when nothing is pending', async () => {
    const { container, unmount } = await renderAt('/portal', <Header />)

    expect(container.querySelector('[data-testid="bell-count"]')).toBeNull()
    expect(bell(container).getAttribute('aria-label')).toBe('Notificações')

    await click(bell(container))
    expect(document.body.textContent).toContain('Nada pendente agora.')
    await unmount()
  })

  it('counts approvals plus due invoices and lists them with links', async () => {
    usePortalBadgeStore.setState({
      pendingApprovals: 2,
      dueInvoices: [{ id: 'i1', label: 'Fatura 2026-014', dueDate: '2020-01-10' }],
    })
    const { container, unmount } = await renderAt('/portal', <Header />)

    expect(container.querySelector('[data-testid="bell-count"]')?.textContent).toBe('3')
    expect(bell(container).getAttribute('aria-label')).toBe('Notificações: 3 pendências')

    await click(bell(container))
    const approvals = byText(document.body, 'a', '2 aprovações aguardando você')!
    expect(approvals.getAttribute('href')).toBe('/portal/projetos/aprovacoes')
    const invoice = Array.from(document.body.querySelectorAll('a')).find(a => a.textContent?.includes('Fatura 2026-014'))!
    expect(invoice.getAttribute('href')).toBe('/portal/financeiro')
    expect(invoice.textContent).toMatch(/venceu há/)
    expect(document.body.textContent).not.toContain('Nada pendente agora.')

    await click(approvals)
    expect(pathname(document.body)).toBe('/portal/projetos/aprovacoes')
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    await unmount()
  })

  it('uses the singular form and the workspace path for the approvals link', async () => {
    seedPlatform({ mode: 'client_workspace' })
    usePortalBadgeStore.setState({ pendingApprovals: 1 })
    const { container, unmount } = await renderAt('/client-workspaces/org-1', <Header />)

    await click(bell(container))
    const link = byText(document.body, 'a', '1 aprovação aguardando você')!
    expect(link.getAttribute('href')).toBe('/client-workspaces/org-1/projetos/aprovacoes')
    await unmount()
  })

  it('opens the user menu with name, role, Minha conta and Sair', async () => {
    const { container, unmount } = await renderAt('/portal', <Header />)

    await keydown(userButton(container), 'Enter')
    const menu = document.body.querySelector('[role="menu"]')!
    expect(menu.textContent).toContain('Mariana Costa')
    expect(menu.textContent).toContain('Administrador da conta')
    expect(byText(menu, 'a', 'Minha conta')?.getAttribute('href')).toBe('/portal/configuracoes/conta')

    await click(byText(menu, '[role="menuitem"]', 'Sair'))
    expect(logout).toHaveBeenCalledTimes(1)
    await unmount()
  })

  it('does not offer Minha conta in the internal Hub', async () => {
    seedPlatform({ mode: 'internal', organization: null, role: null })
    const { container, unmount } = await renderAt('/dashboard', <Header />)

    await keydown(userButton(container), 'Enter')
    const menu = document.body.querySelector('[role="menu"]')!
    expect(byText(menu, 'a', 'Minha conta')).toBeNull()
    expect(menu.textContent).toContain('Sair')
    await act(async () => undefined)
    await unmount()
  })
})
