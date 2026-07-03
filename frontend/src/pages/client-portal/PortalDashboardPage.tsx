import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowLeftRight,
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
import { PortalEmptyState } from '@/components/client-portal/PortalEmptyState'
import { usePortalActionSummary } from '@/hooks/usePortalActionSummary'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import {
  buildPortalDashboardModel,
  type PortalAttentionItem,
  type PortalDashboardTone,
  type PortalDashboardWindow,
  type PortalExecutiveDashboardModel,
  type PortalExpansionSuggestion,
  type PortalModuleSummary,
  type PortalPulseMetric,
} from '@/lib/client-portal/portalDashboardRules'
import { statusLabel } from '@/lib/client-portal/portalDisplay'
import { usePlatformStore } from '@/stores/platformStore'
import type { ContractStatus } from '@/types/platform'

type LaneTone = 'critical' | 'warning' | 'opportunity' | 'efficiency' | 'neutral'

interface ClientLaneItem {
  id: string
  title: string
  affectedEntityLabel: string
  category: string
  urgencyLabel: string
  impactLabel: string
  confidenceLabel?: string
  ownerLabel: string
  evidence: string
  actionLabel: string
  href: string
  tone: LaneTone
}

interface ClientShortcut {
  id: string
  label: string
  detail: string
  href: string
  tone: 'risk' | 'opportunity' | 'neutral' | 'warning'
}

const timeWindows: PortalDashboardWindow[] = ['Hoje', '7 dias', '30 dias']

function formatDateOnly(value?: string) {
  if (!value) return 'Nao informado'
  const [year, month, day] = value.split('T')[0].split('-')
  return [day, month, year].filter(Boolean).join('/')
}

function toPulseTone(tone: PortalDashboardTone): 'risk' | 'opportunity' | 'neutral' | 'warning' {
  if (tone === 'critical') return 'risk'
  if (tone === 'attention') return 'warning'
  if (tone === 'positive' || tone === 'healthy') return 'opportunity'
  return 'neutral'
}

function buildResolveItems(items: PortalAttentionItem[]): ClientLaneItem[] {
  return items.map(item => ({
    id: item.id,
    title: item.title,
    affectedEntityLabel: item.description,
    category: item.impactLabel,
    urgencyLabel: item.priority === 'critical' ? 'Agora' : 'Esta semana',
    impactLabel: item.impactLabel,
    ownerLabel: item.expectedOwner,
    evidence: item.description,
    actionLabel: item.actionLabel,
    href: item.href,
    tone: item.priority === 'critical' ? 'critical' : item.priority === 'high' ? 'warning' : 'neutral',
  }))
}

function buildOpportunityItems(model: PortalExecutiveDashboardModel): ClientLaneItem[] {
  const recommendationItems: ClientLaneItem[] = model.recommendations.map(item => ({
    id: item.id,
    title: item.title,
    affectedEntityLabel: item.detail,
    category: 'Insight',
    urgencyLabel: model.windowLabel,
    impactLabel: item.impactLabel,
    confidenceLabel: 'Confianca media',
    ownerLabel: 'YUX / Cliente',
    evidence: item.detail,
    actionLabel: 'Abrir contexto',
    href: item.href,
    tone: 'opportunity',
  }))

  const expansionItems: ClientLaneItem[] = model.expansionSuggestions.map(item => ({
    id: item.id,
    title: item.moduleName,
    affectedEntityLabel: item.reason,
    category: 'Expansao',
    urgencyLabel: item.confidence === 'high' ? 'Prioritario' : 'Avaliar',
    impactLabel: item.expectedGain,
    confidenceLabel: item.confidence === 'high' ? 'Alta' : item.confidence === 'medium' ? 'Media' : 'Baixa',
    ownerLabel: 'YUX / Comercial',
    evidence: item.reason,
    actionLabel: item.ctaLabel,
    href: item.href,
    tone: 'opportunity',
  }))

  return [...recommendationItems, ...expansionItems].slice(0, 3)
}

function buildShortcuts(model: PortalExecutiveDashboardModel, resolveItems: ClientLaneItem[], opportunityItems: ClientLaneItem[]): ClientShortcut[] {
  return [
    resolveItems[0] ? {
      id: `risk-${resolveItems[0].id}`,
      label: resolveItems[0].title,
      detail: resolveItems[0].actionLabel,
      href: resolveItems[0].href,
      tone: 'risk',
    } : null,
    opportunityItems[0] ? {
      id: `opportunity-${opportunityItems[0].id}`,
      label: opportunityItems[0].impactLabel,
      detail: opportunityItems[0].title,
      href: opportunityItems[0].href,
      tone: 'opportunity',
    } : null,
    model.activeModules[0] ? {
      id: `module-${model.activeModules[0].moduleKey}`,
      label: model.activeModules[0].title,
      detail: model.activeModules[0].signal,
      href: model.activeModules[0].href,
      tone: 'neutral',
    } : null,
  ].filter(Boolean) as ClientShortcut[]
}

