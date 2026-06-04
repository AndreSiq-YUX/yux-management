import { Download, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MroiAlertPanel } from '@/components/crm/MroiAlertPanel'
import { SourceFunnelChart } from '@/components/crm/SourceFunnelChart'
import type { CrmAttributionDashboard, PortalCrmAttributionDashboard } from '@/types/crmAttribution'

interface LeadSourcesDashboardProps {
  dashboard: CrmAttributionDashboard | PortalCrmAttributionDashboard
  portalSafe?: boolean
  onExport?: () => void
}

const money = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function LeadSourcesDashboard({ dashboard, portalSafe = false, onExport }: LeadSourcesDashboardProps) {
  const showInternalCosts = !portalSafe

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-950">Fontes de leads</h2>
          <p className="text-sm text-slate-500">
            {dashboard.periodStart} a {dashboard.periodEnd} com CPL, conversao, receita e MROI por origem.
          </p>
        </div>
        {onExport && (
          <Button type="button" size="sm" variant="outline" onClick={onExport}>
            <Download className="mr-2 h-4 w-4" />CSV
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Leads" value={String(dashboard.totals.leads)} />
        <Metric label="CPL medio" value={money(dashboard.totals.cpl)} />
        <Metric label="Receita atribuida" value={money(dashboard.totals.attributedRevenue)} />
        <Metric label="MROI" value={`${dashboard.totals.mroi}x`} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SourceFunnelChart sources={dashboard.sources} />
        <MroiAlertPanel alerts={dashboard.alerts} />
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-left">Fonte</th>
              <th className="px-3 py-2 text-right">Leads</th>
              <th className="px-3 py-2 text-right">Oportunidades</th>
              <th className="px-3 py-2 text-right">Vendas</th>
              {showInternalCosts && <th className="px-3 py-2 text-right">Custo total</th>}
              <th className="px-3 py-2 text-right">{portalSafe ? 'Investimento' : 'Custo portal'}</th>
              <th className="px-3 py-2 text-right">Receita</th>
              <th className="px-3 py-2 text-right">CPL</th>
              <th className="px-3 py-2 text-right">Conversao</th>
              <th className="px-3 py-2 text-right">MROI</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {dashboard.sources.map(source => (
              <tr key={`${source.sourceId}-${source.periodStart}-${source.periodEnd}`}>
                <td className="px-3 py-3">
                  <span className="font-medium text-slate-950">{source.sourceName}</span>
                  <span className="block text-xs text-slate-500">{source.sourceKind}</span>
                </td>
                <td className="px-3 py-3 text-right">{source.leads}</td>
                <td className="px-3 py-3 text-right">{source.opportunities}</td>
                <td className="px-3 py-3 text-right">{source.sales}</td>
                {showInternalCosts && <td className="px-3 py-3 text-right">{money(('mediaCost' in source ? source.mediaCost || 0 : 0) + ('operationalCost' in source ? source.operationalCost || 0 : 0))}</td>}
                <td className="px-3 py-3 text-right">{money(source.clientVisibleCost)}</td>
                <td className="px-3 py-3 text-right">{money(source.attributedRevenue)}</td>
                <td className="px-3 py-3 text-right">{money(source.cpl)}</td>
                <td className="px-3 py-3 text-right">{source.conversionRate}%</td>
                <td className="px-3 py-3 text-right">
                  <span className="inline-flex items-center justify-end gap-1 font-medium text-slate-950">
                    <TrendingUp className="h-3.5 w-3.5 text-slate-500" />{source.mroi}x
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {dashboard.sources.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Nenhuma fonte consolidada para exibir.</p>}
      </div>
    </section>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-white p-4">
      <p className="text-xs font-medium uppercase text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-950">{value}</p>
    </div>
  )
}
