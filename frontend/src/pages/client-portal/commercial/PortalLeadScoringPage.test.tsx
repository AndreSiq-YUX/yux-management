import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PortalLeadScoringPage, canEditLeadScoring, combineScore } from './PortalLeadScoringPage'
import { usePortalCrmContext } from '@/hooks/usePortalCrmContext'
import { crmGovernanceService } from '@/services/crmGovernanceService'
import { crmScoringService } from '@/services/crmScoringService'
import type { CrmGovernanceContext, CrmInstanceRole, CrmLead, LeadScoringModel, LeadScoringRule } from '@/types/crm'

vi.mock('@/hooks/usePortalCrmContext', () => ({ usePortalCrmContext: vi.fn() }))
vi.mock('@/services/crmGovernanceService', () => ({
  crmGovernanceService: { getActiveInstanceForOrganization: vi.fn(), getGovernanceContext: vi.fn() },
}))
vi.mock('@/services/crmScoringService', () => ({
  crmScoringService: { getModel: vi.fn(), updateModel: vi.fn(), createRule: vi.fn(), deactivateRule: vi.fn(), simulate: vi.fn() },
}))

const organizationId = '11111111-1111-4111-8111-111111111111'
const instance = {
  id: 'instance-1', organizationId, contractId: 'c', status: 'active', sellerSeatLimit: 2, managerSeatLimit: 1, adminSeatLimit: 1,
  maxPipelineCount: 3, maxCustomFieldCount: 20, maxAutomationCount: 5, allowClientPipelineCustomization: true,
  allowClientFieldCustomization: true, allowClientCategoryCustomization: true, defaultAssignmentMode: 'queue', createdAt: '', updatedAt: '',
} as const
const governanceFor = (role: CrmInstanceRole): CrmGovernanceContext => ({
  instance,
  currentMember: { id: 'm1', crmInstanceId: 'instance-1', userId: 'u1', role, status: 'active', createdAt: '', updatedAt: '' },
  members: [], teams: [], teamMemberships: [],
})
const model: LeadScoringModel = { id: 'model-1', crmInstanceId: 'instance-1', name: 'Padrão', fitWeight: 50, intentWeight: 50, thresholds: [40, 70], isActive: true, createdAt: '', updatedAt: '' }
const rule = { id: 'rule-1', modelId: 'model-1', name: 'Abriu e-mail', dimension: 'intent', eventType: 'email.opened', points: 10, isActive: true, createdAt: '', updatedAt: '' } as LeadScoringRule
const leads = [
  { id: 'lead-1', organizationId, pipelineId: 'p', stageId: 's', name: 'Ana Lead', email: 'a@example.com', source: 'Manual', score: 82, fitScore: 90, intentScore: 74, createdAt: '', updatedAt: '' },
  { id: 'lead-2', organizationId, pipelineId: 'p', stageId: 's', name: 'Bruno Lead', email: 'b@example.com', source: 'Manual', score: 40, createdAt: '', updatedAt: '' },
] as CrmLead[]

async function render() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(<MemoryRouter><PortalLeadScoringPage /></MemoryRouter>)
    for (let i = 0; i < 5; i += 1) await Promise.resolve()
  })
  return { container, root }
}

describe('PortalLeadScoringPage', () => {
  beforeEach(() => {
    vi.mocked(usePortalCrmContext).mockReturnValue({
      organization: { id: organizationId, name: 'Cliente', slug: 'cliente', kind: 'client', createdAt: '', updatedAt: '' },
      role: null, enabledModuleKeys: ['crm'], loading: false, error: null, pipelines: [], leads, tasks: [], reload: vi.fn(),
    })
    vi.mocked(crmGovernanceService.getActiveInstanceForOrganization).mockResolvedValue(instance)
    vi.mocked(crmScoringService.getModel).mockResolvedValue({ model, rules: [rule] })
  })
  afterEach(() => { document.body.innerHTML = ''; vi.clearAllMocks() })

  it('decide quem edita pelo papel', () => {
    expect(canEditLeadScoring('client_admin')).toBe(true)
    expect(canEditLeadScoring('manager')).toBe(true)
    expect(canEditLeadScoring('seller')).toBe(false)
    expect(canEditLeadScoring(undefined, 'yux_admin')).toBe(true)
    expect(canEditLeadScoring(undefined, 'client_member')).toBe(false)
    expect(combineScore(80, 60, 50, 50)).toBe(70)
    expect(combineScore(80, 60, 0, 0)).toBe(70)
  })

  it('para quem não edita mostra só a explicação e a pontuação dos leads, sem controles', async () => {
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue(governanceFor('seller'))
    const { container, root } = await render()
    const text = container.textContent || ''

    expect(text).toContain('Como a pontuação funciona')
    expect(text).toContain('Exemplo:')
    expect(text).toContain('Ana Lead')
    expect(text).toContain('82/100')
    expect(text).toContain('Seu perfil pode consultar a pontuação, mas não alterar as regras')
    for (const hidden of ['Salvar modelo', 'Adicionar regra', 'Simular', 'Modelo de pontuação', 'Regras por ação']) expect(text, hidden).not.toContain(hidden)
    expect(container.querySelector('form')).toBeNull()
    expect(container.querySelector('select')).toBeNull()
    act(() => root.unmount())
  })

  it('para quem edita mostra modelo, regras e simulação com a ação escolhida em estado controlado', async () => {
    vi.mocked(crmGovernanceService.getGovernanceContext).mockResolvedValue(governanceFor('client_admin'))
    vi.mocked(crmScoringService.simulate).mockResolvedValue({
      persisted: false, appliedRules: [{ id: 'rule-1', name: 'Abriu e-mail', dimension: 'intent', points: 10 }],
      currentFitScore: 90, currentIntentScore: 74, resultingFitScore: 90, resultingIntentScore: 84, resultingCombinedScore: 87,
    })
    const { container, root } = await render()
    const text = container.textContent || ''
    for (const visible of ['Modelo de pontuação', 'Regras por ação', 'Simular uma ação', 'Salvar modelo', 'Adicionar regra', 'Abriu e-mail']) expect(text, visible).toContain(visible)
    expect(text).not.toContain('Seu perfil pode consultar')

    const setSelect = async (id: string, value: string) => act(async () => {
      const select = container.querySelector<HTMLSelectElement>(`#${id}`)!
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await setSelect('score-simulation-lead', 'lead-1')
    await setSelect('score-simulation-event', 'email.opened')
    await act(async () => {
      [...container.querySelectorAll('button')].find(button => button.textContent === 'Simular')!.click()
      await Promise.resolve()
    })
    expect(crmScoringService.simulate).toHaveBeenCalledWith({ crmInstanceId: 'instance-1', leadId: 'lead-1', eventType: 'email.opened' })
    expect(container.textContent).toContain('Resultado previsto: Perfil 90/100 · Interesse 84/100 · Pontuação 87/100')
    act(() => root.unmount())
  })
})