export function PortalDashboardPage() {
  const portalPath = usePortalWorkspacePath()
  const [selectedWindow, setSelectedWindow] = useState<PortalDashboardWindow>('7 dias')
  const {
    activeContract,
    enabledModuleKeys,
    isLoading,
    mode,
    organization,
  } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    enabledModuleKeys: state.enabledModuleKeys,
    isLoading: state.isLoading,
    mode: state.mode,
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

  const resolveItems = useMemo(() => buildResolveItems(model.attentionItems), [model.attentionItems])
  const opportunityItems = useMemo(() => buildOpportunityItems(model), [model])
  const shortcuts = useMemo(() => buildShortcuts(model, resolveItems, opportunityItems), [model, opportunityItems, resolveItems])

  if (isLoading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-yux-600" />
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
            Mesa de comando para prioridades, resultados, trabalho da YUX e oportunidades de expansao.
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
            {mode === 'client_workspace' && (
              <Link
                to="/client-workspaces"
                className="inline-flex items-center gap-2 rounded-sm border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-900 hover:bg-slate-50"
              >
                Trocar workspace
                <ArrowLeftRight className="h-4 w-4" />
              </Link>
            )}
          </div>
        </div>

        {model.dataStatus !== 'Completo' && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">Nao foi possivel carregar todos os indicadores do cliente.</p>
                {model.unavailableSources.length > 0 && (
                  <p className="mt-1 text-xs text-amber-800">
                    Fontes indisponiveis: {model.unavailableSources.join(', ')}.
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <section aria-labelledby="client-executive-pulse-title" className="rounded-sm border border-slate-300 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-950">Pulso Executivo</p>
            <h2 id="client-executive-pulse-title" className="sr-only">
              Indicadores adaptados ao contrato e ao foco atual do cliente
            </h2>
          </div>
          <Gauge className="hidden h-5 w-5 text-slate-400 sm:block" />
        </div>
        <div className="grid divide-y divide-slate-200 md:grid-cols-5 md:divide-x md:divide-y-0">
          {model.pulse.map(metric => (
            <PulseCard key={metric.label} metric={metric} portalPath={portalPath} />
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_15.5rem]">
        <ClientCommandLane
          title="Resolver agora"
          subtitle="Pendencias, bloqueios e decisoes que podem afetar resultado, prazo ou operacao."
          items={resolveItems}
          emptyTitle="Nada urgente agora"
          emptyDescription="Acoes, aprovacoes e vencimentos principais nao indicam risco imediato."
          icon={ShieldAlert}
          portalPath={portalPath}
        />
        <ClientCommandLane
          title="Aproveitar oportunidade"
          subtitle="Insights, expansao de contrato e recomendacoes ranqueadas por impacto."
          items={opportunityItems}
          emptyTitle="Nenhuma oportunidade prioritaria"
          emptyDescription="A YUX ainda nao tem sinais suficientes para recomendar expansao ou otimizacao nesta janela."
          icon={Sparkles}
          portalPath={portalPath}
        />
        <ContextualShortcuts shortcuts={shortcuts} portalPath={portalPath} />
      </section>

      <ContractMap modules={model.activeModules} suggestions={model.expansionSuggestions} contractName={model.contractName} portalPath={portalPath} startsAt={activeContract.startsAt} status={activeContract.status} />
    </div>
  )
}

function PulseCard({ metric, portalPath }: { metric: PortalPulseMetric; portalPath: (href?: string) => string }) {
  const content = (
    <article className="flex min-h-24 items-center gap-4 px-5 py-4">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${pulseIconClass(toPulseTone(metric.tone))}`}>
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
        <p className={`mt-0.5 text-xs ${metric.tone === 'critical' ? 'text-red-600' : metric.tone === 'positive' || metric.tone === 'healthy' ? 'text-emerald-700' : 'text-slate-600'}`}>
          {metric.detail}
        </p>
      </div>
    </article>
  )

  if (!metric.href) return content

  return (
    <Link to={portalPath(metric.href)} className="block hover:bg-slate-50">
      {content}
    </Link>
  )
}

function ClientCommandLane({
  title,
  subtitle,
  items,
  emptyTitle,
  emptyDescription,
  icon: Icon,
  portalPath,
}: {
  title: string
  subtitle: string
  items: ClientLaneItem[]
  emptyTitle: string
  emptyDescription: string
  icon: typeof ShieldAlert
  portalPath: (href?: string) => string
}) {
  const isOpportunityLane = title === 'Aproveitar oportunidade'

  return (
    <section className={`rounded-sm border border-slate-300 bg-white ${isOpportunityLane ? 'border-t-2 border-t-emerald-700' : 'border-t-2 border-t-red-600'}`}>
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
          items.map(item => <ClientCommandItemCard key={item.id} item={item} portalPath={portalPath} />)
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
          <Link to={portalPath(isOpportunityLane ? '/portal/relatorios' : '/portal/projetos/aprovacoes')} className="inline-flex items-center gap-2 text-sm font-medium text-[#2563eb] hover:text-[#1d4ed8]">
            {isOpportunityLane ? 'Ver todas as oportunidades' : 'Ver todos os pontos de atencao'}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      )}
    </section>
  )
}

function ClientCommandItemCard({ item, portalPath }: { item: ClientLaneItem; portalPath: (href?: string) => string }) {
  const Icon = item.tone === 'opportunity' || item.tone === 'efficiency' ? Sparkles : AlertTriangle

  return (
    <article className={`rounded-sm border bg-white ${itemToneClass(item.tone)}`}>
      <div className="grid gap-3 p-3 sm:grid-cols-[3.25rem_minmax(0,1fr)]">
        <div className={`flex h-12 w-12 items-center justify-center rounded-full border ${itemIconClass(item.tone)}`}>
          <Icon className="h-6 w-6" />
        </div>

        <div className="min-w-0 space-y-3">
          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-[minmax(11rem,1fr)_minmax(5.75rem,.5fr)_minmax(6rem,.55fr)_minmax(7rem,.65fr)] 2xl:items-center">
            <div className="min-w-0 md:col-span-2 2xl:col-span-1">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <span className={`rounded-sm border px-2 py-0.5 text-xs font-medium ${itemBadgeClass(item.tone)}`}>
                  {item.category}
                </span>
                <span className="text-xs text-slate-500">{item.urgencyLabel}</span>
              </div>
              <h3 className="text-[15px] font-semibold leading-5 text-slate-950">{item.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{item.affectedEntityLabel}</p>
            </div>

            <MetricColumn label="Impacto" value={item.impactLabel} tone={item.tone} />
            <MetricColumn label={item.confidenceLabel ? 'Confianca' : 'Dono sugerido'} value={item.confidenceLabel ?? item.ownerLabel} tone="neutral" />
            <MetricColumn className="hidden 2xl:block" label={item.confidenceLabel ? 'Dono sugerido' : 'Evidencia'} value={item.confidenceLabel ? item.ownerLabel : item.evidence} tone="neutral" />
          </div>

          <div className="flex min-w-0 items-center justify-between gap-2 border-t border-slate-100 pt-3">
            <Link
              to={portalPath(item.href)}
              className={`inline-flex max-w-full items-center justify-center rounded-sm border px-3 py-2 text-xs font-semibold ${itemActionClass(item.tone)}`}
            >
              <span className="truncate">{item.actionLabel}</span>
            </Link>
            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          </div>
        </div>
      </div>
    </article>
  )
}

function MetricColumn({ label, value, tone, className = '' }: { label: string; value: string; tone: LaneTone | 'neutral'; className?: string }) {
  return (
    <div className={`min-w-0 border-t border-slate-100 pt-2 2xl:border-l 2xl:border-t-0 2xl:pl-3 2xl:pt-0 ${className}`}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500">{label}</p>
      <p className={`mt-1 text-sm font-semibold leading-5 ${metricValueClass(tone)}`}>{value}</p>
    </div>
  )
}

function ContextualShortcuts({ shortcuts, portalPath }: { shortcuts: ClientShortcut[]; portalPath: (href?: string) => string }) {
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
            to={portalPath(shortcut.href)}
            className="grid grid-cols-[1.75rem_1fr_auto] items-center gap-3 px-4 py-4 text-sm hover:bg-slate-50"
          >
            <span className={`flex h-7 w-7 items-center justify-center rounded-full ${shortcutIconClass(shortcut.tone)}`}>
              {shortcut.tone === 'opportunity' ? <Sparkles className="h-4 w-4" /> : shortcut.tone === 'risk' ? <AlertTriangle className="h-4 w-4" /> : <Briefcase className="h-4 w-4" />}
            </span>
            <span>
              <span className="block font-medium leading-5 text-slate-950">{shortcut.label}</span>
              <span className="mt-0.5 block text-xs text-slate-500">{shortcut.detail}</span>
            </span>
            <ArrowRight className="h-4 w-4 text-slate-400" />
          </Link>
        )) : (
          <div className="m-3 flex items-start gap-3 rounded-sm border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-600">
            <Briefcase className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <span>Nenhum atalho contextual nesta janela.</span>
          </div>
        )}
      </div>
    </aside>
  )
}

function ContractMap({
  contractName,
  modules,
  portalPath,
  startsAt,
  status,
  suggestions,
}: {
  contractName: string
  modules: PortalModuleSummary[]
  portalPath: (href?: string) => string
  startsAt: string
  status: ContractStatus
  suggestions: PortalExpansionSuggestion[]
}) {
  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      <div className="flex flex-col gap-3 border-b border-slate-200 px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-slate-950">Mapa do Contrato</h2>
            <Table2 className="h-4 w-4 text-slate-400" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <SoonButton label="Filtrar" />
          <SoonButton label="Exportar" />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-sm xl:min-w-[980px]">
          <thead className="border-b border-slate-200 bg-[#fafafa] text-[11px] text-slate-700">
            <tr>
              <th className="px-4 py-3 font-semibold">Contrato</th>
              <th className="px-3 py-3 font-semibold">Status</th>
              <th className="px-3 py-3 font-semibold">Inicio</th>
              <th className="px-3 py-3 font-semibold">Modulo</th>
              <th className="px-3 py-3 font-semibold">Saude</th>
              <th className="px-3 py-3 font-semibold">Sinal</th>
              <th className="px-3 py-3 font-semibold">Expansao sugerida</th>
              <th className="px-4 py-3 font-semibold">Proxima acao</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 bg-white">
            {modules.map(module => (
              <tr key={module.moduleKey} className="align-top">
                <td className="px-4 py-3 font-semibold text-slate-950">{contractName}</td>
                <td className="px-3 py-3 text-slate-700">{statusLabel(status)}</td>
                <td className="px-3 py-3 text-slate-700">{formatDateOnly(startsAt)}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{module.title}</td>
                <td className="px-3 py-3 text-slate-700">{module.statusLabel}</td>
                <td className="px-3 py-3 text-slate-700">{module.signal}</td>
                <td className="px-3 py-3 text-slate-700">{suggestions[0]?.moduleName || 'Sem expansao prioritaria'}</td>
                <td className="px-4 py-3 font-medium text-slate-900">
                  <Link to={portalPath(module.href)} className="text-[#2563eb] hover:text-[#1d4ed8]">Abrir modulo</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function SoonButton({ label }: { label: string }) {
  return (
    <button
      type="button"
      disabled
      title="Em breve"
      aria-label={`${label} - em breve`}
      className="cursor-not-allowed rounded-sm border border-slate-300 px-3 py-2 text-slate-400"
    >
      {label}
    </button>
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

function pulseIconClass(tone: 'risk' | 'opportunity' | 'neutral' | 'warning') {
  const classes = {
    risk: 'border border-red-200 text-red-600',
    opportunity: 'border border-emerald-200 text-emerald-700',
    neutral: 'border border-slate-200 text-slate-500',
    warning: 'border border-amber-200 text-amber-600',
  }
  return classes[tone]
}

function itemToneClass(tone: LaneTone) {
  const classes = {
    critical: 'border-l-2 border-l-red-600',
    warning: 'border-l-2 border-l-amber-500',
    opportunity: 'border-l-2 border-l-emerald-700',
    efficiency: 'border-l-2 border-l-emerald-700',
    neutral: 'border-l-2 border-l-slate-400',
  }
  return classes[tone]
}

function itemIconClass(tone: LaneTone) {
  const classes = {
    critical: 'border-red-200 text-red-600',
    warning: 'border-amber-200 text-amber-600',
    opportunity: 'border-emerald-200 text-emerald-700',
    efficiency: 'border-emerald-200 text-emerald-700',
    neutral: 'border-slate-200 text-slate-600',
  }
  return classes[tone]
}

function itemBadgeClass(tone: LaneTone) {
  const classes = {
    critical: 'border-red-200 bg-red-50 text-red-700',
    warning: 'border-amber-200 bg-amber-50 text-amber-700',
    opportunity: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    efficiency: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  }
  return classes[tone]
}

function itemActionClass(tone: LaneTone) {
  if (tone === 'critical') return 'border-red-300 text-red-700 hover:bg-red-50'
  if (tone === 'warning') return 'border-amber-300 text-amber-700 hover:bg-amber-50'
  if (tone === 'opportunity' || tone === 'efficiency') return 'border-emerald-300 text-emerald-800 hover:bg-emerald-50'
  return 'border-slate-300 text-slate-800 hover:bg-slate-50'
}

function metricValueClass(tone: LaneTone | 'neutral') {
  if (tone === 'critical') return 'text-red-700'
  if (tone === 'warning') return 'text-amber-700'
  if (tone === 'opportunity' || tone === 'efficiency') return 'text-emerald-800'
  return 'text-slate-900'
}

function shortcutIconClass(tone: ClientShortcut['tone']) {
  const classes = {
    risk: 'text-red-600',
    opportunity: 'text-emerald-700',
    neutral: 'text-slate-600',
    warning: 'text-amber-600',
  }
  return classes[tone]
}
