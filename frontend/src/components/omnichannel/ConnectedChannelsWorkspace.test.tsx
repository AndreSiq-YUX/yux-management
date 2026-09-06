import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { ConnectedChannelsWorkspace } from './ConnectedChannelsWorkspace'

describe('ConnectedChannelsWorkspace', () => {
  it('renders the onboarding empty state before any Meta channel is connected', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <ConnectedChannelsWorkspace
          organizationId="org-1"
          channels={[]}
          canConfigure
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          onRefreshHealth={vi.fn()}
          onSendTest={vi.fn()}
        />,
      )
    })

    const html = container.textContent || ''

    expect(html).toContain('Nenhum canal Meta conectado')
    expect(html).toContain('Conectar WhatsApp Business')
    expect(html).toContain('Conectar Instagram Direct')
    expect(html).toContain('Conectar pagina do Facebook')

    act(() => root.unmount())
    container.remove()
  })

  it('renders Meta channel cards and connection actions', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <ConnectedChannelsWorkspace
          organizationId="org-1"
          channels={[{
            id: 'conn-1',
            organizationId: 'org-1',
            channel: 'whatsapp',
            label: 'WhatsApp',
            name: 'Comercial',
            displayName: 'Comercial YUX',
            state: 'connected',
            fallbackMode: 'official',
            tokenReferenceConfigured: true,
            publicMetadata: {},
          }]}
          canConfigure
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          onRefreshHealth={vi.fn()}
          onSendTest={vi.fn()}
        />,
      )
    })

    const html = container.textContent || ''

    expect(html).toContain('Canais conectados')
    expect(html).toContain('WhatsApp')
    expect(html).toContain('Comercial YUX')
    expect(html).toContain('Conectar Instagram Direct')
    expect(html).toContain('Conectar pagina do Facebook')

    act(() => root.unmount())
    container.remove()
  })

  it('keeps channel status readable but disables changes for a read-only workspace', () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    act(() => {
      root.render(
        <ConnectedChannelsWorkspace
          organizationId="org-1"
          channels={[]}
          canConfigure={false}
          onConnect={vi.fn()}
          onDisconnect={vi.fn()}
          onRefreshHealth={vi.fn()}
          onSendTest={vi.fn()}
        />,
      )
    })

    expect(container.textContent).toContain('somente um administrador do workspace')
    expect([...container.querySelectorAll('button')].every(button => button.disabled)).toBe(true)

    act(() => root.unmount())
    container.remove()
  })
})
