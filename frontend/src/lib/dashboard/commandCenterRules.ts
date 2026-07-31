import type { AdminHubSummary } from '@/types/adminPlatform'

export interface DashboardStatsForCommandCenter {
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
  recent?: {
    projects: Array<{
      id: string
      name: string
      client: string
      status: string
      progress: number
    }>
  }
  recentActivity?: DashboardStatsForCommandCenter['recent']
}

export interface CommandCenterInput {
  dashboardStats: DashboardStatsForCommandCenter | null
  adminSummary: AdminHubSummary | null
  userName?: string
  hasPartialError: boolean
  windowLabel?: 'Hoje' | '7 dias' | '30 dias'
}

export interface PulseMetric {
  label: string
  value: string
  detail: string
  tone: 'risk' | 'opportunity' | 'neutral' | 'warning'
}

export interface CommandCenterItem {
  id: string
  lane: 'resolve_now' | 'opportunity'
  category: string
  title: string
  affectedEntityLabel: string
  impactLabel: string
  confidenceLabel?: string
  urgencyLabel: string
  ownerLabel: string
  evidence: string
  actionLabel: string
  href: string
  tone: 'critical' | 'warning' | 'opportunity' | 'efficiency' | 'neutral'
}

export interface PortfolioMapRow {
  id: string
  client: string
  health: string
  contract: string
  project: string
  performance: string
  risk: string
  opportunity: string
  owner: string
  nextAction: string
}

export interface ContextualShortcut {
  id: string
  label: string
  detail: string
  href: string
  tone: 'risk' | 'opportunity' | 'neutral' | 'warning'
}

export interface CommandCenterModel {
  userName?: string
  dataStatus: 'Completo' | 'Parcial' | 'Com falha'
  unavailableSources: string[]
  generatedAtLabel: string
  windowLabel: string
  pulse: PulseMetric[]
  resolveNow: CommandCenterItem[]
  opportunities: CommandCenterItem[]
  portfolioRows: PortfolioMapRow[]
  shortcuts: ContextualShortcut[]
}

const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

function formatBRL(value: number) {
  return brl.format(Math.max(0, Math.round(value))).replace(/\s/g, ' ')
}

function plural(count: number, singular: string, pluralValue: string) {
  return count === 1 ? singular : pluralValue
}

function defaultOverview(stats: DashboardStatsForCommandCenter | null) {
  return {
    totalClients: 0,
    totalProjects: 0,
    totalLeads: 0,
    totalCampaigns: 0,
    activeProjects: 0,
    qualifiedLeads: 0,
    ...stats?.overview,
  }
}

function defaultFinancial(stats: DashboardStatsForCommandCenter | null) {
  return {
    totalBudget: 0,
    totalCampaignSpent: 0,
    budgetUtilization: 0,
    ...stats?.financial,
  }
}

function defaultMarketing(stats: DashboardStatsForCommandCenter | null) {
  return {
    totalImpressions: 0,
    totalClicks: 0,
    ctr: 0,
    avgROAS: 0,
    ...stats?.marketing,
  }
}

function recentProjects(stats: DashboardStatsForCommandCenter | null) {
  return stats?.recent?.projects ?? stats?.recentActivity?.projects ?? []
}

