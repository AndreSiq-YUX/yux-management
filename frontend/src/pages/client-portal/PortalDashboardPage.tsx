import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  Gauge,
  LayoutGrid,
  Loader2,
  PackagePlus,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PortalEmptyState } from '@/components/client-portal/PortalEmptyState'
import { usePortalActionSummary } from '@/hooks/usePortalActionSummary'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import {
  buildPortalDashboardModel,
  type PortalAttentionItem,
  type PortalDashboardDataStatus,
  type PortalDashboardFocus,
  type PortalDashboardTone,
  type PortalDashboardWindow,
  type PortalExecutiveDashboardModel,
  type PortalExpansionSuggestion,
  type PortalMainResult,
  type PortalModuleSummary,
  type PortalPulseMetric,
  type PortalRecommendationItem,
  type PortalYuxActivityItem,
} from '@/lib/client-portal/portalDashboardRules'
import { usePlatformStore } from '@/stores/platformStore'

const timeWindows: PortalDashboardWindow[] = ['Hoje', '7 dias', '30 dias']

const resultToneClass: Record<PortalDashboardTone, string> = {
  critical: 'border-red-200 bg-red-50 text-red-900',
  attention: 'border-amber-200 bg-amber-50 text-amber-900',
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  neutral: 'border-slate-200 bg-[#fafafa] text-[#141821]',
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

const attentionClass: Record<PortalAttentionItem['priority'], string> = {
  critical: 'border-l-red-600 bg-red-50/40',
  high: 'border-l-amber-500 bg-amber-50/40',
  normal: 'border-l-[#2563EB] bg-white',
}

const moduleStatusClass: Record<PortalModuleSummary['statusLabel'], string> = {
  Ativo: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Precisa de atencao': 'border-amber-200 bg-amber-50 text-amber-800',
  'Sem dados': 'border-slate-200 bg-slate-50 text-slate-700',
  'Em implantacao': 'border-indigo-200 bg-indigo-50 text-indigo-800',
}

const focusIcon: Record<PortalDashboardFocus, LucideIcon> = {
  commercial: TrendingUp,
  marketing: Sparkles,
  delivery: Briefcase,
  executive: Gauge,
}

function dataStatusClass(status: PortalDashboardDataStatus) {
  if (status === 'Completo') {
    return 'inline-flex items-center gap-2 text-sm text-emerald-800 before:h-2 before:w-2 before:rounded-full before:bg-emerald-500'
  }
  if (status === 'Parcial') {
    return 'inline-flex items-center gap-2 text-sm text-amber-800 before:h-2 before:w-2 before:rounded-full before:bg-amber-500'
  }
  return 'inline-flex items-center gap-2 text-sm text-red-800 before:h-2 before:w-2 before:rounded-full before:bg-red-500'
}

function pulseIconClass(tone: PortalDashboardTone) {
  if (tone === 'critical') return 'border border-red-200 text-red-600'
  if (tone === 'attention') return 'border border-amber-200 text-amber-600'
  if (tone === 'positive' || tone === 'healthy') return 'border border-emerald-200 text-emerald-700'
  return 'border border-slate-200 text-slate-500'
}

function metricDetailClass(tone: PortalDashboardTone) {
  if (tone === 'critical') return 'text-red-600'
  if (tone === 'attention') return 'text-amber-700'
  if (tone === 'positive' || tone === 'healthy') return 'text-emerald-700'
  return 'text-slate-600'
}

function PanelHeader({
  description,
  icon: Icon,
  title,
}: {
  description: string
  icon: LucideIcon
  title: string
}) {
  return (
    <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-base font-semibold text-[#141821]">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
      </div>
    </div>
  )
}

function PulseCard({ metric, portalPath }: { metric: PortalPulseMetric; portalPath: (href?: string) => string }) {
  const content = (
    <article className="flex min-h-24 items-center gap-4 px-5 py-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${pulseIconClass(metric.tone)}`}>
        {metric.tone === 'critical' ? (
          <ShieldAlert className="h-5 w-5" />
        ) : metric.tone === 'positive' || metric.tone === 'healthy' ? (
          <Sparkles className="h-5 w-5" />
        ) : metric.tone === 'attention' ? (
          <Clock3 className="h-5 w-5" />
        ) : (
          <UserRound className="h-5 w-5" />
        )}
      </span>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">{metric.label}</p>
        <p className="mt-1 text-2xl font-semibold tracking-[-0.01em] text-slate-950">{metric.value}</p>
        <p className={`mt-0.5 text-xs ${metricDetailClass(metric.tone)}`}>{metric.detail}</p>
      </div>
    </article>
  )

  if (!metric.href) return content

  return (
    <Link to={portalPath(metric.href)} className="block h-full hover:bg-slate-50">
      {content}
    </Link>
  )
}

function MainResultPanel({ result, portalPath }: { result: PortalMainResult; portalPath: (href?: string) => string }) {
  const FocusIcon = focusIcon[result.focus]

  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      <PanelHeader
        icon={FocusIcon}
        title={result.title}
        description={result.narrative}
      />
      <div className="px-5 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Resultado principal</p>
            <p className="mt-3 text-4xl font-semibold tracking-normal text-[#050816]">{result.headlineMetric}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{result.headlineDetail}</p>
          </div>
          <Link
            to={portalPath(result.ctaHref)}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-sm bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]"
          >
            {result.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {result.signals.map(signal => (
            <div key={`${signal.label}-${signal.value}`} className={`rounded-sm border p-3 ${resultToneClass[signal.tone]}`}>
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{signal.label}</p>
              <p className="mt-2 text-base font-semibold text-[#141821]">{signal.value}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{signal.detail}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AttentionPanel({ items, portalPath }: { items: PortalAttentionItem[]; portalPath: (href?: string) => string }) {
  return (
    <section className="rounded-sm border border-slate-300 border-t-2 border-t-red-600 bg-white">
      <PanelHeader
        icon={ShieldAlert}
        title="Pontos de atencao"
        description="Pendencias, bloqueios e decisoes que podem afetar resultado, prazo ou operacao."
      />
      <div className="space-y-3 p-5">
        {items.length === 0 ? (
          <div className="rounded-sm border border-dashed border-slate-300 bg-white p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="font-semibold text-emerald-950">Nada urgente agora</h3>
                <p className="mt-1 text-sm leading-6 text-emerald-800">Acoes, aprovacoes e vencimentos principais nao indicam risco imediato.</p>
              </div>
            </div>
          </div>
        ) : items.map(item => (
          <article key={item.id} className={`rounded-sm border border-slate-200 border-l-2 p-4 ${attentionClass[item.priority]}`}>
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-sm border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-600">
                    {item.impactLabel}
                  </span>
                  <span className="text-xs text-slate-500">Dono: {item.expectedOwner}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold leading-6 text-[#050816]">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
              <Link
                to={portalPath(item.href)}
                className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
              >
                {item.actionLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ActivityList({
  emptyIcon: EmptyIcon,
  emptyText,
  items,
  portalPath,
}: {
  emptyIcon: LucideIcon
  emptyText: string
  items: Array<PortalYuxActivityItem | PortalRecommendationItem>
  portalPath: (href?: string) => string
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-sm border border-slate-200 bg-[#fafafa] p-4">
        <div className="flex items-start gap-3">
          <EmptyIcon className="mt-0.5 h-5 w-5 text-slate-500" />
          <p className="text-sm leading-6 text-slate-600">{emptyText}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-200 rounded-sm border border-slate-200">
      {items.map(item => (
        <Link key={item.id} to={portalPath(item.href)} className="block px-4 py-3 transition-colors hover:bg-slate-50">
          <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-[#141821]">{item.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
            </div>
            <span className="w-fit rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">{item.impactLabel}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}

function YuxWorkPanel({
  model,
  portalPath,
}: {
  model: PortalExecutiveDashboardModel
  portalPath: (href?: string) => string
}) {
  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      <PanelHeader
        icon={Clock3}
        title="Trabalho da YUX"
        description="O que o time YUX esta conduzindo e quais oportunidades ja foram identificadas."
      />
      <div className="grid gap-5 p-5 xl:grid-cols-2">
        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Em andamento</p>
          <ActivityList
            emptyIcon={Briefcase}
            emptyText="Nenhuma atividade recente registrada para este contrato."
            items={model.yuxActivity}
            portalPath={portalPath}
          />
        </div>
        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-500">Insights e oportunidades</p>
          <ActivityList
            emptyIcon={Sparkles}
            emptyText="Sem novas recomendacoes operacionais no momento."
            items={model.recommendations}
            portalPath={portalPath}
          />
        </div>
      </div>
    </section>
  )
}

function ModulesPanel({
  modules,
  portalPath,
  suggestions,
}: {
  modules: PortalModuleSummary[]
  portalPath: (href?: string) => string
  suggestions: PortalExpansionSuggestion[]
}) {
  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      <PanelHeader
        icon={LayoutGrid}
        title="Modulos contratados"
        description="Leitura objetiva do que esta ativo no contrato e do que a YUX recomenda considerar em seguida."
      />
      <div className="grid gap-5 p-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3 lg:grid-cols-2">
          {modules.map(module => (
            <Link key={module.moduleKey} to={portalPath(module.href)} className="rounded-sm border border-slate-200 bg-white p-4 transition-colors hover:border-[#2563EB]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[#141821]">{module.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{module.signal}</p>
                </div>
                <span className={`shrink-0 rounded-sm border px-2 py-1 text-xs font-medium ${moduleStatusClass[module.statusLabel]}`}>
                  {module.statusLabel}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-sm border border-slate-200 bg-[#fafafa] p-4">
          <div className="mb-3 flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-[#2563EB]" />
            <h3 className="font-semibold text-[#141821]">Expansao recomendada</h3>
          </div>
          {suggestions.length === 0 ? (
            <p className="text-sm leading-6 text-slate-600">Nao ha sugestao prioritaria de modulo adicional para o estado atual do contrato.</p>
          ) : (
            <div className="space-y-3">
              {suggestions.map(suggestion => (
                <Link key={suggestion.id} to={portalPath(suggestion.href)} className="block rounded-sm border border-slate-200 bg-white p-3 transition-colors hover:border-[#2563EB]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#141821]">{suggestion.moduleName}</span>
                    <span className="rounded-sm border border-[#2563EB]/20 bg-[#2563EB]/5 px-2 py-0.5 text-xs font-medium text-[#2563EB]">{suggestion.ctaLabel}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{suggestion.reason}</p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{suggestion.expectedGain}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

export function PortalDashboardPage() {
  const portalPath = usePortalWorkspacePath()
  const [selectedWindow, setSelectedWindow] = useState<PortalDashboardWindow>('7 dias')
  const {
    activeContract,
    enabledModuleKeys,
    isLoading,
    organization,
  } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    enabledModuleKeys: state.enabledModuleKeys,
    isLoading: state.isLoading,
    organization: state.organization,
  }))
  const actionSummary = usePortalActionSummary()

  const model = useMemo(() => buildPortalDashboardModel({
    organization,
    contract: activeContract,
    enabledModuleKeys,
    actions: actionSummary.actions,
    projects: actionSummary.projects,
    approvals: actionSummary.approvals,
    invoices: actionSummary.invoices,
    crm: {
      leads: actionSummary.crm.leads,
      tasks: actionSummary.crm.tasks,
      loading: actionSummary.crm.loading,
      error: actionSummary.crm.error,
    },
    marketing: {
      campaigns: actionSummary.marketing.campaigns,
      contents: actionSummary.marketing.contents,
      reviews: actionSummary.marketing.reviews,
      creativeSuggestions: actionSummary.marketing.creativeSuggestions,
      workflowRuns: actionSummary.marketing.workflowRuns,
      loading: actionSummary.marketing.loading,
      error: actionSummary.marketing.error,
    },
    actionLoading: actionSummary.loading,
    actionError: actionSummary.error,
    windowLabel: selectedWindow,
  }), [activeContract, actionSummary, enabledModuleKeys, organization, selectedWindow])

  if (isLoading) {
    return (
      <div className="flex min-h-[320px] items-center gap-3 text-sm text-slate-600">
        <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
        Carregando portal...
      </div>
    )
  }

  if (!activeContract) {
    return (
      <PortalEmptyState
        title="Nenhum contrato ativo encontrado"
        description="Entre em contato com a YUX para revisar o acesso ao portal e liberar os modulos contratados."
      />
    )
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] space-y-4 bg-[#f4f4f4] px-4 py-5 text-[#141821] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-6">
      <header className="flex flex-col gap-5 border-b border-slate-200/80 pb-5 xl:flex-row xl:items-start xl:justify-between">
        <div className="max-w-3xl">
          <h1 className="text-3xl font-semibold leading-tight tracking-[-0.01em] text-[#141821]">
            Visao Geral do Cliente
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            Painel executivo para acompanhar prioridades, resultados, trabalho da YUX e oportunidades de expansao do contrato.
          </p>
        </div>

        <div className="flex flex-col items-start gap-3 xl:items-end">
          <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700">
            <span className={dataStatusClass(model.dataStatus)}>
              {model.dataStatus}
            </span>
            <span className="inline-flex items-center gap-2">
              <UserRound className="h-4 w-4 text-slate-900" />
              Cliente: {model.organizationName}
            </span>
            <span className="inline-flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-slate-500" />
              Contrato: {model.contractName}
            </span>
            <span className="inline-flex items-center gap-2">
              <Clock3 className="h-4 w-4 text-slate-500" />
              {model.generatedAtLabel}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex overflow-hidden rounded-sm border border-slate-300 bg-white text-sm text-slate-700">
              {timeWindows.map(label => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setSelectedWindow(label)}
                  className={label === model.windowLabel
                    ? 'min-w-20 border-x border-[#2563eb] bg-[#2563eb] px-5 py-2.5 font-semibold text-white first:border-l-0'
                    : 'min-w-20 border-r border-slate-200 px-5 py-2.5 font-normal hover:bg-slate-50 last:border-r-0'}
                  aria-pressed={label === model.windowLabel}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={actionSummary.reload}
              className="inline-flex items-center gap-2 rounded-sm border border-[#2563eb] bg-[#2563eb] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
            >
              Atualizar indicadores
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

        {model.dataStatus !== 'Completo' && (
          <section className="rounded-sm border border-amber-200 bg-amber-50 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
              <div>
                <h2 className="font-semibold text-amber-950">Nao foi possivel carregar todos os indicadores do cliente.</h2>
                <p className="mt-1 text-sm leading-6 text-amber-800">
                  Fontes indisponiveis: {model.unavailableSources.join(', ')}.
                </p>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-sm border border-slate-300 bg-white">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Pulso Executivo</p>
              <h2 className="sr-only">Indicadores adaptados ao contrato e ao foco atual do cliente</h2>
            </div>
            {actionSummary.loading ? (
              <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                Atualizando dados
              </span>
            ) : (
              <Gauge className="hidden h-5 w-5 text-slate-400 sm:block" />
            )}
          </div>
          <div className="grid divide-y divide-slate-200 md:grid-cols-5 md:divide-x md:divide-y-0">
            {model.pulse.map(metric => (
              <PulseCard key={metric.id} metric={metric} portalPath={portalPath} />
            ))}
          </div>
        </section>

        <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
          <MainResultPanel result={model.mainResult} portalPath={portalPath} />
          <AttentionPanel items={model.attentionItems} portalPath={portalPath} />
        </div>

        <YuxWorkPanel model={model} portalPath={portalPath} />
        <ModulesPanel modules={model.activeModules} suggestions={model.expansionSuggestions} portalPath={portalPath} />
    </div>
  )
}
