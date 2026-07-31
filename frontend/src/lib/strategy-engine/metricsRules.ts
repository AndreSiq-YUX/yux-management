import type { CashPriorityMetric } from '@/types/strategyEngine'

const clampRate = (value: number) => Math.max(0, Math.min(1, value))

export function calculateCac(spend: number, customers: number) {
  if (!Number.isFinite(customers) || customers <= 0) return null
  return Math.max(0, spend) / customers
}

export function calculateMroi(revenue: number, spend: number, operationalCost: number) {
  const investment = Math.max(0, spend) + Math.max(0, operationalCost)
  if (investment <= 0) return null
  return (Math.max(0, revenue) - investment) / investment
}

export function calculateStageConversion(fromCount: number, toCount: number) {
  if (!Number.isFinite(fromCount) || fromCount <= 0) return null
  return clampRate(Math.max(0, toCount) / fromCount)
}

export function estimateRecoverableValue(count: number, averageTicket: number, expectedRecoveryRate: number) {
  return Math.max(0, count) * Math.max(0, averageTicket) * clampRate(expectedRecoveryRate)
}

export function classifyCashPriority(metric: CashPriorityMetric) {
  const stuckValue = metric.stuckOpportunityValue || 0
  const recoverableValue = metric.recoverableValue || 0
  const mroi = metric.mroi
  const cac = metric.cac

  if (stuckValue >= 100000 || recoverableValue >= 80000 || (mroi !== null && mroi !== undefined && mroi < -0.25)) {
    return 'critical'
  }

  if (stuckValue >= 30000 || recoverableValue >= 20000 || (cac !== null && cac !== undefined && cac > 5000)) {
    return 'high_priority'
  }

  if (stuckValue > 0 || recoverableValue > 0) return 'monitor'
  return 'low'
}
