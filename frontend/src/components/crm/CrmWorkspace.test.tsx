import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmWorkspace } from './CrmWorkspace'
import { crmService } from '@/services/crmService'
import { usePlatformStore } from '@/stores/platformStore'
import type { CrmLead, CrmPipeline } from '@/types/crm'

vi.mock('@/services/crmService', () => ({
  crmService: {
    getPipelines: vi.fn(),
    getLeads: vi.fn(),
    moveLead: vi.fn(),
    createLead: vi.fn(),
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
    })
  })

  it('renders the commercial cockpit with metrics and pipeline leads', async () => {
    vi.mocked(crmService.getPipelines).mockResolvedValue([pipeline])
    vi.mocked(crmService.getLeads).mockResolvedValue(leads)

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<CrmWorkspace />)
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
      root.render(<CrmWorkspace />)
      await flush()
      await flush()
    })

    const html = container.innerHTML

    expect(html).toContain('CRM indisponivel neste contexto')
    expect(html).not.toContain('Carregando pipeline')
    expect(crmService.getPipelines).not.toHaveBeenCalled()

    act(() => root.unmount())
  })
})
