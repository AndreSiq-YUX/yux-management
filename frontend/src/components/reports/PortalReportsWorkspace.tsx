import { ReportSections } from './ReportsWorkspace'
import { LeadSourcesDashboard } from '@/components/crm/LeadSourcesDashboard'
import { sanitizeReportForPortal } from '@/lib/reports/reportRules'
import { sanitizePortalAttribution } from '@/lib/crm/attributionRules'
import type { OperationalReport, PortalOperationalReport } from '@/types/reports'

export function PortalReportsWorkspace({ report }: { report: OperationalReport | PortalOperationalReport }) {
  const safeReport = 'ownerActivity' in report ? sanitizeReportForPortal(report as OperationalReport) : report
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Relatorios do contrato</h1>
        <p className="text-sm text-gray-600">Indicadores comerciais consolidados sem dados internos protegidos.</p>
      </header>
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-white p-3"><p className="text-xs text-gray-500">Tempo resposta</p><p className="text-xl font-semibold">{safeReport.responseTimeHours}h</p></div>
        <div className="rounded-md border bg-white p-3"><p className="text-xs text-gray-500">CPL medio</p><p className="text-xl font-semibold">R$ {averageCpl(safeReport).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</p></div>
        <div className="rounded-md border bg-white p-3"><p className="text-xs text-gray-500">Propostas aprovadas</p><p className="text-xl font-semibold">{safeReport.proposalMetrics.approvalRate}%</p></div>
      </div>
      {safeReport.crmAttribution && <LeadSourcesDashboard dashboard={sanitizePortalAttribution(safeReport.crmAttribution)} portalSafe />}
      <ReportSections report={{ ...safeReport, ownerActivity: [] }} />
    </div>
  )
}

function averageCpl(report: PortalOperationalReport) {
  if (!report.campaignMetrics.length) return 0
  return report.campaignMetrics.reduce((sum, item) => sum + item.cpl, 0) / report.campaignMetrics.length
}
