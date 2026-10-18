import { afterEach, describe, expect, it, vi } from 'vitest'
import { byText, click, render } from '@/components/portal-ui/__tests__/render'
import { PortalReportsWorkspace } from './PortalReportsWorkspace'
import type { OperationalReport } from '@/types/reports'

// Recharts (ResponsiveContainer) precisa de ResizeObserver, que o jsdom não tem.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub)

const report: OperationalReport = {
  organizationId: 'org-1',
  generatedAt: '2026-06-03T12:00:00.000Z',
  leadsBySource: [{ source: 'instagram', leads: 40 }, { source: 'google_ads', leads: 12 }],
  stageConversions: [
    { stage: 'Novo', entered: 100, advanced: 28, conversionRate: 28 },
    { stage: 'Contato', entered: 28, advanced: 10, conversionRate: 35.7 },
  ],
  responseTimeHours: 2.5,
  stalledOpportunities: 3,
  campaignMetrics: [{
    campaignId: 'campaign-1',
    name: 'Botox',
    spend: 1200,
    impressions: 10000,
    clicks: 500,
    leads: 40,
    cpl: 30,
    opportunities: 12,
    proposals: 6,
    clients: 2,
    revenue: 7200,
    mroi: 5,
    syncStatus: 'connected',
  }],
  landingPageMetrics: [{ landingPageId: 'lp-1', name: 'Landing Botox', visits: 1000, leads: 83, conversionRate: 8.3 }],
  proposalMetrics: { sent: 10, approved: 4, approvalRate: 40 },
  ownerActivity: [{ owner: 'Ana YUX', activities: 22 }],
  projectDelivery: [{ label: 'Projetos ativos', value: 5 }],
}

const emptyReport: OperationalReport = {
  ...report,
  leadsBySource: [],
  stageConversions: [],
  responseTimeHours: 0,
  campaignMetrics: [],
  landingPageMetrics: [],
  proposalMetrics: { sent: 0, approved: 0, approvalRate: 0 },
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('PortalReportsWorkspace', () => {
  it('renders KPIs, charts and tables in client-friendly language without internal data', async () => {
    const { container, unmount } = await render(<PortalReportsWorkspace report={report} />)
    const text = container.textContent ?? ''

    expect(container.querySelector('h1')?.textContent).toBe('Relatórios')
    expect(text).toContain('Resultado de mídia')
    expect(text).toContain('Dados atualizados em')
    expect(text).toContain('Custo por lead (CPL)')
    expect(text).toContain('Retorno sobre marketing (MROI)')
    expect(text).toContain('Instagram')
    expect(text).toContain('Anúncios Google')
    expect(text).toContain('28% avançaram')
    expect(text).toContain('Botox')
    expect(text).toContain('Landing Botox')
    expect(text).toContain('8,3%')
    expect(container.querySelector('[data-testid="campaign-chart"]')).not.toBeNull()
    expect(container.querySelector('[data-testid="responsive-table-desktop"] table')).not.toBeNull()
    expect(container.querySelector('[data-testid="responsive-table-cards"]')).not.toBeNull()
    expect(container.querySelectorAll('[data-testid="bar-fill"]').length).toBeGreaterThanOrEqual(4)

    expect(text).not.toContain('Ana YUX')
    expect(text).not.toContain('Cockpit')
    expect(text).not.toContain('Sync:')
    expect(text).not.toContain('marketing_studio')
    expect(text).not.toContain('Presets')
    expect(text).not.toContain(' | ')
    await unmount()
  })

  it('shows the period selector marked as pending (B6) and explains it on click', async () => {
    const { container, unmount } = await render(<PortalReportsWorkspace report={report} />)

    const group = container.querySelector('[role="group"][aria-label="Período"]')
    expect(group).not.toBeNull()
    expect(container.querySelector('[aria-label^="Pendente: Período em Relatórios"]')).not.toBeNull()
    expect(group!.querySelector('[aria-pressed="true"]')).toBeNull()

    await click(byText(container, 'button', '7 dias'))
    expect(container.querySelector('[role="status"]')?.textContent).toContain('em implantação')
    await unmount()
  })

  it('exports through the browser print dialog', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    const { container, unmount } = await render(<PortalReportsWorkspace report={report} />)

    await click(byText(container, 'button', 'Exportar PDF'))
    expect(print).toHaveBeenCalledTimes(1)
    await unmount()
  })

  it('shows honest empty states per section when there is no data', async () => {
    const { container, unmount } = await render(<PortalReportsWorkspace report={emptyReport} />)
    const text = container.textContent ?? ''

    expect(text).toContain('Nenhuma campanha com resultados ainda')
    expect(text).toContain('Sem leads no período')
    expect(text).toContain('Funil ainda sem dados')
    expect(text).toContain('Nenhuma página de captura com dados')
    expect(text).toContain('Nenhuma proposta enviada')
    expect(container.querySelector('[data-testid="campaign-chart"]')).toBeNull()
    await unmount()
  })
})
