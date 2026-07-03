import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { PortalDashboardPage } from './PortalDashboardPage'

const platformState = {
  activeContract: {
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
  },
  enabledModuleKeys: ['crm'],
  isLoading: false,
  mode: 'portal',
  organization: {
    id: 'org-1',
    name: 'Empresa ABC',
    slug: 'empresa-abc',
    kind: 'client',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
}

vi.mock('@/stores/platformStore', () => ({
  usePlatformStore: (selector: (state: typeof platformState) => unknown) => selector(platformState),
}))

vi.mock('@/hooks/usePortalWorkspacePath', () => ({
  usePortalWorkspacePath: () => (href = '/portal') => href,
}))

vi.mock('@/hooks/usePortalActionSummary', () => ({
  usePortalActionSummary: () => ({
    actions: [{
      id: 'crm-overdue',
      kind: 'commercial',
      priority: 'critical',
      title: '1 follow-up atrasado',
      description: 'Tarefa comercial passou do prazo.',
      href: '/portal/comercial/tarefas',
    }],
    pendingApprovalCount: 0,
    loading: false,
    error: null,
    projects: [],
    approvals: [],
    invoices: [],
    crm: {
      leads: [{
        id: 'lead-1',
        organizationId: 'org-1',
        pipelineId: 'pipeline-1',
        stageId: 'stage-1',
        name: 'Oportunidade enterprise',
        email: 'lead@example.com',
        source: 'site',
        score: 88,
        value: 18000,
        status: 'open',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }],
      tasks: [
        {
          id: 'task-1',
          organizationId: 'org-1',
          leadId: 'lead-1',
          title: 'Follow-up atrasado',
          status: 'pending',
          dueAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'task-2',
          organizationId: 'org-1',
          leadId: 'lead-1',
          title: 'Follow-up 2',
          status: 'pending',
          dueAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'task-3',
          organizationId: 'org-1',
          leadId: 'lead-1',
          title: 'Follow-up 3',
          status: 'pending',
          dueAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      loading: false,
      error: null,
    },
    marketing: {
      campaigns: [],
      contents: [],
      reviews: [],
      creativeSuggestions: [],
      workflowRuns: [],
      loading: false,
      error: null,
    },
    reload: vi.fn(),
  }),
}))

describe('PortalDashboardPage', () => {
  it('renders the adaptive client cockpit with expansion suggestions', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <MemoryRouter>
          <PortalDashboardPage />
        </MemoryRouter>,
      )
    })

    expect(container.innerHTML).toContain('Visao Geral do Cliente')
    expect(container.innerHTML).toContain('Pulso Executivo')
    expect(container.innerHTML).toContain('Resolver agora')
    expect(container.innerHTML).toContain('Aproveitar oportunidade')
    expect(container.innerHTML).toContain('Atalhos contextuais')
    expect(container.innerHTML).toContain('Mapa do Contrato')
    expect(container.innerHTML).toContain('Automacao comercial')

    root.unmount()
  })
})
