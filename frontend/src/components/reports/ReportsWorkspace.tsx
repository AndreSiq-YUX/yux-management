import type { OperationalReport } from '@/types/reports'
import { LeadSourcesDashboard } from '@/components/crm/LeadSourcesDashboard'
import { buildExecutiveCampaignMetrics, buildReportAiInsight, buildReportPresets, summarizeExecutiveCampaignMetrics } from '@/lib/reports/reportRules'

const money = (value: number) => `R$ ${value.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`

export function ReportsWorkspace({ report }: { report: OperationalReport }) {
  const executiveMetrics = report.executiveCampaignMetrics || buildExecutiveCampaignMetrics(report.campaignMetrics)
  const executiveSummary = report.executiveCampaignSummary || summarizeExecutiveCampaignMetrics(executiveMetrics)
  const presets = report.reportPresets || buildReportPresets()
  const aiInsight = report.aiInsight || buildReportAiInsight(report)

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
      <ExecutiveReportPanel summary={executiveSummary} />
      <ReportPresetPanel presets={presets} />
      <ReportAiInsightPanel insight={aiInsight} />
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

export function ExecutiveReportPanel({ summary }: { summary: NonNullable<OperationalReport['executiveCampaignSummary']> }) {
  return (
    <section className="rounded-md border bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-950">Cockpit executivo Ads/MROI</h2>
          <p className="mt-1 text-sm text-gray-600">Resumo de investimento, leads, clientes, receita e sincronizacao de midia.</p>
        </div>
        <span className="rounded-md border bg-slate-50 px-2 py-1 text-sm text-slate-700">Sync: {summary.syncStatus}</span>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <Metric title="Investimento" value={money(summary.spend)} />
        <Metric title="Cliques" value={String(summary.clicks)} />
        <Metric title="Leads" value={String(summary.leads)} />
        <Metric title="CPL" value={money(summary.cpl)} />
        <Metric title="Clientes" value={String(summary.clients)} />
        <Metric title="MROI" value={`${summary.mroi}x`} />
      </div>
      <p className="mt-3 rounded-md border bg-slate-50 p-3 text-sm text-slate-700">{summary.aiRecommendation}</p>
    </section>
  )
}

export function ReportPresetPanel({ presets }: { presets: NonNullable<OperationalReport['reportPresets']> }) {
  return (
    <section className="rounded-md border bg-white p-4">
      <h2 className="font-semibold text-gray-950">Presets de relatorio</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {presets.map(preset => (
          <article key={preset.key} className="rounded-md border bg-slate-50 p-3">
            <p className="font-medium text-slate-950">{preset.label}</p>
            <p className="mt-1 text-sm text-slate-600">{preset.description}</p>
            <p className="mt-2 text-xs uppercase text-slate-500">{preset.moduleKey}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

export function ReportAiInsightPanel({ insight }: { insight: NonNullable<OperationalReport['aiInsight']> }) {
  return (
    <section className="rounded-md border bg-white p-4">
      <h2 className="font-semibold text-gray-950">Resumo de IA</h2>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <InsightBlock title="Melhor oportunidade" value={insight.topOpportunity} />
        <InsightBlock title="Mudanca no periodo" value={insight.periodChange} />
        <InsightBlock title="Lacunas de dados" value={insight.dataGaps.length ? insight.dataGaps.join(' ') : 'Sem lacunas criticas detectadas.'} />
      </div>
      {insight.attributionCaveat && <p className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{insight.attributionCaveat}</p>}
    </section>
  )
}

function InsightBlock({ title, value }: { title: string; value: string }) {
  return (
    <div className="rounded-md border bg-slate-50 p-3">
      <p className="text-xs font-medium uppercase text-slate-500">{title}</p>
      <p className="mt-2 text-sm text-slate-700">{value}</p>
    </div>
  )
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
