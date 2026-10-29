import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CrmWorkspace } from './CrmWorkspace'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmService } from '@/services/crmService'
import { crmRecordProfileService } from '@/services/crmRecordProfileService'
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

vi.mock('@/services/crmRecordProfileService', () => ({
  crmRecordProfileService: { getConfiguration: vi.fn() },
}))

const customerProfileConfiguration = {
  canConfigure: true, maxFieldCount: 20,
  recordTypes: [{ id: 'kitchen', crmInstanceId: 'crm-instance-1', name: 'Cozinha industrial', isActive: true }],
  fields: [{ id: 'meals-field', stableKey: 'meals', crmInstanceId: 'crm-instance-1', recordTypeId: 'kitchen',
    label: 'Refeições diárias', fieldType: 'number' as const, required: true, options: [], isActive: true, orderIndex: 0 }],
}

beforeEach(() => {
  vi.mocked(crmRecordProfileService.getConfiguration).mockResolvedValue(customerProfileConfiguration)
})

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
  it('opens the requested lead from a Radar deep link in its selected pipeline',async()=>{
    vi.mocked(crmService.getPipelines).mockResolvedValue([pipeline])
    vi.mocked(crmService.getLeads).mockResolvedValue(leads)
    for(const method of [crmService.getInteractions,crmService.getTasks,crmService.getSequences,crmService.getEnrollments,crmService.getExecutions])vi.mocked(method).mockResolvedValue([])
    const container=document.createElement('div');document.body.appendChild(container);const root=createRoot(container)
    await act(async()=>{root.render(<MemoryRouter><CrmWorkspace initialPipelineId="pipeline-1" initialLeadId="lead-1"/></MemoryRouter>);await flush();await flush();await flush()})
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain('Ana Lead')
    act(()=>root.unmount());container.remove()
  })
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

  it('marks CSV import and smart segment actions as pending without faking success', async () => {
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

    const buttons = Array.from(container.querySelectorAll('button'))
    const pendingLabels = ['Importar CSV', 'Salvar segmento', 'Criar tarefa', 'Iniciar automação', 'Criar campanha', 'Exportar']
    for (const label of pendingLabels) {
      const button = buttons.find(item => item.textContent?.includes(label))
      expect(button, label).toBeTruthy()
      expect(button!.textContent, label).toContain('Pendente')
    }

    act(() => {
      buttons.find(item => item.textContent?.includes('Importar CSV'))!.click()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(container.textContent).toContain('importação de leads por planilha CSV está em implantação')

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

describe('CrmWorkspace (variante portal)', () => {
  const originalMatchMedia = window.matchMedia
  const setNativeInput = (element: Element, value: string) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  }
  const click = (element: Element | null | undefined) => element?.dispatchEvent(new MouseEvent('click', { bubbles: true }))

  beforeEach(() => {
    vi.clearAllMocks()
    usePlatformStore.setState({
      organization: {
        id: pipeline.organizationId, name: 'Cliente ABC', slug: 'cliente-abc', kind: 'yux',
        createdAt: '2026-06-03T10:00:00.000Z', updatedAt: '2026-06-03T10:00:00.000Z',
      },
      isLoading: false,
      error: null,
      enabledModuleKeys: [],
    })
    vi.mocked(crmService.getPipelines).mockResolvedValue([pipeline])
    vi.mocked(crmService.getLeads).mockResolvedValue(leads)
  })

  afterEach(() => {
    window.matchMedia = originalMatchMedia
    document.body.innerHTML = ''
  })

  async function renderPortal(props: Parameters<typeof CrmWorkspace>[0] = {}) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(<MemoryRouter><CrmWorkspace profile="portal" {...props} /></MemoryRouter>)
      await flush(); await flush(); await flush()
    })
    return { container, root }
  }

  it('inclui os campos personalizados no formulário atual do portal e envia o perfil com o lead', async () => {
    vi.mocked(crmService.getPipelines).mockResolvedValue([{ ...pipeline, crmInstanceId: 'crm-instance-1' }])
    vi.mocked(crmService.createLead).mockResolvedValue(leads[0])
    const { container, root } = await renderPortal()
    expect(container.textContent).toContain('Tipos e campos')
    await act(async () => click([...container.querySelectorAll('button')].find(button => button.textContent === 'Novo lead')))
    const form = document.querySelector('form')!
    await act(async () => {
      setNativeInput(document.querySelector('#new-lead-name')!, 'Cozinha São Lucas')
      setNativeInput(document.querySelector('#new-lead-email')!, 'cozinha@example.com')
    })
    const typeLabel = [...form.querySelectorAll('label')].find(label => label.textContent === 'Tipo de cliente')!
    const selector = document.getElementById(typeLabel.htmlFor) as HTMLSelectElement
    await act(async () => { selector.value = 'kitchen'; selector.dispatchEvent(new Event('change', { bubbles: true })) })
    const mealsLabel = [...form.querySelectorAll('label')].find(label => label.textContent === 'Refeições diárias *')!
    await act(async () => setNativeInput(document.getElementById(mealsLabel.htmlFor)!, '0'))
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush() })
    expect(crmService.createLead).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Cozinha São Lucas', profile: { recordTypeId: 'kitchen', values: { meals: 0 } },
    }))
    act(() => root.unmount())
  })

  it('usa o vocabulário do cliente: Leads, Funil, análise recolhida e filtros recolhidos', async () => {
    const { container, root } = await renderPortal()
    const text = (container.textContent || '').replace(/\u00a0/g, ' ')

    expect(container.querySelector('h1')?.textContent).toBe('Leads')
    expect(container.querySelector('label[for="lead-pipeline"]')?.textContent).toBe('Funil')
    for (const label of ['Novos leads', 'Leads parados', 'Conversão', 'Valor em aberto']) expect(text).toContain(label)
    for (const forbidden of ['Pipeline', 'CRM Controller', 'CRM Cockpit', 'Cockpit', 'Score']) expect(text, forbidden).not.toContain(forbidden)

    const analysis = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Pedir análise à YUX'))!
    expect(analysis.getAttribute('aria-expanded')).toBe('false')
    expect(container.textContent).not.toContain('Abrir pedido no Suporte')
    act(() => click(analysis))
    expect(container.textContent).toContain('Abrir pedido no Suporte')

    const filtersToggle = [...container.querySelectorAll('button')].find(button => button.textContent?.includes('Filtros e segmentos'))!
    expect(filtersToggle.getAttribute('aria-expanded')).toBe('false')
    expect(container.querySelector<HTMLElement>('#lead-advanced-filters')?.hidden).toBe(true)
    act(() => click(filtersToggle))
    expect(container.querySelector<HTMLElement>('#lead-advanced-filters')?.hidden).toBe(false)
    expect(container.querySelector('label[for="lead-filter-stage"]')?.textContent).toBe('Etapa')

    // As ações pendentes continuam visíveis e marcadas.
    for (const label of ['Importar CSV', 'Salvar segmento', 'Criar tarefa', 'Exportar']) {
      const button = [...container.querySelectorAll('button')].find(item => item.textContent?.includes(label))
      expect(button, label).toBeTruthy()
      expect(button!.textContent, label).toContain('Pendente')
    }
    act(() => root.unmount())
  })

  it('no celular abre na lista e no desktop abre no quadro', async () => {
    window.matchMedia = ((query: string) => ({ matches: true, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia
    const mobile = await renderPortal()
    expect(mobile.container.querySelector('[data-testid="lead-kanban"]')).toBeNull()
    expect(mobile.container.querySelector('[data-testid="responsive-table-cards"]')).not.toBeNull()
    act(() => mobile.root.unmount())

    window.matchMedia = originalMatchMedia
    const desktop = await renderPortal()
    expect(desktop.container.querySelector('[data-testid="lead-kanban"]')).not.toBeNull()
    act(() => desktop.root.unmount())
  })

  it('aplica a empresa recebida pela URL como busca', async () => {
    const { container, root } = await renderPortal({ initialSearch: 'Clinica Alpha' })
    const search = container.querySelector<HTMLInputElement>('#lead-search')!
    expect(search.value).toBe('Clinica Alpha')
    expect(container.textContent).toContain('Ana Lead')
    expect(container.textContent).not.toContain('Bruno Lead')
    act(() => root.unmount())
  })

  it('cadastra um lead com rótulos visíveis, e-mail obrigatório e sem campo de pontuação', async () => {
    vi.mocked(crmService.createLead).mockResolvedValue(leads[0])
    const { container, root } = await renderPortal()
    await act(async () => click([...container.querySelectorAll('button')].find(button => button.textContent === 'Novo lead')))

    const dialog = document.querySelector('[role="dialog"]')!
    const labels = [...dialog.querySelectorAll('label')].map(label => label.textContent)
    expect(labels).toEqual(['Nome *', 'E-mail *', 'Telefone', 'Empresa', 'Origem', 'Valor estimado (R$)'])
    expect(dialog.textContent).not.toContain('Score')
    expect(dialog.textContent).not.toContain('Pontuação')
    expect(dialog.textContent).toContain('o cadastro de leads exige um e-mail')
    for (const input of dialog.querySelectorAll('input')) expect(dialog.querySelector(`label[for="${input.id}"]`), input.id).not.toBeNull()

    // Sem e-mail: não envia e explica.
    await act(async () => { setNativeInput(dialog.querySelector('#new-lead-name')!, 'Carla Nova') })
    await act(async () => { dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(crmService.createLead).not.toHaveBeenCalled()
    expect(dialog.querySelector('[role="alert"]')?.textContent).toContain('e-mail válido')

    await act(async () => {
      setNativeInput(dialog.querySelector('#new-lead-email')!, 'carla@example.com')
      setNativeInput(dialog.querySelector('#new-lead-phone')!, '11999990000')
    })
    await act(async () => { dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); await flush(); await flush() })
    expect(crmService.createLead).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Carla Nova', email: 'carla@example.com', phone: '11999990000', score: 0, stageId: 'new-stage', pipelineId: 'pipeline-1',
    }))
    act(() => root.unmount())
  })
})
