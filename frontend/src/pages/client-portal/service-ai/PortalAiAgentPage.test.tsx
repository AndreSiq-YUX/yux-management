import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { usePlatformStore } from '@/stores/platformStore'

const contextMock = vi.hoisted(() => vi.fn())
const getActiveAssistant = vi.hoisted(() => vi.fn())

vi.mock('@/services/aiAssistantService', () => ({
  aiAssistantService: { getActiveAssistant },
}))

vi.mock('@/components/ai-assistant/AssistantSettingsPanel', () => ({
  AssistantSettingsPanel: ({ organizationId, assistant }: { organizationId: string; assistant?: { name: string } | null }) => (
    <div data-testid="assistant-settings-panel">Painel de configuração {organizationId} {assistant?.name}</div>
  ),
}))

vi.mock('@/hooks/usePortalMarketingContext', () => ({
  usePortalMarketingContext: contextMock,
}))

import { PortalAiAgentPage } from './PortalAiAgentPage'

function mockContext(workflowRuns: unknown[]) {
  contextMock.mockReturnValue({
    loading: false,
    error: null,
    agents: [],
    workflowRuns,
    knowledgeDocuments: [],
    knowledgeMatches: [],
    brandProfile: null,
  })
}

const assistant = {
  id: 'assistant-1',
  organizationId: 'org-1',
  name: 'Sofia',
  tone: 'consultivo',
  status: 'active',
  summaryEnabled: true,
  classificationEnabled: true,
  objectives: [{ id: 'o1', label: 'Qualificar lead', objectiveType: 'lead_qualification' }],
  requiredFields: [{ id: 'f1', fieldKey: 'phone', label: 'Telefone' }],
  handoffRules: [{ id: 'h1', name: 'Pedido de atendente', ruleType: 'human_request', conditions: {}, isEnabled: true }],
  safetyRules: [],
  knowledgeLinks: [{ id: 'k1', title: 'FAQ de preços', status: 'published' }],
  createdAt: '2026-06-03T12:00:00.000Z',
  updatedAt: '2026-06-03T12:00:00.000Z',
}

const setAccess = (permissions: string[]) => usePlatformStore.setState({
  organization: { id: 'org-1' } as never,
  role: { key: 'client_admin', name: 'Admin da conta', scope: 'client', permissions } as never,
})

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

function renderPage() {
  const container = document.body.appendChild(document.createElement('div'))
  const root = createRoot(container)
  act(() => root.render(<MemoryRouter><PortalAiAgentPage /></MemoryRouter>))
  return { container, root }
}

afterEach(() => {
  document.body.innerHTML = ''
  contextMock.mockReset()
  getActiveAssistant.mockReset()
  usePlatformStore.setState({ role: null, organization: null, mode: 'internal' })
})

describe('PortalAiAgentPage', () => {
  it('shows readable run names and never the workflow id or the raw error', () => {
    mockContext([
      {
        id: 'run-1',
        workflowId: '3f2b6c1e-9d4a-4a57-8c0e-123456789abc',
        status: 'failed',
        runType: 'scheduled',
        errorMessage: 'provider timeout: stack trace internal',
        createdAt: '2026-10-01T12:00:00.000Z',
      },
    ])
    const { container, root } = renderPage()
    const text = container.textContent || ''

    expect(text).toContain('Execução agendada')
    expect(text).toContain('A execução falhou. A equipe YUX foi avisada.')
    expect(text).not.toContain('3f2b6c1e')
    expect(text).not.toContain('provider timeout')
    expect(text).not.toContain('Fluxo de IA')

    act(() => root.unmount())
  })

  it('marks unanswered questions and agent test as pending', () => {
    mockContext([])
    const { container, root } = renderPage()
    const text = container.textContent || ''

    expect(text).toContain('Perguntas sem resposta')
    expect(text).not.toContain('Ainda nao ha um contrato')
    const testButton = Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Testar o agente'))
    expect(testButton?.textContent).toContain('Pendente')
    expect(container.querySelectorAll('[aria-label^="Pendente"]').length).toBeGreaterThanOrEqual(2)
    expect(text).toContain('Prontidão do agente')
    expect(text).toContain('Execuções recentes')

    act(() => root.unmount())
  })

  it('renders the editable assistant configuration for users who can configure', async () => {
    mockContext([])
    getActiveAssistant.mockResolvedValue(assistant)
    setAccess(['omnichannel.configure'])
    const { container, root } = renderPage()
    await flush()

    const panel = container.querySelector('[data-testid="assistant-settings-panel"]')
    expect(panel?.textContent).toContain('org-1')
    expect(panel?.textContent).toContain('Sofia')
    expect(container.textContent).toContain('Configuração do agente')
    expect(container.textContent).not.toContain('Resumo somente leitura')

    act(() => root.unmount())
  })

  it('also lets platform managers configure the assistant', async () => {
    mockContext([])
    getActiveAssistant.mockResolvedValue(null)
    setAccess(['platform.manage'])
    const { container, root } = renderPage()
    await flush()

    expect(container.querySelector('[data-testid="assistant-settings-panel"]')).toBeTruthy()
    act(() => root.unmount())
  })

  it('shows a read-only summary without the configuration panel for other roles', async () => {
    mockContext([])
    getActiveAssistant.mockResolvedValue(assistant)
    setAccess([])
    const { container, root } = renderPage()
    await flush()
    const text = container.textContent || ''

    expect(container.querySelector('[data-testid="assistant-settings-panel"]')).toBeNull()
    expect(text).toContain('Como o agente atende')
    expect(text).toContain('Sofia')
    expect(text).toContain('Qualificar lead')
    expect(text).toContain('Telefone')
    expect(text).toContain('Pedido de atendente')
    expect(text).toContain('FAQ de preços')
    expect(text).toContain('Resumo somente leitura')

    act(() => root.unmount())
  })

  it('explains when no assistant is configured and links the tone summary to Marca e tom de voz', async () => {
    mockContext([])
    getActiveAssistant.mockResolvedValue(null)
    setAccess([])
    const { container, root } = renderPage()
    await flush()

    expect(container.textContent).toContain('O agente ainda não foi configurado')
    const link = Array.from(container.querySelectorAll('a')).find(item => item.textContent?.includes('Ajustar em Marca e tom de voz'))
    expect(link?.getAttribute('href')).toBe('/portal/empresa/marca')
    act(() => root.unmount())
  })
})
