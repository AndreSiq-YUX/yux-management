import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeadScoreSummary } from './scoring/LeadScoreSummary'
import { crmQualificationService } from '@/services/crmQualificationService'
import { LeadTrashPanel } from './LeadTrashPanel'
import { apiRequest } from '@/lib/apiClient'
import { LeadHighlights } from './LeadHighlights'
import { LeadProfileSummary } from './LeadProfileSummary'
import { LeadDeleteDialog } from './LeadDeleteDialog'
import type { CrmLead } from '@/types/crm'
vi.mock('@/services/crmQualificationService', () => ({
  crmQualificationService: { summary: vi.fn() },
}))
vi.mock('@/lib/apiClient', () => ({ apiRequest: vi.fn() }))
const roots: Array<{ root: Root; container: HTMLDivElement }> = []
async function mount(element: React.ReactNode) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  roots.push({ root, container })
  await act(async () => root.render(element))
  return container
}
afterEach(() => {
  for (const item of roots.splice(0)) {
    act(() => item.root.unmount())
    item.container.remove()
  }
})
const lead = {
  id: 'lead',
  name: 'Cozinha',
  profileSummary: {
    recordTypeName: 'Cozinha industrial',
    fields: [
      {
        key: 'meals',
        label: 'Refeições',
        fieldType: 'number',
        value: 0,
        isHighlighted: true,
      },
      {
        key: 'delivery',
        label: 'Entrega',
        fieldType: 'boolean',
        value: false,
        isHighlighted: true,
      },
      {
        key: 'private',
        label: 'Outras informações',
        fieldType: 'text',
        value: 'Sem destaque',
        isHighlighted: false,
      },
    ],
  },
} as CrmLead
describe('visible customer data', () => {
  it('shows zero and false in the highlight and hides fields not highlighted', async () => {
    const view = await mount(<LeadHighlights lead={lead} />)
    expect(view.textContent).toContain('Refeições: 0')
    expect(view.textContent).toContain('Entrega: Não')
    expect(view.textContent).not.toContain('Sem destaque')
  })
  it('shows all applicable data immediately with a clear edit action', async () => {
    const edit = vi.fn(),
      view = await mount(<LeadProfileSummary lead={lead} onEdit={edit} />)
    expect(view.textContent).toContain('Cozinha industrial')
    expect(view.textContent).toContain('Sem destaque')
    act(() =>
      Array.from(view.querySelectorAll('button'))
        .find((b) => b.textContent === 'Editar dados')!
        .click(),
    )
    expect(edit).toHaveBeenCalledOnce()
  })
  it('requires confirmation before deleting and identifies the selected leads', async () => {
    const closed = vi.fn(),
      removed = vi.fn()
    await mount(
      <LeadDeleteDialog
        leads={[lead]}
        crmInstanceId="crm"
        onClose={closed}
        onDeleted={removed}
      />,
    )
    expect(document.body.textContent).toContain('Cozinha')
    expect(document.body.textContent).toContain('Confirmar exclusão')
    expect(removed).not.toHaveBeenCalled()
    act(() =>
      Array.from(document.body.querySelectorAll('button'))
        .find((b) => b.textContent === 'Cancelar')!
        .click(),
    )
    expect(closed).toHaveBeenCalledOnce()
  })
})

describe('trash pagination isolation', () => {
  it('discards a delayed page when the CRM instance changes', async () => {
    let finish: (value: unknown) => void = () => {}
    vi.mocked(apiRequest).mockImplementation((url) => {
      if (url.includes('afterId='))
        return new Promise((resolve) => {
          finish = resolve
        }) as never
      return Promise.resolve({
        leads: [
          {
            id: url.includes('crm-B') ? 'B' : 'A',
            name: url.includes('crm-B') ? 'Empresa B' : 'Empresa A',
            company: null,
            deletedAt: '2026-11-01',
          },
        ],
        nextCursor: url.includes('crm-B') ? null : 'next-A',
      }) as never
    })
    await mount(
      <LeadTrashPanel
        crmInstanceId="crm-A"
        open
        onClose={() => {}}
        onRestored={() => {}}
      />,
    )
    await act(async () => {
      Array.from(document.body.querySelectorAll('button'))
        .find((b) => b.textContent === 'Carregar mais')!
        .click()
      await Promise.resolve()
    })
    await act(async () => {
      roots
        .at(-1)!
        .root.render(
          <LeadTrashPanel
            crmInstanceId="crm-B"
            open
            onClose={() => {}}
            onRestored={() => {}}
          />,
        )
      await Promise.resolve()
    })
    await act(async () => {
      finish({
        leads: [
          {
            id: 'secret-A',
            name: 'Dados exclusivos de A',
            company: null,
            deletedAt: '2026-11-01',
          },
        ],
        nextCursor: null,
      })
      await Promise.resolve()
    })
    expect(document.body.textContent).toContain('Empresa B')
    expect(document.body.textContent).not.toContain('Dados exclusivos de A')
  })
})

describe('eventual score updates', () => {
  afterEach(() => vi.useRealTimers())
  it('refreshes the visible score after asynchronous activity processing', async () => {
    vi.useFakeTimers()
    vi.mocked(crmQualificationService.summary)
      .mockResolvedValueOnce({
        leadId: 'lead',
        score: 10,
        fitScore: 10,
        intentScore: 0,
        temperature: 'cold',
        contributions: [],
      })
      .mockResolvedValue({
        leadId: 'lead',
        score: 70,
        fitScore: 10,
        intentScore: 60,
        temperature: 'hot',
        contributions: [],
      })
    const view = await mount(
      <LeadScoreSummary
        leadId="lead"
        onTask={() => {}}
        onProposal={() => {}}
      />,
    )
    expect(view.textContent).toContain('10/100')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(view.textContent).toContain('70/100')
    expect(view.textContent).toContain('Quente')
  })
})
