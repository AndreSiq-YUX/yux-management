import type {
  CampaignReportMetric,
  ExecutiveCampaignMetric,
  ExecutiveCampaignSummary,
  OperationalReport,
  PortalOperationalReport,
  ReportAiInsight,
  ReportPreset,
} from '@/types/reports'

export function calculateCpl(input: { spend: number; leads: number }) {
  if (input.leads <= 0) return 0
  return Math.round((input.spend / input.leads) * 100) / 100
}

export function calculateMroi(input: { spend: number; attributedRevenue: number }) {
  if (input.spend <= 0) return 0
  return Math.round(((input.attributedRevenue - input.spend) / input.spend) * 10) / 10
}

export function calculateStageConversion(input: { entered: number; advanced: number }) {
  if (input.entered <= 0) return 0
  return Math.round((input.advanced / input.entered) * 1000) / 10
}

export function sanitizeReportForPortal(report: OperationalReport): PortalOperationalReport {
  const { ownerActivity: _ownerActivity, ...safeReport } = report
  return safeReport
}

export function buildExecutiveCampaignMetrics(campaigns: CampaignReportMetric[]): ExecutiveCampaignMetric[] {
  return campaigns.map(campaign => {
    const metric: ExecutiveCampaignMetric = {
      campaignId: campaign.campaignId,
      name: campaign.name,
      spend: campaign.spend,
      impressions: campaign.impressions || 0,
      clicks: campaign.clicks || 0,
      leads: campaign.leads,
      cpl: campaign.cpl,
      opportunities: campaign.opportunities || 0,
      proposals: campaign.proposals || 0,
      clients: campaign.clients || 0,
      revenue: campaign.revenue || 0,
      mroi: campaign.mroi,
      syncStatus: campaign.syncStatus || 'not_configured',
      aiRecommendation: campaign.aiRecommendation || recommendCampaignAction(campaign),
    }
    return metric
  })
}

export function summarizeExecutiveCampaignMetrics(metrics: ExecutiveCampaignMetric[]): ExecutiveCampaignSummary {
  const spend = sum(metrics, 'spend')
  const leads = sum(metrics, 'leads')
  const revenue = sum(metrics, 'revenue')
  const summary: ExecutiveCampaignSummary = {
    spend,
    impressions: sum(metrics, 'impressions'),
    clicks: sum(metrics, 'clicks'),
    leads,
    cpl: calculateCpl({ spend, leads }),
    opportunities: sum(metrics, 'opportunities'),
    proposals: sum(metrics, 'proposals'),
    clients: sum(metrics, 'clients'),
    revenue,
    mroi: calculateMroi({ spend, attributedRevenue: revenue }),
    syncStatus: summarizeSyncStatus(metrics),
    aiRecommendation: pickExecutiveRecommendation(metrics),
  }
  return summary
}

export function buildReportPresets(): ReportPreset[] {
  return [
    {
      key: 'campaign_performance',
      label: 'Desempenho das campanhas',
      description: 'Investimento, cliques, leads, custo por lead, clientes, receita e retorno sobre marketing.',
      moduleKey: 'campaigns',
      portalVisible: true,
    },
    {
      key: 'lead_source_roi',
      label: 'Retorno por origem de lead',
      description: 'Compara origens, conversão, receita atribuída e custo de aquisição.',
      moduleKey: 'crm',
      portalVisible: true,
    },
    {
      key: 'landing_page_conversion',
      label: 'Conversão das páginas de captura',
      description: 'Visitas, leads e gargalos por página de captura.',
      moduleKey: 'landing_pages',
      portalVisible: true,
    },
    {
      key: 'whatsapp_follow_up',
      label: 'Follow-up WhatsApp',
      description: 'Prazo de resposta, respostas, transferências para atendente e tarefas comerciais geradas pelas conversas.',
      moduleKey: 'whatsapp_ai',
      portalVisible: true,
    },
    {
      key: 'automation_impact',
      label: 'Impacto das automações',
      description: 'Execuções, falhas, tarefas criadas e impacto no funil comercial.',
      moduleKey: 'automations',
      portalVisible: true,
    },
    {
      key: 'sector_onboarding_progress',
      label: 'Onboarding por setor',
      description: 'Progresso da implantação do modelo do seu setor e próximas pendências.',
      moduleKey: 'projects',
      portalVisible: true,
    },
    {
      key: 'brand_knowledge_readiness',
      label: 'Marca e conhecimento',
      description: 'Preparo da marca e da base de conhecimento para IA, campanhas e conteúdo.',
      moduleKey: 'marketing_studio',
      portalVisible: true,
    },
  ]
}

