import type { PortalNextAction } from '@/hooks/usePortalActionSummary'
import type { PortalCampaign } from '@/types/campaign'
import type { CrmLead, CrmTask } from '@/types/crm'
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

export interface PortalDashboardCrmInput {
  leads: CrmLead[]
  tasks: CrmTask[]
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
  actionLoading: boolean
  actionError: string | null
  windowLabel: PortalDashboardWindow
  focusOverride?: PortalDashboardFocus
}

export interface PortalPulseMetric {
  id: string
  label: string
  value: string
  detail: string
  tone: PortalDashboardTone
  href?: string
}

export interface PortalMainResultSignal {
  label: string
  value: string
  detail: string
  tone: PortalDashboardTone
}

export interface PortalMainResult {
  focus: PortalDashboardFocus
  title: string
  headlineMetric: string
  headlineDetail: string
  narrative: string
  signals: PortalMainResultSignal[]
  ctaLabel: string
  ctaHref: string
}

export interface PortalAttentionItem {
  id: string
  priority: 'critical' | 'high' | 'normal'
  kind: 'approval' | 'commercial' | 'finance' | 'project' | 'marketing' | 'integration' | 'support'
  title: string
  description: string
  impactLabel: string
  expectedOwner: string
  href: string
  actionLabel: string
}

export interface PortalYuxActivityItem {
  id: string
  title: string
  detail: string
  impactLabel: string
  href: string
}

export interface PortalRecommendationItem {
  id: string
  title: string
  detail: string
  impactLabel: string
  href: string
}

export interface PortalModuleSummary {
  moduleKey: string
  title: string
  statusLabel: 'Ativo' | 'Precisa de atencao' | 'Sem dados' | 'Em implantacao'
  signal: string
  href: string
}

export interface PortalExpansionSuggestion {
  id: string
  moduleKey: string
  moduleName: string
  reason: string
  expectedGain: string
  ctaLabel: string
  href: string
  confidence: 'high' | 'medium' | 'low'
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
  pulse: PortalPulseMetric[]
  mainResult: PortalMainResult
  attentionItems: PortalAttentionItem[]
  yuxActivity: PortalYuxActivityItem[]
  recommendations: PortalRecommendationItem[]
  activeModules: PortalModuleSummary[]
  expansionSuggestions: PortalExpansionSuggestion[]
}

const brl = new Intl.NumberFormat('pt-BR', {
  currency: 'BRL',
  maximumFractionDigits: 0,
  style: 'currency',
})

const moduleLabels: Record<string, string> = {
  crm: 'Comercial',
  campaigns: 'Campanhas',
  landing_pages: 'Landing Pages',
  marketing_studio: 'Marketing Studio',
  projects: 'Projetos',
  proposals: 'Aprovacoes',
  support: 'Suporte',
  finance: 'Financeiro',
  bi_reports: 'Relatorios',
  automations: 'Automacoes',
  whatsapp_ai: 'Atendimento & IA',
}

const focusLabels: Record<PortalDashboardFocus, string> = {
  commercial: 'Foco comercial',
  marketing: 'Foco marketing',
  delivery: 'Foco entregas',
  executive: 'Foco executivo',
}

