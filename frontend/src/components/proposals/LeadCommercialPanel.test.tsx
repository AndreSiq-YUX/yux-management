import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { LeadCommercialPanel } from './LeadCommercialPanel'
import { apiRequest } from '@/lib/apiClient'
import type { CrmLead } from '@/types/crm'
vi.mock('@/lib/apiClient', () => ({ apiRequest: vi.fn() }))
vi.mock('@/components/crm/LeadProposalLauncher', () => ({
  LeadProposalLauncher: ({ onPackageChange, onCreate }: {onPackageChange:(value:string)=>void;onCreate:()=>void}) => (
    <>
      <button onClick={() => onPackageChange('package')}>
        Escolher pacote
      </button>
      <button onClick={onCreate}>Criar rascunho</button>
    </>
  ),
}))
vi.mock('@/components/proposals/ProposalEditor', () => ({
  ProposalEditor: () => null,
}))
it('creates a draft through the scoped endpoint and keeps failures actionable', async () => {
  const lead = {
    id: 'lead',
    name: 'Empresa',
    organizationId: 'org',
    crmInstanceId: 'crm',
    score: 0,
    source: 'Manual',
  } as CrmLead
  vi.mocked(apiRequest).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('Pacote indisponível. Selecione outro.'))
  const host = document.createElement('div'),
    root = createRoot(host)
  try {
    await act(async () => root.render(<LeadCommercialPanel lead={lead} />))
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Escolher pacote')!
        .click(),
    )
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Criar rascunho')!
        .click(),
    )
    expect(apiRequest).toHaveBeenCalledWith(
      '/crm/leads/lead/proposal-drafts',
      expect.objectContaining({
        method: 'POST',
        body: expect.objectContaining({ packageId: 'package' }),
      }),
    )
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Pacote indisponível',
    )
  } finally {
    act(() => root.unmount())
  }
})
