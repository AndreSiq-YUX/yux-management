import { act } from 'react-dom/test-utils'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { MarketingStudioWorkspace } from './MarketingStudioWorkspace'
import type {
  MarketingAgent,
  MarketingAgentRun,
  MarketingAgentToolPolicy,
  MarketingCalendarItem,
  MarketingBrandProfile,
  MarketingContentItem,
  MarketingContentReview,
  MarketingContentVersion,
  MarketingKnowledgeChunk,
  MarketingKnowledgeDocument,
  MarketingKnowledgeMatch,
  MarketingIdea,
  MarketingProductService,
  MarketingRadarRun,
  MarketingSource,
  MarketingSourceItem,
  MarketingStudioSettings,
  MarketingToolRun,
  MarketingWorkflow,
  MarketingWorkflowRun,
  ModelRoutingRule,
} from '@/types/marketingStudio'

const settings: MarketingStudioSettings = {
  id: 'settings-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  operationMode: 'managed_by_yux',
  monthlyCreditLimit: 500,
  currentCreditBalance: 120,
  approvalPolicy: {
    publishSocial: true,
    publishWordPress: true,
    paidCampaignDraft: true,
    premiumImage: true,
    regulatedContent: true,
  },
  allowedChannels: ['linkedin', 'instagram', 'blog'],
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

const contents: MarketingContentItem[] = [
  {
    id: 'content-1',
    organizationId: 'org-1',
    clientId: 'client-1',
    contractId: 'contract-1',
    title: 'Post sobre funil',
    contentType: 'social_post',
    channel: 'linkedin',
    status: 'in_review',
    body: 'Texto',
    internalNotes: 'Custo interno R$ 12',
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
  {
    id: 'content-2',
    organizationId: 'org-1',
    clientId: 'client-1',
    contractId: 'contract-1',
    title: 'Artigo mensal',
    contentType: 'blog_article',
    channel: 'blog',
    status: 'scheduled',
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
]

const reviews: MarketingContentReview[] = [
  {
    id: 'review-1',
    contentItemId: 'content-1',
    status: 'pending',
    comments: 'Validar promessa comercial',
    checklist: { cta: true },
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
]

const calendarItems: MarketingCalendarItem[] = [
  {
    id: 'calendar-1',
    organizationId: 'org-1',
    clientId: 'client-1',
    contractId: 'contract-1',
    contentItemId: 'content-2',
    title: 'Artigo mensal',
    channel: 'blog',
    status: 'scheduled',
    startsAt: '2026-06-10T12:00:00.000Z',
    metadata: {},
    createdAt: '2026-06-05T12:00:00.000Z',
    updatedAt: '2026-06-05T12:00:00.000Z',
  },
]

const versionsByContent: Record<string, MarketingContentVersion[]> = {
  'content-1': [
    {
      id: 'version-1',
      contentItemId: 'content-1',
      versionNumber: 1,
      title: 'Post sobre funil',
      body: 'Texto',
      createdAt: '2026-06-05T12:00:00.000Z',
    },
  ],
}

const brandProfile: MarketingBrandProfile = {
  id: 'brand-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  toneOfVoice: 'consultivo',
  persona: 'especialista',
  brandVoiceSummary: 'Marca consultiva e direta para PMEs.',
  vocabularyDo: [],
  vocabularyDont: [],
  forbiddenTopics: [],
  priorityTopics: [],
  complianceNotes: 'Sem promessas garantidas',
  status: 'active',
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

const productsServices: MarketingProductService[] = [{
  id: 'product-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  name: 'CRM YUX',
  description: 'CRM comercial',
  valueProposition: 'Organizar pipeline',
  proofPoints: [],
  objections: [],
  status: 'active',
  metadata: {},
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}]

const knowledgeDocuments: MarketingKnowledgeDocument[] = [{
  id: 'doc-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  title: 'Guia da marca',
  documentType: 'brand',
  status: 'published',
  metadata: {},
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}]

const knowledgeChunks: MarketingKnowledgeChunk[] = [{
  id: 'chunk-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  documentId: 'doc-1',
  chunkIndex: 0,
  title: 'Guia da marca',
  body: 'A marca fala com clareza.',
  tokenCount: 8,
  metadata: {},
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}]

const knowledgeMatches: MarketingKnowledgeMatch[] = [{
  chunkId: 'chunk-1',
  documentId: 'doc-1',
  title: 'Guia da marca',
  body: 'A marca fala com clareza.',
  rank: 1,
}]

const agents: MarketingAgent[] = [{
  id: 'agent-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  name: 'Redator do cliente',
  agentType: 'multichannel_writer',
  description: 'Agente de escrita',
  status: 'active',
  defaultModel: 'openai/gpt-4o-mini',
  allowedTools: ['rag_search'],
  requiresHumanApproval: true,
  basePrompt: 'Use exemplos aprovados do cliente.',
  promptConfig: { channel: 'linkedin' },
  contextPolicy: { includeProducts: true },
  qualityGates: { minimumQualityScore: 80 },
  modelParameters: { temperature: 0.6 },
  promptVersion: 3,
  createdAt: '2026-06-06T12:00:00.000Z',
  updatedAt: '2026-06-06T12:00:00.000Z',
}]

const workflows: MarketingWorkflow[] = [{
  id: 'workflow-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  workflowKey: 'post_creation',
  name: 'Criacao de post',
  description: 'Fluxo provider-neutral',
  status: 'active',
  triggerType: 'manual',
  config: {},
  createdAt: '2026-06-06T12:00:00.000Z',
  updatedAt: '2026-06-06T12:00:00.000Z',
}]

const workflowRuns: MarketingWorkflowRun[] = [{
  id: 'run-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  workflowId: 'workflow-1',
  status: 'queued',
  runType: 'manual',
  inputPayload: { topic: 'CRM' },
  contextSnapshot: {},
  resultPayload: {},
  creditDebit: 5,
  rawCostEstimate: 0.1,
  createdAt: '2026-06-06T12:00:00.000Z',
  updatedAt: '2026-06-06T12:00:00.000Z',
}]

const agentRuns: MarketingAgentRun[] = [{
  id: 'agent-run-1',
  workflowRunId: 'run-1',
  agentId: 'agent-1',
  agentType: 'multichannel_writer',
  status: 'succeeded',
  promptConfigSnapshot: { channel: 'linkedin' },
  inputPayload: {},
  outputPayload: { title: 'Post' },
  qualityScore: 82,
  inputTokens: 100,
  outputTokens: 50,
  rawCostEstimate: 0.02,
  creditsCharged: 5,
  createdAt: '2026-06-06T12:00:00.000Z',
}]

const toolRuns: MarketingToolRun[] = [{
  id: 'tool-run-1',
  workflowRunId: 'run-1',
  agentRunId: 'agent-run-1',
  toolKey: 'rag_search',
  status: 'succeeded',
  inputPayload: {},
  outputPayload: {},
  rawCostEstimate: 0,
  creditsCharged: 1,
  createdAt: '2026-06-06T12:00:00.000Z',
}]

const modelRoutes: ModelRoutingRule[] = [{
  id: 'route-1',
  agentType: 'multichannel_writer',
  routingTier: 'default',
  provider: 'openrouter',
  modelName: 'openai/gpt-4o-mini',
  maxInputTokens: 12000,
  maxOutputTokens: 2200,
  temperature: 0.7,
  maxCostPerRun: 0,
  status: 'active',
  createdAt: '2026-06-06T12:00:00.000Z',
  updatedAt: '2026-06-06T12:00:00.000Z',
}]

const toolPolicies: MarketingAgentToolPolicy[] = [{
  id: 'policy-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  agentType: 'multichannel_writer',
  toolKey: 'rag_search',
  enabled: true,
  requiresHumanApproval: false,
  maxCallsPerRun: 3,
  config: {},
  createdAt: '2026-06-06T12:00:00.000Z',
  updatedAt: '2026-06-06T12:00:00.000Z',
}]

const sources: MarketingSource[] = [{
  id: 'source-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  sourceType: 'blog',
  name: 'Blog do cliente',
  sourceUrl: 'https://example.com',
  status: 'active',
  metadata: {},
  createdAt: '2026-06-07T12:00:00.000Z',
  updatedAt: '2026-06-07T12:00:00.000Z',
}]

const sourceItems: MarketingSourceItem[] = [{
  id: 'source-item-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  sourceId: 'source-1',
  itemType: 'article',
  title: 'Tendencia de CRM para PMEs',
  sourceUrl: 'https://example.com/crm',
  normalizedUrl: 'https://example.com/crm',
  summary: 'Resumo da tendencia',
  language: 'pt',
  contentHash: 'hash',
  dedupeKey: 'https://example.com/crm',
  relevanceScore: 90,
  noveltyScore: 70,
  commercialScore: 80,
  status: 'captured',
  metadata: {},
  createdAt: '2026-06-07T12:00:00.000Z',
  updatedAt: '2026-06-07T12:00:00.000Z',
}]

const radarRuns: MarketingRadarRun[] = [{
  id: 'radar-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  status: 'completed',
  query: 'crm para pmes',
  sourceCount: 1,
  itemCount: 1,
  ideaCount: 1,
  rejectedCount: 0,
  summary: 'Radar semanal',
  metadata: {},
  createdAt: '2026-06-07T12:00:00.000Z',
  updatedAt: '2026-06-07T12:00:00.000Z',
}]

const ideas: MarketingIdea[] = [{
  id: 'idea-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  title: 'Post sobre CRM para PMEs',
  summary: 'Ideia gerada pelo Radar',
  status: 'curated',
  sourceType: 'radar',
  sourceItemId: 'source-item-1',
  radarRunId: 'radar-1',
  priority: 'high',
  opportunityScore: 82,
  suggestedChannel: 'linkedin',
  createdAt: '2026-06-07T12:00:00.000Z',
  updatedAt: '2026-06-07T12:00:00.000Z',
}]

describe('MarketingStudioWorkspace', () => {
  it('renders internal metrics, tabs, content, and internal operational details', () => {
    const container = document.createElement('div')
    const root = createRoot(container)
    const onRefresh = vi.fn()
    const onSubmitForReview = vi.fn()
    const onApproveReview = vi.fn()
    const onSearchKnowledge = vi.fn()

    act(() => {
      root.render(
        <MarketingStudioWorkspace
          contents={contents}
          settings={settings}
          onRefresh={onRefresh}
          reviews={reviews}
          calendarItems={calendarItems}
          versionsByContent={versionsByContent}
          brandProfile={brandProfile}
          productsServices={productsServices}
          knowledgeDocuments={knowledgeDocuments}
          knowledgeChunks={knowledgeChunks}
          knowledgeMatches={knowledgeMatches}
          agents={agents}
          workflows={workflows}
          workflowRuns={workflowRuns}
          agentRuns={agentRuns}
          toolRuns={toolRuns}
          modelRoutes={modelRoutes}
          toolPolicies={toolPolicies}
          sources={sources}
          sourceItems={sourceItems}
          radarRuns={radarRuns}
          ideas={ideas}
          onSubmitForReview={onSubmitForReview}
          onApproveReview={onApproveReview}
          onSearchKnowledge={onSearchKnowledge}
        />
      )
    })

    const html = container.innerHTML
    expect(html).toContain('Marketing Studio')
    expect(html).toContain('Conteudos 2')
    expect(html).toContain('Aprovacoes 1')
    expect(html).toContain('Agendados 1')
    expect(html).toContain('Creditos 120')
    expect(html).toContain('Agentes 1')
    expect(html).toContain('Visao geral')
    expect(html).toContain('Conteudo')
    expect(html).toContain('Calendario')
    expect(html).toContain('Aprovacoes')
    expect(html).toContain('Ideias')
    expect(html).toContain('Agentes')
    expect(html).toContain('Creditos')
    expect(html).toContain('Post sobre funil')
    expect(html).toContain('Conteudo organico')
    expect(html).toContain('Fila de aprovacao')
    expect(html).toContain('Calendario editorial')
    expect(html).toContain('Base de conhecimento e tom de voz')
    expect(html).toContain('Marca consultiva e direta')
    expect(html).toContain('CRM YUX')
    expect(html).toContain('1 documentos / 1 chunks')
    expect(html).toContain('Versoes 1')
    expect(html).toContain('Validar promessa comercial')
    expect(html).toContain('managed_by_yux')
    expect(html).toContain('Custo interno R$ 12')
    expect(html).toContain('Agentes e fluxos')
    expect(html).toContain('LangGraph runtime')
    expect(html).toContain('Redator do cliente')
    expect(html).toContain('prompt v3')
    expect(html).toContain('Use exemplos aprovados do cliente.')
    expect(html).toContain('1 workflows / 1 execucoes recentes')
    expect(html).toContain('queued / manual')
    expect(html).toContain('1 agent runs / 1 tool runs')
    expect(html).toContain('openrouter / openai/gpt-4o-mini')
    expect(html).toContain('Ideias e Radar')
    expect(html).toContain('Blog do cliente')
    expect(html).toContain('1 ativas / 1 cadastradas')
    expect(html).toContain('Tendencia de CRM para PMEs')
    expect(html).toContain('score 90/70/80')
    expect(html).toContain('completed / 1 ideias')
    expect(html).toContain('crm para pmes')

    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Atualizar Marketing Studio"]')!.click()
    })
    expect(onRefresh).toHaveBeenCalled()
    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Enviar para revisao"]')!.click()
    })
    expect(onSubmitForReview).toHaveBeenCalledWith('content-1')
    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Aprovar revisao"]')!.click()
    })
    expect(onApproveReview).toHaveBeenCalledWith('review-1')
    act(() => {
      container.querySelector<HTMLButtonElement>('button[title="Buscar conhecimento"]')!.click()
    })
    expect(onSearchKnowledge).toHaveBeenCalledWith('marca produto servico')

    act(() => root.unmount())
  })
})
