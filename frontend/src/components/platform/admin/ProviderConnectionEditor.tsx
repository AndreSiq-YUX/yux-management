import { useMemo, useState, type FormEvent } from 'react'
import { HelpCircle, Save, Wifi } from 'lucide-react'
import { AdminStatusBadge } from '@/components/platform/admin/AdminStatusBadge'
import type {
  PlatformProviderConnectionInput,
  ProviderConnectionTestResult,
  ProviderCredentialSaveResult,
} from '@/services/adminPlatformService'
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

function FieldLabel({ children, help }: { children: string; help?: string }) {
  return (
    <span className="inline-flex items-center gap-1 font-medium text-gray-700">
      {children}
      {help && (
        <span
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-gray-400 hover:text-yux-700"
          title={help}
          aria-label={help}
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      )}
    </span>
  )
}

export function ProviderConnectionEditor({
  title,
  description,
  provider,
  defaults,
  fallbackProviders = [],
  onSave,
  onTest,
  onSaveCredential,
  credentialLabel,
  credentialHelp,
}: {
  title: string
  description: string
  provider?: PlatformProviderConnection
  defaults: PlatformProviderConnectionInput
  fallbackProviders?: PlatformProviderConnection[]
  onSave: (input: PlatformProviderConnectionInput) => Promise<void>
  onTest?: (providerId: string) => Promise<ProviderConnectionTestResult>
  onSaveCredential?: (providerId: string, apiKey: string) => Promise<ProviderCredentialSaveResult>
  credentialLabel?: string
  credentialHelp?: string
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
  const [savingCredential, setSavingCredential] = useState(false)
  const [testing, setTesting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [credentialSaved, setCredentialSaved] = useState(false)
  const [testResult, setTestResult] = useState<ProviderConnectionTestResult | null>(null)
  const [apiKey, setApiKey] = useState('')
  const isLockedProviderKey = defaults.providerKey === 'smtp2go' || defaults.providerKey === 'cnpja'
  const providerKeyValue = isLockedProviderKey ? defaults.providerKey : providerKey

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)
    setCredentialSaved(false)
    setTestResult(null)

    try {
      const parsedConfig = JSON.parse(publicConfig) as Record<string, unknown>
      if (!isLockedProviderKey && /^api[-_]/i.test(providerKey.trim())) {
        throw new Error('provider_key_looks_like_api_key')
      }
      await onSave({
        id: provider?.id,
        providerType,
        providerKey: providerKeyValue,
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
      if (error instanceof SyntaxError) {
        setError('JSON de configuracao invalido.')
      } else if (error instanceof Error && error.message === 'provider_key_looks_like_api_key') {
        setError('Chave do provedor nao e API key. Use um identificador interno como smtp2go.')
      } else if (error instanceof Error && error.message) {
        setError(error.message)
      } else {
        setError('Nao foi possivel salvar o provedor.')
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleTestConnection() {
    if (!provider?.id || !onTest) return

    setTesting(true)
    setError(null)
    setTestResult(null)

    try {
      const result = await onTest(provider.id)
      setTestResult(result)
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : 'Nao foi possivel testar a conexao.')
    } finally {
      setTesting(false)
    }
  }

  async function handleSaveCredential() {
    if (!provider?.id || !onSaveCredential || !apiKey.trim()) return

    setSavingCredential(true)
    setError(null)
    setCredentialSaved(false)
    setTestResult(null)

    try {
      await onSaveCredential(provider.id, apiKey)
      setApiKey('')
      setCredentialSaved(true)
    } catch (error) {
      setError(error instanceof Error && error.message ? error.message : 'Nao foi possivel salvar a credencial.')
    } finally {
      setSavingCredential(false)
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
          <FieldLabel help="Categoria tecnica do provedor dentro do YUX Hub. Para SMTP2GO deve ser email.">Tipo</FieldLabel>
          <select
            value={providerType}
            onChange={event => setProviderType(event.target.value as PlatformProviderType)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {providerTypes.map(type => <option key={type} value={type}>{type}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Identificador interno fixo usado pelo sistema, por exemplo smtp2go ou cnpja. Nao cole API key neste campo.">
            Identificador interno
          </FieldLabel>
          <input
            value={providerKeyValue}
            onChange={event => setProviderKey(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm disabled:bg-gray-50 disabled:text-gray-500"
            required
            disabled={isLockedProviderKey}
          />
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Nome legivel exibido no Admin. Nao afeta a conexao tecnica.">Nome exibido</FieldLabel>
          <input
            value={displayName}
            onChange={event => setDisplayName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Ambiente operacional dessa conexao. Normalmente production na VPS.">Ambiente</FieldLabel>
          <input
            value={environment}
            onChange={event => setEnvironment(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Estado operacional salvo no Admin. Use active quando a credencial master estiver cadastrada e validada no backend.">Status</FieldLabel>
          <select
            value={status}
            onChange={event => setStatus(event.target.value as PlatformProviderStatus)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {providerStatuses.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Apelido interno da credencial armazenada de forma segura pelo Admin/backend. Nao e o valor da API key.">
            Referencia da credencial
          </FieldLabel>
          <input
            value={secretReference}
            onChange={event => setSecretReference(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            placeholder={defaults.secretReference || 'PROVIDER_API_KEY'}
          />
        </label>

        <label className="space-y-1 text-sm lg:col-span-2">
          <FieldLabel help="Provedor alternativo usado se este falhar. Em SMTP2GO normalmente fica vazio.">Fallback externo</FieldLabel>
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
          <FieldLabel help="Marca este provedor como padrao para o tipo e ambiente selecionados.">Provedor padrao</FieldLabel>
        </label>
      </div>

      <label className="mt-4 block space-y-1 text-sm">
        <FieldLabel help="Configuracao operacional nao sensivel usada pelo backend. Nao coloque API keys ou segredos neste JSON.">
          Configuracao publica JSON
        </FieldLabel>
        <textarea
          value={publicConfig}
          onChange={event => setPublicConfig(event.target.value)}
          className="min-h-56 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs leading-5"
          spellCheck={false}
        />
      </label>

      {onSaveCredential && (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3">
          <label className="block space-y-1 text-sm">
            <FieldLabel help={credentialHelp || `Cole aqui a API key real do ${defaults.displayName}. O backend criptografa e salva; o valor nao volta para o frontend.`}>
              {credentialLabel || `API key ${defaults.displayName}`}
            </FieldLabel>
            <input
              type="password"
              value={apiKey}
              onChange={event => setApiKey(event.target.value)}
              className="w-full rounded-md border border-amber-200 px-3 py-2 font-mono text-sm"
              placeholder={provider?.secretReference ? 'Credencial ja cadastrada. Preencha apenas para substituir.' : 'Cole a API key real uma unica vez'}
              autoComplete="off"
            />
          </label>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-amber-800">
              Esta chave sera criptografada no backend e nunca sera exibida novamente.
            </p>
            <button
              type="button"
              disabled={savingCredential || saving || testing || !provider?.id || !apiKey.trim()}
              onClick={handleSaveCredential}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
              title={provider?.id ? 'Salva a API key criptografada no backend.' : 'Salve o provedor antes de cadastrar a credencial.'}
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {savingCredential ? 'Salvando credencial...' : 'Salvar credencial'}
            </button>
          </div>
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          Salva configuracoes operacionais e identificadores internos. Credenciais reais devem ser cadastradas no fluxo seguro do Admin.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          {onTest && (
            <button
              type="button"
              disabled={testing || saving || savingCredential || !provider?.id}
              onClick={handleTestConnection}
              className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              title={provider?.id ? 'Testa a credencial master no backend sem enviar email.' : 'Salve o provedor antes de testar.'}
            >
              <Wifi className="h-4 w-4" aria-hidden="true" />
              {testing ? 'Testando...' : 'Testar conexao'}
            </button>
          )}
          <button
            type="submit"
            disabled={saving || testing || savingCredential}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {saving ? 'Salvando...' : 'Salvar provedor'}
          </button>
        </div>
      </div>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {credentialSaved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Credencial criptografada salva.</div>}
      {testResult && (
        <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${
          testResult.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {testResult.message}
        </div>
      )}
      {saved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Provedor salvo.</div>}
    </form>
  )
}
