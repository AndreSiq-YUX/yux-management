import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Activity, AlertCircle, ArrowRight, Bot, FileCheck2, FolderOpen, Loader2, TrendingUp, Users } from 'lucide-react'
import { PortalEmptyState } from '@/components/client-portal/PortalEmptyState'
import { adminPlatformService } from '@/services/adminPlatformService'
import { backendDataService } from '@/services/backendDataService'
import { useAuthStore } from '@/stores/authStore'
import type { AdminHubSummary } from '@/types/adminPlatform'

interface DashboardStats {
  overview?: {
    totalClients: number
    totalProjects: number
    totalLeads: number
    totalCampaigns: number
    activeProjects: number
    qualifiedLeads: number
  }
  financial?: {
    totalBudget: number
    totalCampaignSpent: number
    budgetUtilization: number
  }
  marketing?: {
    totalImpressions: number
    totalClicks: number
    ctr: number
    avgROAS: number
  }
  campaigns?: {
    totalBudget: number
    totalSpent: number
    totalConversions: number
  }
  recent?: {
    projects: Array<{
      id: string
      name: string
      client: string
      status: string
      progress: number
    }>
  }
  recentActivity?: DashboardStats['recent']
}

interface CriticalItem {
  id: string
  title: string
  description: string
  href: string
  severity: 'critical' | 'warning'
}

