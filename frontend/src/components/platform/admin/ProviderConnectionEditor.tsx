import { useMemo, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import { AdminStatusBadge } from '@/components/platform/admin/AdminStatusBadge'
import type { PlatformProviderConnectionInput } from '@/services/adminPlatformService'
import type { PlatformProviderConnection, PlatformProviderStatus, PlatformProviderType } from '@/types/adminPlatform'

const providerStatuses: PlatformProviderStatus[] = [
  'not_configured',
  'active',
  'degraded',
  'failed',
  'disabled',
  'needs_reauth',
  'stale',
]

const providerTypes: PlatformProviderType[] = [
  'llm',
  'email',
  'whatsapp',
  'ads',
  'webhook',
  'automation',
  'storage',
  'database',
  'internal_service',
]

function stringifyConfig(value: Record<string, unknown>) {
  return JSON.stringify(value, null, 2)
}

export function ProviderConnectionEditor({
  title,
  description,
  provider,
  defaults,
  fallbackProviders = [],
  onSave,
}: {
  title: string
  description: string
  provider?: PlatformProviderConnection
  defaults: PlatformProviderConnectionInput
  fallbackProviders?: PlatformProviderConnection[]
  onSave: (input: PlatformProviderConnectionInput) => Promise<void>
}) {
  const initialConfig = useMemo(
    () => stringifyConfig(provider?.publicConfig || defaults.publicConfig || {}),
    [defaults.publicConfig, provider?.publicConfig],
  )
  const [providerType, setProviderType] = useState<PlatformProviderType>(provider?.providerType || defaults.providerType)
  const [providerKey, setProviderKey] = useState(provider?.providerKey || defaults.providerKey)
  const [displayName, setDisplayName] = useState(provider?.displayName || defaults.displayName)
  const [environment, setEnvironment] = useState(provider?.environment || defaults.environment || 'production')
  const [status, setStatus] = useState<PlatformProviderStatus>(provider?.status || defaults.status || 'not_configured')
  const [secretReference, setSecretReference] = useState(provider?.secretReference || defaults.secretReference || '')
  const [isDefault, setIsDefault] = useState(provider?.isDefault ?? Boolean(defaults.isDefault))
  const [fallbackProviderId, setFallbackProviderId] = useState(provider?.fallbackProviderId || defaults.fallbackProviderId || '')
  const [publicConfig, setPublicConfig] = useState(initialConfig)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      const parsedConfig = JSON.parse(publicConfig) as Record<string, unknown>
      await onSave({
        id: provider?.id,
        providerType,
        providerKey,
        displayName,
        environment,
        status,
        secretReference,
        isDefault,
        fallbackProviderId: fallbackProviderId || null,
        publicConfig: parsedConfig,
      })
      setSaved(true)
    } catch (error) {
      setError(error instanceof SyntaxError ? 'JSON de configuracao invalido.' : 'Nao foi possivel salvar o provedor.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <p className="mt-1 text-sm text-gray-600">{description}</p>
        </div>
        <AdminStatusBadge status={status} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Tipo</span>
          <select
            value={providerType}
            onChange={event => setProviderType(event.target.value as PlatformProviderType)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {providerTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Chave do provedor</span>
          <input
            value={providerKey}
            onChange={event => setProviderKey(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Nome comercial</span>
          <input
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Ambiente</span>
          <input
            value={environment}
            onChange={event => setEnvironment(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Status</span>
          <select
            value={status}
            onChange={event => setStatus(event.target.value as PlatformProviderStatus)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {providerStatuses.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Referencia do segredo</span>
          <input
            value={secretReference}
            onChange={event => setSecretReference(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            placeholder={defaults.secretReference || 'PROVIDER_API_KEY'}
          />
        </label>

        <label className="space-y-1 text-sm lg:col-span-2">
          <span className="font-medium text-gray-700">Fallback externo</span>
          <select
            value={fallbackProviderId}
            onChange={event => setFallbackProviderId(event.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            <option value="">Sem fallback externo</option>
            {fallbackProviders.map(item => (
              <option key={item.id} value={item.id}>{item.displayName}</option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 self-end rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={event => setIsDefault(event.target.checked)}
          />
          Provedor padrao
        </label>
      </div>

      <label className="mt-4 block space-y-1 text-sm">
        <span className="font-medium text-gray-700">Configuracao publica JSON</span>
        <textarea
          value={publicConfig}
          onChange={event => setPublicConfig(event.target.value)}
          className="min-h-56 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs leading-5"
          spellCheck={false}
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          Salva apenas metadados e nomes de secrets. O valor real da API key deve ficar em secrets server-side.
        </p>
        <button
          type="submit"
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Salvando...' : 'Salvar provedor'}
        </button>
      </div>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Provedor salvo.</div>}
    </form>
  )
}
