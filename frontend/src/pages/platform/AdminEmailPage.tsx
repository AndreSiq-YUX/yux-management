import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Mail, Send, ServerCog, ShieldAlert, Users } from 'lucide-react'
import { AdminMetricCard } from '@/components/platform/admin/AdminMetricCard'
import { ProviderConnectionEditor } from '@/components/platform/admin/ProviderConnectionEditor'
import { Smtp2GoConnectionEditor } from '@/components/platform/admin/Smtp2GoConnectionEditor'
import { Smtp2GoSubaccountEditor } from '@/components/platform/admin/Smtp2GoSubaccountEditor'
import { smtp2GoProviderDefaults } from '@/lib/platform/providerDefaults'
import { adminPlatformService } from '@/services/adminPlatformService'
import { platformService } from '@/services/platformService'
import type {
  EmailProviderConnection,
  PlatformProviderConnection,
  Smtp2GoAdminSummary,
  Smtp2GoSubaccount,
} from '@/types/adminPlatform'
import type { Organization } from '@/types/platform'

export function AdminEmailPage() {
  const [summary, setSummary] = useState<Smtp2GoAdminSummary | null>(null)
  const [providers, setProviders] = useState<PlatformProviderConnection[]>([])
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [emailConnections, setEmailConnections] = useState<EmailProviderConnection[]>([])
  const [subaccounts, setSubaccounts] = useState<Smtp2GoSubaccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function loadEmailAdministration(active = true) {
    setLoading(true)
    setError(null)

    try {
      const [summaryResult, providerResult, organizationResult, connectionResult] = await Promise.all([
        adminPlatformService.getSmtp2GoSummary(),
        adminPlatformService.getProviderConnections(),
        platformService.getOrganizations(),
        adminPlatformService.getEmailProviderConnections(),
      ])
      const subaccountResult = await adminPlatformService.getSmtp2GoSubaccounts().catch(error => {
        console.warn('Could not load SMTP2GO subaccounts:', error)
        return []
      })

      if (active) {
        setSummary(summaryResult)
        setProviders(providerResult)
        setOrganizations(organizationResult)
        setEmailConnections(connectionResult)
        setSubaccounts(subaccountResult)
      }
    } catch (error) {
      console.error('Error loading SMTP2GO administration:', error)
      if (active) setError('Nao foi possivel carregar a administracao de Email/SMTP2GO.')
    } finally {
      if (active) setLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    loadEmailAdministration()
    return () => {
      active = false
    }
  }, [])

  const smtpProvider = providers.find(provider => provider.providerKey === 'smtp2go')

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email/SMTP2GO</h1>
          <p className="text-gray-600">
            SMTP2GO e infraestrutura compartilhada do YUX Hub para envios transacionais, subcontas e reputacao de email.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/admin/email/templates"
            className="inline-flex items-center justify-center rounded-md border border-yux-200 bg-yux-50 px-3 py-2 text-sm font-medium text-yux-800 hover:bg-yux-100"
          >
            Gerir modelos
          </Link>
          <Link
            to="/admin/integrations"
            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Ver integracoes
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        Configure aqui a conta master SMTP2GO, subcontas por cliente, remetentes, limites e webhooks. O backend da VPS deve
        validar e armazenar credenciais de forma criptografada; o frontend nunca exibe API keys brutas depois de salvas.
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando administracao de Email/SMTP2GO...</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <AdminMetricCard
          label="Conexoes master"
          value={summary?.connectionCount ?? '-'}
          detail="Conexoes SMTP2GO registradas"
          icon={ServerCog}
        />
        <AdminMetricCard
          label="Subcontas"
          value={summary?.subaccountCount ?? '-'}
          detail="Subcontas operacionais por cliente"
          icon={Users}
        />
        <AdminMetricCard
          label="Enviados hoje"
          value={summary?.sentToday ?? '-'}
          detail="Soma de sent_count do dia"
          icon={Send}
        />
        <AdminMetricCard
          label="Falhas hoje"
          value={summary?.failedToday ?? '-'}
          detail="Soma de failed_count do dia"
          icon={AlertTriangle}
        />
        <AdminMetricCard
          label="Supressoes"
          value={summary?.suppressedCount ?? '-'}
          detail="Emails em lista de supressao"
          icon={ShieldAlert}
        />
      </div>

      {!loading && !error && (
        <div className="grid gap-4 xl:grid-cols-2">
          <ProviderConnectionEditor
            title="SMTP2GO global"
            description="Define a conta master SMTP2GO e a politica de provisionamento automatico usada pelo backend da VPS."
            provider={smtpProvider}
            defaults={smtp2GoProviderDefaults}
            onSave={async input => {
              await adminPlatformService.upsertProviderConnection(input)
              await loadEmailAdministration()
            }}
            onTest={async providerId => {
              return adminPlatformService.testProviderConnection(providerId)
            }}
            onSaveCredential={async (providerId, apiKey) => {
              return adminPlatformService.saveProviderCredential(providerId, apiKey)
            }}
          />
          <Smtp2GoConnectionEditor
            organizations={organizations}
            connections={emailConnections}
            onSave={async input => {
              await adminPlatformService.upsertEmailProviderConnection(input)
              await loadEmailAdministration()
            }}
          />
          <div className="xl:col-span-2">
            <Smtp2GoSubaccountEditor
              organizations={organizations}
              connections={emailConnections}
              subaccounts={subaccounts}
              onSave={async input => {
                await adminPlatformService.upsertSmtp2GoSubaccount(input)
                await loadEmailAdministration()
              }}
            />
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-yux-50 p-2 text-yux-700">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Governanca SMTP2GO</h2>
              <p className="mt-1 text-sm text-gray-600">
                Use esta visao para acompanhar a base compartilhada, credenciais server-side, dominios, subcontas e limites.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
