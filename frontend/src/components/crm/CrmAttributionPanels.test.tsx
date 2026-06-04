import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { LeadSourcesDashboard } from './LeadSourcesDashboard'
import { buildAttributionDashboard, sanitizePortalAttribution } from '@/lib/crm/attributionRules'
import type { LeadSourceRollup } from '@/types/crmAttribution'

vi.mock('recharts', () => ({
  Bar: () => <div />,
  BarChart: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
}))

const rollup: LeadSourceRollup = {
  organizationId: 'org-1',
  crmInstanceId: 'crm-1',
  sourceId: 'source-1',
  sourceKey: 'meta_botox',
  sourceName: 'Meta Botox',
  sourceKind: 'paid_campaign',
  periodStart: '2026-06-01',
  periodEnd: '2026-06-30',
  leads: 20,
  opportunities: 10,
  sales: 4,
  mediaCost: 1000,
  operationalCost: 500,
  clientVisibleCost: 1000,
  attributedRevenue: 6000,
  cpl: 50,
  opportunityRate: 50,
  conversionRate: 20,
  mroi: 3,
}

describe('CRM attribution panels', () => {
  it('renders internal source dashboard with total cost', () => {
    const dashboard = buildAttributionDashboard({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      rollups: [rollup],
    })
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => root.render(<LeadSourcesDashboard dashboard={dashboard} />))

    expect(container.innerHTML).toContain('Fontes de leads')
    expect(container.innerHTML).toContain('Meta Botox')
    expect(container.innerHTML).toContain('Custo total')
    expect(container.innerHTML).toContain('MROI')

    act(() => root.unmount())
  })

  it('renders portal-safe dashboard without operational cost label', () => {
    const dashboard = sanitizePortalAttribution(buildAttributionDashboard({
      organizationId: 'org-1',
      crmInstanceId: 'crm-1',
      periodStart: '2026-06-01',
      periodEnd: '2026-06-30',
      rollups: [rollup],
    }))
    const container = document.createElement('div')
    const root = createRoot(container)

    act(() => root.render(<LeadSourcesDashboard dashboard={dashboard} portalSafe />))

    expect(container.innerHTML).toContain('Investimento')
    expect(container.innerHTML).not.toContain('Custo total')
    expect(container.innerHTML).not.toContain('Custo operacional')

    act(() => root.unmount())
  })
})
