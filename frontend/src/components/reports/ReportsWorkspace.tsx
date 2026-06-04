import type { OperationalReport } from '@/types/reports'
import { LeadSourcesDashboard } from '@/components/crm/LeadSourcesDashboard'

const money = (value: number) => `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`

export function ReportsWorkspace({ report }: { report: OperationalReport }) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Relatorios operacionais</h1>
        <p className="text-sm text-gray-600">Funil, campanhas, landing pages, propostas, conversas e atividades.</p>
      </header>
      <div className="grid gap-3 md:grid-cols-4">
        <Metric title="Tempo resposta" value={`${report.responseTimeHours}h`} />
        <Metric title="Oportunidades paradas" value={String(report.stalledOpportunities)} />
        <Metric title="Propostas aprovadas" value={`${report.proposalMetrics.approvalRate}%`} />
        <Metric title={report.projectDelivery[0]?.label || 'Projetos'} value={String(report.projectDelivery[0]?.value || 0)} />
      </div>
      {report.crmAttribution && <LeadSourcesDashboard dashboard={report.crmAttribution} />}
      <ReportSections report={report} showOwnerActivity />
    </div>
  )
}

export function ReportSections({ report, showOwnerActivity = false }: { report: OperationalReport; showOwnerActivity?: boolean }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Section title="Leads por origem" rows={report.leadsBySource.map(item => [item.source, `${item.leads} leads`])} />
      <Section title="Conversao de etapas" rows={report.stageConversions.map(item => [item.stage, `${item.conversionRate}% (${item.advanced}/${item.entered})`])} />
      <Section title="Campanhas" rows={report.campaignMetrics.map(item => [item.name, `${money(item.spend)} | ${item.leads} leads | CPL ${money(item.cpl)} | MROI ${item.mroi}x`])} />
      <Section title="Landing pages" rows={report.landingPageMetrics.map(item => [item.name, `${item.conversionRate}% | ${item.leads}/${item.visits}`])} />
      <Section title="Propostas" rows={[['Enviadas', String(report.proposalMetrics.sent)], ['Aprovadas', String(report.proposalMetrics.approved)]]} />
      {showOwnerActivity && <Section title="Atividade por responsavel" rows={report.ownerActivity.map(item => [item.owner, `${item.activities} atividades`])} />}
    </div>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="rounded-md border bg-white p-3"><p className="text-xs text-gray-500">{title}</p><p className="text-xl font-semibold text-gray-900">{value}</p></div>
}

function Section({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <section className="rounded-md border bg-white">
      <header className="border-b px-3 py-2 text-sm font-semibold text-gray-900">{title}</header>
      <div className="divide-y">
        {rows.length ? rows.map(([label, value]) => (
          <div key={`${title}-${label}`} className="flex justify-between gap-3 px-3 py-2 text-sm">
            <span className="text-gray-700">{label}</span>
            <span className="font-medium text-gray-900">{value}</span>
          </div>
        )) : <p className="px-3 py-2 text-sm text-gray-500">Sem dados.</p>}
      </div>
    </section>
  )
}
