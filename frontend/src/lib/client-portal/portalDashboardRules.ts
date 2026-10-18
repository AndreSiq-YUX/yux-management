import type { PortalNextAction } from '@/hooks/usePortalActionSummary'
import {
  formatCompactCurrency,
  formatDueLabel,
  formatPortalCurrency,
  formatRelativeTime,
  formatShortDate,
  statusLabel,
} from '@/lib/client-portal/portalDisplay'
import { getInvoicePaymentState } from '@/lib/finance/financeRules'
import { isDeliveryOverdue } from '@/lib/projects/deliveryPresentation'
import type { PortalCampaign } from '@/types/campaign'
import type { CrmLead, CrmPipeline, CrmPipelineStage, CrmTask } from '@/types/crm'
import type { PortalFinanceInvoice } from '@/types/finance'
import type {
  MarketingCampaignCreativeSuggestion,
  MarketingContentReview,
  MarketingWorkflowRun,
  PortalMarketingContentItem,
} from '@/types/marketingStudio'
import type { ContractDetails, Organization } from '@/types/platform'
import type { ApprovalRequest, Project } from '@/types/project'

export type PortalDashboardFocus = 'commercial' | 'marketing' | 'delivery' | 'executive'
export type PortalDashboardWindow = 'Hoje' | '7 dias' | '30 dias'
export type PortalDashboardDataStatus = 'Completo' | 'Parcial' | 'Com falha'
export type PortalDashboardTone = 'healthy' | 'attention' | 'critical' | 'neutral' | 'positive'
/** Fontes de dados carregadas pelo painel; cada seção declara de quais depende. */
export type PortalDashboardSource = 'projects' | 'crm' | 'marketing'

export interface PortalDashboardCrmInput {
  leads: CrmLead[]
  tasks: CrmTask[]
  /** Funis e etapas; sem eles o gráfico do funil não é exibido. */
  pipelines?: CrmPipeline[]
  loading: boolean
  error: string | null
}

export interface PortalDashboardMarketingInput {
  campaigns: PortalCampaign[]
  contents: PortalMarketingContentItem[]
  reviews: MarketingContentReview[]
  creativeSuggestions: MarketingCampaignCreativeSuggestion[]
  workflowRuns: MarketingWorkflowRun[]
  loading: boolean
  error: string | null
}

export interface PortalDashboardInput {
  organization: Organization | null
  contract: ContractDetails | null
  enabledModuleKeys: string[]
  actions: PortalNextAction[]
  projects: Project[]
  approvals: ApprovalRequest[]
  invoices: PortalFinanceInvoice[]
  crm: PortalDashboardCrmInput
  marketing: PortalDashboardMarketingInput
  /** Carregamento de projetos, aprovações e faturas. */
  actionLoading: boolean
  /** Falha ao carregar projetos, aprovações e faturas. */
  actionError: string | null
  windowLabel: PortalDashboardWindow
  focusOverride?: PortalDashboardFocus
  /** Instante de referência dos cálculos de período; injetável para testes. Padrão: agora. */
  now?: Date
  /** Momento da última carga bem-sucedida dos dados. Sem ele, o rótulo mostra "Atualizando dados". */
  loadedAt?: Date | null
  /** Nome completo do usuário; só o primeiro nome é usado na saudação. */
  userName?: string | null
}

type ResolvedInput = PortalDashboardInput & { now: Date }

export interface PortalMetricDelta {
  text: string
  tone: 'good' | 'bad' | 'flat'
}

export interface PortalPulseMetric {
  id: string
  label: string
  value: string
  /** Texto de apoio; o painel o mostra sob o valor quando não há variação. */
  detail: string
  tone: PortalDashboardTone
  href?: string
  /**
   * 'period': contado pelas datas dos registros dentro da janela escolhida.
   * 'position': retrato atual (não filtrado); a variação, quando existe, compara com o início do período.
   */
  kind: 'period' | 'position'
  /** Se um valor maior é melhor (define a cor da variação). */
  higherIsBetter: boolean
  delta?: PortalMetricDelta
  /** Base da comparação, ex.: "vs. 7 dias antes". */
  comparison?: string
  /** Contagem por dia (7/30 dias) ou por hora ("Hoje") ao longo da janela; só em métricas de período. */
  spark?: number[]
}

// ---------------------------------------------------------------------------
// Resultado principal
// ---------------------------------------------------------------------------

export interface PortalFunnelStageView {
  id: string
  label: string
  /** Leads que chegaram a esta etapa (ou além). */
  reached: number
  value: number
  /** Ex.: "11 · R$ 47,3 mil". */
  display: string
  /** Ex.: "61% avançam de Novo". */
  conv?: string
}

export interface PortalBarView {
  label: string
  value: number
  display: string
}

export interface PortalProgressView {
  id: string
  title: string
  subtitle: string
  percent: number
  status: PortalStatusView
}

export interface PortalStatusView {
  variant: 'ok' | 'warn' | 'crit' | 'neutral'
  label: string
}

export interface PortalMainResult {
  /** `funnel`: funil comercial; `bars`: leads por campanha; `progress`: projetos; `empty`: sem dados. */
  kind: 'funnel' | 'bars' | 'progress' | 'empty'
  focus: PortalDashboardFocus
  title: string
  description: string
  ctaLabel: string
  ctaHref: string
  eyebrow?: string
  headline?: string
  headlineDetail?: string
  narrative?: string
  funnel?: { stages: PortalFunnelStageView[]; bottleneckIndex?: number }
  /** Caixa "ganhos no período" do funil. */
  won?: { text: string; hasWins: boolean }
  bars?: PortalBarView[]
  progress?: PortalProgressView[]
  emptyTitle?: string
  emptyDescription?: string
}

// ---------------------------------------------------------------------------
// Atenção, atividade, entregas, módulos
// ---------------------------------------------------------------------------

export type PortalAttentionPriority = 'high' | 'medium' | 'low'

export interface PortalAttentionItem {
  id: string
  priority: PortalAttentionPriority
  kind: 'approval' | 'commercial' | 'finance' | 'project' | 'marketing' | 'integration' | 'support'
  title: string
  description: string
  /** Responsável quando não é a YUX. */
  owner?: string
  ownerIsYux: boolean
  /** Tempo de espera ("há 2 dias"), só quando há uma data real. */
  wait?: string
  href: string
  actionLabel: string
}

export interface PortalYuxActivityItem {
  id: string
  /** Data/hora formatada ("Hoje 09:12", "Ontem 17:40", "15 out"). */
  when: string
  title: string
  description: string
  tag: string
  source: 'project' | 'marketing'
}

export interface PortalDeliveryItem {
  id: string
  title: string
  subtitle: string
  percent: number
  status: PortalStatusView
}

export interface PortalModuleSummary {
  moduleKey: string
  title: string
  statusLabel: 'Ativo' | 'Atenção' | 'Em dia' | 'Sem dados'
  signal: string
  href: string
}

export interface PortalExpansionSuggestion {
  id: string
  moduleKey: string
  moduleName: string
  /** Frase ligada ao sinal real que originou a sugestão. */
  reason: string
  ctaLabel: string
  href: string
  confidence: 'high' | 'medium' | 'low'
}

// ---------------------------------------------------------------------------
// Sua vez
// ---------------------------------------------------------------------------

export interface PortalYourTurnAction {
  label: string
  href: string
}

export interface PortalYourTurnItem {
  id: string
  kind: 'approval' | 'invoice' | 'content'
  tone: 'warn' | 'crit'
  moduleLabel: string
  wait: string
  title: string
  description: string
  primary: PortalYourTurnAction
  /** Fatura: mostra também a ação "Pagar fatura" (pendente, código B1). */
  payInvoice?: boolean
  /** Instante usado só para ordenar dentro da mesma urgência (mais antigo primeiro). */
  since: number
}

export interface PortalYourTurn {
  /** Até 3 itens, do mais urgente ao menos. */
  items: PortalYourTurnItem[]
  /** Total de decisões que dependem do cliente (inclui as que não couberam nos 3 cartões). */
  total: number
  /** Aprovações de projetos pendentes (decide o link "Ver todas as aprovações"). */
  approvalCount: number
}

export interface PortalLeadSentence {
  before: string
  /** Trecho em destaque (serifa itálica). */
  accent: string
  after: string
}

export interface PortalSectionState {
  loading: boolean
  error: boolean
}

export interface PortalExecutiveDashboardModel {
  organizationName: string
  contractName: string
  contractStatus: string
  focus: PortalDashboardFocus
  focusLabel: string
  dataStatus: PortalDashboardDataStatus
  unavailableSources: string[]
  generatedAtLabel: string
  windowLabel: PortalDashboardWindow
  /** "Comparando com os 7 dias anteriores". */
  periodCaption: string
  /** "Últimos 7 dias, comparados com os 7 dias anteriores." */
  periodDescription: string
  greeting: string
  lead: PortalLeadSentence
  yourTurn: PortalYourTurn
  pulse: PortalPulseMetric[]
  mainResult: PortalMainResult
  attentionItems: PortalAttentionItem[]
  yuxActivity: PortalYuxActivityItem[]
  /** Só existe quando algum item da linha do tempo vem de projetos. */
  activityHistoryHref?: string
  deliveries: PortalDeliveryItem[]
  hasProjects: boolean
  activeModules: PortalModuleSummary[]
  expansionSuggestions: PortalExpansionSuggestion[]
  sections: {
    yourTurn: PortalSectionState
    pulse: PortalSectionState
    mainResult: PortalSectionState
    attention: PortalSectionState
    activity: PortalSectionState
    deliveries: PortalSectionState
  }
}