export function buildReportAiInsight(report: Pick<OperationalReport, 'campaignMetrics' | 'landingPageMetrics' | 'proposalMetrics' | 'crmAttribution'>): ReportAiInsight {
  const executive = summarizeExecutiveCampaignMetrics(buildExecutiveCampaignMetrics(report.campaignMetrics))
  const dataGaps: string[] = []

  if (!report.crmAttribution) dataGaps.push('Atribuição CRM/MROI indisponível para confirmar origem de receita.')
  if (executive.clients === 0) dataGaps.push('Clientes fechados não vinculados às campanhas no período.')
  if (report.proposalMetrics.sent === 0) dataGaps.push('Propostas comerciais sem volume suficiente para leitura de conversão.')
  if (report.landingPageMetrics.length === 0) dataGaps.push('Páginas de captura sem métricas conectadas ao relatório.')

  return {
    topOpportunity: executive.cpl > 0 && executive.clients === 0
      ? 'Reduzir o intervalo entre lead e proposta: há investimento e leads, mas nenhum cliente atribuído.'
      : executive.mroi < 1 && executive.spend > 0
        ? 'Revisar criativos, público e página de captura das campanhas com baixo retorno.'
        : 'Manter o acompanhamento de CPL, propostas e clientes para proteger o MROI.',
    periodChange: report.campaignMetrics.length
      ? `${report.campaignMetrics.length} campanha(s) analisada(s) com CPL médio de ${executive.cpl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`
      : 'Sem campanhas com métricas suficientes neste período.',
    dataGaps,
    attributionCaveat: report.crmAttribution
      ? undefined
      : 'Sem atribuição conectada, o relatório mostra correlação operacional e não causalidade de receita.',
  }
}

function recommendCampaignAction(campaign: CampaignReportMetric) {
  if (campaign.syncStatus === 'needs_reauth') return 'Reconectar o provedor antes de otimizar ou publicar alterações.'
  if (campaign.leads === 0 && campaign.spend > 0) return 'Revisar público, criativo e página: houve gasto sem leads.'
  if (campaign.clients === 0 && campaign.proposals && campaign.proposals > 0) return 'Acompanhar propostas abertas e reforçar o acompanhamento comercial.'
  if (campaign.mroi < 1 && campaign.spend > 0) return 'Reavaliar orçamento e segmentação antes de aumentar o investimento.'
  return 'Acompanhar CPL, propostas e clientes antes de mudar o orçamento.'
}

function sum(metrics: ExecutiveCampaignMetric[], key: keyof Pick<ExecutiveCampaignMetric, 'spend' | 'impressions' | 'clicks' | 'leads' | 'opportunities' | 'proposals' | 'clients' | 'revenue'>) {
  return metrics.reduce((total, metric) => total + metric[key], 0)
}

function summarizeSyncStatus(metrics: ExecutiveCampaignMetric[]): ExecutiveCampaignSummary['syncStatus'] {
  if (metrics.some(metric => metric.syncStatus === 'needs_reauth')) return 'needs_reauth'
  if (metrics.some(metric => metric.syncStatus === 'failed')) return 'failed'
  if (metrics.some(metric => metric.syncStatus === 'stale')) return 'stale'
  if (metrics.some(metric => metric.syncStatus === 'connected')) return 'connected'
  return 'not_configured'
}

function pickExecutiveRecommendation(metrics: ExecutiveCampaignMetric[]) {
  const critical = metrics.find(metric => metric.syncStatus === 'needs_reauth' || metric.syncStatus === 'failed')
  if (critical) return critical.aiRecommendation
  const expensiveWithoutClients = metrics.find(metric => metric.spend > 0 && metric.clients === 0)
  if (expensiveWithoutClients) return expensiveWithoutClients.aiRecommendation
  return metrics[0]?.aiRecommendation || 'Conectar campanhas, propostas e clientes para consolidar recomendações.'
}
