import { useEffect, useState } from 'react'
import { Activity, Bot, Boxes, Building2, FileCheck2, HardDrive, Mail, PlugZap } from 'lucide-react'
import { AdminMetricCard } from '@/components/platform/admin/AdminMetricCard'
import { AdminQuickActions } from '@/components/platform/admin/AdminQuickActions'
import { adminPlatformService } from '@/services/adminPlatformService'
import type { AdminHubSummary } from '@/types/adminPlatform'

const quickActions = [
  {
    label: 'Contratos e limites',
    description: 'Gerenciar modulos contratados e quotas por cliente.',
    href: '/contracts',
    icon: FileCheck2,
  },
  {
    label: 'Integracoes',
    description: 'Configurar provedores globais e por cliente.',
    href: '/admin/integrations',
    icon: PlugZap,
  },
  {
    label: 'Email/SMTP2GO',
    description: 'Gerenciar conta master, subcontas, dominios e envios.',
    href: '/admin/email',
    icon: Mail,
  },
  {
    label: 'IA/LLM',
    description: 'Controlar provedores, modelos, custos e uso por modulo.',
    href: '/admin/ai',
    icon: Bot,
  },
  {
    label: 'Limites de Upload',
    description: 'Configurar tamanho maximo de anexo global e por cliente.',
    href: '/admin/limits',
    icon: HardDrive,
  },
]

export function AdminHubPage() {
  const [summary, setSummary] = useState<AdminHubSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadSummary() {
      setLoading(true)
      setError(null)

      try {
        const result = await adminPlatformService.getAdminHubSummary()
        if (active) setSummary(result)
      } catch (error) {
        console.error('Error loading Admin YUX Hub:', error)
        if (active) setError('Nao foi possivel carregar o Admin YUX Hub.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadSummary()

    return () => {
      active = false
    }
  }, [])

  const healthValue = summary
    ? `${summary.failingProviderCount}/${summary.nearLimitCount}`
    : '-'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Admin YUX Hub</h1>
        <p className="text-gray-600">
          Controle central de clientes, contratos, modulos, limites e integracoes.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando administracao do YUX Hub...</p>}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetricCard
          label="Clientes"
          value={summary?.clientCount ?? '-'}
          detail="Clientes cadastrados na plataforma"
          icon={Building2}
        />
        <AdminMetricCard
          label="Contratos ativos"
          value={summary?.activeContractCount ?? '-'}
          detail="Base comercial da plataforma"
          icon={FileCheck2}
        />
        <AdminMetricCard
          label="Modulos ativos"
          value={summary?.activeModuleCount ?? '-'}
          detail="Modulos habilitados em contratos"
          icon={Boxes}
        />
        <AdminMetricCard
          label="Saude operacional"
          value={healthValue}
          detail="Provedores com falha / limites proximos"
          icon={Activity}
        />
      </div>

      <AdminQuickActions actions={quickActions} />
    </div>
  )
}
