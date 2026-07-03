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
    <div className="space-y-5 bg-[#f6f3ee] text-slate-950">
      <header className="rounded-lg border border-slate-200 bg-[#fbfaf7] p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              <span>YUX Console</span>
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              <span>Mesa de comando</span>
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-slate-950 md:text-3xl">Visao Geral YUX</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
              Mesa de comando para riscos, oportunidades e operacao interna.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              {commandCenter.userName && (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                  <UserRound className="h-3.5 w-3.5" />
                  Usuario: {commandCenter.userName}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5">
                <Clock3 className="h-3.5 w-3.5" />
                {commandCenter.generatedAtLabel}
              </span>
              <span className={dataStatusClass(commandCenter.dataStatus)}>
                {commandCenter.dataStatus}
              </span>
            </div>
          </div>

          <div className="flex flex-col items-start gap-3 sm:flex-row xl:items-center">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-xs font-medium text-slate-600">
              {['Hoje', '7 dias', '30 dias'].map(label => (
                <button
                  key={label}
                  type="button"
                  className={label === commandCenter.windowLabel
                    ? 'rounded-md bg-slate-950 px-3 py-1.5 text-white'
                    : 'rounded-md px-3 py-1.5 hover:bg-slate-100'}
                  aria-pressed={label === commandCenter.windowLabel}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setRefreshKey(key => key + 1)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 hover:border-slate-400 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar indicadores
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

      <section aria-labelledby="executive-pulse-title" className="rounded-lg border border-slate-200 bg-[#fbfaf7] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Pulso Executivo</p>
            <h2 id="executive-pulse-title" className="text-sm font-semibold text-slate-950">
              Sinais agregados para orientar a decisao do gestor
            </h2>
          </div>
          <Gauge className="hidden h-5 w-5 text-slate-400 sm:block" />
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          {commandCenter.pulse.map(metric => (
            <PulseCard key={metric.label} metric={metric} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_18rem]">
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
    <article className={`rounded-lg border px-3 py-3 ${pulseToneClass(metric.tone)}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] opacity-70">{metric.label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-normal">{metric.value}</p>
      <p className="mt-1 min-h-5 text-xs opacity-75">{metric.detail}</p>
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
  return (
    <section className="rounded-lg border border-slate-200 bg-[#fbfaf7]">
      <div className="flex items-start gap-3 border-b border-slate-200 px-4 py-4">
        <span className="rounded-md border border-slate-200 bg-white p-2 text-slate-700">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">{subtitle}</p>
        </div>
      </div>

      <div className="space-y-3 p-3">
        {items.length > 0 ? (
          items.map(item => <CommandItemCard key={item.id} item={item} />)
        ) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-6">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <h3 className="mt-3 text-sm font-semibold text-slate-950">{emptyTitle}</h3>
            <p className="mt-1 text-sm leading-5 text-slate-600">{emptyDescription}</p>
          </div>
        )}
      </div>
    </section>
  )
}

function CommandItemCard({ item }: { item: CommandCenterItem }) {
  return (
    <article className={`rounded-lg border bg-white p-3 ${itemToneClass(item.tone)}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-slate-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-600">
          {item.category}
        </span>
        <span className="rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-500">
          {item.urgencyLabel}
        </span>
      </div>

      <div className="mt-3">
        <h3 className="text-sm font-semibold leading-5 text-slate-950">{item.title}</h3>
        <p className="mt-1 text-xs text-slate-500">{item.affectedEntityLabel}</p>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <MetricPill label="Impacto" value={item.impactLabel} />
        <MetricPill label="Dono" value={item.ownerLabel} />
        {item.confidenceLabel && <MetricPill label="Confianca" value={item.confidenceLabel} />}
      </div>

      <p className="mt-3 border-t border-slate-100 pt-3 text-xs leading-5 text-slate-600">
        <span className="font-semibold text-slate-800">Evidencia:</span> {item.evidence}
      </p>

      <div className="mt-3 flex justify-end">
        <Link
          to={item.href}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-[#fbfaf7] px-3 py-1.5 text-xs font-semibold text-slate-800 hover:border-slate-500 hover:bg-white"
        >
          {item.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </article>
  )
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-[#f8f6f1] px-2.5 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-semibold leading-4 text-slate-900">{value}</p>
    </div>
  )
}

function ContextualShortcuts({ shortcuts }: { shortcuts: ContextualShortcut[] }) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-[#fbfaf7]">
      <div className="border-b border-slate-200 px-4 py-4">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-950">Atalhos contextuais</h2>
        </div>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Comandos derivados do estado atual da operacao.
        </p>
      </div>
      <div className="space-y-2 p-3">
        {shortcuts.length > 0 ? shortcuts.map(shortcut => (
          <Link
            key={shortcut.id}
            to={shortcut.href}
            className={`block rounded-lg border bg-white p-3 text-sm hover:border-slate-400 ${shortcutToneClass(shortcut.tone)}`}
          >
            <span className="block font-semibold leading-5 text-slate-950">{shortcut.label}</span>
            <span className="mt-1 block text-xs text-slate-500">{shortcut.detail}</span>
          </Link>
        )) : (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            Nenhum atalho contextual nesta janela.
          </div>
        )}
      </div>
    </aside>
  )
}

function PortfolioMap({ rows }: { rows: PortfolioMapRow[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-[#fbfaf7]">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-4">
        <Table2 className="h-4 w-4 text-slate-500" />
        <div>
          <h2 className="text-base font-semibold text-slate-950">Mapa da Carteira</h2>
          <p className="mt-1 text-sm text-slate-600">
            Cliente, contrato, entrega, performance, risco, oportunidade e proxima acao.
          </p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-[980px] w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-[#f2efe8] text-[11px] uppercase tracking-[0.14em] text-slate-500">
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
          <tbody className="divide-y divide-slate-100 bg-white">
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
    return 'inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-800'
  }
  if (status === 'Parcial') {
    return 'inline-flex items-center rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800'
  }
  return 'inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-800'
}

function pulseToneClass(tone: PulseMetric['tone']) {
  const classes = {
    risk: 'border-red-200 bg-red-50 text-red-950',
    opportunity: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    neutral: 'border-slate-200 bg-white text-slate-950',
    warning: 'border-amber-200 bg-amber-50 text-amber-950',
  }
  return classes[tone]
}

function itemToneClass(tone: CommandCenterItem['tone']) {
  const classes = {
    critical: 'border-l-4 border-l-red-600',
    warning: 'border-l-4 border-l-amber-500',
    opportunity: 'border-l-4 border-l-emerald-600',
    efficiency: 'border-l-4 border-l-sky-700',
    neutral: 'border-l-4 border-l-slate-400',
  }
  return classes[tone]
}

function shortcutToneClass(tone: ContextualShortcut['tone']) {
  const classes = {
    risk: 'border-l-4 border-l-red-600',
    opportunity: 'border-l-4 border-l-emerald-600',
    neutral: 'border-l-4 border-l-slate-400',
    warning: 'border-l-4 border-l-amber-500',
  }
  return classes[tone]
}