function buildResolveNow(input: CommandCenterInput): CommandCenterItem[] {
  const items: CommandCenterItem[] = []
  const projects = recentProjects(input.dashboardStats)

  if (input.adminSummary && input.adminSummary.failingProviderCount > 0) {
    const count = input.adminSummary.failingProviderCount
    items.push({
      id: 'failing-providers',
      lane: 'resolve_now',
      category: 'Critico - Incidente',
      title: `${count} ${plural(count, 'provedor exige', 'provedores exigem')} revisao`,
      affectedEntityLabel: 'Admin / Health',
      impactLabel: 'Operacao interna em risco',
      urgencyLabel: 'Agora',
      ownerLabel: 'Admin',
      evidence: 'Provedores globais, IA, canais ou email reportaram falha.',
      actionLabel: 'Ver saude',
      href: '/admin/health',
      tone: 'critical',
    })
  }

  if (input.adminSummary && input.adminSummary.activeContractCount === 0) {
    items.push({
      id: 'no-active-contracts',
      lane: 'resolve_now',
      category: 'Critico - Receita',
      title: 'Nenhum contrato ativo',
      affectedEntityLabel: 'Contratos',
      impactLabel: 'Portal e modulos sem liberacao comercial',
      urgencyLabel: 'Hoje',
      ownerLabel: 'Financeiro / CS',
      evidence: 'A base comercial precisa de contratos ativos para liberar modulos.',
      actionLabel: 'Abrir contratos',
      href: '/contracts',
      tone: 'critical',
    })
  }

  if (input.adminSummary && input.adminSummary.nearLimitCount > 0) {
    const count = input.adminSummary.nearLimitCount
    items.push({
      id: 'near-limits',
      lane: 'resolve_now',
      category: 'Alto - Limites',
      title: `${count} ${plural(count, 'limite perto', 'limites perto')} do bloqueio`,
      affectedEntityLabel: 'Limites de modulos',
      impactLabel: `${count} ${plural(count, 'recurso pode bloquear', 'recursos podem bloquear')} execucao`,
      urgencyLabel: 'Hoje',
      ownerLabel: 'Admin / Operacao',
      evidence: 'Uso de modulos aproximando cotas contratadas.',
      actionLabel: 'Ver limites',
      href: '/admin/limits',
      tone: 'warning',
    })
  }

  const attentionProject = projects.find(project => {
    const status = project.status.toLowerCase()
    return status.includes('risco') || status.includes('atras') || status.includes('parad') || project.progress < 40
  })

  if (attentionProject) {
    items.push({
      id: `project-${attentionProject.id}`,
      lane: 'resolve_now',
      category: 'Alto - Entrega',
      title: `${attentionProject.name} precisa de atencao`,
      affectedEntityLabel: attentionProject.client || 'Cliente nao informado',
      impactLabel: `${attentionProject.progress}% de progresso`,
      urgencyLabel: 'Esta semana',
      ownerLabel: 'Operacao / CS',
      evidence: `Projeto recente marcado como ${attentionProject.status}.`,
      actionLabel: 'Abrir projetos',
      href: '/projects',
      tone: 'warning',
    })
  }

  return items.slice(0, 5)
}

function buildOpportunities(input: CommandCenterInput): CommandCenterItem[] {
  const overview = defaultOverview(input.dashboardStats)
  const financial = defaultFinancial(input.dashboardStats)
  const marketing = defaultMarketing(input.dashboardStats)
  const items: CommandCenterItem[] = []

  if (marketing.avgROAS >= 3 && financial.totalBudget > 0) {
    const potential = financial.totalBudget * 0.15
    items.push({
      id: 'roas-expansion',
      lane: 'opportunity',
      category: 'Expansao',
      title: `Carteira com ROAS ${marketing.avgROAS.toFixed(1)}x`,
      affectedEntityLabel: 'Marketing / Growth',
      impactLabel: `+${formatBRL(potential)} potencial`,
      confidenceLabel: marketing.avgROAS >= 4 ? 'Confianca alta' : 'Confianca media',
      urgencyLabel: 'Esta semana',
      ownerLabel: 'Growth / CS',
      evidence: `${marketing.ctr.toFixed(2)}% CTR e verba ativa na carteira.`,
      actionLabel: 'Revisar escala',
      href: '/reports',
      tone: 'opportunity',
    })
  }

  if (overview.activeProjects >= 3) {
    const hours = Math.max(6, Math.round(overview.activeProjects * 1.4))
    items.push({
      id: 'automation-efficiency',
      lane: 'opportunity',
      category: 'Eficiencia',
      title: `${overview.activeProjects} projetos ativos com potencial de automacao`,
      affectedEntityLabel: 'Operacao',
      impactLabel: `${hours}h/semana poupadas`,
      confidenceLabel: 'Confianca media',
      urgencyLabel: 'Este mes',
      ownerLabel: 'Operacao / IA',
      evidence: 'Volume de projetos ativos sugere tarefas recorrentes para padronizar.',
      actionLabel: 'Revisar automacoes',
      href: '/portal/automacoes',
      tone: 'efficiency',
    })
  }

  if (financial.budgetUtilization >= 60 && financial.totalCampaignSpent > 0) {
    const avoidable = financial.totalCampaignSpent * 0.04
    items.push({
      id: 'cost-optimization',
      lane: 'opportunity',
      category: 'Reducao de custo',
      title: 'Verba consumida pede revisao de eficiencia',
      affectedEntityLabel: 'Financeiro / Growth',
      impactLabel: `${formatBRL(avoidable)} economizaveis`,
      confidenceLabel: 'Confianca media',
      urgencyLabel: 'Esta semana',
      ownerLabel: 'Financeiro / Growth',
      evidence: `${financial.budgetUtilization.toFixed(1)}% da verba ja consumida.`,
      actionLabel: 'Abrir financeiro',
      href: '/finance',
      tone: 'opportunity',
    })
  }

  return items.slice(0, 5)
}