function formatBRL(value: number) {
  return brl.format(Math.max(0, Math.round(value))).replace(/\s/g, ' ')
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
    input.actionError ? 'Proximas acoes' : null,
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

function overdueTasks(tasks: CrmTask[]) {
  return tasks.filter(task => task.status === 'pending' && new Date(task.dueAt).getTime() < Date.now())
}

function pendingApprovals(approvals: ApprovalRequest[]) {
  return approvals.filter(approval => approval.status === 'pending')
}

function buildPulse(input: PortalDashboardInput, focus: PortalDashboardFocus): PortalPulseMetric[] {
  const overdue = overdueTasks(input.crm.tasks)
  const approvals = pendingApprovals(input.approvals)
  const openValue = openPipelineValue(input.crm.leads)
  const activeCampaigns = input.marketing.campaigns.filter(campaign => campaign.lifecycleStatus === 'active')
  const activeProjects = input.projects.filter(project => project.status === 'ACTIVE' || project.status === 'REVIEW')
  const pendingReviews = input.marketing.reviews.filter(review => review.status === 'pending')
  const criticalActions = input.actions.filter(action => action.priority === 'critical')

  if (focus === 'commercial') {
    return [
      { id: 'opportunities', label: 'Oportunidades', value: String(input.crm.leads.filter(lead => lead.status !== 'won' && lead.status !== 'lost').length), detail: `${formatBRL(openValue)} potencial`, tone: openValue > 0 ? 'positive' : 'neutral', href: '/portal/comercial/leads' },
      { id: 'followups', label: 'Follow-ups', value: String(input.crm.tasks.filter(task => task.status === 'pending').length), detail: `${overdue.length} vencidos`, tone: overdue.length > 0 ? 'critical' : 'healthy', href: '/portal/comercial/tarefas' },
      { id: 'proposals', label: 'Propostas', value: String(input.actions.filter(action => action.kind === 'approval').length), detail: 'em decisao', tone: approvals.length > 0 ? 'attention' : 'neutral', href: '/portal/projetos/aprovacoes' },
      { id: 'conversion', label: 'Conversao', value: input.crm.leads.length > 0 ? `${Math.round((input.crm.leads.filter(lead => lead.status === 'won').length / input.crm.leads.length) * 100)}%` : 'Sem dados', detail: 'periodo atual', tone: 'neutral', href: '/portal/relatorios' },
      { id: 'health', label: 'Saude', value: criticalActions.length > 0 ? 'Atencao' : 'Saudavel', detail: `${criticalActions.length} bloqueio${criticalActions.length === 1 ? '' : 's'}`, tone: criticalActions.length > 0 ? 'attention' : 'healthy' },
    ]
  }

  if (focus === 'marketing') {
    const leads = input.marketing.campaigns.reduce((sum, campaign) => sum + (campaign.leads || 0), 0)
    const spend = input.marketing.campaigns.reduce((sum, campaign) => sum + (campaign.spend || 0), 0)
    const cpl = leads > 0 ? spend / leads : 0
    const bestMroi = Math.max(0, ...input.marketing.campaigns.map(campaign => campaign.mroi || 0))

    return [
      { id: 'leads', label: 'Leads', value: String(leads), detail: 'gerados', tone: leads > 0 ? 'positive' : 'neutral', href: '/portal/marketing/campanhas' },
      { id: 'cpl', label: 'CPL', value: cpl > 0 ? formatBRL(cpl) : 'Sem dados', detail: 'custo por lead', tone: cpl > 0 ? 'neutral' : 'attention' },
      { id: 'mroi', label: 'MROI', value: bestMroi > 0 ? `${bestMroi.toFixed(1)}x` : 'Sem dados', detail: 'melhor campanha', tone: bestMroi >= 3 ? 'positive' : 'neutral' },
      { id: 'campaigns', label: 'Campanhas', value: String(activeCampaigns.length), detail: 'ativas', tone: activeCampaigns.length > 0 ? 'healthy' : 'neutral', href: '/portal/marketing/campanhas' },
      { id: 'creatives', label: 'Criativos', value: String(input.marketing.creativeSuggestions.length), detail: `${pendingReviews.length} revisoes`, tone: pendingReviews.length > 0 ? 'attention' : 'neutral', href: '/portal/marketing/criativos' },
    ]
  }

  if (focus === 'delivery') {
    return [
      { id: 'projects', label: 'Projetos', value: String(activeProjects.length), detail: 'ativos', tone: activeProjects.length > 0 ? 'healthy' : 'neutral', href: '/portal/projetos/projetos' },
      { id: 'approvals', label: 'Aprovacoes', value: String(approvals.length), detail: 'pendentes', tone: approvals.length > 0 ? 'attention' : 'healthy', href: '/portal/projetos/aprovacoes' },
      { id: 'milestones', label: 'Marcos', value: String(input.projects.filter(project => project.expectedEndDate).length), detail: 'proximos', tone: 'neutral' },
      { id: 'support', label: 'Suporte', value: input.enabledModuleKeys.includes('support') ? 'Ativo' : 'N/A', detail: 'contratado', tone: input.enabledModuleKeys.includes('support') ? 'healthy' : 'neutral', href: '/portal/suporte' },
      { id: 'health', label: 'Saude', value: criticalActions.length > 0 ? 'Atencao' : 'Saudavel', detail: `${criticalActions.length} bloqueios`, tone: criticalActions.length > 0 ? 'attention' : 'healthy' },
    ]
  }

  return [
    { id: 'health', label: 'Saude geral', value: criticalActions.length > 0 ? 'Atencao' : 'Saudavel', detail: `${criticalActions.length} criticos`, tone: criticalActions.length > 0 ? 'attention' : 'healthy' },
    { id: 'result', label: 'Resultado', value: openValue > 0 ? formatBRL(openValue) : `${input.marketing.campaigns.length} frentes`, detail: openValue > 0 ? 'potencial comercial' : 'ativas', tone: openValue > 0 ? 'positive' : 'neutral' },
    { id: 'attention', label: 'Pendencias', value: String(input.actions.length), detail: 'pontos de atencao', tone: input.actions.length > 0 ? 'attention' : 'healthy' },
    { id: 'delivery', label: 'Entrega', value: String(activeProjects.length), detail: 'projetos ativos', tone: activeProjects.length > 0 ? 'healthy' : 'neutral' },
    { id: 'value', label: 'YUX', value: String(input.marketing.workflowRuns.length + input.projects.length), detail: 'acoes registradas', tone: 'neutral' },
  ]
}

function buildMainResult(input: PortalDashboardInput, focus: PortalDashboardFocus): PortalMainResult {
  const openValue = openPipelineValue(input.crm.leads)
  const overdue = overdueTasks(input.crm.tasks)
  const activeCampaigns = input.marketing.campaigns.filter(campaign => campaign.lifecycleStatus === 'active')
  const campaignLeads = input.marketing.campaigns.reduce((sum, campaign) => sum + (campaign.leads || 0), 0)
  const activeProjects = input.projects.filter(project => project.status === 'ACTIVE' || project.status === 'REVIEW')
  const approvals = pendingApprovals(input.approvals)

  if (focus === 'commercial') {
    return {
      focus,
      title: 'Resultado comercial',
      headlineMetric: openValue > 0 ? `${formatBRL(openValue)} em receita potencial` : `${input.crm.leads.length} leads no pipeline`,
      headlineDetail: `${input.crm.leads.filter(lead => lead.status !== 'won' && lead.status !== 'lost').length} oportunidades abertas`,
      narrative: 'A leitura principal do contrato esta concentrada em pipeline, follow-ups e decisoes comerciais que podem acelerar receita.',
      signals: [
        { label: 'Pipeline', value: String(input.crm.leads.length), detail: 'leads monitorados', tone: input.crm.leads.length > 0 ? 'positive' : 'neutral' },
        { label: 'Follow-ups', value: String(overdue.length), detail: 'vencidos', tone: overdue.length > 0 ? 'critical' : 'healthy' },
        { label: 'Decisoes', value: String(input.actions.filter(action => action.kind === 'approval').length), detail: 'aguardando acao', tone: 'attention' },
      ],
      ctaHref: '/portal/comercial/leads',
      ctaLabel: 'Ver comercial',
    }
  }

  if (focus === 'marketing') {
    const bestMroi = Math.max(0, ...input.marketing.campaigns.map(campaign => campaign.mroi || 0))
    return {
      focus,
      title: 'Performance de marketing',
      headlineMetric: `${campaignLeads} leads gerados`,
      headlineDetail: bestMroi > 0 ? `melhor MROI ${bestMroi.toFixed(1)}x` : `${activeCampaigns.length} campanhas ativas`,
      narrative: 'A leitura principal prioriza campanhas, criativos, revisoes e recomendacoes para melhorar aquisicao e eficiencia.',
      signals: [
        { label: 'Campanhas', value: String(activeCampaigns.length), detail: 'ativas', tone: activeCampaigns.length > 0 ? 'healthy' : 'neutral' },
        { label: 'Criativos', value: String(input.marketing.creativeSuggestions.length), detail: 'em pauta', tone: input.marketing.creativeSuggestions.length > 0 ? 'attention' : 'neutral' },
        { label: 'Revisoes', value: String(input.marketing.reviews.filter(review => review.status === 'pending').length), detail: 'pendentes', tone: 'attention' },
      ],
      ctaHref: '/portal/marketing/campanhas',
      ctaLabel: 'Ver marketing',
    }
  }

  if (focus === 'delivery') {
    return {
      focus,
      title: 'Andamento das entregas',
      headlineMetric: `${activeProjects.length} projetos ativos`,
      headlineDetail: `${approvals.length} aprovacoes pendentes`,
      narrative: 'A leitura principal prioriza entregas, aprovacoes, marcos e riscos que podem atrasar o plano contratado.',
      signals: [
        { label: 'Projetos', value: String(activeProjects.length), detail: 'em andamento', tone: activeProjects.length > 0 ? 'healthy' : 'neutral' },
        { label: 'Aprovacoes', value: String(approvals.length), detail: 'aguardando cliente', tone: approvals.length > 0 ? 'attention' : 'healthy' },
        { label: 'Revisao', value: String(input.projects.filter(project => project.status === 'REVIEW').length), detail: 'projetos em revisao', tone: 'attention' },
      ],
      ctaHref: '/portal/projetos/projetos',
      ctaLabel: 'Ver projetos',
    }
  }

  return {
    focus,
    title: 'Resumo executivo',
    headlineMetric: openValue > 0 ? `${formatBRL(openValue)} em potencial` : `${input.actions.length} sinais ativos`,
    headlineDetail: 'contrato monitorado por multiplas frentes',
    narrative: 'A leitura executiva combina crescimento, entregas, pendencias e recomendacoes para priorizar a proxima decisao.',
    signals: [
      { label: 'Crescimento', value: openValue > 0 ? formatBRL(openValue) : String(campaignLeads), detail: openValue > 0 ? 'pipeline' : 'leads', tone: openValue > 0 || campaignLeads > 0 ? 'positive' : 'neutral' },
      { label: 'Entregas', value: String(activeProjects.length), detail: 'projetos ativos', tone: activeProjects.length > 0 ? 'healthy' : 'neutral' },
      { label: 'Atencao', value: String(input.actions.length), detail: 'itens abertos', tone: input.actions.length > 0 ? 'attention' : 'healthy' },
    ],
    ctaHref: '/portal/relatorios',
    ctaLabel: 'Ver relatorios',
  }
}

function buildAttentionItems(input: PortalDashboardInput): PortalAttentionItem[] {
  return input.actions.slice(0, 6).map(action => ({
    id: action.id,
    priority: action.priority,
    kind: action.kind,
    title: action.title,
    description: action.description,
    impactLabel: action.priority === 'critical' ? 'Pode travar resultado' : action.priority === 'high' ? 'Exige decisao' : 'Acompanhar',
    expectedOwner: action.kind === 'finance' || action.kind === 'approval' ? 'Cliente' : action.kind === 'commercial' ? 'Equipe comercial' : 'YUX',
    href: action.href,
    actionLabel: action.kind === 'finance' ? 'Abrir financeiro' : action.kind === 'commercial' ? 'Abrir tarefas' : 'Abrir item',
  }))
}

function buildYuxActivity(input: PortalDashboardInput): PortalYuxActivityItem[] {
  const items: PortalYuxActivityItem[] = []

  input.marketing.workflowRuns.slice(0, 2).forEach(run => {
    items.push({
      id: `workflow-${run.id}`,
      title: run.status === 'succeeded' ? 'Fluxo de marketing executado' : 'Fluxo de marketing atualizado',
      detail: run.runType ? `Origem: ${run.runType}` : 'Execucao registrada no Marketing Studio.',
      impactLabel: 'Operacao acompanhada pela YUX',
      href: '/portal/marketing/studio',
    })
  })

  input.projects.slice(0, 2).forEach(project => {
    items.push({
      id: `project-${project.id}`,
      title: `${project.name} atualizado`,
      detail: project.status === 'REVIEW' ? 'Entrega em revisao.' : 'Projeto acompanhado no portal.',
      impactLabel: `${project.progress || 0}% de progresso`,
      href: '/portal/projetos/projetos',
    })
  })

  input.marketing.contents.slice(0, 2).forEach(content => {
    items.push({
      id: `content-${content.id}`,
      title: `${content.title} preparado`,
      detail: `Status: ${content.status}`,
      impactLabel: 'Conteudo registrado',
      href: '/portal/marketing/studio',
    })
  })

  return items.slice(0, 4)
}

function buildRecommendations(input: PortalDashboardInput, focus: PortalDashboardFocus): PortalRecommendationItem[] {
  const recommendations: PortalRecommendationItem[] = []
  const overdue = overdueTasks(input.crm.tasks)
  const approvals = pendingApprovals(input.approvals)
  const pendingReviews = input.marketing.reviews.filter(review => review.status === 'pending')

  if (overdue.length > 0) {
    recommendations.push({
      id: 'followups',
      title: 'Reforcar follow-ups vencidos',
      detail: `${overdue.length} tarefa${overdue.length === 1 ? '' : 's'} comercial${overdue.length === 1 ? '' : 'is'} passou${overdue.length === 1 ? '' : 'ram'} do prazo.`,
      impactLabel: 'Reduz perda de oportunidade',
      href: '/portal/comercial/tarefas',
    })
  }

  if (approvals.length > 0) {
    recommendations.push({
      id: 'approvals',
      title: 'Destravar aprovacoes pendentes',
      detail: `${approvals.length} item${approvals.length === 1 ? '' : 's'} aguardando decisao.`,
      impactLabel: 'Acelera entregas',
      href: '/portal/projetos/aprovacoes',
    })
  }

  if (pendingReviews.length > 0) {
    recommendations.push({
      id: 'reviews',
      title: 'Revisar conteudos em aberto',
      detail: `${pendingReviews.length} conteudo${pendingReviews.length === 1 ? '' : 's'} aguardando revisao.`,
      impactLabel: 'Acelera publicacao',
      href: '/portal/marketing/studio',
    })
  }

  if (recommendations.length === 0) {
    recommendations.push({
      id: 'focus',
      title: focus === 'marketing' ? 'Avaliar proxima campanha' : focus === 'delivery' ? 'Revisar proximos marcos' : 'Revisar proxima oportunidade',
      detail: 'Nao ha bloqueios criticos nesta janela; use a proxima reuniao para priorizar ganho incremental.',
      impactLabel: 'Mantem ritmo do contrato',
      href: focus === 'marketing' ? '/portal/marketing/campanhas' : focus === 'delivery' ? '/portal/projetos/projetos' : '/portal/comercial/leads',
    })
  }

  return recommendations.slice(0, 4)
}

function moduleStatusFor(moduleKey: string, input: PortalDashboardInput): PortalModuleSummary['statusLabel'] {
  if (input.actions.some(action => action.priority === 'critical' && moduleHref(moduleKey) === action.href)) return 'Precisa de atencao'
  if (moduleKey === 'crm' && input.crm.loading) return 'Em implantacao'
  if ((moduleKey === 'campaigns' || moduleKey === 'marketing_studio') && input.marketing.loading) return 'Em implantacao'
  if (moduleKey === 'crm' && input.crm.leads.length === 0) return 'Sem dados'
  if (moduleKey === 'campaigns' && input.marketing.campaigns.length === 0) return 'Sem dados'
  return 'Ativo'
}

function moduleHref(moduleKey: string) {
  const hrefs: Record<string, string> = {
    crm: '/portal/comercial/leads',
    whatsapp_ai: '/portal/atendimento/conversas',
    campaigns: '/portal/marketing/campanhas',
    landing_pages: '/portal/marketing/landing-pages',
    marketing_studio: '/portal/marketing/studio',
    projects: '/portal/projetos/projetos',
    proposals: '/portal/projetos/aprovacoes',
    support: '/portal/suporte',
    finance: '/portal/financeiro',
    bi_reports: '/portal/relatorios',
    automations: '/portal/automacoes/fluxos',
  }
  return hrefs[moduleKey] || '/portal'
}

function moduleSignal(moduleKey: string, input: PortalDashboardInput) {
  if (moduleKey === 'crm') return `${input.crm.leads.length} leads, ${overdueTasks(input.crm.tasks).length} follow-ups vencidos`
  if (moduleKey === 'campaigns') return `${input.marketing.campaigns.filter(campaign => campaign.lifecycleStatus === 'active').length} campanhas ativas`
  if (moduleKey === 'marketing_studio') return `${input.marketing.reviews.filter(review => review.status === 'pending').length} revisoes pendentes`
  if (moduleKey === 'projects') return `${input.projects.filter(project => project.status === 'ACTIVE' || project.status === 'REVIEW').length} projetos ativos`
  if (moduleKey === 'proposals') return `${pendingApprovals(input.approvals).length} aprovacoes pendentes`
  if (moduleKey === 'finance') return `${input.invoices.length} faturas monitoradas`
  return 'Modulo liberado no contrato'
}

function buildActiveModules(input: PortalDashboardInput): PortalModuleSummary[] {
  return input.enabledModuleKeys
    .filter(moduleKey => moduleLabels[moduleKey])
    .slice(0, 8)
    .map(moduleKey => ({
      moduleKey,
      title: moduleLabels[moduleKey],
      statusLabel: moduleStatusFor(moduleKey, input),
      signal: moduleSignal(moduleKey, input),
      href: moduleHref(moduleKey),
    }))
}

function buildExpansionSuggestions(input: PortalDashboardInput): PortalExpansionSuggestion[] {
  const suggestions: PortalExpansionSuggestion[] = []

  if (!input.enabledModuleKeys.includes('automations') && input.crm.tasks.length >= 3) {
    suggestions.push({
      id: 'automations',
      moduleKey: 'automations',
      moduleName: 'Automacao comercial',
      reason: 'Ha follow-ups e tarefas recorrentes no CRM.',
      expectedGain: 'Reduzir trabalho manual da equipe comercial.',
      ctaLabel: 'Conversar com a YUX',
      href: '/portal/suporte',
      confidence: 'high',
    })
  }

  if (!input.enabledModuleKeys.includes('marketing_studio') && input.marketing.campaigns.length > 0) {
    suggestions.push({
      id: 'marketing-studio',
      moduleKey: 'marketing_studio',
      moduleName: 'Marketing Studio',
      reason: 'Existem campanhas ativas, mas o fluxo de conteudo e aprovacao nao esta centralizado.',
      expectedGain: 'Acelerar criacao, revisao e publicacao.',
      ctaLabel: 'Entender modulo',
      href: '/portal/suporte',
      confidence: 'medium',
    })
  }

  if (!input.enabledModuleKeys.includes('bi_reports') && input.enabledModuleKeys.length >= 2) {
    suggestions.push({
      id: 'bi-reports',
      moduleKey: 'bi_reports',
      moduleName: 'Relatorios BI',
      reason: 'O contrato ja possui multiplas frentes com dados operacionais.',
      expectedGain: 'Consolidar leitura executiva recorrente.',
      ctaLabel: 'Solicitar proposta',
      href: '/portal/suporte',
      confidence: 'medium',
    })
  }

  return suggestions.slice(0, 2)
}

export function buildPortalDashboardModel(input: PortalDashboardInput): PortalExecutiveDashboardModel {
  const focus = resolveFocus(input)
  const data = calculateDataStatus(input)

  return {
    organizationName: input.organization?.name || 'Empresa do cliente',
    contractName: input.contract?.name || input.contract?.package?.name || 'Contrato ativo',
    contractStatus: input.contract?.status || 'active',
    focus,
    focusLabel: focusLabels[focus],
    dataStatus: data.dataStatus,
    unavailableSources: data.unavailableSources,
    generatedAtLabel: 'Atualizado agora',
    windowLabel: input.windowLabel,
    pulse: buildPulse(input, focus),
    mainResult: buildMainResult(input, focus),
    attentionItems: buildAttentionItems(input),
    yuxActivity: buildYuxActivity(input),
    recommendations: buildRecommendations(input, focus),
    activeModules: buildActiveModules(input),
    expansionSuggestions: buildExpansionSuggestions(input),
  }
}
