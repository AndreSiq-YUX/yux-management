import { useMemo, useState, type FormEvent } from 'react'
import { HelpCircle, Save } from 'lucide-react'
import type { Smtp2GoSubaccountInput } from '@/services/adminPlatformService'
import type {
  EmailProviderConnection,
  Smtp2GoSubaccount,
  Smtp2GoSubaccountStatus,
} from '@/types/adminPlatform'
import type { Organization } from '@/types/platform'

const statuses: Smtp2GoSubaccountStatus[] = ['active', 'paused', 'failed']

function metadataText(subaccount?: Smtp2GoSubaccount) {
  return JSON.stringify(subaccount?.metadata || {}, null, 2)
}

function defaultSubaccountName(organization?: Organization) {
  return organization ? `${organization.name} SMTP2GO` : ''
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

export function Smtp2GoSubaccountEditor({
  organizations,
  connections,
  subaccounts,
  onSave,
}: {
  organizations: Organization[]
  connections: EmailProviderConnection[]
  subaccounts: Smtp2GoSubaccount[]
  onSave: (input: Smtp2GoSubaccountInput) => Promise<void>
}) {
  const clientOrganizations = organizations.filter(organization => organization.kind === 'client')
  const [organizationId, setOrganizationId] = useState(clientOrganizations[0]?.id || '')
  const selectedOrganization = clientOrganizations.find(organization => organization.id === organizationId)
  const selectedConnection = connections.find(connection => connection.organizationId === organizationId)
  const selectedSubaccount = subaccounts.find(subaccount => subaccount.organizationId === organizationId)
  const initialMetadata = useMemo(() => metadataText(selectedSubaccount), [selectedSubaccount])
  const [smtp2goAccountId, setSmtp2goAccountId] = useState(selectedSubaccount?.smtp2goAccountId || '')
  const [name, setName] = useState(selectedSubaccount?.name || defaultSubaccountName(selectedOrganization))
  const [status, setStatus] = useState<Smtp2GoSubaccountStatus>(selectedSubaccount?.status || 'active')
  const [dailySendLimit, setDailySendLimit] = useState(selectedSubaccount?.dailySendLimit || selectedConnection?.dailySendLimit || 500)
  const [monthlyQuota, setMonthlyQuota] = useState(selectedSubaccount?.monthlyQuota || 15000)
  const [metadata, setMetadata] = useState(initialMetadata)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  function handleOrganizationChange(nextOrganizationId: string) {
    const nextOrganization = clientOrganizations.find(organization => organization.id === nextOrganizationId)
    const nextConnection = connections.find(connection => connection.organizationId === nextOrganizationId)
    const nextSubaccount = subaccounts.find(subaccount => subaccount.organizationId === nextOrganizationId)

    setOrganizationId(nextOrganizationId)
    setSmtp2goAccountId(nextSubaccount?.smtp2goAccountId || '')
    setName(nextSubaccount?.name || defaultSubaccountName(nextOrganization))
    setStatus(nextSubaccount?.status || 'active')
    setDailySendLimit(nextSubaccount?.dailySendLimit || nextConnection?.dailySendLimit || 500)
    setMonthlyQuota(nextSubaccount?.monthlyQuota || 15000)
    setMetadata(metadataText(nextSubaccount))
    setSaved(false)
    setError(null)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setSaved(false)

    try {
      if (!selectedConnection) throw new Error('missing_connection')

      await onSave({
        id: selectedSubaccount?.id,
        organizationId,
        connectionId: selectedConnection.id,
        smtp2goAccountId,
        name,
        status,
        dailySendLimit,
        monthlyQuota,
        metadata: JSON.parse(metadata) as Record<string, unknown>,
      })
      setSaved(true)
    } catch (error) {
      if (error instanceof SyntaxError) {
        setError('JSON de metadados invalido.')
      } else if (error instanceof Error && error.message === 'missing_connection') {
        setError('Crie primeiro a conexao SMTP2GO do cliente.')
      } else {
        setError('Nao foi possivel salvar a subconta SMTP2GO.')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-white p-4">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Subconta SMTP2GO</h2>
        <p className="mt-1 text-sm text-gray-600">
          Acompanhe a subconta provisionada pelo backend para o cliente, com limites e metadados de dominio.
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          <FieldLabel help="Organizacao cliente dona desta subconta SMTP2GO.">Cliente</FieldLabel>
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
          <FieldLabel help="ID retornado pela API do SMTP2GO quando o backend provisiona a subconta. Nao e API key.">
            ID da subconta
          </FieldLabel>
          <input
            value={smtp2goAccountId}
            onChange={event => setSmtp2goAccountId(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm"
            placeholder="smtp2go-account-id"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Nome legivel para identificar a subconta do cliente no Admin e no SMTP2GO.">Nome da subconta</FieldLabel>
          <input
            value={name}
            onChange={event => setName(event.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            required
          />
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Estado operacional da subconta. Pausada/failed impede ou sinaliza bloqueio operacional.">Status</FieldLabel>
          <select
            value={status}
            onChange={event => setStatus(event.target.value as Smtp2GoSubaccountStatus)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
          >
            {statuses.map(item => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Limite diario aplicado a essa subconta especifica.">Limite diario</FieldLabel>
          <input
            type="number"
            min="0"
            value={dailySendLimit}
            onChange={event => setDailySendLimit(Number(event.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <label className="space-y-1 text-sm">
          <FieldLabel help="Cota mensal planejada para governanca e acompanhamento de uso do cliente.">Quota mensal</FieldLabel>
          <input
            type="number"
            min="0"
            value={monthlyQuota}
            onChange={event => setMonthlyQuota(Number(event.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </label>

        <div className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 lg:col-span-2">
          <FieldLabel help="Registro de conexao SMTP2GO por cliente ao qual esta subconta fica associada.">
            Conexao vinculada
          </FieldLabel>
          :{' '}
          <span className="font-mono text-gray-800">{selectedConnection?.id || 'crie a conexao do cliente primeiro'}</span>
        </div>
      </div>

      <label className="mt-4 block space-y-1 text-sm">
        <FieldLabel help="Dados nao sensiveis de dominio, status de verificacao e observacoes de provisionamento.">
          Metadados JSON
        </FieldLabel>
        <textarea
          value={metadata}
          onChange={event => setMetadata(event.target.value)}
          className="min-h-28 w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs leading-5"
          spellCheck={false}
          placeholder={'{\n  "domain": "cliente.com.br",\n  "domainStatus": "verified"\n}'}
        />
      </label>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-gray-500">
          Este registro deve refletir a subconta criada pela API master SMTP2GO no fluxo seguro do Admin.
        </p>
        <button
          type="submit"
          disabled={saving || !organizationId || !selectedConnection}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-yux-600 px-3 py-2 text-sm font-medium text-white hover:bg-yux-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" aria-hidden="true" />
          {saving ? 'Salvando...' : 'Salvar subconta'}
        </button>
      </div>

      {error && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {saved && <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Subconta SMTP2GO salva.</div>}
    </form>
  )
}