export function DashboardPage() {
  const { user } = useAuthStore()
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [adminSummary, setAdminSummary] = useState<AdminHubSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setLoading(true)
      setError(null)

      try {
        const [stats, summary] = await Promise.all([
          backendDataService.getDashboardStats(),
          adminPlatformService.getAdminHubSummary(),
        ])
        if (!active) return
        setDashboardStats(stats as DashboardStats)
        setAdminSummary(summary)
      } catch (loadError) {
        console.error('Erro ao carregar dashboard interno:', loadError)
        if (active) setError('Nao foi possivel carregar todos os indicadores internos.')
      } finally {
        if (active) setLoading(false)
      }
    }

    loadDashboard()

    return () => {
      active = false
    }
  }, [])

  const criticalItems = useMemo<CriticalItem[]>(() => {
    if (!adminSummary) return []

    return [
      adminSummary.failingProviderCount > 0 ? {
        id: 'failing-providers',
        title: `${adminSummary.failingProviderCount} provedor${adminSummary.failingProviderCount > 1 ? 'es' : ''} com falha`,
        description: 'Revisar integracoes globais, IA, canais ou email antes que clientes sejam afetados.',
        href: '/admin/health',
        severity: 'critical',
      } : null,
      adminSummary.nearLimitCount > 0 ? {
        id: 'near-limits',
        title: `${adminSummary.nearLimitCount} limite${adminSummary.nearLimitCount > 1 ? 's' : ''} proximo${adminSummary.nearLimitCount > 1 ? 's' : ''}`,
        description: 'Clientes ou modulos estao perto de estourar cotas contratadas.',
        href: '/admin/limits',
        severity: 'warning',
      } : null,
      adminSummary.activeContractCount === 0 ? {
        id: 'no-active-contracts',
        title: 'Nenhum contrato ativo',
        description: 'A base comercial precisa de contratos ativos para liberar o portal do cliente.',
        href: '/contracts',
        severity: 'critical',
      } : null,
    ].filter(Boolean) as CriticalItem[]
  }, [adminSummary])

  if (loading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-yux-600" />
      </div>
    )
  }

  const overview = {
    totalClients: 0,
    totalProjects: 0,
    totalLeads: 0,
    totalCampaigns: 0,
    activeProjects: 0,
    qualifiedLeads: 0,
    ...dashboardStats?.overview,
  }
  const marketing = {
    totalImpressions: 0,
    totalClicks: 0,
    ctr: 0,
    avgROAS: 0,
    ...dashboardStats?.marketing,
  }
  const recentProjects = dashboardStats?.recent?.projects ?? dashboardStats?.recentActivity?.projects ?? []

  const stats = [
    {
      name: 'Clientes',
      value: adminSummary?.clientCount ?? overview.totalClients,
      detail: 'Clientes cadastrados',
      icon: Users,
    },
    {
      name: 'Contratos ativos',
      value: adminSummary?.activeContractCount ?? 0,
      detail: 'Contratos liberando modulos',
      icon: FileCheck2,
    },
    {
      name: 'Projetos ativos',
      value: overview.activeProjects,
      detail: `${overview.totalProjects} projetos no total`,
      icon: FolderOpen,
    },
    {
      name: 'ROAS medio',
      value: `${marketing.avgROAS.toFixed(1)}x`,
      detail: `${marketing.ctr.toFixed(2)}% CTR`,
      icon: TrendingUp,
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Visao Geral YUX</h1>
        <p className="text-gray-600">Resumo operacional da plataforma, clientes, contratos e pontos criticos.</p>
        {user?.name && <p className="mt-1 text-sm text-gray-500">Usuario: {user.name}</p>}
      </div>

      {error && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {error}
        </div>
      )}

      <section className="rounded-lg border bg-white p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-medium uppercase text-red-700">Pendencias criticas</p>
            <h2 className="text-lg font-semibold text-gray-900">Riscos que exigem atencao da YUX</h2>
          </div>
          <Link to="/admin/health" className="inline-flex items-center text-sm font-medium text-yux-700 hover:text-yux-800">
            Ver saude da plataforma
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </div>

        {criticalItems.length > 0 ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-3">
            {criticalItems.map(item => (
              <Link
                key={item.id}
                to={item.href}
                className={item.severity === 'critical'
                  ? 'rounded-md border border-red-200 bg-red-50 p-4 text-red-800 hover:border-red-300'
                  : 'rounded-md border border-amber-200 bg-amber-50 p-4 text-amber-800 hover:border-amber-300'}
              >
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                  <div>
                    <h3 className="font-semibold">{item.title}</h3>
                    <p className="mt-1 text-sm opacity-80">{item.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-4">
            <PortalEmptyState
              icon={Activity}
              title="Nenhuma pendencia critica"
              description="Provedores, contratos e limites principais nao indicam risco imediato."
            />
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(stat => (
          <article key={stat.name} className="relative overflow-hidden rounded-lg border bg-white px-4 py-5 sm:px-6">
            <div className="absolute rounded-md bg-yux-500 p-3">
              <stat.icon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <p className="ml-16 truncate text-sm font-medium text-gray-500">{stat.name}</p>
            <p className="ml-16 mt-1 text-2xl font-semibold text-gray-900">{stat.value}</p>
            <p className="ml-16 mt-1 text-sm text-gray-600">{stat.detail}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Projetos recentes</h2>
          <div className="mt-4 space-y-3">
            {recentProjects.map(project => (
              <div key={project.id} className="rounded-md border bg-gray-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{project.name}</p>
                  <span className="rounded-full bg-white px-2 py-1 text-xs text-gray-600">{project.status}</span>
                </div>
                <p className="mt-1 text-xs text-gray-500">{project.client || 'Cliente nao informado'}</p>
              </div>
            ))}
            {recentProjects.length === 0 && (
              <PortalEmptyState
                title="Nenhum projeto recente"
                description="Projetos criados ou atualizados aparecem nesta area para acompanhamento interno."
                action={{ label: 'Abrir projetos', href: '/projects' }}
              />
            )}
          </div>
        </article>

        <article className="rounded-lg border bg-white p-5">
          <h2 className="text-base font-semibold text-gray-900">Atalhos internos</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {[
              { label: 'Clientes & Contratos', href: '/clients', icon: Users },
              { label: 'Administracao da Plataforma', href: '/admin', icon: Activity },
              { label: 'IA / Modelos / Custos', href: '/admin/ai', icon: Bot },
              { label: 'Financeiro', href: '/finance', icon: FileCheck2 },
            ].map(action => {
              const Icon = action.icon
              return (
                <Link key={action.href} to={action.href} className="rounded-md border bg-gray-50 p-3 text-sm font-medium text-gray-800 hover:border-yux-300 hover:bg-yux-50">
                  <Icon className="mb-2 h-4 w-4 text-yux-700" />
                  {action.label}
                </Link>
              )
            })}
          </div>
        </article>
      </section>
    </div>
  )
}
