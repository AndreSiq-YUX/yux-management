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
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PortalEmptyState } from '@/components/client-portal/PortalEmptyState'
import { usePortalActionSummary } from '@/hooks/usePortalActionSummary'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import {
  buildPortalDashboardModel,
  type PortalAttentionItem,
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
import { statusLabel } from '@/lib/client-portal/portalDisplay'
import { usePlatformStore } from '@/stores/platformStore'

const timeWindows: PortalDashboardWindow[] = ['Hoje', '7 dias', '30 dias']

const pulseToneClass: Record<PortalDashboardTone, string> = {
  critical: 'border-red-200 bg-red-50 text-red-900',
  attention: 'border-amber-200 bg-amber-50 text-amber-900',
  healthy: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  neutral: 'border-slate-200 bg-white text-[#141821]',
  positive: 'border-emerald-200 bg-emerald-50 text-emerald-900',
}

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

function formatDateOnly(value?: string) {
  if (!value) return 'Nao informado'
  const [year, month, day] = value.split('T')[0].split('-')
  return [day, month, year].filter(Boolean).join('/')
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
    <div className={`h-full rounded-md border p-4 ${pulseToneClass[metric.tone]}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">{metric.label}</p>
      <p className="mt-4 text-3xl font-semibold text-[#050816]">{metric.value}</p>
      <p className="mt-2 text-sm text-slate-600">{metric.detail}</p>
    </div>
  )

  if (!metric.href) return content

  return (
    <Link to={portalPath(metric.href)} className="block h-full transition-transform hover:-translate-y-0.5">
      {content}
    </Link>
  )
}

function MainResultPanel({ result, portalPath }: { result: PortalMainResult; portalPath: (href?: string) => string }) {
  const FocusIcon = focusIcon[result.focus]

  return (
    <section className="rounded-md border border-slate-200 bg-white">
      <PanelHeader
        icon={FocusIcon}
        title={result.title}
        description={result.narrative}
      />
      <div className="px-5 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">Resultado principal</p>
            <p className="mt-3 text-4xl font-semibold tracking-normal text-[#050816]">{result.headlineMetric}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">{result.headlineDetail}</p>
          </div>
          <Link
            to={portalPath(result.ctaHref)}
            className="inline-flex w-fit items-center justify-center gap-2 rounded-md bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]"
          >
            {result.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {result.signals.map(signal => (
            <div key={`${signal.label}-${signal.value}`} className={`rounded-md border p-3 ${resultToneClass[signal.tone]}`}>
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">{signal.label}</p>
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
    <section className="rounded-md border border-slate-200 bg-white">
      <PanelHeader
        icon={ShieldAlert}
        title="Pontos de atencao"
        description="Pendencias, bloqueios e decisoes que podem afetar resultado, prazo ou operacao."
      />
      <div className="space-y-3 p-5">
        {items.length === 0 ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="font-semibold text-emerald-950">Nada urgente agora</h3>
                <p className="mt-1 text-sm leading-6 text-emerald-800">Acoes, aprovacoes e vencimentos principais nao indicam risco imediato.</p>
              </div>
            </div>
          </div>
        ) : items.map(item => (
          <article key={item.id} className={`rounded-md border border-slate-200 border-l-2 p-4 ${attentionClass[item.priority]}`}>
            <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-600">
                    {item.impactLabel}
                  </span>
                  <span className="text-xs text-slate-500">Dono: {item.expectedOwner}</span>
                </div>
                <h3 className="mt-3 text-sm font-semibold leading-6 text-[#050816]">{item.title}</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
              </div>
              <Link
                to={portalPath(item.href)}
                className="inline-flex w-fit shrink-0 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 transition-colors hover:border-[#2563EB] hover:text-[#2563EB]"
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
      <div className="rounded-md border border-slate-200 bg-[#fafafa] p-4">
        <div className="flex items-start gap-3">
          <EmptyIcon className="mt-0.5 h-5 w-5 text-slate-500" />
          <p className="text-sm leading-6 text-slate-600">{emptyText}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="divide-y divide-slate-200 rounded-md border border-slate-200">
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
    <section className="rounded-md border border-slate-200 bg-white">
      <PanelHeader
        icon={Clock3}
        title="Trabalho da YUX"
        description="O que o time YUX esta conduzindo e quais oportunidades ja foram identificadas."
      />
      <div className="grid gap-5 p-5 xl:grid-cols-2">
        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">Em andamento</p>
          <ActivityList
            emptyIcon={Briefcase}
            emptyText="Nenhuma atividade recente registrada para este contrato."
            items={model.yuxActivity}
            portalPath={portalPath}
          />
        </div>
        <div>
          <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">Insights e oportunidades</p>
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
    <section className="rounded-md border border-slate-200 bg-white">
      <PanelHeader
        icon={LayoutGrid}
        title="Modulos contratados"
        description="Leitura objetiva do que esta ativo no contrato e do que a YUX recomenda considerar em seguida."
      />
      <div className="grid gap-5 p-5 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="grid gap-3 lg:grid-cols-2">
          {modules.map(module => (
            <Link key={module.moduleKey} to={portalPath(module.href)} className="rounded-md border border-slate-200 bg-white p-4 transition-colors hover:border-[#2563EB]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[#141821]">{module.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{module.signal}</p>
                </div>
                <span className={`shrink-0 rounded border px-2 py-1 text-xs font-medium ${moduleStatusClass[module.statusLabel]}`}>
                  {module.statusLabel}
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="rounded-md border border-slate-200 bg-[#fafafa] p-4">
          <div className="mb-3 flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-[#2563EB]" />
            <h3 className="font-semibold text-[#141821]">Expansao recomendada</h3>
          </div>
          {suggestions.length === 0 ? (
            <p className="text-sm leading-6 text-slate-600">Nao ha sugestao prioritaria de modulo adicional para o estado atual do contrato.</p>
          ) : (
            <div className="space-y-3">
              {suggestions.map(suggestion => (
                <Link key={suggestion.id} to={portalPath(suggestion.href)} className="block rounded-md border border-slate-200 bg-white p-3 transition-colors hover:border-[#2563EB]">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-[#141821]">{suggestion.moduleName}</span>
                    <span className="rounded border border-[#2563EB]/20 bg-[#2563EB]/5 px-2 py-0.5 text-xs font-medium text-[#2563EB]">{suggestion.ctaLabel}</span>
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
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#f4f4f4] px-4 py-5 text-[#141821] sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-6">
      <div className="space-y-5">
        <section className="rounded-md border border-slate-200 bg-white p-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">
                <span>YUX Portal</span>
                <span className="h-1 w-1 rounded-full bg-slate-300" />
                <span>{model.focusLabel}</span>
              </div>
              <h1 className="text-3xl font-semibold tracking-normal text-[#050816]">Visao Geral do Cliente</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
                Painel executivo para acompanhar prioridades, resultados, trabalho da YUX e oportunidades de expansao do contrato.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  Cliente: {model.organizationName}
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  Contrato: {model.contractName}
                </span>
                <span className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700">
                  Inicio: {formatDateOnly(activeContract.startsAt)}
                </span>
                <span className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800">
                  {statusLabel(activeContract.status)}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row xl:items-center">
              <div className="inline-flex rounded-md border border-slate-200 bg-white p-1">
                {timeWindows.map(windowLabel => (
                  <button
                    key={windowLabel}
                    type="button"
                    aria-pressed={selectedWindow === windowLabel}
                    onClick={() => setSelectedWindow(windowLabel)}
                    className={`whitespace-nowrap rounded px-3 py-1.5 text-sm transition-colors ${
                      selectedWindow === windowLabel
                        ? 'bg-[#050816] font-semibold text-white'
                        : 'font-normal text-slate-600 hover:text-[#050816]'
                    }`}
                  >
                    {windowLabel}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={actionSummary.reload}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md border border-[#2563EB]/30 bg-white px-4 py-2 text-sm font-semibold text-[#2563EB] transition-colors hover:bg-[#2563EB] hover:text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar visao
              </button>
            </div>
          </div>
        </section>

        {model.dataStatus !== 'Completo' && (
          <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
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

        <section className="rounded-md border border-slate-200 bg-white p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-500">Pulso Executivo</p>
              <h2 className="mt-1 text-sm font-semibold text-[#141821]">Indicadores adaptados ao contrato e ao foco atual do cliente</h2>
            </div>
            {actionSummary.loading && (
              <span className="inline-flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-[#2563EB]" />
                Atualizando dados
              </span>
            )}
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            {model.pulse.map(metric => (
              <PulseCard key={metric.id} metric={metric} portalPath={portalPath} />
            ))}
          </div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[1.12fr_0.88fr]">
          <MainResultPanel result={model.mainResult} portalPath={portalPath} />
          <AttentionPanel items={model.attentionItems} portalPath={portalPath} />
        </div>

        <YuxWorkPanel model={model} portalPath={portalPath} />
        <ModulesPanel modules={model.activeModules} suggestions={model.expansionSuggestions} portalPath={portalPath} />
      </div>
    </div>
  )
}
