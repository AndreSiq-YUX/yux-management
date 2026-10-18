import { useState } from 'react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { usePortalBadgeStore } from '@/stores/portalBadgeStore'
import { Sidebar } from './Sidebar'
import { byText, click, keydown, pathname, renderAt, seedPlatform } from './testUtils'

function SidebarWithDrawer() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>abrir menu</button>
      <Sidebar mobileOpen={open} onMobileOpenChange={setOpen} />
    </>
  )
}

const currentLinks = (root: ParentNode) =>
  Array.from(root.querySelectorAll('a[aria-current="page"]')).map(link => link.textContent?.replace(/\s+/g, ' ').trim())

describe('Sidebar', () => {
  beforeEach(() => {
    window.localStorage.clear()
    seedPlatform()
    usePortalBadgeStore.setState({ pendingApprovals: 0, dueInvoices: [], loadedFor: undefined })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('marks only the current page, never the root item on sub-routes', async () => {
    const { container, unmount } = await renderAt('/portal/comercial/leads', <Sidebar />)

    expect(currentLinks(container)).toEqual(['Leads'])
    expect(byText(container, 'a', 'Visão geral')?.getAttribute('aria-current')).toBeNull()
    await unmount()

    const root = await renderAt('/portal', <Sidebar />)
    expect(currentLinks(root.container)).toEqual(['Visão geral'])
    await root.unmount()
  })

  it('keeps the parent item active on child routes', async () => {
    seedPlatform({ enabledModuleKeys: ['action_engine'] })
    const { container, unmount } = await renderAt('/portal/missoes/conversas/abc', <Sidebar />)

    expect(currentLinks(container)).toEqual(['Missões'])
    await unmount()
  })

  it('renders the organization card, the plan name and the footer links', async () => {
    seedPlatform({ activeContract: { id: 'c1', package: { name: 'Growth Comercial' } } })
    const { container, unmount } = await renderAt('/portal', <Sidebar />)

    expect(container.textContent).toContain('Clínica Aurora')
    expect(container.textContent).toContain('Growth Comercial')
    const footerLabels = Array.from(container.querySelectorAll('ul')).pop()?.textContent
    expect(footerLabels).toContain('Financeiro')
    expect(footerLabels).toContain('Ajuda e suporte')
    expect(footerLabels).toContain('Minha conta')
    expect(container.textContent).not.toContain('Configuracoes')
    await unmount()
  })

  it('shows the approvals count from the badge store', async () => {
    usePortalBadgeStore.setState({ pendingApprovals: 3 })
    const { container, unmount } = await renderAt('/portal', <Sidebar />)

    const link = Array.from(container.querySelectorAll('a')).find(a => a.textContent?.startsWith('Aprovações'))
    expect(link?.textContent).toContain('3')
    expect(link?.textContent).toContain('pendentes')
    await unmount()

    usePortalBadgeStore.setState({ pendingApprovals: 0 })
    const empty = await renderAt('/portal', <Sidebar />)
    const plain = Array.from(empty.container.querySelectorAll('a')).find(a => a.textContent?.startsWith('Aprovações'))
    expect(plain?.textContent).toBe('Aprovações')
    await empty.unmount()
  })

  it('collapses a group, remembers it, and never collapses the group of the current page', async () => {
    const first = await renderAt('/portal', <Sidebar />)
    const marketing = byText(first.container, 'button', 'Marketing')!
    expect(marketing.getAttribute('aria-expanded')).toBe('true')
    expect(byText(first.container, 'a', 'Marketing Studio')).not.toBeNull()

    await click(marketing)
    expect(marketing.getAttribute('aria-expanded')).toBe('false')
    expect(byText(first.container, 'a', 'Marketing Studio')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('yux-portal-nav-collapsed-groups') || '[]')).toEqual(['Marketing'])

    // O grupo da página atual (Início) ignora o clique.
    await click(byText(first.container, 'button', 'Início'))
    expect(byText(first.container, 'button', 'Início')?.getAttribute('aria-expanded')).toBe('true')
    await first.unmount()

    const second = await renderAt('/portal', <Sidebar />)
    expect(byText(second.container, 'button', 'Marketing')?.getAttribute('aria-expanded')).toBe('false')
    await second.unmount()

    // Ao abrir uma página do grupo recolhido, ele reaparece.
    const third = await renderAt('/portal/marketing/studio', <Sidebar />)
    expect(byText(third.container, 'button', 'Marketing')?.getAttribute('aria-expanded')).toBe('true')
    expect(currentLinks(third.container)).toEqual(['Marketing Studio'])
    await third.unmount()
  })

  it('works without localStorage', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')!
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get: () => {
        throw new Error('bloqueado')
      },
    })
    try {
      const { container, unmount } = await renderAt('/portal', <Sidebar />)
      await click(byText(container, 'button', 'Marketing'))
      expect(byText(container, 'button', 'Marketing')?.getAttribute('aria-expanded')).toBe('false')
      await unmount()
    } finally {
      Object.defineProperty(window, 'localStorage', original)
    }
  })

  it('offers to switch client in the assisted workspace and shows the Hub card internally', async () => {
    seedPlatform({ mode: 'client_workspace' })
    const workspace = await renderAt('/client-workspaces/org-1/comercial/leads', <Sidebar />)
    expect(byText(workspace.container, 'a', 'Trocar cliente')?.getAttribute('href')).toBe('/client-workspaces')
    expect(byText(workspace.container, 'a', 'Leads')?.getAttribute('href')).toBe('/client-workspaces/org-1/comercial/leads')
    expect(currentLinks(workspace.container)).toEqual(['Leads'])
    await workspace.unmount()

    seedPlatform({ mode: 'internal', organization: null })
    const hub = await renderAt('/dashboard', <Sidebar />)
    expect(hub.container.textContent).toContain('YUX Hub')
    expect(byText(hub.container, 'a', 'Trocar cliente')).toBeNull()
    expect(currentLinks(hub.container)).toEqual(['Dashboard'])
    await hub.unmount()
  })

  describe('mobile drawer', () => {
    it('opens as a labelled dialog, closes with Esc and with the close button', async () => {
      const { container, unmount } = await renderAt('/portal', <SidebarWithDrawer />)
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await click(byText(container, 'button', 'abrir menu'))
      const dialog = document.querySelector('[role="dialog"]')!
      expect(dialog.getAttribute('aria-label')).toBe('Menu principal')
      expect(dialog.textContent).toContain('Marketing')

      await keydown(document, 'Escape')
      expect(document.querySelector('[role="dialog"]')).toBeNull()

      await click(byText(container, 'button', 'abrir menu'))
      await click(document.querySelector('[aria-label="Fechar menu"]'))
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      await unmount()
    })

    it('closes when a menu link is followed', async () => {
      const { container, unmount } = await renderAt('/portal', <SidebarWithDrawer />)

      await click(byText(container, 'button', 'abrir menu'))
      const dialog = document.querySelector('[role="dialog"]')!
      await click(byText(dialog, 'a', 'Leads'))

      expect(pathname(document.body)).toBe('/portal/comercial/leads')
      expect(document.querySelector('[role="dialog"]')).toBeNull()
      await unmount()
    })

    it('closes when the scrim is pressed', async () => {
      const { container, unmount } = await renderAt('/portal', <SidebarWithDrawer />)

      await click(byText(container, 'button', 'abrir menu'))
      const dialog = document.querySelector('[role="dialog"]')!
      const scrim = document.querySelector('[data-state="open"].inset-0')!
      expect(scrim).not.toBe(dialog)
      // O Radix só passa a ouvir toques fora do painel depois de um tick.
      await act(async () => {
        await new Promise(resolve => setTimeout(resolve, 10))
      })
      await act(async () => {
        scrim.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        ;(scrim as HTMLElement).click()
      })

      expect(document.querySelector('[role="dialog"]')).toBeNull()
      await unmount()
    })
  })
})
