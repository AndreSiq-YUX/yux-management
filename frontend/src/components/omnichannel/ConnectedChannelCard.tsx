import { Cable, RefreshCw, Send, Unplug } from 'lucide-react'
import type { ConnectedChannelView } from '@/services/metaChannelService'

interface ConnectedChannelCardProps {
  channel: ConnectedChannelView
  onConnect: () => void
  onDisconnect: () => void
  onRefreshHealth: () => void
  onSendTest: () => void
}

export function ConnectedChannelCard({
  channel,
  onConnect,
  onDisconnect,
  onRefreshHealth,
  onSendTest,
}: ConnectedChannelCardProps) {
  const connected = Boolean(channel.id && channel.state !== 'disconnected' && channel.state !== 'not_configured')
  const statusLabel = channel.state.replace(/_/g, ' ')

  return (
    <section className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{channel.label}</h2>
          <p className="mt-1 truncate text-sm text-gray-600">
            {channel.displayName || channel.name || 'Nenhuma conta conectada'}
          </p>
          {channel.username && <p className="mt-1 text-xs text-gray-500">@{channel.username}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{statusLabel}</span>
      </div>

      <dl className="mt-4 grid gap-2 text-xs text-gray-600">
        <div className="flex justify-between gap-3">
          <dt>Adapter</dt>
          <dd className="truncate text-gray-900">{channel.adapterKey || '-'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Fallback</dt>
          <dd className="text-gray-900">{channel.fallbackMode}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Ultima checagem</dt>
          <dd className="truncate text-gray-900">{channel.healthCheckedAt || '-'}</dd>
        </div>
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onConnect}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-yux-600 px-3 text-sm font-medium text-white hover:bg-yux-700"
        >
          <Cable className="h-4 w-4" aria-hidden="true" />
          {connected ? `Reconectar ${channel.label}` : `Conectar ${channel.label}`}
        </button>
        <button
          type="button"
          onClick={onRefreshHealth}
          disabled={!connected}
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Checar saude
        </button>
        <button
          type="button"
          onClick={onSendTest}
          disabled={!connected}
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden="true" />
          Testar
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={!connected}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Unplug className="h-4 w-4" aria-hidden="true" />
          Desconectar
        </button>
      </div>
    </section>
  )
}