function buildPortfolioRows(input: CommandCenterInput): PortfolioMapRow[] {
  const marketing = defaultMarketing(input.dashboardStats)
  const projects = recentProjects(input.dashboardStats)
  const rows = projects.slice(0, 3).map((project, index) => {
    const status = project.status.toLowerCase()
    const risky = status.includes('risco') || status.includes('atras') || status.includes('parad') || project.progress < 40
    return {
      id: project.id,
      client: project.client || 'Cliente nao informado',
      health: risky ? 'Atencao' : 'Saudavel',
      contract: index === 0 && input.adminSummary?.activeContractCount === 0 ? 'Sem contrato' : 'Ativo',
      project: risky ? 'Em risco' : 'Em dia',
      performance: marketing.avgROAS > 0 ? `ROAS ${marketing.avgROAS.toFixed(1)}x` : 'Sem dados',
      risk: risky ? `${project.name} requer revisao` : 'Sem risco critico',
      opportunity: marketing.avgROAS >= 3 ? 'Escalar performance' : 'Nenhuma',
      owner: risky ? 'Operacao' : 'Growth',
      nextAction: risky ? 'Abrir projeto' : 'Revisar escala',
    }
  })

  if (rows.length > 0) return rows

  return [
    {
      id: 'portfolio-empty',
      client: input.adminSummary && input.adminSummary.clientCount > 0 ? `${input.adminSummary.clientCount} clientes` : 'Sem clientes',
      health: input.adminSummary && input.adminSummary.failingProviderCount > 0 ? 'Atencao' : 'Saudavel',
      contract: input.adminSummary && input.adminSummary.activeContractCount > 0 ? 'Ativo' : 'Sem contrato',
      project: 'Sem projetos recentes',
      performance: marketing.avgROAS > 0 ? `ROAS ${marketing.avgROAS.toFixed(1)}x` : 'Sem dados',
      risk: input.adminSummary && input.adminSummary.failingProviderCount > 0 ? 'Provedor em falha' : 'Sem risco critico',
      opportunity: marketing.avgROAS >= 3 ? 'Escalar performance' : 'Aguardando dados',
      owner: 'Gestor',
      nextAction: 'Revisar carteira',
    },
  ]
}

function buildShortcuts(resolveNow: CommandCenterItem[], opportunities: CommandCenterItem[]): ContextualShortcut[] {
  return [
    ...resolveNow.slice(0, 3).map(item => ({
      id: `shortcut-${item.id}`,
      label: item.title,
      detail: item.actionLabel,
      href: item.href,
      tone: item.tone === 'critical' ? 'risk' as const : 'warning' as const,
    })),
    ...opportunities.slice(0, 2).map(item => ({
      id: `shortcut-${item.id}`,
      label: item.impactLabel,
      detail: item.title,
      href: item.href,
      tone: 'opportunity' as const,
    })),
  ].slice(0, 5)
}

export function buildCommandCenterModel(input: CommandCenterInput): CommandCenterModel {
  const overview = defaultOverview(input.dashboardStats)
  const marketing = defaultMarketing(input.dashboardStats)
  const resolveNow = buildResolveNow(input)
  const opportunities = buildOpportunities(input)
  const criticalCount = resolveNow.filter(item => item.tone === 'critical').length
  const dataStatus = input.hasPartialError
    ? input.dashboardStats || input.adminSummary ? 'Parcial' : 'Com falha'
    : 'Completo'
  const unavailableSources = input.hasPartialError
    ? [
      ...(input.dashboardStats ? [] : ['Indicadores de workspace']),
      ...(input.adminSummary ? [] : ['Resumo administrativo']),
    ]
    : []

  return {
    userName: input.userName,
    dataStatus,
    unavailableSources,
    generatedAtLabel: 'Atualizado agora',
    windowLabel: input.windowLabel ?? '7 dias',
    pulse: [
      { label: 'Riscos abertos', value: String(resolveNow.length), detail: `${criticalCount} criticos`, tone: criticalCount > 0 ? 'risk' : 'neutral' },
      { label: 'Oportunidades estimadas', value: String(opportunities.length), detail: opportunities[0]?.impactLabel ?? 'Sem impacto estimado', tone: 'opportunity' },
      { label: 'Clientes em atencao', value: String(input.adminSummary?.clientCount ?? overview.totalClients), detail: 'com sinal ativo', tone: 'neutral' },
      { label: 'Projetos ativos', value: String(overview.activeProjects), detail: `${overview.totalProjects} projetos no total`, tone: 'neutral' },
      { label: 'Performance media', value: marketing.avgROAS > 0 ? `${marketing.avgROAS.toFixed(1)}x` : 'Sem dados', detail: `${marketing.ctr.toFixed(2)}% CTR`, tone: marketing.avgROAS >= 3 ? 'opportunity' : 'warning' },
    ],
    resolveNow,
    opportunities,
    portfolioRows: buildPortfolioRows(input),
    shortcuts: buildShortcuts(resolveNow, opportunities),
  }
}
