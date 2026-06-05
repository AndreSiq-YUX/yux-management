import { ConnectedChannelCard } from './ConnectedChannelCard'
import type { ConnectedChannelView } from '@/services/metaChannelService'
import type { MetaChannel } from '@/types/omnichannel'

const desiredChannels: Array<{ channel: MetaChannel; label: string; connectLabel: string; description: string }> = [
  {
    channel: 'whatsapp',
    label: 'WhatsApp',
    connectLabel: 'Conectar WhatsApp Business',
    description: 'Autorize numeros oficiais da WhatsApp Business Platform para atendimento, IA e handoff.',
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
    connectLabel: 'Conectar pagina do Facebook',
    description: 'Conecte paginas do Facebook para centralizar Messenger junto ao atendimento da equipe.',
  },
]

interface ConnectedChannelsWorkspaceProps {
  organizationId: string
  channels: ConnectedChannelView[]
  onConnect: (channel: MetaChannel) => void
  onDisconnect: (connectionId: string) => void
  onRefreshHealth: (connectionId: string) => void
  onSendTest: (connectionId: string) => void
}

export function ConnectedChannelsWorkspace({
  organizationId,
  channels,
  onConnect,
  onDisconnect,
  onRefreshHealth,
  onSendTest,
}: ConnectedChannelsWorkspaceProps) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Canais conectados</h1>
        <p className="text-sm text-gray-600">Conecte e monitore os canais Meta autorizados para esta organizacao.</p>
      </div>

      {channels.length === 0 && (
        <section className="rounded-lg border border-yux-100 bg-yux-50 p-4">
          <h2 className="text-base font-semibold text-gray-900">Nenhum canal Meta conectado</h2>
          <p className="mt-1 text-sm text-gray-700">
            Comece pelo WhatsApp Business ou conecte Instagram Direct e Facebook Messenger. Cada autorizacao abre o fluxo oficial da Meta para o cliente selecionar os ativos que deseja liberar para a YUX Hub.
          </p>
        </section>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {desiredChannels.map(item => {
          const connectedChannel = channels.find(connection => connection.channel === item.channel)
          const channel = connectedChannel || {
            id: '',
            organizationId,
            channel: item.channel,
            label: item.label,
            name: item.label,
            state: 'not_configured' as const,
            fallbackMode: 'official' as const,
            tokenReferenceConfigured: false,
            publicMetadata: {},
          }

          return (
            <ConnectedChannelCard
              key={item.channel}
              channel={channel}
              connectLabel={item.connectLabel}
              description={item.description}
              onConnect={() => onConnect(item.channel)}
              onDisconnect={() => connectedChannel?.id && onDisconnect(connectedChannel.id)}
              onRefreshHealth={() => connectedChannel?.id && onRefreshHealth(connectedChannel.id)}
              onSendTest={() => connectedChannel?.id && onSendTest(connectedChannel.id)}
            />
          )
        })}
      </div>
    </div>
  )
}
