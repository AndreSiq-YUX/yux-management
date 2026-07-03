import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Briefcase,
  CheckCircle2,
  Clock3,
  FileText,
  Gauge,
  LayoutGrid,
  Loader2,
  PackagePlus,
  Phone,
  RefreshCw,
  ShieldCheck,
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
  type PortalDashboardDataStatus,
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

const moduleIcon: Record<string, LucideIcon> = {
  automations: Sparkles,
  bi_reports: Gauge,
  campaigns: TrendingUp,
  crm: Phone,
  finance: FileText,
  landing_pages: LayoutGrid,
  marketing_studio: Sparkles,
  projects: Briefcase,
  proposals: FileText,
  support: ShieldCheck,
  whatsapp_ai: Phone,
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

function metricDetailClass(tone: PortalDashboardTone) {
  if (tone === 'critical') return 'text-red-600'
  if (tone === 'attention') return 'text-amber-700'
  if (tone === 'positive' || tone === 'healthy') return 'text-emerald-700'
  return 'text-slate-600'
}

function pulseIcon(metric: PortalPulseMetric) {
  if (metric.id === 'followups') return Phone
  if (metric.id === 'proposals' || metric.id === 'approvals') return FileText
  if (metric.id === 'conversion' || metric.id === 'mroi' || metric.id === 'result') return TrendingUp
  if (metric.id === 'health') return ShieldCheck
  if (metric.id === 'projects' || metric.id === 'delivery') return Briefcase
  return Sparkles
}

function toneAccentClass(tone: PortalDashboardTone) {
  if (tone === 'critical') return 'text-red-600'
  if (tone === 'attention') return 'text-amber-600'
  if (tone === 'positive' || tone === 'healthy') return 'text-[#2563EB]'
  return 'text-slate-500'
}

function toneSoftClass(tone: PortalDashboardTone) {
  if (tone === 'critical') return 'bg-red-100 text-red-600'
  if (tone === 'attention') return 'bg-amber-100 text-amber-600'
  if (tone === 'positive' || tone === 'healthy') return 'bg-emerald-100 text-emerald-700'
  return 'bg-[#eff6ff] text-[#2563EB]'
}

function sectionTitle(title: string) {
  return (
    <div className="border-b border-slate-200 px-4 py-3">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">{title}</h2>
    </div>
  )
}

function mainMetricParts(headline: string) {
  const revenueMatch = headline.match(/^(R\$\s?[\d.,]+)(.*)$/)
  if (revenueMatch) {
    return {
      metric: revenueMatch[1],
      qualifier: revenueMatch[2].trim(),
    }
  }

  const countMatch = headline.match(/^(\d+\s+\S+)(.*)$/)
  if (countMatch) {
    return {
      metric: countMatch[1],
      qualifier: countMatch[2].trim(),
    }
  }

  return {
    metric: headline,
    qualifier: '',
  }
}

function attentionActionLabel(item: PortalAttentionItem) {
  if (item.kind === 'commercial') return 'Retomar'
  if (item.kind === 'approval') return 'Aprovar'
  if (item.kind === 'project' || item.kind === 'marketing') return 'Revisar'
  if (item.kind === 'finance') return 'Abrir'
  return item.actionLabel.replace('Abrir ', '') || 'Abrir'
}

function PulseCard({ metric, portalPath }: { metric: PortalPulseMetric; portalPath: (href?: string) => string }) {
  const Icon = pulseIcon(metric)
  const content = (
    <article className="flex min-h-[108px] items-center gap-5 px-5 py-5">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center ${toneAccentClass(metric.tone)}`}>
        <Icon className="h-6 w-6 stroke-[2.2]" />
      </span>
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
        <p className="mt-2 text-[1.75rem] font-semibold leading-none tracking-[-0.01em] text-slate-950">{metric.value}</p>
        <p className={`mt-2 text-xs font-medium ${metricDetailClass(metric.tone)}`}>{metric.detail}</p>
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
  const headline = mainMetricParts(result.headlineMetric)

  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      {sectionTitle(result.title)}
      <div className="grid gap-0 p-5 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="flex flex-col items-start justify-center border-b border-slate-200 pb-5 pr-0 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8">
          <p className="text-[3rem] font-semibold leading-none tracking-[-0.03em] text-[#141821]">{headline.metric}</p>
          <p className="mt-3 text-lg font-medium text-[#141821]">{headline.qualifier || result.headlineDetail}</p>
          {headline.qualifier && <p className="mt-1 text-sm text-slate-600">{result.headlineDetail}</p>}
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-600">{result.narrative}</p>
          <Link
            to={portalPath(result.ctaHref)}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-sm bg-[#2563EB] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1d4ed8]"
          >
            {result.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="divide-y divide-slate-200 pt-2 lg:pl-6 lg:pt-0">
          {result.signals.map(signal => (
            <div key={`${signal.label}-${signal.value}`} className="grid grid-cols-[40px_1fr_auto] items-center gap-4 py-4 first:pt-0 last:pb-0">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full ${toneSoftClass(signal.tone)}`}>
                {signal.tone === 'critical' ? <Phone className="h-4 w-4" /> : signal.tone === 'attention' ? <Clock3 className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-[#141821]">{signal.label} {signal.value}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{signal.detail}</p>
              </div>
              <span className={`h-2 w-2 rounded-full ${signal.tone === 'critical' ? 'bg-red-500' : signal.tone === 'attention' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AttentionPanel({ items, portalPath }: { items: PortalAttentionItem[]; portalPath: (href?: string) => string }) {
  return (
    <section className="rounded-sm border border-slate-300 bg-white">
      {sectionTitle('Pontos de atencao')}
      <div className="space-y-3 p-4">
        {items.length === 0 ? (
          <div className="rounded-sm border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700" />
              <div>
                <h3 className="font-semibold text-emerald-950">Nada urgente agora</h3>
                <p className="mt-1 text-sm leading-6 text-emerald-800">Acoes, aprovacoes e vencimentos principais nao indicam risco imediato.</p>
              </div>
            </div>
          </div>
        ) : items.map(item => (
          <article key={item.id} className={`rounded-sm border border-slate-200 border-l-2 ${attentionClass[item.priority]}`}>
            <div className="grid grid-cols-[44px_1fr] gap-4 px-4 py-3 2xl:grid-cols-[44px_1fr_220px_auto] 2xl:items-center">
              <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${item.priority === 'critical' ? 'border-red-200 text-red-600' : 'border-amber-200 text-amber-600'}`}>
                {item.kind === 'commercial' ? <Phone className="h-4 w-4" /> : item.kind === 'approval' ? <FileText className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              </span>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold leading-5 text-[#141821]">{item.title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{item.description}</p>
              </div>
              <div className="col-span-2 grid grid-cols-2 gap-4 border-t border-slate-200 pt-3 2xl:col-span-1 2xl:border-t-0 2xl:pt-0">
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Impacto</p>
                  <p className={`mt-1 text-xs font-semibold ${item.priority === 'critical' ? 'text-red-600' : 'text-amber-700'}`}>
                    {item.priority === 'critical' ? 'Alto' : item.priority === 'high' ? 'Medio' : 'Normal'}
                  </p>
                </div>
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">Responsavel</p>
                  <p className="mt-1 text-xs font-semibold text-[#141821]">{item.expectedOwner}</p>
                </div>
              </div>
              <Link
                to={portalPath(item.href)}
                className="col-start-2 inline-flex h-9 w-fit items-center justify-center rounded-sm border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:border-[#2563EB] hover:text-[#2563EB] 2xl:col-start-auto"
              >
                {attentionActionLabel(item)}
              </Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function ActivityRow({
  item,
  portalPath,
  variant,
}: {
  item: PortalYuxActivityItem | PortalRecommendationItem
  portalPath: (href?: string) => string
  variant: 'activity' | 'recommendation'
}) {
  const isHigh = item.impactLabel.toLowerCase().includes('alto') || item.impactLabel.toLowerCase().includes('acelera')

  return (
    <Link to={portalPath(item.href)} className="grid gap-3 px-3 py-3 transition-colors hover:bg-slate-50 sm:grid-cols-[36px_1fr_92px] sm:items-center">
      <span className="flex h-8 w-8 items-center justify-center rounded-sm bg-[#eff6ff] text-[#2563EB]">
        {variant === 'activity' ? <Sparkles className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
      </span>
      <div className="min-w-0">
        <h3 className="truncate text-sm font-semibold text-[#141821]">{item.title}</h3>
        <p className="mt-1 truncate text-xs text-slate-500">{item.detail}</p>
      </div>
      <div className="sm:text-right">
        <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">{variant === 'activity' ? 'Impacto' : 'Impacto esperado'}</p>
        <p className={`mt-1 text-xs font-semibold ${isHigh ? 'text-emerald-700' : 'text-amber-700'}`}>
          {item.impactLabel}
        </p>
      </div>
    </Link>
  )
}

function CompactList({
  emptyIcon: EmptyIcon,
  emptyText,
  items,
  portalPath,
  title,
  variant,
}: {
  emptyIcon: LucideIcon
  emptyText: string
  items: Array<PortalYuxActivityItem | PortalRecommendationItem>
  portalPath: (href?: string) => string
  title: string
  variant: 'activity' | 'recommendation'
}) {
  return (
    <div className="rounded-sm border border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-600">{title}</p>
      </div>
      {items.length === 0 ? (
        <div className="p-4">
          <div className="flex items-start gap-3 rounded-sm border border-slate-200 bg-[#fafafa] p-4">
            <EmptyIcon className="mt-0.5 h-5 w-5 text-slate-500" />
            <p className="text-sm leading-6 text-slate-600">{emptyText}</p>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-200">
          {items.slice(0, 3).map(item => (
            <ActivityRow key={item.id} item={item} portalPath={portalPath} variant={variant} />
          ))}
        </div>
      )}
      {items.length > 0 && (
        <div className="border-t border-slate-200 px-4 py-3">
          <Link to={portalPath(variant === 'activity' ? '/portal/projetos/projetos' : '/portal/relatorios')} className="inline-flex items-center gap-2 text-xs font-semibold text-[#2563EB]">
            {variant === 'activity' ? 'Ver todas as atividades' : 'Ver todas as recomendacoes'}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
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
      {sectionTitle('Trabalho da YUX e recomendacoes')}
      <div className="grid gap-4 p-4 xl:grid-cols-2">
        <CompactList
          emptyIcon={Briefcase}
          emptyText="Nenhuma atividade recente registrada para este contrato."
          items={model.yuxActivity}
          portalPath={portalPath}
          title="Executado pela YUX"
          variant="activity"
        />
        <CompactList
          emptyIcon={Sparkles}
          emptyText="Sem novas recomendacoes operacionais no momento."
          items={model.recommendations}
          portalPath={portalPath}
          title="Recomendado agora"
          variant="recommendation"
        />
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
    <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
      <section className="rounded-sm border border-slate-300 bg-white">
        {sectionTitle('Modulos contratados')}
        <div className="grid gap-3 p-4 sm:grid-cols-2 2xl:grid-cols-4">
          {modules.map(module => {
            const Icon = moduleIcon[module.moduleKey] || LayoutGrid

            return (
              <Link key={module.moduleKey} to={portalPath(module.href)} className="rounded-sm border border-slate-200 bg-white p-3 transition-colors hover:border-[#2563EB]">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-[#eff6ff] text-[#2563EB]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="truncate text-sm font-semibold text-[#141821]">{module.title}</h3>
                      <span className={`shrink-0 rounded-sm border px-2 py-0.5 text-[10px] font-semibold ${moduleStatusClass[module.statusLabel]}`}>
                        {module.statusLabel === 'Precisa de atencao' ? 'Atencao' : module.statusLabel}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{module.signal}</p>
                    <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB]">
                      Abrir {module.title.toLowerCase()}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      <section className="rounded-sm border border-slate-300 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-700">Expansao recomendada</h2>
          <Link to={portalPath('/portal/suporte')} className="hidden items-center gap-2 text-xs font-semibold text-[#2563EB] sm:inline-flex">
            Ver todas as oportunidades
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
          {suggestions.length === 0 ? (
            <div className="rounded-sm border border-slate-200 bg-[#fafafa] p-4">
              <PackagePlus className="h-5 w-5 text-slate-500" />
              <p className="mt-3 text-sm leading-6 text-slate-600">Nao ha sugestao prioritaria de modulo adicional para o estado atual do contrato.</p>
            </div>
          ) : suggestions.map(suggestion => {
            const Icon = moduleIcon[suggestion.moduleKey] || PackagePlus

            return (
              <Link key={suggestion.id} to={portalPath(suggestion.href)} className="rounded-sm border border-slate-200 bg-white p-4 transition-colors hover:border-[#2563EB]">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm bg-indigo-50 text-[#635BFF]">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-[#141821]">{suggestion.moduleName}</h3>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{suggestion.reason}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-700">{suggestion.expectedGain}</p>
                    <span className="mt-3 inline-flex h-8 items-center justify-center rounded-sm border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700">
                      {suggestion.ctaLabel}
                    </span>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </section>
    </div>
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
          <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-700">
            Saude, resultado e proximas decisoes do contrato ativo.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-slate-700">
            <span className="inline-flex h-8 items-center gap-2 rounded-sm border border-slate-300 bg-white px-3">
              <Briefcase className="h-3.5 w-3.5 text-slate-500" />
              Contrato: {model.contractName}
            </span>
            <span className="text-slate-400">+</span>
            <span className="inline-flex h-8 items-center gap-2">
              <Gauge className="h-3.5 w-3.5 text-slate-500" />
              {model.focusLabel}
            </span>
            <span className="inline-flex h-8 items-center gap-2">
              <Clock3 className="h-3.5 w-3.5 text-slate-500" />
              {model.generatedAtLabel}
            </span>
            <span className={`inline-flex h-8 items-center gap-2 rounded-sm border border-slate-300 bg-white px-3 ${dataStatusClass(model.dataStatus)}`}>
              {model.dataStatus}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <div className="inline-flex overflow-hidden rounded-sm border border-slate-300 bg-white text-sm text-slate-700">
            {timeWindows.map(label => (
              <button
                key={label}
                type="button"
                onClick={() => setSelectedWindow(label)}
                className={label === model.windowLabel
                  ? 'min-w-16 border-x border-[#050816] bg-[#050816] px-4 py-2 font-semibold text-white first:border-l-0'
                  : 'min-w-16 border-r border-slate-200 px-4 py-2 font-normal hover:bg-slate-50 last:border-r-0'}
                aria-pressed={label === model.windowLabel}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={actionSummary.reload}
            className="inline-flex items-center gap-2 rounded-sm border border-[#2563eb] bg-[#2563eb] px-5 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8]"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar visao
          </button>
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
