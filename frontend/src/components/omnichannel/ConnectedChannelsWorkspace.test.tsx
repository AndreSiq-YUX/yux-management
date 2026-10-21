import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import type { ConnectedChannelView, WhatsAppConnectionSettings } from '@/services/metaChannelService'
import type { MetaChannel } from '@/types/omnichannel'
import type { ConnectionOperationStatus } from './ConnectedChannelCard'
import { ConnectedChannelsWorkspace } from './ConnectedChannelsWorkspace'

const settingsOptions = {
  assistants: [{ id: 'assistant-1', name: 'Comercial' }],
  teams: [{ id: 'team-1', name: 'Vendas' }],
  queues: [{ id: 'queue-1', name: 'Novos contatos' }],
}

function mountWorkspace(input: {
  channels: ConnectedChannelView[]
  canConfigure?: boolean
  connectionOperations?: Record<string, ConnectionOperationStatus>
  onConnect?: (channel: MetaChannel, connectionId?: string) => void
  onDisconnect?: (connectionId: string) => void
  onSaveSettings?: (connectionId: string, settings: WhatsAppConnectionSettings) => void
}) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const onConnect = input.onConnect || ((_channel: MetaChannel, _connectionId?: string) => undefined)
  const onDisconnect = input.onDisconnect || ((_connectionId: string) => undefined)
  const onSaveSettings = input.onSaveSettings || ((_connectionId: string, _settings: WhatsAppConnectionSettings) => undefined)
  act(() => {
    root.render(
      <ConnectedChannelsWorkspace
        organizationId="org-1"
        channels={input.channels}
        canConfigure={input.canConfigure ?? true}
        settingsOptions={settingsOptions}
        connectionOperations={input.connectionOperations || {}}
        savingSettingsConnectionId={null}
        onConnect={onConnect}
        onPrepareConnect={vi.fn()}
        onDisconnect={onDisconnect}
        onRefreshHealth={vi.fn()}
        onSaveSettings={onSaveSettings}
      />,
    )
  })
  return { container, root, onConnect, onDisconnect, onSaveSettings, cleanup: () => {
    act(() => root.unmount())
    container.remove()
  } }
}

const connection = (input: { id: string; channel?: 'whatsapp' | 'instagram'; number?: string; name?: string }): ConnectedChannelView => ({
  id: input.id,
  organizationId: 'org-1',
  channel: input.channel || 'whatsapp',
  label: input.channel === 'instagram' ? 'Instagram' : 'WhatsApp Business',
  name: input.name || input.id,
  displayName: input.name || 'YUX',
  displayPhoneNumber: input.number,
  phoneNumberId: input.id,
  assistantId: input.id === 'wa-1' ? 'assistant-1' : undefined,
  state: 'connected',
  fallbackMode: 'official',
  tokenReferenceConfigured: true,
  publicMetadata: {},
})

