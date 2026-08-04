import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { PortalCommercialFunnelsPage } from './PortalCommercialFunnelsPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmService } from '@/services/crmService'
import type { CrmGovernanceContext, CrmLead, CrmPipeline } from '@/types/crm'

vi.mock('@/hooks/usePortalCrmContext', () => ({
  usePortalCrmContext: vi.fn(),
}))

vi.mock('@/services/crmGovernanceService', () => ({
  crmGovernanceService: {
    getActiveInstanceForOrganization: vi.fn(),
    getGovernanceContext: vi.fn(),
  },
}))

vi.mock('@/services/crmService', () => ({
  crmService: {
    moveLeadToStage: vi.fn(),
    createPipeline: vi.fn(),
    updatePipeline: vi.fn(),
    createPipelineStage: vi.fn(),
    updatePipelineStage: vi.fn(),
    reorderPipelineStages: vi.fn(),
  },
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const pipeline: CrmPipeline = {
  id: 'pipeline-1',
  organizationId,
  crmInstanceId: 'instance-1',
  name: 'Comercial',
  description: 'Funil principal',
  isDefault: true,
  isActive: true,
  stages: [
    { id: 'new-stage', pipelineId: 'pipeline-1', key: 'new', name: 'Novo lead', color: '#2563eb', orderIndex: 0, isWon: false, isLost: false, isActive: true },
    { id: 'proposal-stage', pipelineId: 'pipeline-1', key: 'proposal', name: 'Proposta', color: '#d97706', orderIndex: 1, isWon: false, isLost: false, isActive: true },
  ],
}

const leads: CrmLead[] = [
  {
    id: 'lead-1', organizationId, pipelineId: 'pipeline-1', stageId: 'proposal-stage', name: 'Ana Lead', email: 'ana@example.com', company: 'Alpha', source: 'Formulário', status: 'open', score: 82, value: 10000,
    lastActivityAt: '2026-07-20T10:00:00.000Z', createdAt: '2026-07-20T10:00:00.000Z', updatedAt: '2026-07-20T10:00:00.000Z',
  },
  {
    id: 'lead-2', organizationId, pipelineId: 'pipeline-1', stageId: 'proposal-stage', name: 'Bruno Lead', email: 'bruno@example.com', company: 'Beta', source: 'Manual', status: 'open', score: 45, value: 5000,
    lastActivityAt: '2026-08-03T10:00:00.000Z', createdAt: '2026-08-03T10:00:00.000Z', updatedAt: '2026-08-03T10:00:00.000Z',
  },
]

const governance: CrmGovernanceContext = {
  instance: {
    id: 'instance-1', organizationId, contractId: 'contract-1', status: 'active', sellerSeatLimit: 3, managerSeatLimit: 1, adminSeatLimit: 1,
    maxPipelineCount: 3, maxCustomFieldCount: 20, maxAutomationCount: 5, allowClientPipelineCustomization: true,
    allowClientFieldCustomization: true, allowClientCategoryCustomization: true, defaultAssignmentMode: 'queue',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  currentMember: {
    id: 'member-1', crmInstanceId: 'instance-1', userId: 'user-1', role: 'client_admin', status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  },
  members: [], teams: [], teamMemberships: [],
}

const flush = () => Promise.resolve()

describe('PortalCommercialFunnelsPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-04T12:00:00.000Z'))
    vi.clearAllMocks()
    vi.mocked(usePortalCrmContext).mockReturnValue({
      organization: { id: organizationId, name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      role: null,
      enabledModuleKeys: ['crm'], loading: false, error: null, pipelines: [pipeline], leads, tasks: [], reload: vi.fn().mockResolvedValue(undefined),
    })
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(governance.instance)
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue(governance)
    vi.mocked(crmService.moveLeadToStage).mockResolvedValue(leads[0])
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('shows stage metrics, stale leads, and authorized configuration', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><PortalCommercialFunnelsPage /></MemoryRouter>)
      await flush()
      await flush()
      await flush()
    })

    const renderedText = (container.textContent || '').replace(/\u00a0/g, ' ')
    expect(renderedText).toContain('Configurar funil')
    expect(renderedText).toContain('2 leads · R$ 15.000,00')
    expect(renderedText).toContain('Sem atividade há mais de 7 dias')
    expect(renderedText).toContain('Proposta')

    act(() => root.unmount())
  })

  it('moves a lead through the operational stage selector', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><PortalCommercialFunnelsPage /></MemoryRouter>)
      await flush()
      await flush()
      await flush()
    })

    const select = container.querySelector('#move-lead-lead-1') as HTMLSelectElement
    expect(select).not.toBeNull()
    await act(async () => {
      select.value = 'new-stage'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      await flush()
    })

    expect(crmService.moveLeadToStage).toHaveBeenCalledWith('lead-1', 'new-stage')
    act(() => root.unmount())
  })

  it('offers a clear first-funnel setup path for an internal admin', async () => {
    vi.mocked(usePortalCrmContext).mockReturnValue({
      organization: { id: organizationId, name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      role: { key: 'yux_admin', name: 'YUX Admin', scope: 'internal', permissions: [] },
      enabledModuleKeys: ['crm'], loading: false, error: null, pipelines: [], leads: [], tasks: [], reload: vi.fn().mockResolvedValue(undefined),
    })
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue({ ...governance, currentMember: undefined })

    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(<MemoryRouter><PortalCommercialFunnelsPage /></MemoryRouter>)
      await flush()
      await flush()
      await flush()
    })

    const renderedText = (container.textContent || '').replace(/\u00a0/g, ' ')
    expect(renderedText).toContain('Comece pela sua primeira operação')
    expect(renderedText).toContain('Criar primeiro funil')

    act(() => root.unmount())
  })
})
