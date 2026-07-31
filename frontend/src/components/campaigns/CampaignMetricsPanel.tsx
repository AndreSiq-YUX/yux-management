import { BarChart3, CircleDollarSign, MousePointerClick, Target, TrendingUp, UsersRound, WifiOff } from 'lucide-react'
import { calculateCampaignSummary } from '@/lib/campaigns/campaignRules'
import { buildExecutiveCampaignMetrics, summarizeExecutiveCampaignMetrics } from '@/lib/reports/reportRules'
import type { AdProviderConnection, Campaign } from '@/types/campaign'
import type { CampaignReportMetric } from '@/types/reports'

interface CampaignMetricsPanelProps {
  campaigns: Campaign[]
  providerConnections?: AdProviderConnection[]
  activeCampaignPlanId?: string
}

export function CampaignMetricsPanel({ campaigns, providerConnections = [], activeCampaignPlanId }: CampaignMetricsPanelProps) {
  const summary = calculateCampaignSummary(campaigns)
  const executiveMetrics = buildExecutiveCampaignMetrics(campaigns.map(campaign => mapCampaignToReportMetric(campaign, providerConnections)))
  const executiveSummary = summarizeExecutiveCampaignMetrics(executiveMetrics)
  const syncLabel = syncStatusLabel[executiveSummary.syncStatus]

  return (
    <section className="space-y-3 rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">Cockpit executivo Ads/MROI</h2>
          <p className="mt-1 text-sm text-slate-600">Investimento, funil comercial, receita atribuida e saude de sincronizacao.</p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <span className="rounded-md border bg-slate-50 px-2 py-1">Atribuicao: ultima interacao de anuncio</span>
          <span className={`rounded-md border px-2 py-1 ${syncTone[executiveSummary.syncStatus]}`}>{syncLabel}</span>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Metric icon={CircleDollarSign} label="Investimento" value={summary.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
        <Metric icon={MousePointerClick} label="Cliques" value={executiveSummary.clicks.toString()} />
        <Metric icon={Target} label="Leads" value={summary.leads.toString()} />
        <Metric icon={BarChart3} label="CPL" value={summary.cpl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
        <Metric icon={UsersRound} label="Clientes" value={executiveSummary.clients.toString()} />
        <Metric icon={TrendingUp} label="MROI" value={`${summary.mroi}x`} />
      </div>

      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
        <div className="rounded-md border bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-950">
            <TrendingUp className="h-4 w-4" />
            Recomendacao executiva
          </div>
          <p className="mt-2 text-sm text-slate-600">{executiveSummary.aiRecommendation}</p>
        </div>
        <div className="rounded-md border bg-slate-50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-950">
            <WifiOff className="h-4 w-4" />
            Acoes rapidas
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            <a className="rounded-md border bg-white px-2 py-1 text-slate-700 hover:text-yux-700" href="/reports">Abrir relatorio</a>
            <a className="rounded-md border bg-white px-2 py-1 text-slate-700 hover:text-yux-700" href={activeCampaignPlanId ? `/campaigns#${activeCampaignPlanId}` : '/campaigns'}>Plano de campanha</a>
          </div>
        </div>
      </div>
    </section>
  )
}

function Metric({ icon: Icon, label, value }: { icon: typeof CircleDollarSign; label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-4">
      <Icon className="h-4 w-4 text-slate-500" />
      <p className="mt-2 text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}

const syncStatusLabel: Record<ReturnType<typeof summarizeExecutiveCampaignMetrics>['syncStatus'], string> = {
  connected: 'Sync conectado',
  stale: 'Sync desatualizado',
  needs_reauth: 'Reconexao necessaria',
  failed: 'Sync com falha',
  not_configured: 'Sync nao configurado',
}

const syncTone: Record<ReturnType<typeof summarizeExecutiveCampaignMetrics>['syncStatus'], string> = {
  connected: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  stale: 'border-amber-200 bg-amber-50 text-amber-800',
  needs_reauth: 'border-red-200 bg-red-50 text-red-800',
  failed: 'border-red-200 bg-red-50 text-red-800',
  not_configured: 'border-slate-200 bg-slate-50 text-slate-700',
}

function mapCampaignToReportMetric(campaign: Campaign, providerConnections: AdProviderConnection[]): CampaignReportMetric {
  const connection = providerConnections.find(item => item.id === campaign.providerConnectionId)
  return {
    campaignId: campaign.id,
    name: campaign.name,
    spend: campaign.spend,
    impressions: campaign.impressions,
    clicks: campaign.clicks,
    leads: campaign.leads,
    cpl: campaign.cpl,
    opportunities: campaign.opportunities || 0,
    proposals: campaign.proposals || 0,
    clients: campaign.clients || 0,
    revenue: campaign.attributedRevenue,
    mroi: campaign.mroi,
    syncStatus: connection?.status || (campaign.providerConnectionId ? 'stale' : 'not_configured'),
    aiRecommendation: campaign.recommendations?.[0]?.title,
  }
}