describe('ConnectedChannelsWorkspace', () => {
  it('renders the onboarding empty state and an add action for each channel', () => {
    const view = mountWorkspace({ channels: [] })
    const html = view.container.textContent || ''

    expect(html).toContain('Nenhum canal Meta conectado')
    expect(html).toContain('Conectar WhatsApp Business')
    expect(html).toContain('Conectar Instagram Direct')
    expect(html).toContain('Conectar página do Facebook')

    view.cleanup()
  })

  it('renders two WhatsApp numbers independently alongside another Meta channel', () => {
    const onConnect = vi.fn((_channel: MetaChannel, _connectionId?: string) => undefined)
    const onSaveSettings = vi.fn((_connectionId: string, _settings: WhatsAppConnectionSettings) => undefined)
    const view = mountWorkspace({ onConnect, onSaveSettings, channels: [
      connection({ id: 'wa-1', number: '+55 43 99917-3440', name: 'YUX Comercial' }),
      connection({ id: 'wa-2', number: '+55 43 99917-3441', name: 'YUX Suporte' }),
      connection({ id: 'ig-1', channel: 'instagram', name: '@yux' }),
    ] })

    expect(view.container.querySelectorAll('[data-connection-id]')).toHaveLength(3)
    expect(view.container.textContent).toContain('+55 43 99917-3440')
    expect(view.container.textContent).toContain('+55 43 99917-3441')
    expect(view.container.textContent).toContain('YUX Comercial')
    expect(view.container.textContent).toContain('YUX Suporte')
    const addNumberButton = [...view.container.querySelectorAll('button')].find(button => button.textContent === 'Adicionar número')
    expect(addNumberButton).toBeTruthy()
    if (addNumberButton) act(() => addNumberButton.click())
    expect(onConnect).toHaveBeenCalledWith('whatsapp')

    const forms = view.container.querySelectorAll('form')
    expect(forms).toHaveLength(2)
    const assistantSelect = forms[0]?.querySelector<HTMLSelectElement>('select[name="assistantId"]')
    expect(assistantSelect?.value).toBe('assistant-1')
    if (assistantSelect) assistantSelect.value = 'assistant-1'
    const form = forms[0]
    if (form) act(() => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
    expect(onSaveSettings).toHaveBeenCalledWith('wa-1', {
      assistantId: 'assistant-1',
      teamId: null,
      queueId: null,
      responseModeOverride: null,
    })

    view.cleanup()
  })

  it('keeps connections readable while disabling changes in a read-only workspace', () => {
    const view = mountWorkspace({ channels: [connection({ id: 'wa-1', number: '+55 43 99917-3440' })], canConfigure: false })

    expect(view.container.textContent).toContain('somente um administrador do workspace')
    expect([...view.container.querySelectorAll('button')].every(button => button.disabled)).toBe(true)
    expect([...view.container.querySelectorAll('select')].every(select => select.disabled)).toBe(true)

    view.cleanup()
  })

  it('routes a disconnect action to only the selected WhatsApp connection', () => {
    const onDisconnect = vi.fn((_connectionId: string) => undefined)
    const view = mountWorkspace({ channels: [
      connection({ id: 'wa-1', number: '+55 43 99917-3440' }),
      connection({ id: 'wa-2', number: '+55 43 99917-3441' }),
    ], onDisconnect })
    const selectedCard = view.container.querySelector('[data-connection-id="wa-2"]')
    const disconnectButton = [...(selectedCard?.querySelectorAll('button') || [])].find(button => button.textContent === 'Desconectar')

    expect(disconnectButton).toBeTruthy()
    if (disconnectButton) act(() => disconnectButton.click())
    expect(onDisconnect).toHaveBeenCalledExactlyOnceWith('wa-2')
    expect(view.container.querySelectorAll('[data-connection-id]')).toHaveLength(2)

    view.cleanup()
  })

  it('targets the selected number when reconnecting instead of starting an untargeted signup', () => {
    const onConnect = vi.fn((_channel: MetaChannel, _connectionId?: string) => undefined)
    const view = mountWorkspace({
      channels: [connection({ id: 'wa-1' }), connection({ id: 'wa-2' })],
      onConnect,
    })
    const selectedCard = view.container.querySelector('[data-connection-id="wa-2"]')
    const reconnectButton = [...(selectedCard?.querySelectorAll('button') || [])].find(button => button.textContent?.includes('Reconectar'))

    expect(reconnectButton).toBeTruthy()
    if (reconnectButton) act(() => reconnectButton.click())
    expect(onConnect).toHaveBeenCalledExactlyOnceWith('whatsapp', 'wa-2')

    view.cleanup()
  })

  it('shows pending and failed per-connection checks without blocking another number', () => {
    const view = mountWorkspace({
      channels: [connection({ id: 'wa-1' }), connection({ id: 'wa-2' })],
      connectionOperations: {
        'wa-1': { pending: 'health', error: null },
        'wa-2': { pending: null, error: 'Não foi possível verificar esta conexão. Tente novamente.' },
      },
    })
    const firstCard = view.container.querySelector('[data-connection-id="wa-1"]')
    const secondCard = view.container.querySelector('[data-connection-id="wa-2"]')

    expect(firstCard?.textContent).toContain('Verificando credencial…')
    expect(firstCard?.querySelector('button[disabled]')).toBeTruthy()
    expect(secondCard?.querySelector('[role="alert"]')?.textContent).toContain('Não foi possível verificar')
    expect(secondCard?.querySelector('button:not([disabled])')).toBeTruthy()

    view.cleanup()
  })
})
