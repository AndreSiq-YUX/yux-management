import type { OperationalReport, PortalOperationalReport } from '@/types/reports'

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
