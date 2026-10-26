import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, click, byText } from '@/components/portal-ui/__tests__/render'
import { usePlatformStore } from '@/stores/platformStore'
import { ApiClientError } from '@/lib/apiClient'

const service = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), createDraft: vi.fn(), saveDraft: vi.fn(), publish: vi.fn(), setPrimary: vi.fn(), archive: vi.fn(), restore: vi.fn(), history: vi.fn() }))
const route = vi.hoisted(() => ({ strategyId: undefined as string | undefined,navigate:vi.fn() }))
vi.mock('react-router-dom', async importOriginal => ({ ...await importOriginal<typeof import('react-router-dom')>(), useParams: () => route,useNavigate:()=>route.navigate }))
vi.mock('@/services/companyStrategyService', () => ({ companyStrategyService: service }))
import { PortalCompanyStrategyPage } from './PortalCompanyStrategyPage'

const content = { schemaVersion: 1, title: 'Sites para empresas', objective: 'Captar empresas que precisam de sites', summary: 'Priorizar empresas da região com oportunidade comercial.', sections: [], references: { productIds: [], documentIds: [] } }
const revision = { id: 'revision-1', strategyId: 'strategy-1', revisionNumber: 1, content, contentHash: 'a'.repeat(64), origin: { kind: 'manual' }, createdBy: 'user-1', createdAt: '2026-10-26T12:00:00Z' }
const strategy = { id: 'strategy-1', organizationId: 'org-a', clientId: 'client-a', version: 3, isPrimary: true, archivedAt: null, draftRevision: null, publishedRevision: revision, createdAt: revision.createdAt, updatedAt: revision.createdAt }
beforeEach(() => {
  route.strategyId = undefined
  usePlatformStore.setState({ organization: { id: 'org-a', name: 'Empresa A' } as never, role: { key: 'client_admin' } as never, workspaceContext: { canConfigure: true } as never, enabledModuleKeys: [], mode: 'portal' })
  service.list.mockResolvedValue([])
  service.history.mockResolvedValue([])
})
afterEach(() => { document.body.innerHTML = ''; vi.resetAllMocks() })
async function fill(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value')!.set!.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })) })
}
describe('Company strategy page', () => {
  it('selects another strategy compactly even when the account has many strategies', async () => {
    service.list.mockResolvedValue(Array.from({ length: 30 }, (_, index) => ({ ...strategy, id: `strategy-${index + 1}`, isPrimary: index === 0, publishedRevision: { ...revision, content: { ...content, title: `Estratégia ${index + 1}`, objective: `Objetivo do mercado ${index + 1}` } } })))
    const { container, unmount } = await render(<PortalCompanyStrategyPage />)
    const select = container.querySelector<HTMLSelectElement>('[aria-label="Estratégia em foco"]')
    expect(select).not.toBeNull()
    await act(async () => { select!.value = 'strategy-30'; select!.dispatchEvent(new Event('change', { bubbles: true })) })
    expect(container.querySelector('section h2')?.textContent).toBe('Estratégia 30')
    expect(container.textContent).toContain('Objetivo do mercado 30')
    await unmount()
  })
  it('creates a separate strategy from a detail route instead of overwriting the open strategy', async () => {
    route.strategyId = 'strategy-1'
    service.list.mockResolvedValue([strategy])
    service.createDraft.mockResolvedValue({ ...strategy, id: 'strategy-2', publishedRevision: null, draftRevision: { ...revision, content: { ...content, title: 'Estratégia nova da empresa' } } })
    service.saveDraft.mockResolvedValue(strategy)
    const { container, unmount } = await render(<PortalCompanyStrategyPage />)
    await click(byText(container, 'button', 'Criar estratégia'))
    await fill(container.querySelector('input[aria-label="Título da estratégia"]')!, 'Estratégia nova da empresa')
    await fill(container.querySelector('textarea[aria-label="Objetivo da estratégia"]')!, 'Desenvolver uma nova frente comercial')
    await fill(container.querySelector('textarea[aria-label="Resumo da estratégia"]')!, 'Uma estratégia distinta da estratégia que já foi publicada.')
    await click(byText(container, 'button', 'Salvar rascunho'))
    expect(service.createDraft.mock.calls.length).toBe(1)
    expect(service.saveDraft.mock.calls.length).toBe(0)
    expect(route.navigate).toHaveBeenCalledWith('/portal/empresa/estrategia/strategy-2',{replace:true})
    await unmount()
  })
  it('does not show a completed write from the previous account after switching workspace', async () => {
    service.list.mockResolvedValue([strategy])
    let finish!: (value: unknown) => void
    service.saveDraft.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { container, unmount } = await render(<PortalCompanyStrategyPage />)
    await click(byText(container, 'button', 'Editar'))
    await click(byText(container, 'button', 'Salvar rascunho'))
    service.list.mockResolvedValue([])
    await act(async () => { usePlatformStore.setState({ organization: { id: 'org-b', name: 'Empresa B' } as never }) })
    await act(async () => { finish(strategy); await Promise.resolve() })
    expect(container.textContent).not.toContain('Sites para empresas')
    await unmount()
  })
  it('allows manual creation without Action Engine or a website', async () => {
    const { container, unmount } = await render(<PortalCompanyStrategyPage />)
    await click(byText(container, 'button', 'Criar estratégia'))
    expect(container.querySelector('input[aria-label="Título da estratégia"]')).not.toBeNull()
    expect(container.textContent).not.toContain('Orçamento obrigatório')
    expect(container.textContent).not.toContain('Construir com o agente')
    await unmount()
  })
  it('preserves text after a failed save and shows a comparison on conflict', async () => {
    service.list.mockResolvedValue([strategy])
    service.get.mockResolvedValue({ ...strategy, version: 4, publishedRevision: { ...revision, content: { ...content, summary: 'Outra pessoa atualizou a estratégia da empresa.' } } })
    service.saveDraft.mockRejectedValue(new ApiClientError(new Response('', { status: 409 }), { error: 'company_strategy_version_conflict' }))
    const { container, unmount } = await render(<PortalCompanyStrategyPage />)
    await click(byText(container, 'button', 'Editar'))
    const objective = container.querySelector<HTMLTextAreaElement>('[aria-label="Objetivo da estratégia"]')!
    await fill(objective, 'Priorizar revisões e agendamento na oficina')
    await click(byText(container, 'button', 'Salvar rascunho'))
    expect(objective.value).toBe('Priorizar revisões e agendamento na oficina')
    expect(container.textContent).toContain('Outra pessoa atualizou')
    await unmount()
  })
  it('renders published content for members without leaking draft text or edit controls', async () => {
    usePlatformStore.setState({ role: { key: 'client_member' } as never, workspaceContext: { canConfigure: false } as never })
    service.list.mockResolvedValue([{ ...strategy, draftRevision: { ...revision, content: { ...content, summary: 'Rascunho privado que não pode aparecer.' } } }])
    const { container, unmount } = await render(<PortalCompanyStrategyPage />)
    expect(container.textContent).toContain('Sites para empresas')
    expect(container.textContent).not.toContain('Rascunho privado')
    expect(byText(container, 'button', 'Editar')).toBeNull()
    await unmount()
  })
})
