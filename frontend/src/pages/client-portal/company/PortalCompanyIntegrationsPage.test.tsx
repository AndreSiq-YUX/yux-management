import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from '@/components/portal-ui/__tests__/render'
import { usePlatformStore } from '@/stores/platformStore'

const context = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/hooks/usePortalMarketingContext', () => ({ usePortalMarketingContext: () => context.value }))

import { PortalCompanyIntegrationsPage } from './PortalCompanyIntegrationsPage'

afterEach(() => {
  document.body.innerHTML = ''
  usePlatformStore.setState({ enabledModuleKeys: [] })
})

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString()

describe('PortalCompanyIntegrationsPage', () => {
  it('mostra um cartão por conexão real, com status, última verificação e link para o módulo', async () => {
    usePlatformStore.setState({ enabledModuleKeys: ['whatsapp_ai', 'campaigns', 'marketing_studio'] })
    context.value = {
      loading: false,
      error: null,
      campaigns: [{ id: 'c1', provider: 'meta', updatedAt: hoursAgo(5) }],
      publishingConnections: [
        { id: 'p1', name: 'Blog da empresa', provider: 'wordpress', status: 'connected', lastVerifiedAt: hoursAgo(2) },
        { id: 'p2', name: 'Instagram', provider: 'meta_instagram', status: 'needs_reauth' },
      ],
    }
    const { container, unmount } = await render(<PortalCompanyIntegrationsPage />)
    expect(container.querySelector('h1')?.textContent).toBe('Conexões')
    expect(container.querySelectorAll('article')).toHaveLength(4)
    expect(container.textContent).toContain('Blog da empresa')
    expect(container.textContent).toContain('Conectado')
    expect(container.textContent).toContain('Última verificação há 2 h')
    expect(container.textContent).toContain('Reconexão necessária')
    expect(container.textContent).toContain('Ainda não verificada')
    expect(container.textContent).toContain('Meta Ads')

    const hrefs = Array.from(container.querySelectorAll('article a')).map(link => link.getAttribute('href'))
    expect(hrefs).toContain('/portal/marketing/studio')
    expect(hrefs).toContain('/portal/marketing/campanhas')
    expect(hrefs).toContain('/portal/atendimento/canais')

    expect(container.textContent).not.toContain('não contratado')
    expect(container.textContent).not.toContain('Google Sheets')
    expect(container.textContent).not.toContain('webhooks')
    await unmount()
  })

  it('sem conexões nem módulos mostra estado vazio, sem listar o que não foi contratado', async () => {
    usePlatformStore.setState({ enabledModuleKeys: [] })
    context.value = { loading: false, error: null, campaigns: [], publishingConnections: [] }
    const { container, unmount } = await render(<PortalCompanyIntegrationsPage />)
    expect(container.textContent).toContain('Nenhuma conexão por aqui ainda')
    expect(container.querySelectorAll('article')).toHaveLength(0)
    expect(container.textContent).not.toContain('Canais de atendimento')
    await unmount()
  })
})
