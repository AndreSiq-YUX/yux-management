import { act } from 'react-dom/test-utils'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalDashboardPage } from './PortalDashboardPage'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

const NOW = new Date(2026, 9, 17, 9, 30, 0)
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
const dateOnlyIn = (days: number) => new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10)

const contract = {
  id: 'contract-1',
  clientId: 'client-1',
  packageId: 'package-1',
  status: 'active',
  name: 'Growth Comercial',
  startsAt: '2026-01-01T00:00:00.000Z',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  package: {
    id: 'package-1',
    key: 'growth',
    name: 'Growth',
    description: 'Pacote Growth',
    moduleKeys: ['crm'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  modules: [],
}

const platformState = {
  activeContract: contract as typeof contract | null,
  enabledModuleKeys: ['crm', 'projects', 'finance'] as string[],
  isLoading: false,
  organization: {
    id: 'org-1',
    name: 'Empresa ABC',
    slug: 'empresa-abc',
    kind: 'client',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
}

const reload = vi.fn()

const makeSummary = (overrides: Record<string, unknown> = {}) => ({
  actions: [],
  pendingApprovalCount: 0,
  loading: false,
  error: null,
  loadedAt: new Date(NOW.getTime() - 12 * 60_000),
  projectsLoading: false,
  projectsError: null,
  projects: [],
  approvals: [],
  invoices: [],
  crm: { leads: [], tasks: [], pipelines: [], loading: false, error: null },
  marketing: {
    campaigns: [],
    contents: [],
    reviews: [],
    creativeSuggestions: [],
    workflowRuns: [],
    loading: false,
    error: null,
  },
  reload,
  ...overrides,
})

let summary = makeSummary()

vi.mock('@/stores/platformStore', () => ({
  usePlatformStore: (selector: (state: typeof platformState) => unknown) => selector(platformState),
}))

vi.mock('@/stores/authStore', () => ({
  useAuthStore: (selector: (state: { user: { name: string } | null }) => unknown) => selector({ user: { name: 'Mariana Souza' } }),
}))

vi.mock('@/hooks/usePortalWorkspacePath', () => ({
  usePortalWorkspacePath: () => (href = '/portal') => href,
}))

vi.mock('@/hooks/usePortalActionSummary', () => ({
  usePortalActionSummary: () => summary,
}))

let container: HTMLDivElement
let root: Root

const text = () => container.textContent ?? ''
const hrefs = () => Array.from(container.querySelectorAll('a')).map(link => link.getAttribute('href'))

async function render() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <PortalDashboardPage />
      </MemoryRouter>,
    )
  })
}

