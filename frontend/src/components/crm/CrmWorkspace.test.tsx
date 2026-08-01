import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmWorkspace } from './CrmWorkspace'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmService } from '@/services/crmService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmLead, CrmPipeline } from '@/types/crm'

vi.mock('@/services/crmService', () => ({
  crmService: {
    getPipelines: vi.fn(),
    getLeads: vi.fn(),
    getLeadsForInstance: vi.fn(),
    moveLead: vi.fn(),
    createLead: vi.fn(),
    createGovernedLead: vi.fn(),
    getInteractions: vi.fn(),
    getTasks: vi.fn(),
    getSequences: vi.fn(),
    getEnrollments: vi.fn(),
    getExecutions: vi.fn(),
    createInteraction: vi.fn(),
    createTask: vi.fn(),
    completeLeadTask: vi.fn(),
    markLeadWon: vi.fn(),
    markLeadLost: vi.fn(),
    enrollLead: vi.fn(),
    updateEnrollment: vi.fn(),
    retryExecution: vi.fn(),
  },
}))

vi.mock('@/services/crmGovernanceService', () => ({
  crmGovernanceService: {
    getActiveInstanceForOrganization: vi.fn(),
    getGovernanceContext: vi.fn(),
  },
}))

const pipeline: CrmPipeline = {
  id: 'pipeline-1',
  organizationId: '11111111-1111-4111-8111-111111111111',
  name: 'Comercial',
  isDefault: true,
  isActive: true,
  stages: [
    { id: 'new-stage', pipelineId: 'pipeline-1', key: 'new', name: 'Novo lead', color: '#2563eb', orderIndex: 0, isWon: false, isLost: false, isActive: true },
    { id: 'proposal-stage', pipelineId: 'pipeline-1', key: 'proposal', name: 'Proposta', color: '#d97706', orderIndex: 1, isWon: false, isLost: false, isActive: true },
    { id: 'won-stage', pipelineId: 'pipeline-1', key: 'won', name: 'Ganho', color: '#16a34a', orderIndex: 2, isWon: true, isLost: false, isActive: true },
  ],
}

