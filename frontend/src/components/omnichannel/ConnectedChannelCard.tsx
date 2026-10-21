import { useState, type FormEvent } from 'react'
import { Cable, RefreshCw, Unplug } from 'lucide-react'
import type { ConnectedChannelView, WhatsAppConnectionSettings } from '@/services/metaChannelService'
import { WhatsAppTestSendForm } from './WhatsAppTestSendForm'

type SettingsOptions = {
  assistants: Array<{ id: string; name: string }>
  teams: Array<{ id: string; name: string }>
  queues: Array<{ id: string; name: string }>
}

export type ConnectionOperationStatus = {
  pending: 'health' | 'disconnect' | null
  error: string | null
}

interface ConnectedChannelCardProps {
  channel: ConnectedChannelView
  canConfigure: boolean
  connectLabel: string
  description: string
  settingsOptions: SettingsOptions
  operation: ConnectionOperationStatus
  onConnect: (connectionId?: string) => void
  onPrepareConnect?: (connectionId?: string) => void
  onDisconnect: () => void
  onRefreshHealth: () => void
  onSaveSettings: (settings: WhatsAppConnectionSettings) => void
  isSavingSettings: boolean
}

const connectionStateLabels: Record<string, string> = {
  connected: 'Conectado',
  disconnected: 'Desconectado',
  not_configured: 'Nao configurado',
  needs_reauth: 'Reconectar',
  stale: 'Sem sincronizacao recente',
  failed: 'Com erro',
}

const responseModeLabels: Record<string, string> = {
  automatic: 'Automático',
  assisted: 'Assistido',
  manual: 'Manual',
}