const moduleLabels: Record<string, string> = {
  crm: 'CRM e funis',
  whatsapp_ai: 'Conversas e IA',
  campaigns: 'Campanhas',
  landing_pages: 'Landing pages',
  marketing_studio: 'Marketing Studio',
  projects: 'Projetos e entregas',
  proposals: 'Propostas',
  support: 'Suporte',
  finance: 'Financeiro',
  bi_reports: 'Relatórios',
  automations: 'Automações',
  radar: 'Radar comercial',
  action_engine: 'Missões',
}

const focusLabels: Record<PortalDashboardFocus, string> = {
  commercial: 'Foco comercial',
  marketing: 'Foco marketing',
  delivery: 'Foco entregas',
  executive: 'Foco executivo',
}

function plural(count: number, singular: string, pluralForm: string) {
  return count === 1 ? singular : pluralForm
}

function hasAny(modules: string[], candidates: string[]) {
  return candidates.some(candidate => modules.includes(candidate))
}

function resolveFocus(input: Pick<PortalDashboardInput, 'enabledModuleKeys' | 'focusOverride'>): PortalDashboardFocus {
  if (input.focusOverride) return input.focusOverride

  const groups = [
    hasAny(input.enabledModuleKeys, ['crm', 'whatsapp_ai']),
    hasAny(input.enabledModuleKeys, ['campaigns', 'landing_pages', 'marketing_studio']),
    hasAny(input.enabledModuleKeys, ['projects', 'proposals', 'support', 'finance']),
  ].filter(Boolean).length

  if (groups >= 2) return 'executive'
  if (hasAny(input.enabledModuleKeys, ['crm', 'whatsapp_ai'])) return 'commercial'
  if (hasAny(input.enabledModuleKeys, ['campaigns', 'landing_pages', 'marketing_studio'])) return 'marketing'
  return 'delivery'
}

function calculateDataStatus(input: PortalDashboardInput): Pick<PortalExecutiveDashboardModel, 'dataStatus' | 'unavailableSources'> {
  const unavailableSources = [
    input.actionError ? 'Projetos e financeiro' : null,
    input.crm.error ? 'Comercial' : null,
    input.marketing.error ? 'Marketing' : null,
  ].filter(Boolean) as string[]

  if (unavailableSources.length === 0) {
    return { dataStatus: 'Completo', unavailableSources }
  }

  const hasAnyData = input.actions.length > 0
    || input.projects.length > 0
    || input.approvals.length > 0
    || input.invoices.length > 0
    || input.crm.leads.length > 0
    || input.marketing.campaigns.length > 0
    || input.marketing.contents.length > 0

  return {
    dataStatus: hasAnyData ? 'Parcial' : 'Com falha',
    unavailableSources,
  }
}

function openPipelineValue(leads: CrmLead[]) {
  return leads
    .filter(lead => lead.status !== 'won' && lead.status !== 'lost')
    .reduce((sum, lead) => sum + (lead.value || 0), 0)
}

function overdueTasks(tasks: CrmTask[], now: Date) {
  return tasks.filter(task => task.status === 'pending' && new Date(task.dueAt).getTime() < now.getTime())
}

function pendingApprovals(approvals: ApprovalRequest[]) {
  return approvals.filter(approval => approval.status === 'pending')
}

function activeProjectsOf(projects: Project[]) {
  return projects.filter(project => project.status === 'ACTIVE' || project.status === 'REVIEW')
}

function moduleOn(input: Pick<PortalDashboardInput, 'enabledModuleKeys'>, key: string) {
  return input.enabledModuleKeys.includes(key)
}

// ---------------------------------------------------------------------------
// Janela de período
// ---------------------------------------------------------------------------

export interface PortalDashboardWindowRange {
  /** Início do período atual (inclusive). */
  start: Date
  /** Fim do período atual (inclusive): o instante "agora". */
  end: Date
  /** Início do período anterior equivalente (inclusive). */
  previousStart: Date
  /** Fim do período anterior (exclusivo). */
  previousEnd: Date
  comparisonLabel: string
}

const DAY_MS = 86_400_000
const HOUR_MS = 3_600_000

function shiftDays(date: Date, days: number) {
  const shifted = new Date(date.getTime())
  shifted.setDate(shifted.getDate() + days)
  return shifted
}

/**
 * Resolve o intervalo de cada seletor de período.
 * - "Hoje": da meia-noite local até agora; o anterior é o mesmo trecho de ontem.
 * - "7 dias" / "30 dias": janela móvel que termina agora; o anterior é a janela
 *   de mesmo tamanho imediatamente antes.
 */
export function resolveDashboardWindow(windowLabel: PortalDashboardWindow, now: Date = new Date()): PortalDashboardWindowRange {
  const end = new Date(now.getTime())

  if (windowLabel === 'Hoje') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const previousStart = shiftDays(start, -1)
    const previousEnd = new Date(previousStart.getTime() + (end.getTime() - start.getTime()))
    return { start, end, previousStart, previousEnd, comparisonLabel: 'vs. ontem' }
  }

  const days = windowLabel === '7 dias' ? 7 : 30
  const start = shiftDays(end, -days)
  return {
    start,
    end,
    previousStart: shiftDays(start, -days),
    previousEnd: start,
    comparisonLabel: `vs. ${days} dias antes`,
  }
}