const leads: CrmLead[] = [
  {
    id: 'lead-1',
    organizationId: pipeline.organizationId,
    pipelineId: pipeline.id,
    stageId: 'new-stage',
    name: 'Ana Lead',
    email: 'ana@example.com',
    company: 'Clinica Alpha',
    source: 'Meta Ads',
    sourceKind: 'paid_campaign',
    status: 'open',
    score: 82,
    value: 2500,
    lastActivityAt: '2026-06-03T10:00:00.000Z',
    createdAt: '2026-06-03T10:00:00.000Z',
    updatedAt: '2026-06-03T10:00:00.000Z',
  },
  {
    id: 'lead-2',
    organizationId: pipeline.organizationId,
    pipelineId: pipeline.id,
    stageId: 'proposal-stage',
    name: 'Bruno Lead',
    email: 'bruno@example.com',
    source: 'Manual',
    sourceKind: 'manual',
    status: 'open',
    score: 45,
    value: 1000,
    lastActivityAt: '2026-06-01T10:00:00.000Z',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
  },
]

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('CrmWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePlatformStore.setState({
      organization: {
        id: pipeline.organizationId,
        name: 'YUX',
        slug: 'yux',
        kind: 'yux',
        createdAt: '2026-06-03T10:00:00.000Z',
        updatedAt: '2026-06-03T10:00:00.000Z',
      },
      isLoading: false,
      error: null,
      enabledModuleKeys: [],
    })
  })

  it('renders the commercial cockpit with metrics and pipeline leads', async () => {
    vi.mocked(crmService.getPipelines).mockResolvedValue([pipeline])
    vi.mocked(crmService.getLeads).mockResolvedValue(leads)

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><CrmWorkspace /></MemoryRouter>)
      await flush()
      await flush()
      await flush()
    })

    const html = container.innerHTML.replace(/&nbsp;/g, ' ')

    expect(html).toContain('CRM Cockpit')
    expect(html).toContain('Novos leads')
    expect(html).toContain('Leads parados')
    expect(html).toContain('Pipeline aberto')
    expect(html).toContain('Ana Lead')
    expect(html).toContain('Bruno Lead')
    expect(html).toContain('Novo lead')

    act(() => root.unmount())
  })

  it('does not keep loading forever when platform falls back to a local organization', async () => {
    usePlatformStore.setState({
      organization: {
        id: 'local-yux',
        name: 'YUX local',
        slug: 'yux',
        kind: 'yux',
        createdAt: '1970-01-01T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:00.000Z',
      },
      isLoading: false,
      error: 'Erro ao carregar contexto da plataforma; usando contexto local.',
    })

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><CrmWorkspace /></MemoryRouter>)
      await flush()
      await flush()
    })

    const html = container.innerHTML

    expect(html).toContain('CRM indisponivel neste contexto')
    expect(html).not.toContain('Carregando pipeline')
    expect(crmService.getPipelines).not.toHaveBeenCalled()

    act(() => root.unmount())
  })

  it('shows CRM implementation pending when the module is contracted without an active instance', async () => {
    usePlatformStore.setState({
      organization: {
        id: pipeline.organizationId,
        name: 'Cliente ABC',
        slug: 'cliente-abc',
        kind: 'client',
        createdAt: '2026-06-03T10:00:00.000Z',
        updatedAt: '2026-06-03T10:00:00.000Z',
      },
      isLoading: false,
      error: null,
      enabledModuleKeys: ['crm'],
    })
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(null)

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><CrmWorkspace /></MemoryRouter>)
      await flush()
      await flush()
    })

    expect(container.innerHTML).toContain('Implantacao do CRM pendente')
    expect(container.innerHTML).toContain('O CRM esta contratado')
    expect(crmService.getPipelines).not.toHaveBeenCalled()

    act(() => root.unmount())
  })

  it('shows CRM not contracted when the module is not enabled', async () => {
    usePlatformStore.setState({
      organization: {
        id: pipeline.organizationId,
        name: 'Cliente ABC',
        slug: 'cliente-abc',
        kind: 'client',
        createdAt: '2026-06-03T10:00:00.000Z',
        updatedAt: '2026-06-03T10:00:00.000Z',
      },
      isLoading: false,
      error: null,
      enabledModuleKeys: [],
    })
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(null)

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><CrmWorkspace /></MemoryRouter>)
      await flush()
      await flush()
    })

    expect(container.innerHTML).toContain('CRM nao contratado')
    expect(container.innerHTML).not.toContain('Implantacao do CRM pendente')
    expect(crmService.getPipelines).not.toHaveBeenCalled()

    act(() => root.unmount())
  })

  it('shows seller-scoped lead view when current member is seller', async () => {
    usePlatformStore.setState({
      organization: {
        id: pipeline.organizationId,
        name: 'Cliente ABC',
        slug: 'cliente-abc',
        kind: 'client',
        createdAt: '2026-06-03T10:00:00.000Z',
        updatedAt: '2026-06-03T10:00:00.000Z',
      },
      isLoading: false,
      error: null,
    })
    const instance = {
      id: 'crm-1',
      organizationId: pipeline.organizationId,
      contractId: 'contract-1',
      status: 'active' as const,
      sellerSeatLimit: 2,
      managerSeatLimit: 1,
      adminSeatLimit: 1,
      maxPipelineCount: 3,
      maxCustomFieldCount: 20,
      maxAutomationCount: 5,
      allowClientPipelineCustomization: true,
      allowClientFieldCustomization: true,
      allowClientCategoryCustomization: true,
      defaultAssignmentMode: 'queue' as const,
      createdAt: '2026-06-03T10:00:00.000Z',
      updatedAt: '2026-06-03T10:00:00.000Z',
    }
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(instance)
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue({
      instance,
      currentMember: {
        id: 'seller-1',
        crmInstanceId: 'crm-1',
        userId: 'user-1',
        role: 'seller',
        status: 'active',
        createdAt: '2026-06-03T10:00:00.000Z',
        updatedAt: '2026-06-03T10:00:00.000Z',
      },
      teams: [],
      teamMemberships: [],
    })
    vi.mocked(crmService.getPipelines).mockResolvedValue([{ ...pipeline, crmInstanceId: 'crm-1' }])
    vi.mocked(crmService.getLeadsForInstance).mockResolvedValue(leads)

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><CrmWorkspace /></MemoryRouter>)
      await flush()
      await flush()
      await flush()
    })

    expect(container.innerHTML).toContain('Meus leads')
    expect(crmService.getLeadsForInstance).toHaveBeenCalledWith('crm-1', pipeline.id)

    act(() => root.unmount())
  })

  it('shows manager team controls when current member manages teams', async () => {
    usePlatformStore.setState({
      organization: {
        id: pipeline.organizationId,
        name: 'Cliente ABC',
        slug: 'cliente-abc',
        kind: 'client',
        createdAt: '2026-06-03T10:00:00.000Z',
        updatedAt: '2026-06-03T10:00:00.000Z',
      },
      isLoading: false,
      error: null,
    })
    const instance = {
      id: 'crm-1',
      organizationId: pipeline.organizationId,
      contractId: 'contract-1',
      status: 'active' as const,
      sellerSeatLimit: 2,
      managerSeatLimit: 1,
      adminSeatLimit: 1,
      maxPipelineCount: 3,
      maxCustomFieldCount: 20,
      maxAutomationCount: 5,
      allowClientPipelineCustomization: true,
      allowClientFieldCustomization: true,
      allowClientCategoryCustomization: true,
      defaultAssignmentMode: 'queue' as const,
      createdAt: '2026-06-03T10:00:00.000Z',
      updatedAt: '2026-06-03T10:00:00.000Z',
    }
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(instance)
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue({
      instance,
      currentMember: {
        id: 'manager-1',
        crmInstanceId: 'crm-1',
        userId: 'user-2',
        role: 'manager',
        status: 'active',
        createdAt: '2026-06-03T10:00:00.000Z',
        updatedAt: '2026-06-03T10:00:00.000Z',
      },
      teams: [],
      teamMemberships: [],
    })
    vi.mocked(crmService.getPipelines).mockResolvedValue([{ ...pipeline, crmInstanceId: 'crm-1' }])
    vi.mocked(crmService.getLeadsForInstance).mockResolvedValue(leads)

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><CrmWorkspace /></MemoryRouter>)
      await flush()
      await flush()
      await flush()
    })

    expect(container.innerHTML).toContain('Leads da equipe')

    act(() => root.unmount())
  })
})
