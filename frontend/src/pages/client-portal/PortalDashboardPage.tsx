import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Filter,
  FileText,
  FolderKanban,
  LayoutTemplate,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  Wallet,
  Workflow,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  AttentionItem,
  BarList,
  DecisionCard,
  EmptyState,
  ErrorState,
  FunnelBars,
  KpiCard,
  KpiGrid,
  PageHeader,
  PendingAction,
  PeriodSelector,
  ProgressRow,
  SectionCard,
  SkeletonCard,
  SkeletonKpiGrid,
  StatusChip,
  Timeline,
  TimelineItem,
  portalButtonClasses,
  sectionLinkClasses,
  type PortalPeriod,
  type StatusChipVariant,
} from '@/components/portal-ui'
import { usePortalActionSummary } from '@/hooks/usePortalActionSummary'
import { usePortalWorkspacePath } from '@/hooks/usePortalWorkspacePath'
import {
  buildPortalDashboardModel,
  getModuleGridColumns,
  type PortalDashboardDataStatus,
  type PortalDashboardWindow,
  type PortalMainResult,
  type PortalModuleSummary,
  type PortalSectionState,
  type PortalStatusView,
  type PortalYourTurnItem,
} from '@/lib/client-portal/portalDashboardRules'
import { useAuthStore } from '@/stores/authStore'
import { usePlatformStore } from '@/stores/platformStore'

const periodToWindow: Record<PortalPeriod, PortalDashboardWindow> = {
  today: 'Hoje',
  '7d': '7 dias',
  '30d': '30 dias',
}

const moduleIcon: Record<string, LucideIcon> = {
  action_engine: Target,
  automations: Workflow,
  bi_reports: BarChart3,
  campaigns: Megaphone,
  crm: Filter,
  finance: Wallet,
  landing_pages: LayoutTemplate,
  marketing_studio: Sparkles,
  projects: FolderKanban,
  proposals: FileText,
  radar: Search,
  support: LifeBuoy,
  whatsapp_ai: MessageSquare,
}

const moduleStatusVariant: Record<PortalModuleSummary['statusLabel'], StatusChipVariant> = {
  Ativo: 'ok',
  'Em dia': 'ok',
  Atenção: 'warn',
  'Sem dados': 'neutral',
}

const yourTurnIcon: Record<PortalYourTurnItem['kind'], LucideIcon> = {
  approval: FolderKanban,
  invoice: Wallet,
  content: FileText,
}

const yourTurnColumns: Record<number, string> = {
  1: '',
  2: 'min-[1024px]:grid-cols-2',
  3: 'min-[1024px]:grid-cols-3',
}

const duoGrid = 'grid gap-5 min-[1181px]:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]'

const retryNote = 'Parte das informações desta seção não pôde ser carregada.'

function lowercaseFirst(text: string) {
  return text.charAt(0).toLowerCase() + text.slice(1)
}

function statusChip(status: PortalStatusView) {
  return <StatusChip variant={status.variant}>{status.label}</StatusChip>
}

interface DashSectionProps {
  id: string
  title: string
  description?: ReactNode
  action?: ReactNode
  state: PortalSectionState
  /** Não há nada para mostrar (nem dado, nem estado vazio dedicado). */
  isEmpty: boolean
  empty: ReactNode
  onRetry: () => void
  skeleton?: ReactNode
  skeletonLines?: number
  bodyClassName?: string
  children: ReactNode
}

/**
 * Cartão de seção com os três estados: esqueleto no carregamento, erro com "Tentar novamente"
 * (sem derrubar o resto da página) e vazio honesto. Com erro parcial, mostra o que há e um aviso.
 */
function DashSection({
  id,
  title,
  description,
  action,
  state,
  isEmpty,
  empty,
  onRetry,
  skeleton,
  skeletonLines = 4,
  bodyClassName,
  children,
}: DashSectionProps) {
  if (state.loading) return <>{skeleton ?? <SkeletonCard lines={skeletonLines} />}</>

  const failed = state.error && isEmpty
  return (
    <SectionCard id={id} title={title} description={description} action={action} bodyClassName={bodyClassName}>
      {failed ? (
        <ErrorState
          title="Não foi possível carregar esta seção."
          description="O resto da página continua disponível. Tente novamente em instantes."
          onRetry={onRetry}
        />
      ) : isEmpty ? (
        empty
      ) : (
        children
      )}
      {state.error && !isEmpty ? (
        <p className="mt-3 text-xs text-yx-fg-3">
          {retryNote}{' '}
          <button type="button" onClick={onRetry} className="font-semibold text-yx-blue underline underline-offset-2">
            Tentar novamente
          </button>
        </p>
      ) : null}
    </SectionCard>
  )
}

