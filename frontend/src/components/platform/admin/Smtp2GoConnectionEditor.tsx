import { useMemo, useState, type FormEvent } from 'react'
import { Save } from 'lucide-react'
import type { EmailProviderConnection, EmailProviderConnectionStatus } from '@/types/adminPlatform'
import type { Organization } from '@/types/platform'

const statuses: EmailProviderConnectionStatus[] = ['needs_setup', 'connected', 'stale', 'failed']

function metadataText(connection?: EmailProviderConnection) {
  return JSON.stringify(connection?.metadata || {}, null, 2)
}

export function Smtp2GoConnectionEditor({
  organizations,
  connections,
  onSave,
}: {
  organizations: Organization[]
  connections: EmailProviderConnection[]
  onSave: (input: {
    organizationId: string
    status: EmailProviderConnectionStatus
    tokenReference: string
    defaultFromEmail: string
    defaultFromName: string
    dailySendLimit: number
    metadata: Record<string, unknown>
  }) => Promise<void>
}) {
  const clientOrganizations = organizations.filter(organization => organization.kind === 'client')
  const [organizationId, setOrganizationId] = useState(clientOrganizations[0]?.id || '')
  const selectedConnection = connections.find(connection => connection.organizationId === organizationId)
  const initialMetadata = useMemo(() => metadataText(selectedConnection), [selectedConnection])
  const [status, setStatus] = useState<EmailProviderConnectionStatus>(selectedConnection?.status || 'needs_setup')
  const [tokenReference, setTokenReference] = useState(selectedConnection?.tokenReference || 'smtp2go:client')
  const [defaultFromEmail, setDefaultFromEmail] = useState(selectedConnection?.defaultFromEmail || '')
  const [defaultFromName, setDefaultFromName] = useState(selectedConnection?.defaultFromName || 'YUX Hub')
  const [dailySendLimit, setDailySendLimit] = useState(selectedConnection?.dailySendLimit || 500)
  const [metadata, setMetadata] = useState(initialMetadata)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleOrganizationChange(nextOrganizationId: string) {
    const nextConnection = connections.find(connection => connection.organizationId === nextOrganizationId)
    setOrganizationId(nextOrganizationId)
    setStatus(nextConnection?.status || 'needs_setup')
    setTokenReference(nextConnection?.tokenReference || 'smtp2go:client')
    setDefaultFromEmail(nextConnection?.defaultFromEmail || '')
    setDefaultFromName(nextConnection?.defaultFromName || 'YUX Hub')
    setDailySendLimit(nextConnection?.dailySendLimit || 500)
    setMetadata(metadataText(nextConnection))
    setSaved(false)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      await onSave({
        organizationId,
        status,
        tokenReference,
        defaultFromEmail,
        defaultFromName,
        dailySendLimit,
        metadata: JSON.parse(metadata) as Record<string, unknown>,
      })
      setSaved(true)
    } catch (error) {
      setError(error instanceof SyntaxError ? 'JSON de metadados invalido.' : 'Nao foi possivel salvar a conexao SMTP2GO.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">SMTP2GO por cliente</h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure remetente, limite e referencia segura usada pelo backend da VPS para os envios do cliente.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Cliente</span>
          <select
            value={organizationId}
            onChange={event => handleOrganizationChange(event.target.value)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
            required
          >
            {clientOrganizations.map(organization => (
              <option key={organization.id} value={organization.id}>{organization.name}</option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Status</span>
          <select
            value={status}
            onChange={event => setStatus(event.target.value as EmailProviderConnectionStatus)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {statuses.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Limite diario</span>
          <input
            type="number"
            min="0"
            value={dailySendLimit}
            onChange={event => setDailySendLimit(Number(event.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Credencial de envio</span>
          <input
            value={tokenReference}
            onChange={event => setTokenReference(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            placeholder="smtp2go:client"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Email remetente</span>
          <input
            type="email"
            value={defaultFromEmail}
            onChange={event => setDefaultFromEmail(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            placeholder="contato@cliente.com.br"
          />
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium text-gray-700">Nome remetente</span>
          <input
            value={defaultFromName}
            onChange={event => setDefaultFromName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="mt-4 block space-y-1 text-sm">
        <span className="font-medium text-gray-700">Metadados JSON</span>
        <textarea
          value={metadata}
          onChange={event => setMetadata(event.target.value)}
          className="min-h-32 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs leading-5"
          spellCheck={false}
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          Use uma credencial criada/gerenciada pelo Admin; nao insira API key bruta neste campo.
        </p>
        <button
          type="submit"
          disabled={saving || !organizationId}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Salvando...' : 'Salvar SMTP2GO'}
        </button>
      </div>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Conexao SMTP2GO salva.</div>}
    </form>
  )
}
