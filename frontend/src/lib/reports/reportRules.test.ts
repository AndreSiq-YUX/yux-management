import { describe, expect, it } from 'vitest'
import {
  calculateCpl,
  calculateMroi,
  calculateStageConversion,
  sanitizeReportForPortal,
} from './reportRules'
import type { OperationalReport } from '@/types/reports'

const report: OperationalReport = {
  organizationId: 'org-1',
  generatedAt: '2026-06-03T12:00:00.000Z',
  leadsBySource: [{ source: 'instagram', leads: 40 }],
  stageConversions: [{ stage: 'Novo', entered: 100, advanced: 28, conversionRate: 28 }],
  responseTimeHours: 2,
  stalledOpportunities: 3,
  campaignMetrics: [{ campaignId: 'campaign-1', name: 'Botox', spend: 1200, leads: 40, cpl: 30, mroi: 4 }],
  landingPageMetrics: [{ landingPageId: 'lp-1', name: 'Landing Botox', visits: 1000, leads: 83, conversionRate: 8.3 }],
  proposalMetrics: { sent: 10, approved: 4, approvalRate: 40 },
  ownerActivity: [{ owner: 'Ana YUX', activities: 22 }],
  projectDelivery: [{ label: 'Projetos ativos', value: 5 }],
}

describe('reportRules', () => {
  it('calculates CPL', () => {
    expect(calculateCpl({ spend: 1200, leads: 40 })).toBe(30)
  })

  it('calculates MROI', () => {
    expect(calculateMroi({ spend: 1000, attributedRevenue: 5000 })).toBe(4)
  })

  it('calculates stage conversion', () => {
    expect(calculateStageConversion({ entered: 100, advanced: 28 })).toBe(28)
  })

  it('removes owner activity from portal report', () => {
    expect(sanitizeReportForPortal(report)).not.toHaveProperty('ownerActivity')
  })
})