function SectionLink({ href, children, portalPath }: { href: string; children: ReactNode; portalPath: (href?: string) => string }) {
  return (
    <Link to={portalPath(href)} className={sectionLinkClasses}>
      {children}
      <ArrowRight aria-hidden="true" />
    </Link>
  )
}

function dataStatusChip(status: PortalDashboardDataStatus, sources: string[]) {
  if (status === 'Completo') {
    return <StatusChip variant="ok" icon={CheckCircle2}>Todos os dados carregados</StatusChip>
  }
  const detail = sources.length > 0 ? `: ${sources.join(', ')}` : ''
  if (status === 'Parcial') {
    return <StatusChip variant="warn" icon={AlertTriangle}>{`Dados parciais${detail}`}</StatusChip>
  }
  return <StatusChip variant="crit" icon={AlertTriangle}>{`Não foi possível carregar os dados${detail}`}</StatusChip>
}

function MainResultBody({ result }: { result: PortalMainResult }) {
  const chart = result.funnel ? (
    <FunnelBars
      aria-label="Leads por etapa do funil"
      header={{ left: 'Etapa', right: 'Leads que chegaram · valor' }}
      stages={result.funnel.stages}
      bottleneckIndex={result.funnel.bottleneckIndex}
    />
  ) : result.bars ? (
    <BarList aria-label="Leads por campanha" items={result.bars} />
  ) : result.progress ? (
    <ul aria-label="Progresso dos projetos" className="m-0 grid list-none gap-4 p-0">
      {result.progress.map(row => (
        <li key={row.id}>
          <ProgressRow title={row.title} subtitle={row.subtitle} percent={row.percent} status={statusChip(row.status)} />
        </li>
      ))}
    </ul>
  ) : null

  return (
    <div className={chart ? 'grid gap-6 min-[1360px]:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]' : 'grid'}>
      <div className="min-w-0">
        {result.eyebrow ? (
          <span className="font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-yx-fg-3">{result.eyebrow}</span>
        ) : null}
        <p className="mb-1.5 mt-1.5 whitespace-nowrap font-display text-[clamp(28px,2.8vw,44px)] font-semibold leading-none tracking-[-0.03em] tabular-nums">
          {result.headline}
        </p>
        <p className="text-sm tabular-nums text-yx-fg-2">{result.headlineDetail}</p>
        {result.narrative ? <p className="mb-4 mt-3.5 max-w-[46ch] text-[13.5px] leading-normal text-yx-fg-2">{result.narrative}</p> : null}
        {result.won ? (
          <div
            className={
              result.won.hasWins
                ? 'flex items-center gap-2.5 rounded-lg border border-yx-ok-line bg-yx-ok-soft px-3 py-2.5 text-[13px] text-yx-fg'
                : 'flex items-center gap-2.5 rounded-lg border border-yx-line bg-yx-surface-2 px-3 py-2.5 text-[13px] text-yx-fg-2'
            }
          >
            <CheckCircle2 aria-hidden="true" className={result.won.hasWins ? 'h-4 w-4 shrink-0 text-yx-ok' : 'h-4 w-4 shrink-0 text-yx-fg-3'} />
            <span className="tabular-nums">{result.won.text}</span>
          </div>
        ) : null}
      </div>
      {chart ? <div className="min-w-0">{chart}</div> : null}
    </div>
  )
}

