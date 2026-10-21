import { ConnectedChannelCard, type ConnectionOperationStatus } from './ConnectedChannelCard'
import type { ConnectedChannelView, WhatsAppConnectionSettings } from '@/services/metaChannelService'
import type { MetaChannel } from '@/types/omnichannel'

const desiredChannels: Array<{ channel: MetaChannel; label: string; connectLabel: string; description: string }> = [
  {
    channel: 'whatsapp',
    label: 'WhatsApp Business',
    connectLabel: 'Conectar WhatsApp Business',
    description: 'Cada número oficial fica associado às suas próprias configurações e conexões.',
  },
  {
    channel: 'instagram',
    label: 'Instagram',
    connectLabel: 'Conectar Instagram Direct',
    description: 'Vincule contas profissionais do Instagram para receber e responder mensagens no omnichannel.',
  },
  {
    channel: 'messenger',
    label: 'Facebook Messenger',
    connectLabel: 'Conectar página do Facebook',
    description: 'Conecte páginas do Facebook para centralizar Messenger junto ao atendimento da equipe.',
  },
]

type SelectOption = { id: string; name: string }
type SettingsOptions = {
  assistants: SelectOption[]
  teams: SelectOption[]
  queues: SelectOption[]
}

interface ConnectedChannelsWorkspaceProps {
  organizationId: string
  channels: ConnectedChannelView[]
  canConfigure: boolean
  settingsOptions: SettingsOptions
  connectionOperations: Record<string, ConnectionOperationStatus>
  savingSettingsConnectionId: string | null
  onConnect: (channel: MetaChannel, connectionId?: string) => void
  onPrepareConnect?: (channel: MetaChannel, connectionId?: string) => void
  onDisconnect: (connectionId: string) => void
  onRefreshHealth: (connectionId: string) => void
  onSaveSettings: (connectionId: string, settings: WhatsAppConnectionSettings) => void
}

export function ConnectedChannelsWorkspace({
  organizationId,
  channels,
  canConfigure,
  settingsOptions,
  connectionOperations,
  savingSettingsConnectionId,
  onConnect,
  onPrepareConnect,
  onDisconnect,
  onRefreshHealth,
  onSaveSettings,
}: ConnectedChannelsWorkspaceProps) {
  const connectionsByChannel = new Map<string, ConnectedChannelView[]>()
  for (const connection of channels) {
    const channelConnections = connectionsByChannel.get(connection.channel) || []
    channelConnections.push(connection)
    connectionsByChannel.set(connection.channel, channelConnections)
  }

  return (
    <div className="space-y-6" data-organization-id={organizationId}>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-sm text-gray-600">Conecte e monitore os canais Meta autorizados para esta organização.</p>
      </div>

      {!canConfigure ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Você pode acompanhar os canais, mas somente um administrador do workspace pode alterar as conexões.</p> : null}

      {channels.length === 0 ? (
        <section className="rounded-lg border border-yux-100 bg-yux-50 p-4">
          <h2 className="text-base font-semibold text-gray-900">Nenhum canal Meta conectado</h2>
          <p className="mt-1 text-sm text-gray-700">
            Comece pelo WhatsApp Business ou conecte Instagram Direct e Facebook Messenger. Cada autorização abre o fluxo oficial da Meta para selecionar os ativos que serão liberados para a YUX Hub.
          </p>
        </section>
      ) : null}

      {desiredChannels.map(item => {
        const connectedChannels = connectionsByChannel.get(item.channel) || []
        return (
          <section className="space-y-3 rounded-lg border bg-gray-50 p-4" key={item.channel}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{item.label}</h2>
                <p className="mt-1 text-sm text-gray-600">{item.description}</p>
              </div>
              <button
                className="rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canConfigure}
                onClick={() => onConnect(item.channel)}
                onFocus={() => onPrepareConnect?.(item.channel)}
                onPointerEnter={() => onPrepareConnect?.(item.channel)}
                type="button"
              >
                {connectedChannels.length ? `Adicionar ${item.channel === 'whatsapp' ? 'número' : 'conta'}` : item.connectLabel}
              </button>
            </div>

            {connectedChannels.length ? (
              <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
                {connectedChannels.map(connection => (
                  <ConnectedChannelCard
                    key={connection.id}
                    channel={connection}
                    canConfigure={canConfigure}
                    connectLabel={item.connectLabel}
                    description={item.description}
                    settingsOptions={settingsOptions}
                    operation={connectionOperations[connection.id] || { pending: null, error: null }}
                    isSavingSettings={savingSettingsConnectionId === connection.id}
                    onConnect={connectionId => onConnect(item.channel, connectionId)}
                    onPrepareConnect={connectionId => onPrepareConnect?.(item.channel, connectionId)}
                    onDisconnect={() => onDisconnect(connection.id)}
                    onRefreshHealth={() => onRefreshHealth(connection.id)}
                    onSaveSettings={settings => onSaveSettings(connection.id, settings)}
                  />
                ))}
              </div>
            ) : (
              <p className="rounded-md border border-dashed bg-white p-3 text-sm text-gray-600">Nenhuma conexão deste canal nesta organização.</p>
            )}
          </section>
        )
      })}
    </div>
  )
}
