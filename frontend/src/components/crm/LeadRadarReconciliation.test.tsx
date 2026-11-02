import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { afterEach, expect, it, vi } from 'vitest'
import { LeadRadarReconciliation } from './LeadRadarReconciliation'
import { radarService } from '@/services/radarService'
vi.mock('@/services/radarService', () => ({
  radarService: { previewLeadData: vi.fn(), applyLeadData: vi.fn() },
}))
let cleanup = () => {}
afterEach(() => cleanup())
it('shows the preview and applies gaps only after explicit action', async () => {
  vi.mocked(radarService.previewLeadData).mockResolvedValue({
    previewRevision: 'revision',
    proposals: [
      {
        field: 'city',
        currentValue: 'Manual',
        incomingValue: 'Pesquisada',
        decision: 'preserve',
      },
    ],
  })
  vi.mocked(radarService.applyLeadData).mockResolvedValue({
    requestId: 'id',
    appliedFields: [],
  })
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  cleanup = () => {
    act(() => root.unmount())
    host.remove()
  }
  const saved = vi.fn()
  await act(async () =>
    root.render(<LeadRadarReconciliation leadId="lead" onSaved={saved} />),
  )
  await act(async () => host.querySelector('button')!.click())
  expect(host.textContent).toContain('Preservar dado cadastrado')
  expect(radarService.applyLeadData).not.toHaveBeenCalled()
  await act(async () =>
    Array.from(host.querySelectorAll('button'))
      .find((b) => b.textContent === 'Preencher lacunas')!
      .click(),
  )
  expect(radarService.applyLeadData).toHaveBeenCalledWith(
    'lead',
    'revision',
    expect.any(String),
  )
  expect(saved).toHaveBeenCalledOnce()
})