const lead = (id: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizationId: 'org-1',
  pipelineId: 'pipeline-1',
  stageId: 'stage-1',
  name: `Lead ${id}`,
  email: `${id}@example.com`,
  source: 'site',
  score: 50,
  value: 18000,
  status: 'open',
  createdAt,
  updatedAt: createdAt,
  ...extra,
})

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  platformState.activeContract = contract
  platformState.enabledModuleKeys = ['crm', 'projects', 'finance']
  platformState.isLoading = false
  summary = makeSummary()
  reload.mockClear()
  container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('PortalDashboardPage', () => {
  it('renderiza as seções na ordem da prévia aprovada', async () => {
    summary = makeSummary({
      actions: [{ id: 'crm-overdue', kind: 'commercial', priority: 'critical', title: '1 follow-up atrasado', description: 'Tarefa comercial passou do prazo.', href: '/portal/comercial/tarefas', since: daysAgo(2) }],
      crm: {
        leads: [lead('1', daysAgo(1)), lead('2', daysAgo(3))],
        tasks: [{ id: 't1', organizationId: 'org-1', leadId: '1', title: 'x', status: 'pending', dueAt: daysAgo(2) }],
        pipelines: [],
        loading: false,
        error: null,
      },
      projects: [{ id: 'p1', name: 'Site institucional', status: 'ACTIVE', progress: 65, expectedEndDate: dateOnlyIn(9), createdAt: daysAgo(30), updatedAt: daysAgo(1) }],
    })
    await render()

    const headings = Array.from(container.querySelectorAll('h1, h2')).map(heading => heading.textContent)
    expect(headings).toEqual([
      'Bom dia, Mariana.',
      'Sua vez',
      'Pulso do período',
      'Funil comercial',
      'Pontos de atenção',
      'Executado pela YUX',
      'Próximas entregas',
      'Seus módulos',
      'Sugestão para o seu momento: Automações',
    ].filter(Boolean))
    expect(text()).toContain('Visão geral')
    expect(text()).toContain('dados atualizados há 12 min')
    expect(text()).toContain('Contrato Growth Comercial')
    expect(text()).toContain('Todos os dados carregados')
    expect(text()).toContain('R$ 36 mil')
    expect(text()).toContain('CRM e funis')
    expect(text()).toContain('Retomar')
    // A sugestão leva a Missões, não ao Suporte.
    expect(hrefs()).toContain('/portal/missoes')
    expect(hrefs()).not.toContain('/portal/suporte')
  })

  it.each([
    [9, 'Bom dia, Mariana.'],
    [14, 'Boa tarde, Mariana.'],
    [21, 'Boa noite, Mariana.'],
  ])('cumprimenta pelo horário (%ih)', async (hour, greeting) => {
    vi.setSystemTime(new Date(2026, 9, 17, hour, 0, 0))
    await render()
    expect(container.querySelector('h1')?.textContent).toBe(greeting)
  })

  it('mostra Sua vez com ações reais e Pagar fatura como pendente (B1)', async () => {
    summary = makeSummary({
      approvals: [{
        id: 'a1', projectId: 'p1', targetType: 'deliverable', targetId: 'd1', title: 'Landing page Implantes 2026',
        status: 'pending', isClientVisible: true, submittedAt: daysAgo(2), createdAt: daysAgo(2), updatedAt: daysAgo(2),
      }],
      invoices: [{
        id: 'i1', invoiceNumber: '0042', status: 'issued', dueDate: dateOnlyIn(3), totalAmount: 4800, paidAmount: 0, items: [],
      }],
    })
    await render()

    expect(container.querySelector('h1')?.nextElementSibling?.textContent).toContain('2 decisões')
    expect(text()).toContain('Landing page Implantes 2026')
    expect(text()).toContain('Fatura nº 0042')
    expect(text()).toContain('vence em 3 dias')
    expect(hrefs()).toContain('/portal/projetos/projetos?projectId=p1&tab=approvals')
    expect(hrefs()).toContain('/portal/financeiro')
    expect(hrefs()).toContain('/portal/projetos/aprovacoes')

    const pay = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Pagar fatura'))
    expect(pay).toBeTruthy()
    expect(pay?.getAttribute('aria-disabled')).toBe('true')
    expect(pay?.textContent).toContain('Pendente')
    await act(async () => { pay?.click() })
    expect(text()).toContain('em implantação')
  })

  it('sem decisões, mostra a mensagem positiva e a frase de zero decisões', async () => {
    await render()

    expect(text()).toContain('Nada depende de você agora.')
    expect(text()).toContain('nenhuma decisão')
    expect(text()).toContain('Nada urgente agora')
    expect(text()).toContain('Nenhuma atividade registrada no período.')
    expect(text()).not.toContain('Ver todas as aprovações')
  })

  it('usa o singular com uma decisão', async () => {
    summary = makeSummary({
      invoices: [{ id: 'i1', invoiceNumber: '7', status: 'issued', dueDate: dateOnlyIn(-1), totalAmount: 100, paidAmount: 0, items: [] }],
    })
    await render()

    const lead = container.querySelector('h1')?.nextElementSibling?.textContent ?? ''
    expect(lead).toContain('1 decisão')
    expect(lead).not.toContain('1 decisões')
    expect(text()).toContain('venceu ontem')
  })

  it('não inventa valores: sem dados, nada de números fixos nem métricas sem fonte', async () => {
    await render()

    expect(text()).not.toMatch(/Atualizado agora/)
    expect(text()).not.toMatch(/1ª resposta|Atendidos pela IA/)
    expect(text()).toContain('Ainda não há leads no funil')
    // Sem funil nem projetos com dados, os módulos mostram o estado real.
    expect(text()).toContain('Nenhum lead ainda')
    expect(text()).toContain('Nenhuma fatura emitida')
    expect(container.innerHTML).not.toMatch(/#2563EB|#141821|#f4f4f4|#635BFF|#050816/i)
  })

  it('troca o período e atualiza a legenda de comparação', async () => {
    await render()
    expect(text()).toContain('Comparando com os 7 dias anteriores')

    const buttons = Array.from(container.querySelectorAll('button'))
    await act(async () => { buttons.find(button => button.textContent === 'Hoje')?.click() })
    expect(text()).toContain('Comparando com ontem')

    const again = Array.from(container.querySelectorAll('button'))
    await act(async () => { again.find(button => button.textContent === '30 dias')?.click() })
    expect(text()).toContain('Comparando com os 30 dias anteriores')
  })

  it('mostra esqueletos no primeiro carregamento', async () => {
    summary = makeSummary({
      loading: true,
      projectsLoading: true,
      crm: { leads: [], tasks: [], pipelines: [], loading: true, error: null },
    })
    await render()

    expect(container.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThan(0)
    expect(text()).not.toContain('Nada depende de você agora.')
  })

  it('erro em uma fonte vira erro só nas seções dela, com nova tentativa', async () => {
    summary = makeSummary({
      error: 'falha',
      crm: { leads: [], tasks: [], pipelines: [], loading: false, error: 'falha' },
    })
    await render()

    const alerts = container.querySelectorAll('[role="alert"]')
    expect(alerts.length).toBeGreaterThan(0)
    // O resto da página continua de pé.
    expect(text()).toContain('Sua vez')
    expect(text()).toContain('Seus módulos')
    expect(text()).toContain('Nada depende de você agora.')
    expect(text()).toContain('Comercial')

    const retry = Array.from(container.querySelectorAll('button')).find(button => button.textContent === 'Tentar novamente')
    await act(async () => { retry?.click() })
    expect(reload).toHaveBeenCalled()
  })

  it('mantém o estado vazio para contrato ausente', async () => {
    platformState.activeContract = null
    await render()

    expect(text()).toContain('Nenhum contrato ativo encontrado')
    expect(text()).toContain('módulos contratados')
  })

  it('não usa margens negativas nem fundo próprio (o layout já pinta bg-yx-bg)', async () => {
    await render()
    expect(container.innerHTML).not.toMatch(/-mx-|-my-|min-h-\[calc/)
  })
})
