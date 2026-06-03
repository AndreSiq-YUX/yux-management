import { BarChart3, CircleDollarSign, Target, TrendingUp } from 'lucide-react'
import { calculateCampaignSummary } from '@/lib/campaigns/campaignRules'
import type { Campaign } from '@/types/campaign'

interface CampaignMetricsPanelProps {
  campaigns: Campaign[]
}

export function CampaignMetricsPanel({ campaigns }: CampaignMetricsPanelProps) {
  const summary = calculateCampaignSummary(campaigns)

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <Metric icon={CircleDollarSign} label="Investimento" value={summary.spend.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
      <Metric icon={Target} label="Leads" value={summary.leads.toString()} />
      <Metric icon={BarChart3} label="CPL" value={summary.cpl.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
      <Metric icon={TrendingUp} label="MROI" value={`${summary.mroi}x`} />
    </div>
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
