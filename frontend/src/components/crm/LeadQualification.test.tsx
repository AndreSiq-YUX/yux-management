import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LeadHighlights } from './LeadHighlights'
import { LeadProfileSummary } from './LeadProfileSummary'
import { LeadDeleteDialog } from './LeadDeleteDialog'
import type { CrmLead } from '@/types/crm'
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
