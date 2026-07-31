import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Activity, Bot, BrainCircuit, Database, GitBranch, MessageCircle, MessageSquare, PackageCheck, Route, Workflow } from 'lucide-react'
import { AgentHandoffPanel } from '@/components/strategy-engine/AgentHandoffPanel'
import { AgentRecommendationPanel } from '@/components/strategy-engine/AgentRecommendationPanel'
import { StrategyAdminChatPanel } from '@/components/strategy-engine/StrategyAdminChatPanel'
import { StrategyConversationAgentsPanel } from '@/components/strategy-engine/StrategyConversationAgentsPanel'
import { StrategyHarnessPanel } from '@/components/strategy-engine/StrategyHarnessPanel'
import { StrategyKnowledgePanel } from '@/components/strategy-engine/StrategyKnowledgePanel'
import { StrategyModelRoutingPanel } from '@/components/strategy-engine/StrategyModelRoutingPanel'
import { StrategyOverviewPanel } from '@/components/strategy-engine/StrategyOverviewPanel'
import { StrategyPacksPanel } from '@/components/strategy-engine/StrategyPacksPanel'
import { StrategyProfileConfigPanel } from '@/components/strategy-engine/StrategyProfileConfigPanel'
import { strategyEngineService } from '@/services/strategyEngineService'
import type {
  AgentAutonomyPolicy,
  AgentExecutionRun,
  AgentImprovementRecommendation,
  AgentLearningSignal,
  AgentShadowExperiment,
  StrategyAgentBinding,
  StrategyAgentProfile,
  StrategyChatSession,
  StrategyConceptCard,
  StrategyConversationAssistant,
  StrategyIngestionJob,
  StrategyKnowledgeStats,
  StrategyLlmProvider,
  StrategyModelRoute,
  StrategyOrganization,
  StrategyPack,
  StrategyPackBinding,
  StrategyPackItem,
  StrategyRetrievalQuery,
  StrategySkill,
  StrategySourceDocument,
  StrategyWorkflowSpec,
} from '@/types/strategyEngine'

type StrategyAdminData = {
  profiles: StrategyAgentProfile[]
  skills: StrategySkill[]
  cards: StrategyConceptCard[]
  documents: StrategySourceDocument[]
  retrievalQueries: StrategyRetrievalQuery[]
  bindings: StrategyAgentBinding[]
  recommendations: Record<string, unknown>[]
  playbook: Record<string, unknown>[]
  metrics: Record<string, unknown>[]
  handoffs: Record<string, unknown>[]
  providers: StrategyLlmProvider[]
  modelRoutes: StrategyModelRoute[]
  assistants: StrategyConversationAssistant[]
  organizations: StrategyOrganization[]
  chatSessions: StrategyChatSession[]
  strategyPacks: StrategyPack[]
  strategyPackItems: StrategyPackItem[]
  strategyPackBindings: StrategyPackBinding[]
  ingestionJobs: StrategyIngestionJob[]
  knowledgeStats: StrategyKnowledgeStats
  agentRuns: AgentExecutionRun[]
  autonomyPolicies: AgentAutonomyPolicy[]
  workflowSpecs: StrategyWorkflowSpec[]
  learningSignals: AgentLearningSignal[]
  improvementRecommendations: AgentImprovementRecommendation[]
  shadowExperiments: AgentShadowExperiment[]
}

const emptyData: StrategyAdminData = {
  profiles: [],
  skills: [],
  cards: [],
  documents: [],
  retrievalQueries: [],
  bindings: [],
  recommendations: [],
  playbook: [],
  metrics: [],
  handoffs: [],
  providers: [],
  modelRoutes: [],
  assistants: [],
  organizations: [],
  chatSessions: [],
  strategyPacks: [],
  strategyPackItems: [],
  strategyPackBindings: [],
  ingestionJobs: [],
  knowledgeStats: { documents: 0, chunks: 0, assets: 0, cards: 0, retrievals: 0 },
  agentRuns: [],
  autonomyPolicies: [],
  workflowSpecs: [],
  learningSignals: [],
  improvementRecommendations: [],
  shadowExperiments: [],
}