function toTime(value?: string | null) {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

function inCurrent(value: string | null | undefined, range: PortalDashboardWindowRange) {
  const time = toTime(value)
  return time !== null && time >= range.start.getTime() && time <= range.end.getTime()
}

function inPrevious(value: string | null | undefined, range: PortalDashboardWindowRange) {
  const time = toTime(value)
  return time !== null && time >= range.previousStart.getTime() && time < range.previousEnd.getTime()
}

function periodPhrase(windowLabel: PortalDashboardWindow) {
  if (windowLabel === 'Hoje') return 'hoje'
  return `nos últimos ${windowLabel}`
}

/** Contagem por intervalo ao longo da janela: horas para "Hoje", dias para 7/30. Retorna undefined com pontos insuficientes. */
function bucketCounts(values: Array<string | null | undefined>, range: PortalDashboardWindowRange, windowLabel: PortalDashboardWindow) {
  const isToday = windowLabel === 'Hoje'
  const bucketMs = isToday ? HOUR_MS : DAY_MS
  const size = isToday
    ? Math.floor((range.end.getTime() - range.start.getTime()) / HOUR_MS) + 1
    : windowLabel === '7 dias' ? 7 : 30
  if (size < 2) return undefined

  const buckets = new Array<number>(size).fill(0)
  values.forEach(value => {
    if (!inCurrent(value, range)) return
    const index = Math.floor((new Date(value as string).getTime() - range.start.getTime()) / bucketMs)
    buckets[Math.min(size - 1, Math.max(0, index))] += 1
  })
  return buckets
}

// ---------------------------------------------------------------------------
// Variações
// ---------------------------------------------------------------------------

function deltaTone(diff: number, higherIsBetter: boolean): PortalMetricDelta['tone'] {
  if (diff === 0) return 'flat'
  return (diff > 0) === higherIsBetter ? 'good' : 'bad'
}

function signed(value: number) {
  return value > 0 ? `+${value}` : String(value)
}

/** Variação de uma contagem: "+3 (+25%)", "-2", "Sem variação". */
function countDelta(current: number, previous: number, higherIsBetter: boolean): PortalMetricDelta {
  const diff = current - previous
  if (diff === 0) return { text: 'Sem variação', tone: 'flat' }
  const percent = previous > 0 ? ` (${signed(Math.round((diff / previous) * 100))}%)` : ''
  return { text: `${signed(diff)}${percent}`, tone: deltaTone(diff, higherIsBetter) }
}

/** Variação de uma taxa em pontos percentuais: "+5 p.p.". */
function rateDelta(current: number, previous: number, higherIsBetter: boolean): PortalMetricDelta {
  const diff = Math.round(current - previous)
  if (diff === 0) return { text: 'Sem variação', tone: 'flat' }
  return { text: `${signed(diff)} p.p.`, tone: deltaTone(diff, higherIsBetter) }
}

function moneyDelta(current: number, previous: number, higherIsBetter: boolean): PortalMetricDelta {
  const diff = current - previous
  if (Math.round(diff) === 0) return { text: 'Sem variação', tone: 'flat' }
  const text = `${diff > 0 ? '+' : '-'}${formatCompactCurrency(Math.abs(diff))}`
  return { text, tone: deltaTone(diff, higherIsBetter) }
}

// ---------------------------------------------------------------------------
// Instantâneos (posição) reconstruídos a partir de carimbos de data
// ---------------------------------------------------------------------------

/**
 * Oportunidades abertas em `at`: criadas até `at` e ainda não fechadas nesse instante.
 * O fechamento só é conhecido com precisão por `wonAt`/`lostAt`; se algum lead fechado
 * criado antes de `at` não tiver esse carimbo, o instantâneo não é confiável e retorna null.
 */
function openLeadsSnapshot(leads: CrmLead[], at: Date) {
  const atTime = at.getTime()
  let count = 0
  let value = 0

  for (const lead of leads) {
    const createdAt = toTime(lead.createdAt)
    if (createdAt === null || createdAt > atTime) continue

    if (lead.status !== 'won' && lead.status !== 'lost') {
      count += 1
      value += lead.value || 0
      continue
    }

    const closedAt = toTime(lead.status === 'won' ? lead.wonAt : lead.lostAt)
    if (closedAt === null) return null
    if (closedAt > atTime) {
      count += 1
      value += lead.value || 0
    }
  }

  return { count, value }
}

/** Aprovações pendentes em `at`; null se alguma aprovação já decidida não tiver data de decisão. */
function pendingApprovalsSnapshot(approvals: ApprovalRequest[], at: Date) {
  const atTime = at.getTime()
  let count = 0

  for (const approval of approvals) {
    const submittedAt = toTime(approval.submittedAt)
    if (submittedAt === null || submittedAt > atTime) continue

    if (approval.status === 'pending') {
      count += 1
      continue
    }

    const decidedAt = toTime(approval.decidedAt) ?? (approval.status === 'cancelled' ? toTime(approval.updatedAt) : null)
    if (decidedAt === null) return null
    if (decidedAt > atTime) count += 1
  }

  return count
}

/** Data de fechamento usada nas métricas do período (com `updatedAt` como aproximação). */
function leadClosedAt(lead: CrmLead) {
  if (lead.status === 'won') return lead.wonAt || lead.updatedAt
  if (lead.status === 'lost') return lead.lostAt || lead.updatedAt
  return undefined
}

/**
 * Taxa de conversão do período = ganhos / (ganhos + perdidos) entre os leads FECHADOS
 * dentro do intervalo. Foi escolhida em vez da coorte "criados no período" porque a coorte
 * subestima períodos recentes (leads novos ainda não tiveram tempo de fechar).
 */
function conversionIn(leads: CrmLead[], inRange: (value?: string) => boolean) {
  const closed = leads.filter(lead => (lead.status === 'won' || lead.status === 'lost') && inRange(leadClosedAt(lead)))
  const won = closed.filter(lead => lead.status === 'won').length
  return { won, closed: closed.length, rate: closed.length > 0 ? (won / closed.length) * 100 : null }
}

// ---------------------------------------------------------------------------
// Pulso
// ---------------------------------------------------------------------------

interface PulseContext {
  input: ResolvedInput
  range: PortalDashboardWindowRange
  comparison: string
  phrase: string
}

/** Posição: oportunidades abertas e valor em negociação, com variação desde o início do período. */
function commercialMetrics({ input, range, comparison, phrase }: PulseContext): PortalPulseMetric[] {
  const leads = input.crm.leads
  const overdue = overdueTasks(input.crm.tasks, input.now)
  const pendingTasks = input.crm.tasks.filter(task => task.status === 'pending').length
  const openLeads = leads.filter(lead => lead.status !== 'won' && lead.status !== 'lost')
  const openValue = openPipelineValue(leads)

  const openAtStart = openLeadsSnapshot(leads, range.start)
  const opportunitiesDelta = openAtStart ? countDelta(openLeads.length, openAtStart.count, true) : undefined
  const pipelineDelta = openAtStart ? moneyDelta(openValue, openAtStart.value, true) : undefined

  const createdDates = leads.map(lead => lead.createdAt)
  const newLeads = createdDates.filter(value => inCurrent(value, range)).length
  const previousNewLeads = createdDates.filter(value => inPrevious(value, range)).length

  const conversionNow = conversionIn(leads, value => inCurrent(value, range))
  const conversionBefore = conversionIn(leads, value => inPrevious(value, range))
  const conversionDelta = conversionNow.rate !== null && conversionBefore.rate !== null
    ? rateDelta(conversionNow.rate, conversionBefore.rate, true)
    : undefined

  const wonLeads = leads.filter(lead => lead.status === 'won')
  const wonNow = wonLeads.filter(lead => inCurrent(leadClosedAt(lead), range))
  const wonBefore = wonLeads.filter(lead => inPrevious(leadClosedAt(lead), range))
  const wonValue = wonNow.reduce((sum, lead) => sum + (lead.value || 0), 0)

  return [
    { id: 'new-leads', kind: 'period', higherIsBetter: true, label: 'Novos leads', value: String(newLeads), detail: `criados ${phrase}`, tone: newLeads > 0 ? 'positive' : 'neutral', href: '/portal/comercial/leads', delta: countDelta(newLeads, previousNewLeads, true), comparison, spark: bucketCounts(createdDates, range, input.windowLabel) },
    { id: 'opportunities', kind: 'position', higherIsBetter: true, label: 'Oportunidades abertas', value: String(openLeads.length), detail: 'em aberto agora', tone: openLeads.length > 0 ? 'positive' : 'neutral', href: '/portal/comercial/leads', delta: opportunitiesDelta, comparison: opportunitiesDelta ? comparison : undefined },
    { id: 'pipeline-value', kind: 'position', higherIsBetter: true, label: 'Valor em negociação', value: formatCompactCurrency(openValue), detail: 'soma das oportunidades abertas', tone: openValue > 0 ? 'positive' : 'neutral', href: '/portal/comercial/funis', delta: pipelineDelta, comparison: pipelineDelta ? comparison : undefined },
    {
      id: 'conversion',
      kind: 'period',
      higherIsBetter: true,
      label: 'Taxa de conversão',
      value: conversionNow.rate !== null ? `${Math.round(conversionNow.rate)}%` : 'Sem dados',
      detail: conversionNow.closed > 0
        ? `${conversionNow.won} ${plural(conversionNow.won, 'ganho', 'ganhos')} de ${conversionNow.closed} ${plural(conversionNow.closed, 'fechado', 'fechados')}`
        : `nenhum lead fechado ${phrase}`,
      tone: 'neutral',
      href: '/portal/relatorios',
      delta: conversionDelta,
      comparison: conversionDelta ? comparison : undefined,
    },
    { id: 'followups', kind: 'position', higherIsBetter: false, label: 'Follow-ups vencidos', value: String(overdue.length), detail: `de ${pendingTasks} ${plural(pendingTasks, 'pendente', 'pendentes')}`, tone: overdue.length > 0 ? 'critical' : 'healthy', href: '/portal/comercial/tarefas' },
    { id: 'won', kind: 'period', higherIsBetter: true, label: 'Vendas ganhas', value: String(wonNow.length), detail: wonValue > 0 ? formatCompactCurrency(wonValue) : `fechadas ${phrase}`, tone: wonNow.length > 0 ? 'positive' : 'neutral', href: '/portal/comercial/funis', delta: countDelta(wonNow.length, wonBefore.length, true), comparison, spark: bucketCounts(wonLeads.map(leadClosedAt), range, input.windowLabel) },
  ]
}

function marketingMetrics({ input, range, comparison, phrase }: PulseContext): PortalPulseMetric[] {
  const campaigns = moduleOn(input, 'campaigns') ? input.marketing.campaigns : []
  const metrics: PortalPulseMetric[] = []

  if (campaigns.length > 0) {
    // Os totais da campanha (leads, gasto, MROI) são acumulados: não há quebra por data, então
    // não é possível filtrá-los pelo período. Ficam como posição e sem variação.
    const leads = campaigns.reduce((sum, campaign) => sum + (campaign.leads || 0), 0)
    const spend = campaigns.reduce((sum, campaign) => sum + (campaign.spend || 0), 0)
    const cpl = leads > 0 ? spend / leads : 0
    const bestMroi = Math.max(0, ...campaigns.map(campaign => campaign.mroi || 0))
    const active = campaigns.filter(campaign => campaign.lifecycleStatus === 'active').length

    metrics.push({ id: 'leads', kind: 'position', higherIsBetter: true, label: 'Leads das campanhas', value: String(leads), detail: 'gerados (acumulado)', tone: leads > 0 ? 'positive' : 'neutral', href: '/portal/marketing/campanhas' })
    metrics.push({ id: 'spend', kind: 'position', higherIsBetter: false, label: 'Investimento', value: formatCompactCurrency(spend), detail: 'em campanhas (acumulado)', tone: 'neutral', href: '/portal/marketing/campanhas' })
    if (cpl > 0) {
      metrics.push({ id: 'cpl', kind: 'position', higherIsBetter: false, label: 'Custo por lead', value: formatPortalCurrency(cpl), detail: 'média das campanhas', tone: 'neutral' })
    }
    if (bestMroi > 0) {
      metrics.push({ id: 'mroi', kind: 'position', higherIsBetter: true, label: 'MROI', value: `${bestMroi.toFixed(1).replace('.', ',')}x`, detail: 'retorno da melhor campanha', tone: bestMroi >= 3 ? 'positive' : 'neutral' })
    }
    metrics.push({ id: 'campaigns', kind: 'position', higherIsBetter: true, label: 'Campanhas ativas', value: String(active), detail: `de ${campaigns.length} ${plural(campaigns.length, 'campanha', 'campanhas')}`, tone: active > 0 ? 'healthy' : 'neutral', href: '/portal/marketing/campanhas' })
  }

  if (moduleOn(input, 'marketing_studio')) {
    const published = input.marketing.contents.filter(content => content.status === 'published')
    const publishedDates = published.map(content => content.publishedAt)
    const publishedNow = publishedDates.filter(value => inCurrent(value, range)).length
    const publishedBefore = publishedDates.filter(value => inPrevious(value, range)).length
    metrics.push({ id: 'published', kind: 'period', higherIsBetter: true, label: 'Conteúdos publicados', value: String(publishedNow), detail: `publicados ${phrase}`, tone: publishedNow > 0 ? 'positive' : 'neutral', href: '/portal/marketing/conteudo', delta: countDelta(publishedNow, publishedBefore, true), comparison, spark: bucketCounts(publishedDates, range, input.windowLabel) })
  }

  return metrics
}

function deliveryMetrics({ input, range, comparison, phrase }: PulseContext): PortalPulseMetric[] {
  const now = input.now
  const approvals = pendingApprovals(input.approvals)
  const active = activeProjectsOf(input.projects)
  const withDeadline = active.filter(project => project.expectedEndDate)
  const onTime = withDeadline.filter(project => !isDeliveryOverdue(project.expectedEndDate, project.status, now))

  const approvalsAtStart = pendingApprovalsSnapshot(input.approvals, range.start)
  const approvalsDelta = approvalsAtStart === null ? undefined : countDelta(approvals.length, approvalsAtStart, false)

  const completedDates = input.projects
    .filter(project => project.status === 'COMPLETED')
    .map(project => project.actualEndDate || project.endDate || project.updatedAt)
  const completedNow = completedDates.filter(value => inCurrent(value, range)).length
  const completedBefore = completedDates.filter(value => inPrevious(value, range)).length

  const horizon = shiftDays(now, 14).getTime()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const upcoming = active.filter(project => {
    const due = toTime(project.expectedEndDate?.length === 10 ? `${project.expectedEndDate}T12:00:00` : project.expectedEndDate)
    return due !== null && due >= startOfToday && due <= horizon
  })

  const metrics: PortalPulseMetric[] = [
    { id: 'projects', kind: 'position', higherIsBetter: true, label: 'Projetos ativos', value: String(active.length), detail: 'em andamento ou revisão', tone: active.length > 0 ? 'healthy' : 'neutral', href: '/portal/projetos/projetos' },
    { id: 'approvals', kind: 'position', higherIsBetter: false, label: 'Aprovações pendentes', value: String(approvals.length), detail: 'esperando você', tone: approvals.length > 0 ? 'attention' : 'healthy', href: '/portal/projetos/aprovacoes', delta: approvalsDelta, comparison: approvalsDelta ? comparison : undefined },
  ]
  if (withDeadline.length > 0) {
    metrics.push({ id: 'on-time', kind: 'position', higherIsBetter: true, label: 'Entregas no prazo', value: `${onTime.length} de ${withDeadline.length}`, detail: 'projetos ativos com previsão', tone: onTime.length === withDeadline.length ? 'healthy' : 'attention', href: '/portal/projetos/projetos' })
  }
  metrics.push({ id: 'completed', kind: 'period', higherIsBetter: true, label: 'Entregas concluídas', value: String(completedNow), detail: `concluídas ${phrase}`, tone: completedNow > 0 ? 'positive' : 'neutral', href: '/portal/projetos/projetos', delta: countDelta(completedNow, completedBefore, true), comparison, spark: bucketCounts(completedDates, range, input.windowLabel) })
  if (active.length > 0) {
    metrics.push({ id: 'milestones', kind: 'position', higherIsBetter: true, label: 'Próximos marcos', value: String(upcoming.length), detail: 'previsões nos próximos 14 dias', tone: 'neutral', href: '/portal/projetos/projetos' })
  }
  return metrics
}

function financeMetrics({ input }: PulseContext): PortalPulseMetric[] {
  const open = input.invoices.filter(invoice => {
    const state = getInvoicePaymentState(invoice, input.now)
    return state !== 'paid' && state !== 'cancelled'
  })
  const overdue = open.filter(invoice => {
    const state = getInvoicePaymentState(invoice, input.now)
    return state === 'overdue' || state === 'partial_overdue'
  })
  return [{
    id: 'invoices',
    kind: 'position',
    higherIsBetter: false,
    label: 'Faturas em aberto',
    value: String(open.length),
    detail: overdue.length > 0 ? `${overdue.length} ${plural(overdue.length, 'vencida', 'vencidas')}` : 'nenhuma vencida',
    tone: overdue.length > 0 ? 'critical' : 'healthy',
    href: '/portal/financeiro',
  }]
}

/** Grades fecham em 6, 4, 3 ou 2 colunas: 5 indicadores viram 4 e mais de 6 viram 6. */
function fitPulse(metrics: PortalPulseMetric[]) {
  if (metrics.length > 6) return metrics.slice(0, 6)
  if (metrics.length === 5) return metrics.slice(0, 4)
  return metrics
}

function pulseAreas(input: ResolvedInput) {
  return {
    commercial: moduleOn(input, 'crm') && !input.crm.error,
    marketing: (moduleOn(input, 'campaigns') || moduleOn(input, 'marketing_studio')) && !input.marketing.error,
    delivery: moduleOn(input, 'projects') && !input.actionError,
    finance: moduleOn(input, 'finance') && !input.actionError,
  }
}

function buildPulse(input: ResolvedInput, focus: PortalDashboardFocus): PortalPulseMetric[] {
  const range = resolveDashboardWindow(input.windowLabel, input.now)
  const ctx: PulseContext = { input, range, comparison: range.comparisonLabel, phrase: periodPhrase(input.windowLabel) }
  const areas = pulseAreas(input)

  if (focus === 'commercial') return fitPulse(areas.commercial ? commercialMetrics(ctx) : [])
  if (focus === 'marketing') return fitPulse(areas.marketing ? marketingMetrics(ctx) : [])
  if (focus === 'delivery') return fitPulse(areas.delivery ? deliveryMetrics(ctx) : [])

  // Executivo: um indicador de cada área contratada por vez, até completar 6.
  const lists = [
    areas.commercial ? commercialMetrics(ctx) : [],
    areas.marketing ? marketingMetrics(ctx) : [],
    areas.delivery ? deliveryMetrics(ctx) : [],
    areas.finance ? financeMetrics(ctx) : [],
  ].filter(list => list.length > 0)
  const picked: PortalPulseMetric[] = []
  for (let round = 0; picked.length < 6; round += 1) {
    let added = false
    for (const list of lists) {
      if (picked.length < 6 && list[round]) {
        picked.push(list[round])
        added = true
      }
    }
    if (!added) break
  }
  return fitPulse(picked)
}

function pulseSourcesFor(input: ResolvedInput, focus: PortalDashboardFocus): PortalDashboardSource[] {
  if (focus === 'commercial') return ['crm']
  if (focus === 'marketing') return ['marketing']
  if (focus === 'delivery') return ['projects']
  return ['crm', 'marketing', 'projects']
}

// ---------------------------------------------------------------------------
// Resultado principal
// ---------------------------------------------------------------------------

const MIN_BOTTLENECK_BASE = 5

function funnelStagesOf(pipeline: CrmPipeline): CrmPipelineStage[] {
  return (pipeline.stages ?? [])
    .filter(stage => stage.isActive !== false && !stage.isWon && !stage.isLost)
    .sort((a, b) => a.orderIndex - b.orderIndex)
}

/** Funil com mais leads (empate: o padrão) entre os que têm ao menos 2 etapas em andamento. */
function pickFunnelPipeline(pipelines: CrmPipeline[], leads: CrmLead[]) {
  const usable = pipelines.filter(pipeline => pipeline.isActive !== false && funnelStagesOf(pipeline).length >= 2)
  if (usable.length === 0) return undefined
  const count = (pipeline: CrmPipeline) => leads.filter(lead => lead.pipelineId === pipeline.id).length
  return [...usable].sort((a, b) => count(b) - count(a) || Number(b.isDefault) - Number(a.isDefault))[0]
}

/**
 * Funil por etapa = leads que CHEGARAM a cada etapa (estão nela ou além, ou já foram ganhos), de modo que
 * a série nunca cresce e a taxa de passagem entre etapas é a razão entre elas. Leads perdidos entram até a
 * etapa em que estavam; perdidos sem etapa conhecida ficam de fora.
 */
function buildFunnel(pipeline: CrmPipeline, leads: CrmLead[]) {
  const stages = funnelStagesOf(pipeline)
  const indexByStage = new Map(stages.map((stage, index) => [stage.id, index]))
  const reached = stages.map(() => ({ count: 0, value: 0 }))

  for (const lead of leads) {
    if (lead.pipelineId !== pipeline.id) continue
    let reachIndex: number | undefined
    if (lead.status === 'won') reachIndex = stages.length - 1
    else reachIndex = indexByStage.get(lead.stageId)
    if (reachIndex === undefined) continue
    for (let i = 0; i <= reachIndex; i += 1) {
      reached[i].count += 1
      reached[i].value += lead.value || 0
    }
  }

  const views: PortalFunnelStageView[] = stages.map((stage, index) => {
    const { count, value } = reached[index]
    const previous = index > 0 ? reached[index - 1].count : 0
    return {
      id: stage.id,
      label: stage.name,
      reached: count,
      value: count,
      display: value > 0 ? `${count} · ${formatCompactCurrency(value)}` : String(count),
      conv: index > 0 && previous > 0
        ? `${Math.round((count / previous) * 100)}% avançam de ${stages[index - 1].name}`
        : undefined,
    }
  })

  let bottleneckIndex: number | undefined
  let lowest = Infinity
  for (let index = 1; index < reached.length; index += 1) {
    const base = reached[index - 1].count
    if (base < MIN_BOTTLENECK_BASE) continue
    const ratio = reached[index].count / base
    if (ratio < lowest) {
      lowest = ratio
      bottleneckIndex = index
    }
  }
  if (bottleneckIndex !== undefined && lowest >= 1) bottleneckIndex = undefined

  let narrative: string
  if (bottleneckIndex !== undefined) {
    narrative = `A maior perda está entre "${stages[bottleneckIndex - 1].name}" e "${stages[bottleneckIndex].name}": ${Math.round(lowest * 100)}% dos leads que chegaram a "${stages[bottleneckIndex - 1].name}" avançaram.`
  } else if (reached.some((_, index) => index > 0 && reached[index - 1].count >= MIN_BOTTLENECK_BASE)) {
    narrative = 'Os leads estão avançando entre todas as etapas, sem perda entre elas.'
  } else {
    narrative = 'Ainda há poucos leads para apontar onde o funil perde mais.'
  }

  return { stages: views, bottleneckIndex, narrative }
}

function commercialResult(input: ResolvedInput, focus: PortalDashboardFocus): PortalMainResult {
  const base = {
    focus,
    title: 'Funil comercial',
    description: 'Posição de hoje, independente do período escolhido.',
    ctaLabel: 'Abrir funil',
    ctaHref: '/portal/comercial/funis',
  }
  const leads = input.crm.leads
  if (!moduleOn(input, 'crm') || leads.length === 0) {
    return {
      ...base,
      kind: 'empty',
      emptyTitle: 'Ainda não há leads no funil',
      emptyDescription: 'Quando os leads chegarem, aqui você vê quanto está em negociação, quantos avançam em cada etapa e onde eles ficam parados.',
    }
  }

  const range = resolveDashboardWindow(input.windowLabel, input.now)
  const open = leads.filter(lead => lead.status !== 'won' && lead.status !== 'lost')
  const openValue = openPipelineValue(leads)
  const wonNow = leads.filter(lead => lead.status === 'won' && inCurrent(leadClosedAt(lead), range))
  const wonValue = wonNow.reduce((sum, lead) => sum + (lead.value || 0), 0)
  const phrase = periodPhrase(input.windowLabel)

  const pipeline = pickFunnelPipeline(input.crm.pipelines ?? [], leads)
  const funnel = pipeline ? buildFunnel(pipeline, leads) : undefined

  let wonText: string
  if (wonNow.length === 0) wonText = `Nenhuma venda fechada ${phrase}.`
  else if (wonValue > 0) wonText = `${formatCompactCurrency(wonValue)} ganhos em ${wonNow.length} ${plural(wonNow.length, 'venda', 'vendas')} ${phrase}`
  else wonText = `${wonNow.length} ${plural(wonNow.length, 'venda ganha', 'vendas ganhas')} ${phrase}`

  return {
    ...base,
    kind: 'funnel',
    eyebrow: 'Em negociação',
    headline: openValue > 0 ? formatCompactCurrency(openValue) : String(open.length),
    headlineDetail: openValue > 0
      ? `em ${open.length} ${plural(open.length, 'oportunidade aberta', 'oportunidades abertas')}`
      : `${plural(open.length, 'oportunidade aberta', 'oportunidades abertas')}, sem valor informado`,
    narrative: funnel?.narrative ?? 'Configure as etapas do funil para ver onde os leads ficam parados.',
    funnel: funnel ? { stages: funnel.stages, bottleneckIndex: funnel.bottleneckIndex } : undefined,
    won: { text: wonText, hasWins: wonNow.length > 0 },
  }
}

function marketingResult(input: ResolvedInput, focus: PortalDashboardFocus): PortalMainResult {
  const base = {
    focus,
    title: 'Leads por campanha',
    description: 'Total acumulado de cada campanha.',
    ctaLabel: 'Ver campanhas',
    ctaHref: '/portal/marketing/campanhas',
  }
  const campaigns = moduleOn(input, 'campaigns')
    ? input.marketing.campaigns.filter(campaign => (campaign.leads || 0) > 0).sort((a, b) => (b.leads || 0) - (a.leads || 0))
    : []
  if (campaigns.length === 0) {
    return {
      ...base,
      kind: 'empty',
      emptyTitle: 'Ainda não há leads de campanhas',
      emptyDescription: 'Quando as campanhas gerarem leads, mostramos aqui qual delas traz mais resultado.',
    }
  }

  const total = campaigns.reduce((sum, campaign) => sum + (campaign.leads || 0), 0)
  const top = campaigns[0]
  return {
    ...base,
    kind: 'bars',
    eyebrow: 'Leads gerados',
    headline: String(total),
    headlineDetail: `em ${campaigns.length} ${plural(campaigns.length, 'campanha', 'campanhas')} (acumulado)`,
    narrative: campaigns.length > 1
      ? `A campanha "${top.name}" gerou ${Math.round(((top.leads || 0) / total) * 100)}% dos leads.`
      : `Todos os leads vieram da campanha "${top.name}".`,
    bars: campaigns.slice(0, 6).map(campaign => ({
      label: campaign.name,
      value: campaign.leads || 0,
      display: `${campaign.leads || 0} ${plural(campaign.leads || 0, 'lead', 'leads')}`,
    })),
  }
}

function deliveryStatusFor(project: Project, awaitingYou: boolean, now: Date): PortalStatusView {
  if (awaitingYou) return { variant: 'warn', label: 'Aguardando você' }
  if (!project.expectedEndDate) return { variant: 'neutral', label: 'Sem prazo definido' }
  return isDeliveryOverdue(project.expectedEndDate, project.status, now)
    ? { variant: 'crit', label: 'Atrasado' }
    : { variant: 'ok', label: 'No prazo' }
}

/** Projetos que esperam o cliente primeiro; depois por previsão mais próxima (sem previsão por último). */
function sortedActiveProjects(input: ResolvedInput) {
  const waiting = new Set(pendingApprovals(input.approvals).map(approval => approval.projectId))
  const dueTime = (project: Project) => toTime(project.expectedEndDate?.length === 10 ? `${project.expectedEndDate}T12:00:00` : project.expectedEndDate) ?? Infinity
  return activeProjectsOf(input.projects)
    .map(project => ({ project, awaitingYou: waiting.has(project.id) }))
    .sort((a, b) => Number(b.awaitingYou) - Number(a.awaitingYou) || dueTime(a.project) - dueTime(b.project))
}

function deliveryResult(input: ResolvedInput, focus: PortalDashboardFocus): PortalMainResult {
  const base = {
    focus,
    title: 'Andamento das entregas',
    description: 'Progresso dos projetos em andamento.',
    ctaLabel: 'Abrir projetos',
    ctaHref: '/portal/projetos/projetos',
  }
  const rows = moduleOn(input, 'projects') ? sortedActiveProjects(input) : []
  if (rows.length === 0) {
    return {
      ...base,
      kind: 'empty',
      emptyTitle: 'Nenhum projeto em andamento',
      emptyDescription: 'Quando um projeto for iniciado, mostramos aqui o progresso, a previsão de entrega e o que depende de você.',
    }
  }

  const awaiting = rows.filter(row => row.awaitingYou).length
  const late = rows.filter(row => isDeliveryOverdue(row.project.expectedEndDate, row.project.status, input.now)).length
  let narrative = 'Nenhuma aprovação pendente e nenhum prazo vencido.'
  if (awaiting > 0) narrative = `${awaiting} ${plural(awaiting, 'projeto espera', 'projetos esperam')} a sua decisão para seguir.`
  else if (late > 0) narrative = `${late} ${plural(late, 'projeto passou', 'projetos passaram')} da previsão de entrega.`

  return {
    ...base,
    kind: 'progress',
    eyebrow: 'Em andamento',
    headline: String(rows.length),
    headlineDetail: plural(rows.length, 'projeto ativo', 'projetos ativos'),
    narrative,
    progress: rows.slice(0, 5).map(({ project, awaitingYou }) => ({
      id: project.id,
      title: project.name,
      subtitle: project.expectedEndDate ? `Previsão ${formatShortDate(project.expectedEndDate, input.now)}` : 'Sem previsão definida',
      percent: project.progress || 0,
      status: deliveryStatusFor(project, awaitingYou, input.now),
    })),
  }
}

function buildMainResult(input: ResolvedInput, focus: PortalDashboardFocus): { result: PortalMainResult; sources: PortalDashboardSource[] } {
  if (focus === 'commercial') return { result: commercialResult(input, focus), sources: ['crm'] }
  if (focus === 'marketing') return { result: marketingResult(input, focus), sources: ['marketing'] }
  if (focus === 'delivery') return { result: deliveryResult(input, focus), sources: ['projects'] }

  // Executivo: o primeiro dos três que tenha dados; sem nenhum, o vazio da primeira área contratada.
  const candidates: Array<{ result: PortalMainResult; source: PortalDashboardSource; contracted: boolean }> = [
    { result: commercialResult(input, focus), source: 'crm', contracted: moduleOn(input, 'crm') },
    { result: marketingResult(input, focus), source: 'marketing', contracted: moduleOn(input, 'campaigns') },
    { result: deliveryResult(input, focus), source: 'projects', contracted: moduleOn(input, 'projects') },
  ]
  const withData = candidates.find(candidate => candidate.contracted && candidate.result.kind !== 'empty')
  const chosen = withData ?? candidates.find(candidate => candidate.contracted) ?? candidates[0]
  return { result: chosen.result, sources: [chosen.source] }
}

// ---------------------------------------------------------------------------
// Sua vez
// ---------------------------------------------------------------------------

export function buildGreeting(now: Date, userName?: string | null) {
  const hour = now.getHours()
  const salutation = hour >= 5 && hour < 12 ? 'Bom dia' : hour >= 12 && hour < 18 ? 'Boa tarde' : 'Boa noite'
  const firstName = userName?.trim().split(/\s+/)[0]
  return firstName ? `${salutation}, ${firstName}.` : `${salutation}.`
}

/** Frase-resumo do cabeçalho; `accent` é o trecho em serifa itálica. */
export function buildLeadSentence(decisionCount: number): PortalLeadSentence {
  if (decisionCount <= 0) {
    return { before: 'Você não tem ', accent: 'nenhuma decisão', after: ' esperando. A YUX está acompanhando o restante.' }
  }
  return {
    before: 'Você tem ',
    accent: `${decisionCount} ${plural(decisionCount, 'decisão', 'decisões')}`,
    after: ' esperando. O restante a YUX está acompanhando.',
  }
}

const MAX_YOUR_TURN_ITEMS = 3

/**
 * O que só anda com a decisão do cliente, só com dados reais carregados e só dos módulos contratados:
 * aprovações de projetos pendentes, faturas vencidas ou a vencer em até 7 dias e conteúdos aguardando revisão.
 * Ordem: faturas vencidas (urgência alta) primeiro, depois o que espera há mais tempo. Mostra até 3 cartões.
 */
export function buildYourTurn(rawInput: PortalDashboardInput): PortalYourTurn {
  const now = rawInput.now ?? new Date()
  const items: PortalYourTurnItem[] = []
  let total = 0
  let approvalCount = 0

  if (moduleOn(rawInput, 'projects')) {
    for (const approval of pendingApprovals(rawInput.approvals)) {
      approvalCount += 1
      total += 1
      items.push({
        id: `approval-${approval.id}`,
        kind: 'approval',
        tone: 'warn',
        moduleLabel: 'Projetos · aprovação',
        wait: formatRelativeTime(approval.submittedAt, now),
        title: approval.title,
        description: approval.instructions || 'Esta entrega só avança depois da sua decisão.',
        primary: {
          label: 'Revisar e aprovar',
          href: `/portal/projetos/projetos?projectId=${encodeURIComponent(approval.projectId)}&tab=approvals`,
        },
        since: toTime(approval.submittedAt) ?? now.getTime(),
      })
    }
  }

  if (moduleOn(rawInput, 'finance')) {
    for (const invoice of rawInput.invoices) {
      const state = getInvoicePaymentState(invoice, now)
      const overdue = state === 'overdue' || state === 'partial_overdue'
      if (!overdue && state !== 'due_soon') continue
      total += 1
      const openAmount = Math.max(invoice.totalAmount - invoice.paidAmount, 0)
      items.push({
        id: `invoice-${invoice.id}`,
        kind: 'invoice',
        tone: overdue ? 'crit' : 'warn',
        moduleLabel: 'Financeiro · fatura',
        wait: formatDueLabel(invoice.dueDate, now),
        title: `Fatura nº ${invoice.invoiceNumber} · ${formatPortalCurrency(openAmount)}`,
        description: `${overdue ? 'Venceu em' : 'Vencimento em'} ${formatShortDate(invoice.dueDate, now)}.${invoice.paidAmount > 0 ? ' Já houve pagamento parcial.' : ''}`,
        primary: { label: 'Ver fatura', href: '/portal/financeiro' },
        payInvoice: true,
        since: toTime(invoice.dueDate.length === 10 ? `${invoice.dueDate}T12:00:00` : invoice.dueDate) ?? now.getTime(),
      })
    }
  }

  if (moduleOn(rawInput, 'marketing_studio')) {
    const { reviews, contents } = rawInput.marketing
    const titleById = new Map(contents.map(content => [content.id, content.title]))
    const pendingReviews = reviews.filter(review => review.status === 'pending')
    const inReview = contents.filter(content => content.status === 'in_review')
    const pending = pendingReviews.length > 0
      ? { titles: pendingReviews.map(review => titleById.get(review.contentItemId)), dates: pendingReviews.map(review => review.createdAt) }
      : { titles: inReview.map(content => content.title), dates: inReview.map(content => content.updatedAt) }

    if (pending.dates.length > 0) {
      total += pending.dates.length
      const times = pending.dates.map(value => toTime(value)).filter((value): value is number => value !== null)
      const oldest = times.length > 0 ? Math.min(...times) : now.getTime()
      const single = pending.dates.length === 1
      items.push({
        id: 'content-reviews',
        kind: 'content',
        tone: 'warn',
        moduleLabel: 'Marketing · conteúdo',
        wait: formatRelativeTime(new Date(oldest), now),
        title: single
          ? pending.titles[0] || 'Conteúdo aguardando a sua revisão'
          : `${pending.dates.length} conteúdos aguardando a sua revisão`,
        description: 'O conteúdo só segue para publicação depois da sua aprovação ou do pedido de ajustes.',
        primary: { label: 'Revisar conteúdo', href: '/portal/marketing/conteudo' },
        since: oldest,
      })
    }
  }

  items.sort((a, b) => Number(b.tone === 'crit') - Number(a.tone === 'crit') || a.since - b.since)
  return { items: items.slice(0, MAX_YOUR_TURN_ITEMS), total, approvalCount }
}

// ---------------------------------------------------------------------------
// Atenção
// ---------------------------------------------------------------------------

/** Já aparecem em "Sua vez" (com os mesmos filtros), então não se repetem em "Pontos de atenção". */
const YOUR_TURN_ACTION_IDS = new Set(['project-approvals', 'finance-due', 'content-reviews'])
const attentionRank: Record<PortalAttentionPriority, number> = { high: 0, medium: 1, low: 2 }
const attentionPriorityFor: Record<PortalNextAction['priority'], PortalAttentionPriority> = {
  critical: 'high',
  high: 'medium',
  normal: 'low',
}

function attentionActionLabel(kind: PortalNextAction['kind']) {
  if (kind === 'commercial') return 'Retomar'
  if (kind === 'approval' || kind === 'marketing') return 'Revisar'
  if (kind === 'project') return 'Ver projetos'
  return 'Abrir'
}

function buildAttentionItems(input: ResolvedInput): PortalAttentionItem[] {
  return input.actions
    .filter(action => !YOUR_TURN_ACTION_IDS.has(action.id))
    .map(action => {
      const sinceTime = toTime(action.since)
      let wait: string | undefined
      if (sinceTime !== null) {
        if (action.kind === 'finance') wait = formatDueLabel(action.since, input.now)
        else if (sinceTime <= input.now.getTime()) wait = formatRelativeTime(action.since, input.now)
      }
      const clientOwns = action.kind === 'approval' || action.kind === 'finance' || action.kind === 'marketing'
      const item: PortalAttentionItem & { sinceTime: number } = {
        id: action.id,
        priority: attentionPriorityFor[action.priority],
        kind: action.kind,
        title: action.title,
        description: action.description,
        owner: clientOwns ? 'Você' : action.kind === 'commercial' ? 'Equipe comercial' : undefined,
        ownerIsYux: !clientOwns && action.kind !== 'commercial',
        wait,
        href: action.href,
        actionLabel: attentionActionLabel(action.kind),
        sinceTime: sinceTime ?? Infinity,
      }
      return item
    })
    .sort((a, b) => attentionRank[a.priority] - attentionRank[b.priority] || a.sinceTime - b.sinceTime)
    .slice(0, 6)
    .map(({ sinceTime: _sinceTime, ...item }) => item)
}

// ---------------------------------------------------------------------------
// Executado pela YUX
// ---------------------------------------------------------------------------

function pad2(value: number) {
  return String(value).padStart(2, '0')
}

/** "Hoje 09:12", "Ontem 17:40" ou "15 out". */
export function formatActivityWhen(date: Date, now: Date = new Date()) {
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
  const dayDiff = Math.round((startOf(date) - startOf(now)) / DAY_MS)
  const time = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (dayDiff === 0) return `Hoje ${time}`
  if (dayDiff === -1) return `Ontem ${time}`
  return formatShortDate(date, now)
}

const workflowRunDescriptions: Record<MarketingWorkflowRun['runType'], string> = {
  manual: 'Executado pela equipe YUX.',
  scheduled: 'Execução automática agendada.',
  event: 'Disparado por um evento do seu marketing.',
  retry: 'Nova tentativa concluída com sucesso.',
}

function workflowRunTitle(run: MarketingWorkflowRun) {
  for (const payload of [run.resultPayload, run.inputPayload]) {
    for (const key of ['title', 'name']) {
      const value = payload?.[key]
      if (typeof value === 'string' && value.trim()) return value.trim()
    }
  }
  return 'Fluxo de marketing concluído'
}

/** Atividades com data real dentro do período escolhido, da mais recente para a mais antiga (até 4). */
function buildYuxActivity(input: ResolvedInput) {
  const range = resolveDashboardWindow(input.windowLabel, input.now)
  const entries: Array<PortalYuxActivityItem & { at: number }> = []
  const push = (id: string, value: string | undefined | null, entry: Omit<PortalYuxActivityItem, 'id' | 'when'>) => {
    if (!inCurrent(value, range)) return
    const at = new Date(value as string)
    entries.push({ ...entry, id, when: formatActivityWhen(at, input.now), at: at.getTime() })
  }

  if (moduleOn(input, 'projects')) {
    input.projects.forEach(project => {
      push(`project-${project.id}`, project.updatedAt, {
        title: `${project.name} atualizado`,
        description: project.status === 'REVIEW' ? 'Entrega em revisão.' : `${project.progress || 0}% concluído.`,
        tag: 'Projetos',
        source: 'project',
      })
    })
    input.approvals.forEach(approval => {
      push(`approval-${approval.id}`, approval.submittedAt, {
        title: `${approval.title} enviado para aprovação`,
        description: approval.status === 'pending' ? 'Aguardando a sua decisão.' : `Situação: ${statusLabel(approval.status).toLowerCase()}.`,
        tag: 'Projetos',
        source: 'project',
      })
    })
  }

  if (moduleOn(input, 'marketing_studio')) {
    input.marketing.workflowRuns
      .filter(run => run.status === 'succeeded')
      .forEach(run => {
        push(`workflow-${run.id}`, run.completedAt || run.createdAt, {
          title: workflowRunTitle(run),
          description: workflowRunDescriptions[run.runType] ?? workflowRunDescriptions.manual,
          tag: 'Marketing',
          source: 'marketing',
        })
      })
    input.marketing.contents.forEach(content => {
      if (content.status === 'published') {
        push(`content-${content.id}`, content.publishedAt, {
          title: `${content.title} publicado`,
          description: 'Conteúdo no ar.',
          tag: 'Marketing',
          source: 'marketing',
        })
      } else if (['in_review', 'approved', 'scheduled', 'changes_requested'].includes(content.status)) {
        push(`content-${content.id}`, content.createdAt, {
          title: `${content.title} preparado`,
          description: `Situação: ${statusLabel(content.status).toLowerCase()}.`,
          tag: 'Marketing',
          source: 'marketing',
        })
      }
    })
  }

  if (moduleOn(input, 'campaigns')) {
    input.marketing.campaigns.forEach(campaign => {
      push(`campaign-${campaign.id}`, campaign.createdAt, {
        title: `Campanha ${campaign.name} criada`,
        description: 'Campanha preparada pela equipe YUX.',
        tag: 'Campanhas',
        source: 'marketing',
      })
    })
  }

  return entries
    .sort((a, b) => b.at - a.at)
    .slice(0, 4)
    .map(({ at: _at, ...item }) => item)
}

// ---------------------------------------------------------------------------
// Próximas entregas
// ---------------------------------------------------------------------------

function buildDeliveries(input: ResolvedInput): PortalDeliveryItem[] {
  if (!moduleOn(input, 'projects')) return []
  return sortedActiveProjects(input).slice(0, 4).map(({ project, awaitingYou }) => {
    const phase = project.phases?.find(item => item.status === 'in_progress')
    const forecast = project.expectedEndDate ? `previsão ${formatShortDate(project.expectedEndDate, input.now)}` : 'sem previsão definida'
    return {
      id: project.id,
      title: phase?.name || project.name,
      subtitle: phase ? `${project.name} · ${forecast}` : forecast.charAt(0).toUpperCase() + forecast.slice(1),
      percent: phase ? phase.progress : project.progress || 0,
      status: deliveryStatusFor(project, awaitingYou, input.now),
    }
  })
}

// ---------------------------------------------------------------------------
// Módulos e sugestão
// ---------------------------------------------------------------------------

function moduleHref(moduleKey: string) {
  const hrefs: Record<string, string> = {
    crm: '/portal/comercial/leads',
    whatsapp_ai: '/portal/atendimento/conversas',
    campaigns: '/portal/marketing/campanhas',
    landing_pages: '/portal/marketing/landing-pages',
    marketing_studio: '/portal/marketing/studio',
    projects: '/portal/projetos/projetos',
    proposals: '/portal/projetos/propostas',
    support: '/portal/suporte',
    finance: '/portal/financeiro',
    bi_reports: '/portal/relatorios',
    automations: '/portal/automacoes/fluxos',
    radar: '/portal/comercial/radar',
    action_engine: '/portal/missoes',
  }
  return hrefs[moduleKey] || '/portal'
}

const genericModuleSignals: Record<string, string> = {
  whatsapp_ai: 'Acompanhe as conversas e o atendimento da IA',
  landing_pages: 'Veja as páginas de captação do seu site',
  proposals: 'Consulte as propostas enviadas e as decisões',
  support: 'Abra e acompanhe chamados com a YUX',
  bi_reports: 'Consulte os relatórios do seu contrato',
  automations: 'Veja os fluxos automáticos em funcionamento',
  radar: 'Encontre novas empresas para prospectar',
  action_engine: 'Converse com a YUX sobre as missões',
}

function moduleSummary(moduleKey: string, input: ResolvedInput): Pick<PortalModuleSummary, 'statusLabel' | 'signal'> {
  const unavailable = { statusLabel: 'Sem dados' as const, signal: 'Não foi possível carregar os dados agora' }

  if (moduleKey === 'crm') {
    if (input.crm.error) return unavailable
    const open = input.crm.leads.filter(lead => lead.status !== 'won' && lead.status !== 'lost').length
    if (input.crm.leads.length === 0) return { statusLabel: 'Sem dados', signal: 'Nenhum lead ainda' }
    const overdue = overdueTasks(input.crm.tasks, input.now).length
    return { statusLabel: overdue > 0 ? 'Atenção' : 'Ativo', signal: `${open} ${plural(open, 'oportunidade aberta', 'oportunidades abertas')}` }
  }

  if (moduleKey === 'campaigns') {
    if (input.marketing.error) return unavailable
    const campaigns = input.marketing.campaigns
    if (campaigns.length === 0) return { statusLabel: 'Sem dados', signal: 'Nenhuma campanha ainda' }
    const active = campaigns.filter(campaign => campaign.lifecycleStatus === 'active').length
    const failed = campaigns.some(campaign => campaign.lifecycleStatus === 'failed')
    return { statusLabel: failed ? 'Atenção' : 'Ativo', signal: `${active} ${plural(active, 'campanha ativa', 'campanhas ativas')}` }
  }

  if (moduleKey === 'marketing_studio') {
    if (input.marketing.error) return unavailable
    const waiting = input.marketing.reviews.filter(review => review.status === 'pending').length
    if (waiting > 0) return { statusLabel: 'Atenção', signal: `${waiting} ${plural(waiting, 'conteúdo aguardando revisão', 'conteúdos aguardando revisão')}` }
    const total = input.marketing.contents.length
    if (total === 0) return { statusLabel: 'Sem dados', signal: 'Nenhum conteúdo ainda' }
    return { statusLabel: 'Ativo', signal: `${total} ${plural(total, 'conteúdo no estúdio', 'conteúdos no estúdio')}` }
  }

  if (moduleKey === 'projects') {
    if (input.actionError) return unavailable
    const waiting = pendingApprovals(input.approvals).length
    if (waiting > 0) return { statusLabel: 'Atenção', signal: `${waiting} ${plural(waiting, 'aprovação espera', 'aprovações esperam')} você` }
    const active = activeProjectsOf(input.projects).length
    if (active === 0) return { statusLabel: 'Sem dados', signal: 'Nenhum projeto em andamento' }
    return { statusLabel: 'Ativo', signal: `${active} em andamento` }
  }

  if (moduleKey === 'finance') {
    if (input.actionError) return unavailable
    const open = input.invoices.filter(invoice => {
      const state = getInvoicePaymentState(invoice, input.now)
      return state !== 'paid' && state !== 'cancelled'
    })
    if (input.invoices.length === 0) return { statusLabel: 'Sem dados', signal: 'Nenhuma fatura emitida' }
    if (open.length === 0) return { statusLabel: 'Em dia', signal: 'Nenhuma fatura em aberto' }
    const overdue = open.filter(invoice => ['overdue', 'partial_overdue'].includes(getInvoicePaymentState(invoice, input.now))).length
    if (overdue > 0) return { statusLabel: 'Atenção', signal: `${overdue} ${plural(overdue, 'fatura vencida', 'faturas vencidas')}` }
    const next = open.map(invoice => invoice.dueDate).sort()[0]
    return { statusLabel: 'Ativo', signal: `Próxima fatura ${formatDueLabel(next, input.now)}` }
  }

  return { statusLabel: 'Ativo', signal: genericModuleSignals[moduleKey] || 'Disponível no seu contrato' }
}

function buildActiveModules(input: ResolvedInput): PortalModuleSummary[] {
  return [...new Set(input.enabledModuleKeys)]
    .filter(moduleKey => moduleLabels[moduleKey])
    .map(moduleKey => ({
      moduleKey,
      title: moduleLabels[moduleKey],
      href: moduleHref(moduleKey),
      ...moduleSummary(moduleKey, input),
    }))
}

/** Colunas da grade de módulos de modo que a última linha fique completa nas larguras comuns. */
export function getModuleGridColumns(count: number) {
  const desktop: Record<number, string> = {
    1: 'min-[1180px]:grid-cols-1',
    2: 'min-[1180px]:grid-cols-2',
    3: 'min-[1180px]:grid-cols-3',
    4: 'min-[1180px]:grid-cols-4',
    5: 'min-[1180px]:grid-cols-5',
    6: 'min-[1180px]:grid-cols-3',
    7: 'min-[1180px]:grid-cols-4',
    8: 'min-[1180px]:grid-cols-4',
    9: 'min-[1180px]:grid-cols-3',
    10: 'min-[1180px]:grid-cols-5',
    11: 'min-[1180px]:grid-cols-4',
    12: 'min-[1180px]:grid-cols-4',
  }
  const tablet = count <= 1 ? '' : 'min-[640px]:grid-cols-2'
  return ['grid-cols-1', tablet, desktop[count] ?? 'min-[1180px]:grid-cols-4'].filter(Boolean).join(' ')
}

/** No máximo uma sugestão, ligada a um sinal real do período, que leva a uma conversa com a YUX. */
function buildExpansionSuggestions(input: ResolvedInput): PortalExpansionSuggestion[] {
  const overdue = overdueTasks(input.crm.tasks, input.now).length
  const pendingTasks = input.crm.tasks.filter(task => task.status === 'pending').length

  if (!moduleOn(input, 'automations') && (overdue > 0 || pendingTasks >= 3)) {
    return [{
      id: 'automations',
      moduleKey: 'automations',
      moduleName: 'Automações',
      reason: overdue > 0
        ? `${overdue} ${plural(overdue, 'follow-up venceu', 'follow-ups venceram')} e ainda ${plural(overdue, 'espera', 'esperam')} retorno. Uma sequência automática de retomada ajudaria a evitar que isso se repita.`
        : `Há ${pendingTasks} follow-ups pendentes. Uma sequência automática de retomada reduz o trabalho manual da equipe comercial.`,
      ctaLabel: 'Conversar com a YUX',
      href: '/portal/missoes',
      confidence: 'high',
    }]
  }

  const activeCampaigns = input.marketing.campaigns.filter(campaign => campaign.lifecycleStatus === 'active').length
  if (!moduleOn(input, 'marketing_studio') && activeCampaigns > 0) {
    return [{
      id: 'marketing-studio',
      moduleKey: 'marketing_studio',
      moduleName: 'Marketing Studio',
      reason: `Você tem ${activeCampaigns} ${plural(activeCampaigns, 'campanha ativa', 'campanhas ativas')}, mas a criação e a aprovação dos conteúdos ainda não estão centralizadas.`,
      ctaLabel: 'Conversar com a YUX',
      href: '/portal/missoes',
      confidence: 'medium',
    }]
  }

  return []
}

// ---------------------------------------------------------------------------
// Modelo
// ---------------------------------------------------------------------------

function buildGeneratedAtLabel(loadedAt: Date | null | undefined, now: Date) {
  if (!loadedAt || Number.isNaN(loadedAt.getTime())) return 'Atualizando dados'
  // Relógio do navegador levemente atrás da carga não deve gerar "em 2 min".
  const reference = loadedAt.getTime() > now.getTime() ? now : loadedAt
  return `Dados atualizados ${formatRelativeTime(reference, now)}`
}

/** Textos do seletor de período: legenda do cabeçalho e descrição do Pulso. */
export function describeDashboardPeriod(windowLabel: PortalDashboardWindow) {
  if (windowLabel === 'Hoje') {
    return { caption: 'Comparando com ontem', description: 'Hoje até agora, comparado com o mesmo horário de ontem.' }
  }
  const days = windowLabel === '7 dias' ? 7 : 30
  return {
    caption: `Comparando com os ${days} dias anteriores`,
    description: `Últimos ${days} dias, comparados com os ${days} dias anteriores.`,
  }
}

function sectionState(input: ResolvedInput, wanted: PortalDashboardSource[]): PortalSectionState {
  const enabledSources = wanted.filter(source => {
    if (source === 'projects') return moduleOn(input, 'projects') || moduleOn(input, 'finance')
    if (source === 'crm') return moduleOn(input, 'crm')
    return moduleOn(input, 'campaigns') || moduleOn(input, 'marketing_studio')
  })
  const status: Record<PortalDashboardSource, PortalSectionState> = {
    projects: { loading: input.actionLoading, error: Boolean(input.actionError) },
    crm: { loading: input.crm.loading, error: Boolean(input.crm.error) },
    marketing: { loading: input.marketing.loading, error: Boolean(input.marketing.error) },
  }
  return {
    loading: enabledSources.some(source => status[source].loading),
    error: enabledSources.some(source => status[source].error),
  }
}

export function buildPortalDashboardModel(rawInput: PortalDashboardInput): PortalExecutiveDashboardModel {
  const now = rawInput.now ?? new Date()
  const input: ResolvedInput = { ...rawInput, now }
  const focus = resolveFocus(input)
  const data = calculateDataStatus(input)
  const period = describeDashboardPeriod(input.windowLabel)
  const yourTurn = buildYourTurn(input)
  const main = buildMainResult(input, focus)
  const yuxActivity = buildYuxActivity(input)
  const allSources: PortalDashboardSource[] = ['projects', 'crm', 'marketing']

  return {
    organizationName: input.organization?.name || 'Empresa do cliente',
    contractName: input.contract?.name || input.contract?.package?.name || 'Contrato ativo',
    contractStatus: input.contract?.status || 'active',
    focus,
    focusLabel: focusLabels[focus],
    dataStatus: data.dataStatus,
    unavailableSources: data.unavailableSources,
    generatedAtLabel: buildGeneratedAtLabel(input.loadedAt, now),
    windowLabel: input.windowLabel,
    periodCaption: period.caption,
    periodDescription: period.description,
    greeting: buildGreeting(now, input.userName),
    lead: buildLeadSentence(yourTurn.total),
    yourTurn,
    pulse: buildPulse(input, focus),
    mainResult: main.result,
    attentionItems: buildAttentionItems(input),
    yuxActivity,
    activityHistoryHref: yuxActivity.some(item => item.source === 'project') ? '/portal/projetos/projetos' : undefined,
    deliveries: buildDeliveries(input),
    hasProjects: moduleOn(input, 'projects'),
    activeModules: buildActiveModules(input),
    expansionSuggestions: buildExpansionSuggestions(input),
    sections: {
      yourTurn: sectionState(input, ['projects', 'marketing']),
      pulse: sectionState(input, pulseSourcesFor(input, focus)),
      mainResult: sectionState(input, main.sources),
      attention: sectionState(input, allSources),
      activity: sectionState(input, ['projects', 'marketing']),
      deliveries: sectionState(input, ['projects']),
    },
  }
}
