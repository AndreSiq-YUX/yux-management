import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Mail, Send, ServerCog, ShieldAlert, Users } from 'lucide-react'
import { AdminMetricCard } from '@/components/platform/admin/AdminMetricCard'
import { adminPlatformService } from '@/services/adminPlatformService'
import type { Smtp2GoAdminSummary } from '@/types/adminPlatform'

export function AdminEmailPage() {
  const [summary, setSummary] = useState<Smtp2GoAdminSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadSummary() {
      setLoading(true)
      setError(null)

      try {
        const result = await adminPlatformService.getSmtp2GoSummary()
        if (active) setSummary(result)
      } catch (error) {
        console.error('Error loading SMTP2GO administration:', error)
        if (active) setError('Nao foi possivel carregar a administracao de Email/SMTP2GO.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSummary()

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Email/SMTP2GO</h1>
          <p className="text-gray-600">
            SMTP2GO e infraestrutura compartilhada do YUX Hub para envios transacionais, subcontas e reputacao de email.
          </p>
        </div>
        <Link
          to="/admin/integrations"
          className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Ver integracoes
        </Link>
      </div>

      <div className="rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
        As credenciais master e configuracoes sensiveis do SMTP2GO ainda nao sao editaveis por esta tela. Esta pagina mostra apenas
        indicadores operacionais da infraestrutura compartilhada.
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
        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start gap-3">
            <span className="rounded-md bg-yux-50 p-2 text-yux-700">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Governanca SMTP2GO</h2>
              <p className="mt-1 text-sm text-gray-600">
                Use esta visao para acompanhar a base compartilhada antes de abrir operacoes de credenciais,
                dominios ou ajuste de subcontas.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