const tabs = [
  { key: 'strategist', label: 'Estrategista YUX', icon: MessageCircle },
  { key: 'overview', label: 'Visao Geral', icon: Activity },
  { key: 'packs', label: 'Strategy Packs', icon: PackageCheck },
  { key: 'knowledge', label: 'Ingestao/RAG', icon: Database },
  { key: 'profiles', label: 'Perfis e Guardrails', icon: Bot },
  { key: 'models', label: 'Modelos por Agente', icon: Route },
  { key: 'assistants', label: 'IAs de Conversa', icon: MessageSquare },
  { key: 'traces', label: 'Execution Trace', icon: GitBranch },
  { key: 'workflows', label: 'Workflows', icon: Workflow },
  { key: 'learning', label: 'Learning', icon: BrainCircuit },
  { key: 'operations', label: 'Operacao', icon: BrainCircuit },
]

export function StrategyEnginePage() {
  const [data, setData] = useState<StrategyAdminData>(emptyData)
  const location = useLocation()
  const [activeTab, setActiveTab] = useState(() => new URLSearchParams(location.search).get('tab') || 'strategist')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [
        profiles,
        skills,
        cards,
        documents,
        retrievalQueries,
        bindings,
        recommendations,
        playbook,
        metrics,
        providers,
        modelRoutes,
        assistants,
        organizations,
        chatSessions,
        strategyPacks,
        strategyPackItems,
        strategyPackBindings,
        ingestionJobs,
        knowledgeStats,
        agentRuns,
        autonomyPolicies,
        workflowSpecs,
        learningSignals,
        improvementRecommendations,
        shadowExperiments,
      ] = await Promise.all([
        strategyEngineService.getAgentProfiles(),
        strategyEngineService.getSkills(),
        strategyEngineService.getConceptCards(),
        strategyEngineService.getSourceDocuments(),
        strategyEngineService.getRetrievalQueries(),
        strategyEngineService.getAgentBindings(),
        strategyEngineService.getRecommendations(),
        strategyEngineService.getObjectionPlaybook(),
        strategyEngineService.getMetricsSnapshots(),
        strategyEngineService.getLlmProviders(),
        strategyEngineService.getModelRoutes(),
        strategyEngineService.getConversationAssistants(),
        strategyEngineService.getClientOrganizations(),
        strategyEngineService.getStrategyChatSessions(),
        strategyEngineService.getStrategyPacks(),
        strategyEngineService.getStrategyPackItems(),
        strategyEngineService.getStrategyPackBindings(),
        strategyEngineService.getStrategyIngestionJobs(),
        strategyEngineService.getKnowledgeStats(),
        strategyEngineService.getAgentExecutionRuns(),
        strategyEngineService.getAgentAutonomyPolicies(),
        strategyEngineService.getStrategyWorkflowSpecs(),
        strategyEngineService.getAgentLearningSignals(),
        strategyEngineService.getAgentImprovementRecommendations(),
        strategyEngineService.getAgentShadowExperiments(),
      ])
      setData({
        profiles,
        skills,
        cards,
        documents,
        retrievalQueries,
        bindings,
        recommendations,
        playbook,
        metrics,
        providers,
        modelRoutes,
        assistants,
        organizations,
        chatSessions,
        strategyPacks,
        strategyPackItems,
        strategyPackBindings,
        ingestionJobs,
        knowledgeStats,
        agentRuns,
        autonomyPolicies,
        workflowSpecs,
        learningSignals,
        improvementRecommendations,
        shadowExperiments,
        handoffs: [],
      })
    } catch (error) {
      console.error('Error loading Strategy Engine:', error)
      setError('Nao foi possivel carregar o Strategy Engine.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  useEffect(() => {
    const tab = new URLSearchParams(location.search).get('tab')
    if (tab && tabs.some(item => item.key === tab)) setActiveTab(tab)
  }, [location.search])

  async function reloadAfter(action: () => Promise<unknown>) {
    await action()
    await load()
  }

  async function refreshChatSessions() {
    const chatSessions = await strategyEngineService.getStrategyChatSessions()
    setData(current => ({ ...current, chatSessions }))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">YUX Strategy Engine</h1>
        <p className="text-gray-600">
          Console de comando para doutrina, skills, RAG, perfis, modelos, IAs conversacionais, handoffs e aprendizado.
        </p>
      </div>

      {loading && <p className="text-sm text-gray-600">Carregando Strategy Engine...</p>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <nav className="flex gap-2 overflow-x-auto border-b border-gray-200 pb-2">
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`inline-flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold ${activeTab === tab.key ? 'bg-yux-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {tab.label}
            </button>
          )
        })}
      </nav>

      {!loading && !error && activeTab === 'strategist' && (
        <StrategyAdminChatPanel
          organizations={data.organizations}
          sessions={data.chatSessions}
          providers={data.providers}
          modelRoutes={data.modelRoutes}
          onRefreshSessions={refreshChatSessions}
        />
      )}

      {!loading && !error && activeTab === 'overview' && (
        <StrategyOverviewPanel
          profiles={data.profiles}
          skills={data.skills}
          providers={data.providers}
          modelRoutes={data.modelRoutes}
          assistants={data.assistants}
          knowledgeStats={data.knowledgeStats}
        />
      )}

      {!loading && !error && activeTab === 'profiles' && (
        <StrategyProfileConfigPanel
          profiles={data.profiles}
          onSave={input => reloadAfter(() => strategyEngineService.updateAgentProfile(input))}
        />
      )}

      {!loading && !error && activeTab === 'models' && (
        <StrategyModelRoutingPanel
          profiles={data.profiles}
          providers={data.providers}
          modelRoutes={data.modelRoutes}
          onSave={input => reloadAfter(() => strategyEngineService.upsertModelRoute(input))}
        />
      )}

      {!loading && !error && activeTab === 'assistants' && (
        <StrategyConversationAgentsPanel
          organizations={data.organizations}
          profiles={data.profiles}
          assistants={data.assistants}
          onSaveAssistant={input => strategyEngineService.upsertConversationAssistant(input)}
          onSaveRule={input => reloadAfter(() => strategyEngineService.upsertAssistantRoutingRule(input))}
        />
      )}

      {!loading && !error && activeTab === 'knowledge' && (
        <StrategyKnowledgePanel
          stats={data.knowledgeStats}
          documents={data.documents}
          cards={data.cards}
          retrievalQueries={data.retrievalQueries}
          bindings={data.bindings}
          packs={data.strategyPacks}
          packItems={data.strategyPackItems}
        />
      )}

      {!loading && !error && activeTab === 'packs' && (
        <StrategyPacksPanel
          packs={data.strategyPacks}
          items={data.strategyPackItems}
          jobs={data.ingestionJobs}
          bindings={data.strategyPackBindings}
          profiles={data.profiles}
          organizations={data.organizations}
          onSavePack={input => reloadAfter(() => strategyEngineService.upsertStrategyPack(input))}
          onSaveItem={input => reloadAfter(() => strategyEngineService.upsertStrategyPackItem(input))}
          onUpdateItemStatus={(id, status) => reloadAfter(() => strategyEngineService.updateStrategyPackItemStatus(id, status))}
          onCreateJob={input => reloadAfter(() => strategyEngineService.createStrategyIngestionJob(input))}
          onSaveBinding={input => reloadAfter(() => strategyEngineService.upsertStrategyPackBinding(input))}
        />
      )}

      {!loading && !error && activeTab === 'traces' && (
        <StrategyHarnessPanel
          view="traces"
          runs={data.agentRuns}
          policies={data.autonomyPolicies}
          workflows={data.workflowSpecs}
          learningSignals={data.learningSignals}
          recommendations={data.improvementRecommendations}
          experiments={data.shadowExperiments}
        />
      )}

      {!loading && !error && activeTab === 'workflows' && (
        <StrategyHarnessPanel
          view="workflows"
          runs={data.agentRuns}
          policies={data.autonomyPolicies}
          workflows={data.workflowSpecs}
          learningSignals={data.learningSignals}
          recommendations={data.improvementRecommendations}
          experiments={data.shadowExperiments}
        />
      )}

      {!loading && !error && activeTab === 'learning' && (
        <StrategyHarnessPanel
          view="learning"
          runs={data.agentRuns}
          policies={data.autonomyPolicies}
          workflows={data.workflowSpecs}
          learningSignals={data.learningSignals}
          recommendations={data.improvementRecommendations}
          experiments={data.shadowExperiments}
        />
      )}

      {!loading && !error && activeTab === 'operations' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Recomendacoes</h2>
            <AgentRecommendationPanel recommendations={data.recommendations} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Handoffs</h2>
            <AgentHandoffPanel handoffs={data.handoffs} />
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Objection Intelligence</h2>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-2xl font-bold text-gray-950">{data.playbook.length}</div>
              <p className="text-sm text-gray-600">Itens de playbook cadastrados para tratamento de objecoes.</p>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-gray-900">Metricas & Cash</h2>
            <div className="rounded-lg border bg-white p-4">
              <div className="text-2xl font-bold text-gray-950">{data.metrics.length}</div>
              <p className="text-sm text-gray-600">Snapshots financeiros disponiveis para priorizacao por caixa.</p>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
