import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { ProposalEditor } from './ProposalEditor'
import { proposalService } from '@/services/proposalService'
import type { ProposalDraft } from '@/types/proposal'
vi.mock('@/services/proposalService', () => ({
  proposalService: { updateDraft: vi.fn() },
}))
it('reports a failed draft save without unhandled rejection or false success', async () => {
  vi.mocked(proposalService.updateDraft).mockRejectedValue(
    new Error('Sem permissão para alterar esta proposta.'),
  )
  const host = document.createElement('div'),
    root = createRoot(host)
  try {
    await act(async () =>
      root.render(
        <ProposalEditor
          proposal={
            {
              id: 'p',
              title: 'Proposta',
              status: 'draft',
              scope: '',
              finalValue: 0,
            } as ProposalDraft
          }
          onRefresh={async () => {}}
        />,
      ),
    )
    await act(async () =>
      Array.from(host.querySelectorAll('button'))
        .find((b) => b.textContent === 'Salvar')!
        .click(),
    )
    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      'Sem permissão',
    )
  } finally {
    act(() => root.unmount())
  }
})
