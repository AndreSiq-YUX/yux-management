import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { ReportsWorkspace } from './ReportsWorkspace'
import { PortalReportsWorkspace } from './PortalReportsWorkspace'
import type { OperationalReport } from '@/types/reports'

const report: OperationalReport = {
  organizationId: 'org-1',
  generatedAt: '2026-06-03T12:00:00.000Z',
  leadsBySource: [{ source: 'instagram', leads: 40 }],
  stageConversions: [{ stage: 'Novo', entered: 100, advanced: 28, conversionRate: 28 }],
  responseTimeHours: 2.5,
  stalledOpportunities: 3,
  campaignMetrics: [{ campaignId: 'campaign-1', name: 'Botox', spend: 1200, leads: 40, cpl: 30, mroi: 4 }],
  landingPageMetrics: [{ landingPageId: 'lp-1', name: 'Landing Botox', visits: 1000, leads: 83, conversionRate: 8.3 }],
  proposalMetrics: { sent: 10, approved: 4, approvalRate: 40 },
  ownerActivity: [{ owner: 'Ana YUX', activities: 22 }],
  projectDelivery: [{ label: 'Projetos ativos', value: 5 }],
}

describe('ReportsWorkspace', () => {
  it('renders operational report metrics for internal users', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => root.render(<ReportsWorkspace report={report} />))
    const html = container.innerHTML

    expect(html).toContain('Relatorios operacionais')
    expect(html).toContain('instagram')
    expect(html).toContain('28%')
    expect(html).toContain('2.5h')
    expect(html).toContain('Botox')
    expect(html).toContain('CPL R$ 30')
    expect(html).toContain('MROI 4x')
    expect(html).toContain('Landing Botox')
    expect(html).toContain('Ana YUX')

    act(() => root.unmount())
  })

  it('renders client-safe portal report without owner activity', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    act(() => root.render(<PortalReportsWorkspace report={report} />))
    const html = container.innerHTML

    expect(html).toContain('Relatorios do contrato')
    expect(html).toContain('Botox')
    expect(html).not.toContain('Ana YUX')

    act(() => root.unmount())
  })
})
