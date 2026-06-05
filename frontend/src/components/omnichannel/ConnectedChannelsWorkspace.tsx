import { ConnectedChannelCard } from './ConnectedChannelCard'
import type { ConnectedChannelView } from '@/services/metaChannelService'
import type { MetaChannel } from '@/types/omnichannel'

const desiredChannels: Array<{ channel: MetaChannel; label: string }> = [
  { channel: 'whatsapp', label: 'WhatsApp' },
  { channel: 'instagram', label: 'Instagram' },
  { channel: 'messenger', label: 'Facebook Messenger' },
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