function ModuleCard({ module, portalPath, spanLast }: { module: PortalModuleSummary; portalPath: (href?: string) => string; spanLast: boolean }) {
  const Icon = moduleIcon[module.moduleKey] || Sparkles
  return (
    <li className={spanLast ? 'min-[640px]:max-[1179px]:last:col-span-2' : undefined}>
      <Link
        to={portalPath(module.href)}
        className="grid h-full content-start gap-2 rounded-lg border border-yx-line bg-yx-surface p-3.5 text-yx-fg no-underline transition-colors hover:border-yx-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yx-blue max-[639px]:min-h-[56px] max-[639px]:grid-cols-[auto_minmax(0,1fr)_auto] max-[639px]:items-center max-[639px]:gap-x-3 max-[639px]:gap-y-0.5 max-[639px]:px-3 max-[639px]:py-2.5"
      >
        <div className="flex items-center justify-between gap-2 max-[639px]:contents">
          <span className="grid h-8 w-8 place-items-center rounded-[7px] bg-yx-blue-soft text-yx-blue max-[639px]:col-start-1 max-[639px]:row-span-2 max-[639px]:row-start-1">
            <Icon aria-hidden="true" className="h-4 w-4" />
          </span>
          <StatusChip variant={moduleStatusVariant[module.statusLabel]} className="max-[639px]:col-start-3 max-[639px]:row-start-1 max-[639px]:justify-self-end">{module.statusLabel}</StatusChip>
        </div>
        <h3 className="font-display text-sm font-semibold leading-[1.3] max-[639px]:col-start-2 max-[639px]:row-start-1 max-[639px]:min-w-0">{module.title}</h3>
        <div className="flex items-center justify-between gap-2 text-[13px] text-yx-fg-2 max-[639px]:contents">
          <span className="tabular-nums max-[639px]:col-start-2 max-[639px]:row-start-2 max-[639px]:min-w-0 max-[639px]:text-xs">{module.signal}</span>
          <ArrowRight aria-hidden="true" className="h-[15px] w-[15px] shrink-0 text-yx-fg-3 max-[639px]:col-start-3 max-[639px]:row-start-2 max-[639px]:justify-self-end" />
        </div>
      </Link>
    </li>
  )
}

