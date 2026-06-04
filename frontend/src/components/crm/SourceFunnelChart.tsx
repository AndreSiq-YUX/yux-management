import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import type { LeadSourceRollup, PortalLeadSourceRollup } from '@/types/crmAttribution'

interface SourceFunnelChartProps {
  sources: Array<LeadSourceRollup | PortalLeadSourceRollup>
}

export function SourceFunnelChart({ sources }: SourceFunnelChartProps) {
  const data = sources.slice(0, 6).map(source => ({
    name: source.sourceName,
    Leads: source.leads,
    Oportunidades: source.opportunities,
    Vendas: source.sales,
  }))

  if (data.length === 0) {
    return <p className="rounded-md border bg-white px-4 py-6 text-sm text-slate-500">Sem fontes consolidadas para o periodo.</p>
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-white p-3">
      <BarChart width={620} height={240} data={data} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="Leads" fill="#334155" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Oportunidades" fill="#0f766e" radius={[3, 3, 0, 0]} />
        <Bar dataKey="Vendas" fill="#ca8a04" radius={[3, 3, 0, 0]} />
      </BarChart>
    </div>
  )
}
