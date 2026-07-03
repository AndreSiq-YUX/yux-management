import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  Gauge,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Table2,
  UserRound,
} from 'lucide-react'
import {
  buildCommandCenterModel,
  type CommandCenterItem,
  type ContextualShortcut,
  type DashboardStatsForCommandCenter,
  type PortfolioMapRow,
  type PulseMetric,
} from '@/lib/dashboard/commandCenterRules'
import { adminPlatformService } from '@/services/adminPlatformService'
import { backendDataService } from '@/services/backendDataService'
import { useAuthStore } from '@/stores/authStore'
import type { AdminHubSummary } from '@/types/adminPlatform'

type DashboardStats = DashboardStatsForCommandCenter

export function DashboardPage() {
  const { user } = useAuthStore()
  const [dashboardStats, setDashboardStats] = useState<DashboardStats | null>(null)
  const [adminSummary, setAdminSummary] = useState<AdminHubSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true

    async function loadDashboard() {
      setLoading(true)
      setError(null)
      setDashboardStats(null)
      setAdminSummary(null)

      const [statsResult, summaryResult] = await Promise.allSettled([
        backendDataService.getDashboardStats(),
        adminPlatformService.getAdminHubSummary(),
      ])

      if (!active) return

      if (statsResult.status === 'fulfilled') {
        setDashboardStats(statsResult.value as DashboardStats)
      } else {
        console.error('Erro ao carregar indicadores de workspace:', statsResult.reason)
      }

      if (summaryResult.status === 'fulfilled') {
        setAdminSummary(summaryResult.value)
      } else {
        console.error('Erro ao carregar resumo administrativo:', summaryResult.reason)
      }

      if (statsResult.status === 'rejected' || summaryResult.status === 'rejected') {
        setError(
          statsResult.status === 'rejected' && summaryResult.status === 'rejected'
            ? 'Nao foi possivel carregar a mesa de comando.'
            : 'Indicadores carregados parcialmente.',
        )
      }

      setLoading(false)
    }

    loadDashboard()

    return () => {
      active = false
    }
  }, [refreshKey])

  const commandCenter = useMemo(() => buildCommandCenterModel({
    dashboardStats,
    adminSummary,
    userName: user?.name,
    hasPartialError: Boolean(error),
  }), [adminSummary, dashboardStats, error, user?.name])

  if (loading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-800" />
      </div>
    )
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] space-y-4 bg-[#f7f6f2] px-4 py-5 text-slate-950 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-6">
      <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-[2rem] font-semibold leading-tight tracking-[-0.01em] text-slate-950">
            Visao Geral YUX
          </h1>
          <p className="mt-2 max-w-3xl text-[15px] leading-6 text-slate-700">
            Mesa de comando para riscos, oportunidades e operacao interna.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <span className={dataStatusClass(commandCenter.dataStatus)}>
              {commandCenter.dataStatus}
            </span>
            {commandCenter.userName && (
              <span className="inline-flex items-center gap-2">
                <UserRound className="h-4 w-4 text-slate-900" />
                Usuario: {commandCenter.userName}
              </span>
            )}
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-slate-500" />
              {commandCenter.generatedAtLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-sm border border-slate-300 bg-white text-sm text-slate-700">
              {['Hoje', '7 dias', '30 dias'].map(label => (
                <button
                  key={label}
                  type="button"
                  className={label === commandCenter.windowLabel
                    ? 'min-w-20 border-x border-slate-950 bg-slate-950 px-5 py-2.5 font-medium text-white first:border-l-0'
                    : 'min-w-20 border-r border-slate-200 px-5 py-2.5 hover:bg-slate-50 last:border-r-0'}
                  aria-pressed={label === commandCenter.windowLabel}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey(key => key + 1)}
              className="inline-flex items-center gap-2 rounded-sm border border-slate-950 bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
            >
              Atualizar indicadores
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">{error}</p>
                {commandCenter.unavailableSources.length > 0 && (
                  <p className="mt-1 text-xs text-amber-800">
                    Fontes indisponiveis: {commandCenter.unavailableSources.join(', ')}.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <section aria-labelledby="executive-pulse-title" className="rounded-sm border border-slate-300 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Pulso Executivo</p>
            <h2 id="executive-pulse-title" className="sr-only">
              Sinais agregados para orientar a decisao do gestor
            </h2>
          </div>
          <Gauge className="hidden h-5 w-5 text-slate-400 sm:block" />
        </div>
        <div className="grid divide-y divide-slate-200 md:grid-cols-5 md:divide-x md:divide-y-0">
          {commandCenter.pulse.map(metric => (
            <PulseCard key={metric.label} metric={metric} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15.5rem]">
        <CommandLane
          title="Resolver agora"
          subtitle="Riscos, bloqueios e incidentes que podem degradar a operacao."
          items={commandCenter.resolveNow}
          emptyTitle="Nenhum risco operacional relevante"
          emptyDescription="Provedores, contratos, limites, projetos e aprovacoes nao indicam acao urgente nesta janela."
          icon={ShieldAlert}
        />
        <CommandLane
          title="Aproveitar oportunidade"
          subtitle="Expansao, performance e eficiencia ranqueadas por impacto estimado."
          items={commandCenter.opportunities}
          emptyTitle="Nenhuma oportunidade com impacto estimado suficiente"
          emptyDescription="A YUX ainda nao tem sinais quantitativos confiaveis para destacar expansao, growth ou eficiencia nesta janela."
          icon={Sparkles}
        />
        <ContextualShortcuts shortcuts={commandCenter.shortcuts} />
      </section>

      <PortfolioMap rows={commandCenter.portfolioRows} />
    </div>
  )
}

function PulseCard({ metric }: { metric: PulseMetric }) {
  return (
    <article className="flex min-h-24 items-center gap-4 px-5 py-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${pulseIconClass(metric.tone)}`}>
        {metric.tone === 'risk' ? (
          <ShieldAlert className="h-5 w-5" />
        ) : metric.tone === 'opportunity' ? (
          <Sparkles className="h-5 w-5" />
        ) : metric.tone === 'warning' ? (
          <Clock3 className="h-5 w-5" />
        ) : (
          <UserRound className="h-5 w-5" />
        )}
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-slate-950">{metric.value}</p>
        <p className={`mt-0.5 text-xs ${metric.tone === 'risk' ? 'text-red-600' : metric.tone === 'opportunity' ? 'text-emerald-700' : 'text-slate-600'}`}>
          {metric.detail}
        </p>
      </div>
    </article>
  )
}

function CommandLane({
  title,
  subtitle,
  items,
  emptyTitle,
  emptyDescription,
  icon: Icon,
}: {
  title: string
  subtitle: string
  items: CommandCenterItem[]
  emptyTitle: string
  emptyDescription: string
  icon: typeof ShieldAlert
}) {
  const isOpportunityLane = title === 'Aproveitar oportunidade'

  return (
    <section className={`rounded-sm border border-slate-300 bg-white ${isOpportunityLane ? 'border-t-4 border-t-emerald-700' : 'border-t-4 border-t-red-600'}`}>
      <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-4">
        <span className="rounded-full border border-slate-200 bg-white p-2 text-slate-700">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className={`text-lg font-semibold ${isOpportunityLane ? 'text-emerald-800' : 'text-red-700'}`}>{title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-700">{subtitle}</p>
        </div>
      </div>

      <div className="space-y-2 p-2">
        {items.length > 0 ? (
          items.map(item => <CommandItemCard key={item.id} item={item} />)
        ) : (
          <div className="rounded-sm border border-dashed border-slate-300 bg-white px-4 py-6">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h3 className="mt-3 text-sm font-semibold text-slate-950">{emptyTitle}</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">{emptyDescription}</p>
          </div>
        )}
      </div>
      {items.length > 0 && (
        <div className="border-t border-slate-200 px-4 py-3">
          <Link to={isOpportunityLane ? '/reports' : '/admin/health'} className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-slate-950">
            {isOpportunityLane ? 'Ver todas as oportunidades' : 'Ver todos os riscos'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  )
}

function CommandItemCard({ item }: { item: CommandCenterItem }) {
  const Icon = item.tone === 'opportunity' || item.tone === 'efficiency' ? Sparkles : AlertTriangle

  return (
    <article className={`rounded-sm border bg-white ${itemToneClass(item.tone)}`}>
      <div className="grid gap-3 p-3 lg:grid-cols-[3.25rem_minmax(13rem,1.05fr)_minmax(6rem,.55fr)_minmax(6rem,.55fr)_minmax(7rem,.65fr)_auto] lg:items-center">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${itemIconClass(item.tone)}`}>
          <Icon className="h-6 w-6" />
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${itemBadgeClass(item.tone)}`}>
              {item.category.split(' - ')[0]}
            </span>
            <span className="text-xs text-slate-500">{item.urgencyLabel}</span>
          </div>
          <h3 className="text-[15px] font-semibold leading-5 text-slate-950">{item.title}</h3>
          <p className="mt-1 text-xs text-slate-500">{item.affectedEntityLabel}</p>
        </div>

        <MetricColumn label="Impacto" value={item.impactLabel} tone={item.tone} />
        <MetricColumn label={item.confidenceLabel ? 'Confianca' : 'Dono sugerido'} value={item.confidenceLabel ?? item.ownerLabel} tone="neutral" />
        <MetricColumn label={item.confidenceLabel ? 'Dono sugerido' : 'Evidencia'} value={item.confidenceLabel ? item.ownerLabel : item.evidence} tone="neutral" />

        <div className="flex items-center justify-end gap-2">
        <Link
          to={item.href}
            className={`inline-flex min-w-32 items-center justify-center rounded-sm border px-3 py-2 text-xs font-semibold ${itemActionClass(item.tone)}`}
        >
          {item.actionLabel}
        </Link>
          <button type="button" className="hidden rounded-sm px-2 py-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:inline-flex" title="Mais acoes">
            ...
          </button>
          <ArrowRight className="hidden h-4 w-4 text-slate-400 lg:block" />
        </div>
      </div>
    </article>
  )
}

function MetricColumn({ label, value, tone }: { label: string; value: string; tone: CommandCenterItem['tone'] | 'neutral' }) {
  return (
    <div className="min-w-0 border-t border-slate-100 pt-2 lg:border-l lg:border-t-0 lg:pl-3 lg:pt-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold leading-5 ${metricValueClass(tone)}`}>{value}</p>
    </div>
  )
}

function ContextualShortcuts({ shortcuts }: { shortcuts: ContextualShortcut[] }) {
  return (
    <aside className="rounded-sm border border-slate-300 bg-white">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-slate-500" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-950">Atalhos contextuais</h2>
        </div>
      </div>
      <div className="divide-y divide-slate-200">
        {shortcuts.length > 0 ? shortcuts.map(shortcut => (
          <Link
            key={shortcut.id}
            to={shortcut.href}
            className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 px-4 py-4 text-sm hover:bg-slate-50"
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${shortcutIconClass(shortcut.tone)}`}>
              {shortcut.tone === 'opportunity' ? <Sparkles className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            </span>
            <span>
              <span className="block font-medium leading-5 text-slate-950">{shortcut.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{shortcut.detail}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>
        )) : (
          <div className="m-3 rounded-sm border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Nenhum atalho contextual nesta janela.
          </div>
        )}
      </div>
    </aside>
  )
}

function PortfolioMap({ rows }: { rows: PortfolioMapRow[] }) {
  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-950">Mapa da Carteira</h2>
            <Table2 className="h-4 w-4 text-slate-400" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="rounded-sm border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50">Filtrar</button>
          <button type="button" className="rounded-sm border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50">Todos os clientes</button>
          <button type="button" className="rounded-sm border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50">Exportar</button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-[#fbfaf7] text-[11px] text-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Cliente</th>
              <th className="px-3 py-3 font-semibold">Saude</th>
              <th className="px-3 py-3 font-semibold">Contrato</th>
              <th className="px-3 py-3 font-semibold">Projeto</th>
              <th className="px-3 py-3 font-semibold">Performance</th>
              <th className="px-3 py-3 font-semibold">Principal risco</th>
              <th className="px-3 py-3 font-semibold">Principal oportunidade</th>
              <th className="px-3 py-3 font-semibold">Dono</th>
              <th className="px-4 py-3 font-semibold">Proxima acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {rows.map(row => (
              <tr key={row.id} className="align-top">
                <td className="px-4 py-3 font-semibold text-slate-950">{row.client}</td>
                <td className="px-3 py-3 text-slate-700">{row.health}</td>
                <td className="px-3 py-3 text-slate-700">{row.contract}</td>
                <td className="px-3 py-3 text-slate-700">{row.project}</td>
                <td className="px-3 py-3 text-slate-700">{row.performance}</td>
                <td className="px-3 py-3 text-slate-700">{row.risk}</td>
                <td className="px-3 py-3 text-slate-700">{row.opportunity}</td>
                <td className="px-3 py-3 text-slate-700">{row.owner}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{row.nextAction}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function dataStatusClass(status: 'Completo' | 'Parcial' | 'Com falha') {
  if (status === 'Completo') {
    return 'inline-flex items-center gap-2 text-sm text-emerald-800 before:h-2 before:w-2 before:rounded-full before:bg-emerald-500'
  }
  if (status === 'Parcial') {
    return 'inline-flex items-center gap-2 text-sm text-amber-800 before:h-2 before:w-2 before:rounded-full before:bg-amber-500'
  }
  return 'inline-flex items-center gap-2 text-sm text-red-800 before:h-2 before:w-2 before:rounded-full before:bg-red-500'
}

function pulseIconClass(tone: PulseMetric['tone']) {
  const classes = {
    risk: 'border border-red-200 text-red-600',
    opportunity: 'border border-emerald-200 text-emerald-700',
    neutral: 'border border-indigo-200 text-indigo-500',
    warning: 'border border-amber-200 text-amber-600',
  }
  return classes[tone]
}

function itemToneClass(tone: CommandCenterItem['tone']) {
  const classes = {
    critical: 'border-l-4 border-l-red-600',
    warning: 'border-l-4 border-l-amber-500',
    opportunity: 'border-l-4 border-l-emerald-700',
    efficiency: 'border-l-4 border-l-emerald-700',
    neutral: 'border-l-4 border-l-slate-400',
  }
  return classes[tone]
}

function itemIconClass(tone: CommandCenterItem['tone']) {
  const classes = {
    critical: 'border-red-200 text-red-600',
    warning: 'border-amber-200 text-amber-600',
    opportunity: 'border-emerald-200 text-emerald-700',
    efficiency: 'border-emerald-200 text-emerald-700',
    neutral: 'border-slate-200 text-slate-600',
  }
  return classes[tone]
}

function itemBadgeClass(tone: CommandCenterItem['tone']) {
  const classes = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    opportunity: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    efficiency: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  }
  return classes[tone]
}

function itemActionClass(tone: CommandCenterItem['tone']) {
  if (tone === 'critical') return 'border-red-300 text-red-700 hover:bg-red-50'
  if (tone === 'warning') return 'border-amber-300 text-amber-700 hover:bg-amber-50'
  if (tone === 'opportunity' || tone === 'efficiency') return 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
  return 'border-slate-300 text-slate-800 hover:bg-slate-50'
}

function metricValueClass(tone: CommandCenterItem['tone'] | 'neutral') {
  if (tone === 'critical') return 'text-red-700'
  if (tone === 'warning') return 'text-amber-700'
  if (tone === 'opportunity' || tone === 'efficiency') return 'text-emerald-800'
  return 'text-slate-900'
}

function shortcutIconClass(tone: ContextualShortcut['tone']) {
  const classes = {
    risk: 'text-red-600',
    opportunity: 'text-emerald-700',
    neutral: 'text-slate-600',
    warning: 'text-amber-600',
  }
  return classes[tone]
}