export function PortalDashboardPage() {
  const portalPath = usePortalWorkspacePath()
  const [period, setPeriod] = useState<PortalPeriod>('7d')
  const selectedWindow = periodToWindow[period]
  // Reavalia janelas e o rótulo "Dados atualizados há..." a cada minuto.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  const { activeContract, enabledModuleKeys, isLoading, organization } = usePlatformStore(state => ({
    activeContract: state.activeContract,
    enabledModuleKeys: state.enabledModuleKeys,
    isLoading: state.isLoading,
    organization: state.organization,
  }))
  const userName = useAuthStore(state => state.user?.name)
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
      pipelines: actionSummary.crm.pipelines,
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
    actionLoading: Boolean(actionSummary.projectsLoading),
    actionError: actionSummary.projectsError ?? null,
    windowLabel: selectedWindow,
    now,
    loadedAt: actionSummary.loadedAt,
    userName,
  }), [activeContract, actionSummary, enabledModuleKeys, now, organization, selectedWindow, userName])

  if (isLoading) {
    return (
      <div className="mx-auto grid max-w-[1440px] gap-5" aria-busy="true">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
        <SkeletonKpiGrid />
      </div>
    )
  }

  if (!activeContract) {
    return (
      <div className="mx-auto max-w-2xl">
        <EmptyState
          icon={FileText}
          title="Nenhum contrato ativo encontrado"
          description="Entre em contato com a YUX para revisar o acesso ao portal e liberar os módulos contratados."
        />
      </div>
    )
  }

  const retry = actionSummary.reload
  const { yourTurn, lead, sections } = model
  const result = model.mainResult
  const pulseLink = enabledModuleKeys.includes('bi_reports')
    ? <SectionLink href="/portal/relatorios" portalPath={portalPath}>Abrir relatórios</SectionLink>
    : undefined
  const suggestion = model.expansionSuggestions[0]
  const modulesCount = model.activeModules.length

  return (
    <div className="mx-auto grid max-w-[1440px] gap-5">
      <PageHeader
        eyebrow="Visão geral"
        live={{ label: lowercaseFirst(model.generatedAtLabel) }}
        title={model.greeting}
        lead={(
          <>
            {lead.before}
            <span className="bg-brand-gradient bg-clip-text pr-[.06em] font-accent text-[1.38em] italic leading-none tracking-[-0.01em] text-transparent">
              {lead.accent}
            </span>
            {lead.after}
          </>
        )}
        meta={(
          <>
            <StatusChip icon={FileText}>{/^contrato\b/i.test(model.contractName) ? model.contractName : `Contrato ${model.contractName}`}</StatusChip>
            <StatusChip icon={Target}>{model.focusLabel}</StatusChip>
            {dataStatusChip(model.dataStatus, model.unavailableSources)}
          </>
        )}
        actions={<PeriodSelector value={period} onChange={setPeriod} caption={model.periodCaption} />}
      />

      <DashSection
        id="sua-vez"
        title="Sua vez"
        description={yourTurn.total > yourTurn.items.length
          ? `Mostrando ${yourTurn.items.length} de ${yourTurn.total} decisões que dependem de você.`
          : 'Itens que só andam com a sua decisão.'}
        action={yourTurn.approvalCount > 0
          ? <SectionLink href="/portal/projetos/aprovacoes" portalPath={portalPath}>Ver todas as aprovações</SectionLink>
          : undefined}
        state={sections.yourTurn}
        isEmpty={yourTurn.items.length === 0}
        empty={(
          <EmptyState
            icon={CheckCircle2}
            title="Nada depende de você agora."
            description="Quando houver aprovações, faturas ou conteúdos esperando a sua decisão, eles aparecem aqui."
          />
        )}
        onRetry={retry}
        skeletonLines={3}
      >
        <div className={`grid gap-3 ${yourTurnColumns[yourTurn.items.length] ?? ''}`}>
          {yourTurn.items.map(item => (
            <DecisionCard
              key={item.id}
              tone={item.tone}
              module={{ label: item.moduleLabel, icon: yourTurnIcon[item.kind] }}
              wait={item.wait}
              title={item.title}
              description={item.description}
              actions={(
                <>
                  <Link to={portalPath(item.primary.href)} className={portalButtonClasses('primary')}>
                    {item.primary.label}
                  </Link>
                  {item.payInvoice ? <PendingAction code="B1">Pagar fatura</PendingAction> : null}
                </>
              )}
            />
          ))}
        </div>
      </DashSection>

      <DashSection
        id="pulso"
        title="Pulso do período"
        description={model.periodDescription}
        action={pulseLink}
        state={sections.pulse}
        isEmpty={model.pulse.length === 0}
        empty={(
          <EmptyState
            icon={TrendingUp}
            title="Os indicadores aparecem aqui"
            description="Assim que houver leads, campanhas, projetos ou faturas no seu contrato, mostramos os números do período com a comparação."
          />
        )}
        onRetry={retry}
        skeleton={(
          <SectionCard id="pulso" title="Pulso do período" description={model.periodDescription} bodyClassName="px-0 pb-0 pt-3.5">
            <SkeletonKpiGrid count={model.pulse.length || 6} />
          </SectionCard>
        )}
        bodyClassName="px-0 pb-0 pt-3.5"
      >
        <KpiGrid aria-label="Indicadores do período" count={model.pulse.length}>
          {model.pulse.map(metric => (
            <KpiCard
              key={metric.id}
              label={metric.label}
              value={metric.value}
              delta={metric.delta}
              comparison={metric.delta ? (metric.comparison ?? metric.detail) : metric.detail}
              spark={metric.spark}
              href={metric.href}
            />
          ))}
        </KpiGrid>
      </DashSection>

      <div className={duoGrid}>
        <DashSection
          id="resultado"
          title={result.title}
          description={result.description}
          action={<SectionLink href={result.ctaHref} portalPath={portalPath}>{result.ctaLabel}</SectionLink>}
          state={sections.mainResult}
          isEmpty={result.kind === 'empty'}
          empty={(
            <EmptyState
              icon={TrendingUp}
              title={result.emptyTitle ?? 'Sem dados por enquanto'}
              description={result.emptyDescription}
            />
          )}
          onRetry={retry}
          skeletonLines={6}
        >
          <MainResultBody result={result} />
        </DashSection>

        <DashSection
          id="atencao"
          title="Pontos de atenção"
          description="Ordenados pela prioridade."
          state={sections.attention}
          isEmpty={model.attentionItems.length === 0}
          empty={(
            <EmptyState
              icon={CheckCircle2}
              title="Nada urgente agora"
              description="Follow-ups, entregas e prazos principais não indicam risco imediato."
            />
          )}
          onRetry={retry}
          skeletonLines={5}
        >
          <div className="grid gap-2.5">
            {model.attentionItems.map(item => (
              <AttentionItem
                key={item.id}
                priority={item.priority}
                title={item.title}
                description={item.description}
                owner={item.owner}
                ownerIsYux={item.ownerIsYux}
                wait={item.wait}
                action={(
                  <Link to={portalPath(item.href)} className={portalButtonClasses('ghost')}>
                    {item.actionLabel}
                  </Link>
                )}
              />
            ))}
          </div>
        </DashSection>
      </div>

      <div className={model.hasProjects ? duoGrid : 'grid gap-5'}>
        <DashSection
          id="executado-yux"
          title="Executado pela YUX"
          description="O que a equipe e os agentes fizeram por você neste período."
          state={sections.activity}
          isEmpty={model.yuxActivity.length === 0}
          empty={(
            <EmptyState
              icon={Sparkles}
              title="Nenhuma atividade registrada no período."
              description="Quando a YUX ou os agentes executarem algo por você, aparece aqui com data e hora."
            />
          )}
          onRetry={retry}
          skeletonLines={5}
        >
          <Timeline aria-label="Atividades executadas pela YUX">
            {model.yuxActivity.map(item => (
              <TimelineItem key={item.id} variant="yux" when={item.when} title={item.title} description={item.description} tag={item.tag} />
            ))}
          </Timeline>
          {model.activityHistoryHref ? (
            <div className="mt-1">
              <SectionLink href={model.activityHistoryHref} portalPath={portalPath}>Ver histórico completo</SectionLink>
            </div>
          ) : null}
        </DashSection>

        {model.hasProjects ? (
          <DashSection
            id="proximas-entregas"
            title="Próximas entregas"
            description="Etapas em andamento nos seus projetos."
            action={<SectionLink href="/portal/projetos/projetos" portalPath={portalPath}>Projetos</SectionLink>}
            state={sections.deliveries}
            isEmpty={model.deliveries.length === 0}
            empty={(
              <EmptyState
                icon={FolderKanban}
                title="Nenhuma entrega em andamento"
                description="Quando um projeto estiver em andamento, mostramos aqui o progresso, a previsão e o que depende de você."
              />
            )}
            onRetry={retry}
            skeletonLines={5}
          >
            <ul aria-label="Próximas entregas" className="m-0 grid list-none gap-3.5 p-0">
              {model.deliveries.map(item => (
                <li key={item.id}>
                  <ProgressRow title={item.title} subtitle={item.subtitle} percent={item.percent} status={statusChip(item.status)} />
                </li>
              ))}
            </ul>
          </DashSection>
        ) : null}
      </div>

      {modulesCount > 0 ? (
        <SectionCard id="modulos" title="Seus módulos" description="Situação de cada área contratada.">
          <ul aria-label="Módulos contratados" className={`m-0 grid list-none gap-3 p-0 ${getModuleGridColumns(modulesCount)}`}>
            {model.activeModules.map(module => (
              <ModuleCard key={module.moduleKey} module={module} portalPath={portalPath} spanLast={modulesCount % 2 === 1 && modulesCount > 1} />
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {suggestion ? (
        <section
          aria-labelledby="sugestao-title"
          className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 rounded-[10px] border border-dashed border-yx-line-strong px-[18px] py-3.5"
        >
          <div className="flex min-w-0 flex-1 basis-[420px] items-start gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[7px] border border-yx-line-strong text-brand-violet-500">
              <Sparkles aria-hidden="true" className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 id="sugestao-title" className="font-sans text-sm font-semibold leading-[1.35]">
                {`Sugestão para o seu momento: ${suggestion.moduleName}`}
              </h2>
              <p className="mt-0.5 text-[13px] text-yx-fg-2">{suggestion.reason}</p>
            </div>
          </div>
          <SectionLink href={suggestion.href} portalPath={portalPath}>{suggestion.ctaLabel}</SectionLink>
        </section>
      ) : null}
    </div>
  )
}