export function ConnectedChannelCard({
  channel,
  canConfigure,
  connectLabel,
  description,
  settingsOptions,
  operation,
  onConnect,
  onPrepareConnect,
  onDisconnect,
  onRefreshHealth,
  onSaveSettings,
  isSavingSettings,
}: ConnectedChannelCardProps) {
  const [showTest, setShowTest] = useState(false)
  const connected = Boolean(channel.id && channel.state !== 'disconnected' && channel.state !== 'not_configured')
  const statusLabel = connectionStateLabels[channel.state] || channel.state.replace(/_/g, ' ')
  const phoneNumber = channel.displayPhoneNumber || channel.phoneNumberId
  const displayName = channel.displayName && channel.displayName !== phoneNumber
    ? channel.displayName
    : channel.channel === 'whatsapp' ? '' : channel.displayName || channel.name
  const healthCheckedAt = channel.healthCheckedAt
    ? new Date(channel.healthCheckedAt)
    : null
  const healthCheckedLabel = healthCheckedAt && !Number.isNaN(healthCheckedAt.getTime())
    ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(healthCheckedAt)
    : channel.healthCheckedAt || 'Ainda não verificado'

  function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const responseMode = formData.get('responseModeOverride')
    onSaveSettings({
      assistantId: String(formData.get('assistantId') || '') || null,
      teamId: String(formData.get('teamId') || '') || null,
      queueId: String(formData.get('queueId') || '') || null,
      responseModeOverride: responseMode === 'automatic' || responseMode === 'assisted' || responseMode === 'manual'
        ? responseMode
        : null,
    })
  }

  return (
    <section className="rounded-lg border bg-white p-4" data-connection-id={channel.id || undefined}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">{channel.label}</h2>
          {displayName ? <p className="mt-1 truncate text-sm text-gray-600">{displayName}</p> : null}
          {phoneNumber ? <p className="mt-1 text-sm font-medium text-gray-800">Número: {phoneNumber}</p> : null}
          <p className="mt-2 text-sm text-gray-600">{description}</p>
          {channel.username && <p className="mt-1 text-xs text-gray-500">@{channel.username}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600">{statusLabel}</span>
      </div>

      <dl className="mt-4 grid gap-2 text-xs text-gray-600">
        <div className="flex justify-between gap-3">
          <dt>Agente</dt>
          <dd className="truncate text-gray-900">{settingsOptions.assistants.find(option => option.id === channel.assistantId)?.name || 'Padrão da organização'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Equipe / fila</dt>
          <dd className="truncate text-gray-900">
            {[settingsOptions.teams.find(option => option.id === channel.teamId)?.name, settingsOptions.queues.find(option => option.id === channel.queueId)?.name].filter(Boolean).join(' / ') || 'Padrão da organização'}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Modo</dt>
          <dd className="text-gray-900">{channel.responseModeOverride ? responseModeLabels[channel.responseModeOverride] : 'Padrão da organização'}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt>Última verificação</dt>
          <dd className="truncate text-gray-900">{healthCheckedLabel}</dd>
        </div>
      </dl>

      {operation.error ? <p className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700" role="alert">{operation.error}</p> : null}
      {channel.healthSummary ? <p className="mt-3 text-sm text-gray-600">{channel.healthSummary}</p> : null}

      {channel.channel === 'whatsapp' && channel.id ? (
        <form
          key={`${channel.id}:${channel.assistantId || ''}:${channel.teamId || ''}:${channel.queueId || ''}:${channel.responseModeOverride || ''}`}
          className="mt-4 space-y-3 border-t pt-4"
          onSubmit={saveSettings}
        >
          <h3 className="text-sm font-semibold text-gray-800">Configurações deste número</h3>
          <label className="block text-xs font-medium text-gray-700">
            Agente
            <select className="mt-1 w-full rounded-md border px-2 py-2 text-sm" defaultValue={channel.assistantId || ''} disabled={!canConfigure || Boolean(operation.pending)} name="assistantId">
              <option value="">Padrão da organização</option>
              {settingsOptions.assistants.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-medium text-gray-700">
              Equipe
              <select className="mt-1 w-full rounded-md border px-2 py-2 text-sm" defaultValue={channel.teamId || ''} disabled={!canConfigure || Boolean(operation.pending)} name="teamId">
                <option value="">Padrão da organização</option>
                {settingsOptions.teams.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
            <label className="block text-xs font-medium text-gray-700">
              Fila
              <select className="mt-1 w-full rounded-md border px-2 py-2 text-sm" defaultValue={channel.queueId || ''} disabled={!canConfigure || Boolean(operation.pending)} name="queueId">
                <option value="">Padrão da organização</option>
                {settingsOptions.queues.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-xs font-medium text-gray-700">
            Modo de resposta
            <select className="mt-1 w-full rounded-md border px-2 py-2 text-sm" defaultValue={channel.responseModeOverride || ''} disabled={!canConfigure || Boolean(operation.pending)} name="responseModeOverride">
              <option value="">Padrão da organização</option>
              <option value="manual">Manual</option>
              <option value="assisted">Assistido</option>
              <option value="automatic">Automático</option>
            </select>
          </label>
          <p className="text-xs text-gray-500">O modo fica salvo por número; sua aplicação ao processamento automático será ativada na etapa de automação.</p>
          <button className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={!canConfigure || isSavingSettings || Boolean(operation.pending)} type="submit">
            {isSavingSettings ? 'Salvando…' : 'Salvar configurações'}
          </button>
        </form>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onConnect(channel.channel === 'whatsapp' ? channel.id : undefined)}
          onPointerEnter={() => onPrepareConnect?.(channel.channel === 'whatsapp' ? channel.id : undefined)}
          onFocus={() => onPrepareConnect?.(channel.channel === 'whatsapp' ? channel.id : undefined)}
          disabled={!canConfigure || Boolean(operation.pending)}
          className="inline-flex h-9 items-center gap-2 rounded-md bg-yux-600 px-3 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Cable className="h-4 w-4" aria-hidden="true" />
          {connected ? `Reconectar ${channel.label}` : connectLabel}
        </button>
        <button
          type="button"
          onClick={onRefreshHealth}
          disabled={!canConfigure || !connected || Boolean(operation.pending)}
          className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          {operation.pending === 'health' ? 'Verificando credencial…' : 'Verificar credencial'}
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          disabled={!canConfigure || !connected || Boolean(operation.pending)}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-red-200 px-3 text-sm text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Unplug className="h-4 w-4" aria-hidden="true" />
          {operation.pending === 'disconnect' ? 'Desconectando…' : 'Desconectar'}
        </button>
        {channel.channel === 'whatsapp' && canConfigure ? <button className="rounded-md border px-3 py-2 text-sm disabled:opacity-50" disabled={channel.state !== 'connected' || Boolean(operation.pending)} onClick={() => setShowTest(value => !value)} type="button">{showTest ? 'Fechar teste' : 'Enviar mensagem de teste'}</button> : null}
      </div>
      {showTest && channel.channel === 'whatsapp' && channel.state === 'connected' && canConfigure ? <WhatsAppTestSendForm connectionId={channel.id} senderNumber={phoneNumber || channel.name} /> : null}
    </section>
  )
}
