import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StrategyEnginePage } from './StrategyEnginePage'

vi.mock('@/services/strategyEngineService', () => ({
  strategyEngineService: {
    getAgentProfiles: vi.fn(async () => [{ id: 'p1', profileKey: 'crm_controller', description: 'Controle CRM', maxCards: 8, maxChunks: 4 }]),
    getSkills: vi.fn(async () => [{ id: 's1', skill_key: 'yux_crm_controller' }]),
    getConceptCards: vi.fn(async () => [{ id: 'c1', concept: 'Follow-up', problem_solved: 'Lead parado' }]),
    getSourceDocuments: vi.fn(async () => []),
    getKnowledgeStats: vi.fn(async () => ({ documents: 0, chunks: 0, assets: 0, cards: 1, retrievals: 1 })),
    getRetrievalQueries: vi.fn(async () => [{ id: 'r1', profile_key: 'crm_controller', query: 'lead parado' }]),
    getAgentBindings: vi.fn(async () => []),
    getRecommendations: vi.fn(async () => [{ id: 'rec1', profile_key: 'crm_controller', objective: 'Criar tarefa', action: 'Follow-up', audience: 'raised hands', stage: 'raised_hand', metric: 'sla', status: 'pending' }]),
    getObjectionPlaybook: vi.fn(async () => []),
    getMetricsSnapshots: vi.fn(async () => []),
    getAgentExecutionRuns: vi.fn(async () => []),
    getAgentAutonomyPolicies: vi.fn(async () => []),
    getStrategyWorkflowSpecs: vi.fn(async () => []),
    getAgentLearningSignals: vi.fn(async () => []),
    getAgentImprovementRecommendations: vi.fn(async () => []),
    getAgentShadowExperiments: vi.fn(async () => []),
    getLlmProviders: vi.fn(async () => [{ id: 'provider-1', provider_key: 'openrouter', status: 'active', is_default: true }]),
    getModelRoutes: vi.fn(async () => [{ id: 'route-1', agentType: 'crm_controller', routingTier: 'default', provider: 'openrouter', modelName: 'openai/gpt-4.1-mini', status: 'active' }]),
    getConversationAssistants: vi.fn(async () => []),
    getClientOrganizations: vi.fn(async () => [{ id: 'org-1', name: 'Cliente Demo' }]),
    getStrategyChatSessions: vi.fn(async () => [{ id: 'chat-1', title: 'Diagnostico demo', mode: 'diagnostic_48h', profileKey: 'growth_strategist', status: 'active', contextSnapshot: {}, lastMessageAt: '2026-06-12T10:00:00.000Z', createdAt: '2026-06-12T10:00:00.000Z' }]),
    getStrategyChatMessages: vi.fn(async () => [{ id: 'msg-1', sessionId: 'chat-1', role: 'assistant', content: 'Plano inicial', status: 'completed', inputTokens: 0, outputTokens: 0, safeContext: {}, toolResults: [], createdAt: '2026-06-12T10:01:00.000Z' }]),
    runStrategyAdminChat: vi.fn(),
    updateAgentProfile: vi.fn(),
    upsertModelRoute: vi.fn(),
    upsertConversationAssistant: vi.fn(),
    upsertAssistantRoutingRule: vi.fn(),
  },
}))

describe('StrategyEnginePage', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    document.body.removeChild(container)
  })

  it('renders strategy engine admin data', async () => {
    const root = createRoot(container)

    await act(async () => {
      root.render(<StrategyEnginePage />)
    })

    expect(container.textContent).toContain('YUX Strategy Engine')
    expect(container.textContent).toContain('Estrategista YUX')
    expect(container.textContent).toContain('Chat com Estrategista YUX')
    expect(container.textContent).toContain('Diagnostico demo')
    expect(container.textContent).toContain('Modelos por Agente')

    await act(async () => {
      Array.from(container.querySelectorAll('button')).find(button => button.textContent?.includes('Modelos por Agente'))!.click()
    })

    expect(container.textContent).toContain('crm_controller')
  })
})
