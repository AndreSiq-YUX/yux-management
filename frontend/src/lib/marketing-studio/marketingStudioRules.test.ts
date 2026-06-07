import { describe, expect, it } from 'vitest'
import {
  buildSimpleKnowledgeChunks,
  composeAgentPrompt,
  canTransitionContentStatus,
  calculateCreditsForAction,
  canScheduleContent,
  canSubmitContentForReview,
  filterToolsByPolicies,
  getNextVersionNumber,
  isBrandProfileReady,
  rankKnowledgeMatches,
  requiresHumanApproval,
  sanitizeBrandProfileForPortal,
  sanitizeMarketingContentForPortal,
  selectAllowedAgentTools,
  selectModelRoute,
  shouldBlockCreditDebit,
  shouldBlockAgentRun,
  statusAfterReviewDecision,
  summarizeHarnessTelemetry,
  summarizeKnowledgeCoverage,
  summarizeReviewQueue,
} from './marketingStudioRules'
import type { MarketingBrandProfile, MarketingContentItem, MarketingKnowledgeChunk, MarketingStudioSettings } from '@/types/marketingStudio'

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
  allowedChannels: ['linkedin', 'instagram', 'blog', 'newsletter'],
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

const content: MarketingContentItem = {
  id: 'content-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  title: 'Post sobre funil',
  contentType: 'social_post',
  channel: 'linkedin',
  status: 'draft',
  brief: 'Explicar funil comercial para PMEs',
  body: 'Texto interno',
  cta: 'Fale com a YUX',
  createdByAgentId: 'agent-1',
  internalNotes: 'Margem e custo interno',
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

const brandProfile: MarketingBrandProfile = {
  id: 'brand-1',
  organizationId: 'org-1',
  clientId: 'client-1',
  contractId: 'contract-1',
  toneOfVoice: 'consultivo',
  persona: 'especialista pragmatica',
  brandVoiceSummary: 'Comunicacao clara, direta e consultiva para PMEs.',
  vocabularyDo: ['clareza'],
  vocabularyDont: ['garantido'],
  forbiddenTopics: ['promessa garantida'],
  priorityTopics: ['ia aplicada'],
  visualGuidelines: 'minimalista',
  complianceNotes: 'Nao prometer resultado financeiro',
  status: 'active',
  createdAt: '2026-06-05T12:00:00.000Z',
  updatedAt: '2026-06-05T12:00:00.000Z',
}

describe('marketingStudioRules', () => {
  it('requires human approval for publish and sensitive actions', () => {
    expect(requiresHumanApproval({ action: 'publish_wordpress', settings })).toBe(true)
    expect(requiresHumanApproval({ action: 'generate_short_caption', settings })).toBe(false)
    expect(requiresHumanApproval({ action: 'regulated_claim', settings })).toBe(true)
  })

  it('allows explicit content workflow transitions only', () => {
    expect(canTransitionContentStatus('draft', 'in_review')).toBe(true)
    expect(canTransitionContentStatus('in_review', 'approved')).toBe(true)
    expect(canTransitionContentStatus('approved', 'scheduled')).toBe(true)
    expect(canTransitionContentStatus('draft', 'published')).toBe(false)
    expect(canTransitionContentStatus('rejected', 'published')).toBe(false)
  })

  it('calculates credits by action and premium multiplier', () => {
    expect(calculateCreditsForAction({ action: 'classify_idea' })).toBe(1)
    expect(calculateCreditsForAction({ action: 'generate_blog_article' })).toBe(30)
    expect(calculateCreditsForAction({ action: 'generate_image', premium: true })).toBe(60)
  })

  it('blocks debit when balance or monthly limit is exceeded', () => {
    expect(shouldBlockCreditDebit({ balance: 4, monthlyUsed: 100, monthlyLimit: 500, debit: 5 })).toBe(true)
    expect(shouldBlockCreditDebit({ balance: 20, monthlyUsed: 499, monthlyLimit: 500, debit: 2 })).toBe(true)
    expect(shouldBlockCreditDebit({ balance: 20, monthlyUsed: 100, monthlyLimit: 500, debit: 5 })).toBe(false)
  })

  it('limits agent tools by agent type and operation mode', () => {
    expect(selectAllowedAgentTools({ agentType: 'content_radar', operationMode: 'managed_by_yux' })).toEqual([
      'jina_reader',
      'jina_search',
      'curated_sources',
    ])
    expect(selectAllowedAgentTools({ agentType: 'controlled_publisher', operationMode: 'assisted_client' })).toEqual([
      'create_task',
      'create_wordpress_draft',
    ])
  })

  it('removes internal fields from portal content', () => {
    expect(sanitizeMarketingContentForPortal(content)).toEqual({
      id: 'content-1',
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: 'Post sobre funil',
      contentType: 'social_post',
      channel: 'linkedin',
      status: 'draft',
      brief: 'Explicar funil comercial para PMEs',
      body: 'Texto interno',
      cta: 'Fale com a YUX',
      createdByAgentId: 'agent-1',
      createdAt: '2026-06-05T12:00:00.000Z',
      updatedAt: '2026-06-05T12:00:00.000Z',
    })
  })

  it('calculates next version number from existing content versions', () => {
    expect(getNextVersionNumber([])).toBe(1)
    expect(getNextVersionNumber([{ versionNumber: 1 }, { versionNumber: 3 }])).toBe(4)
  })

  it('allows review submission only for drafted content with body', () => {
    expect(canSubmitContentForReview(content)).toBe(true)
    expect(canSubmitContentForReview({ ...content, body: '' })).toBe(false)
    expect(canSubmitContentForReview({ ...content, status: 'published' })).toBe(false)
  })

  it('maps review decisions to editorial status', () => {
    expect(statusAfterReviewDecision('approved')).toBe('approved')
    expect(statusAfterReviewDecision('changes_requested')).toBe('changes_requested')
    expect(statusAfterReviewDecision('rejected')).toBe('rejected')
    expect(statusAfterReviewDecision('pending')).toBe('in_review')
  })

  it('blocks scheduling unless content is approved and the slot is free', () => {
    const future = new Date(Date.now() + 86_400_000).toISOString()
    expect(canScheduleContent({ content: { ...content, status: 'approved' }, startsAt: future })).toBe(true)
    expect(canScheduleContent({ content, startsAt: future })).toBe(false)
    expect(canScheduleContent({
      content: { ...content, status: 'approved' },
      startsAt: future,
      existingCalendarItems: [{ contentItemId: content.id, startsAt: future, status: 'planned' }],
    })).toBe(false)
  })

  it('summarizes review queue status counts', () => {
    expect(summarizeReviewQueue([
      {
        id: 'review-1',
        contentItemId: 'content-1',
        status: 'pending',
        checklist: {},
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
      },
      {
        id: 'review-2',
        contentItemId: 'content-2',
        status: 'changes_requested',
        checklist: {},
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
      },
    ])).toEqual({ pending: 1, approved: 0, changesRequested: 1, rejected: 0 })
  })

  it('marks brand profile ready only when active and descriptive', () => {
    expect(isBrandProfileReady(brandProfile)).toBe(true)
    expect(isBrandProfileReady({ ...brandProfile, status: 'draft' })).toBe(false)
    expect(isBrandProfileReady({ ...brandProfile, brandVoiceSummary: 'curto' })).toBe(false)
  })

  it('removes compliance notes from portal brand profile', () => {
    expect(sanitizeBrandProfileForPortal(brandProfile)).not.toHaveProperty('complianceNotes')
  })

  it('builds simple knowledge chunks from paragraphs', () => {
    const longParagraph = 'Primeiro paragrafo com contexto de marca para alimentar o RAG simples. '.repeat(4)
    const secondParagraph = 'Segundo paragrafo com servicos, provas, objeções e CTAs para orientar redatores. '.repeat(4)
    expect(buildSimpleKnowledgeChunks({
      title: 'Marca',
      body: `${longParagraph}\n\n${secondParagraph}`,
      maxChars: 30,
    })).toEqual([
      expect.objectContaining({ title: 'Marca', chunkIndex: 0 }),
      expect.objectContaining({ title: 'Marca', chunkIndex: 1 }),
    ])
  })

  it('ranks knowledge chunks with text fallback', () => {
    const chunks: MarketingKnowledgeChunk[] = [
      {
        id: 'chunk-1',
        organizationId: 'org-1',
        clientId: 'client-1',
        contractId: 'contract-1',
        chunkIndex: 0,
        title: 'CRM',
        body: 'Conteudo sobre CRM e funil comercial',
        tokenCount: 10,
        metadata: {},
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
      },
      {
        id: 'chunk-2',
        organizationId: 'org-1',
        clientId: 'client-1',
        contractId: 'contract-1',
        chunkIndex: 1,
        title: 'Financeiro',
        body: 'Conteudo sobre cobranca',
        tokenCount: 8,
        metadata: {},
        createdAt: '2026-06-05T12:00:00.000Z',
        updatedAt: '2026-06-05T12:00:00.000Z',
      },
    ]
    expect(rankKnowledgeMatches({ query: 'crm funil', chunks })[0].chunkId).toBe('chunk-1')
  })

  it('summarizes marketing knowledge coverage', () => {
    expect(summarizeKnowledgeCoverage({
      brandProfile,
      products: [{
        id: 'product-1',
        organizationId: 'org-1',
        clientId: 'client-1',
        contractId: 'contract-1',
        name: 'CRM',
        description: '',
        proofPoints: [],
        objections: [],
        status: 'active',
        metadata: {},
        createdAt: '',
        updatedAt: '',
      }],
      documents: [{ status: 'published' }, { status: 'draft' }],
      chunks: [],
    })).toEqual({ brandReady: true, activeProducts: 1, publishedDocuments: 1, chunks: 0 })
  })

  it('composes layered agent prompts for the harness', () => {
    const prompt = composeAgentPrompt({
      globalPrompt: {
        systemPrompt: 'System prompt global da YUX.',
        promptVersion: 2,
        defaultContextPolicy: { includeBrandProfile: true },
        defaultQualityGates: { minimumQualityScore: 70 },
      },
      agent: {
        name: 'Redator do cliente',
        basePrompt: 'Use exemplos aprovados do cliente.',
        promptConfig: { channel: 'linkedin' },
        contextPolicy: { includeProducts: true },
        qualityGates: { minimumQualityScore: 80 },
        promptVersion: 3,
      },
      context: {
        objective: 'Gerar post',
        brandSummary: 'Marca consultiva',
        products: ['CRM YUX'],
        knowledgeSnippets: ['A marca fala com clareza'],
      },
    })

    expect(prompt.systemPrompt).toBe('System prompt global da YUX.')
    expect(prompt.agentPrompt).toBe('Use exemplos aprovados do cliente.')
    expect(prompt.contextBlock).toContain('Marca consultiva')
    expect(prompt.promptConfig).toMatchObject({
      includeBrandProfile: true,
      includeProducts: true,
      channel: 'linkedin',
      minimumQualityScore: 80,
    })
    expect(prompt.promptVersions).toEqual({ global: 2, agent: 3 })
  })

  it('selects model routes by agent override before type defaults', () => {
    const route = selectModelRoute({
      agent: {
        id: 'agent-1',
        agentType: 'multichannel_writer',
        defaultModel: 'model-from-agent',
        fallbackModel: 'fallback-from-agent',
      },
      tier: 'default',
      routes: [
        {
          id: 'route-type',
          agentType: 'multichannel_writer',
          routingTier: 'default',
          provider: 'openrouter',
          modelName: 'type-model',
          maxInputTokens: 8000,
          maxOutputTokens: 1200,
          temperature: 0.4,
          maxCostPerRun: 0,
          status: 'active',
          createdAt: '2026-06-06T12:00:00.000Z',
          updatedAt: '2026-06-06T12:00:00.000Z',
        },
        {
          id: 'route-agent',
          agentId: 'agent-1',
          agentType: 'multichannel_writer',
          routingTier: 'default',
          provider: 'openrouter',
          modelName: 'agent-model',
          maxInputTokens: 8000,
          maxOutputTokens: 1200,
          temperature: 0.5,
          maxCostPerRun: 0,
          status: 'active',
          createdAt: '2026-06-06T12:00:00.000Z',
          updatedAt: '2026-06-06T12:00:00.000Z',
        },
      ],
    })

    expect(route.modelName).toBe('agent-model')
  })

  it('filters tools and blocks agent runs by policy', () => {
    expect(filterToolsByPolicies({
      agent: {
        id: 'agent-1',
        agentType: 'multichannel_writer',
        allowedTools: ['rag_search', 'jina_grounding'],
      },
      policies: [
        {
          id: 'policy-1',
          organizationId: 'org-1',
          clientId: 'client-1',
          contractId: 'contract-1',
          agentType: 'multichannel_writer',
          toolKey: 'jina_grounding',
          enabled: false,
          requiresHumanApproval: true,
          maxCallsPerRun: 1,
          config: {},
          createdAt: '2026-06-06T12:00:00.000Z',
          updatedAt: '2026-06-06T12:00:00.000Z',
        },
      ],
    })).toEqual(['rag_search'])

    expect(shouldBlockAgentRun({
      estimatedCredits: 15,
      estimatedCost: 0.2,
      runsToday: 1,
      policy: {
        id: 'budget-1',
        organizationId: 'org-1',
        clientId: 'client-1',
        contractId: 'contract-1',
        agentType: 'multichannel_writer',
        maxCostPerRun: 1,
        maxCreditsPerRun: 10,
        maxRunsPerDay: 5,
        monthlyCreditLimit: 300,
        requireApprovalOverCredits: 20,
        status: 'active',
        createdAt: '2026-06-06T12:00:00.000Z',
        updatedAt: '2026-06-06T12:00:00.000Z',
      },
    })).toBe(true)
  })

  it('summarizes harness telemetry for internal operations', () => {
    expect(summarizeHarnessTelemetry({
      workflowRuns: [
        {
          id: 'run-1',
          organizationId: 'org-1',
          clientId: 'client-1',
          contractId: 'contract-1',
          status: 'queued',
          runType: 'manual',
          inputPayload: {},
          contextSnapshot: {},
          resultPayload: {},
          creditDebit: 0,
          rawCostEstimate: 0,
          createdAt: '2026-06-06T12:00:00.000Z',
          updatedAt: '2026-06-06T12:00:00.000Z',
        },
        {
          id: 'run-2',
          organizationId: 'org-1',
          clientId: 'client-1',
          contractId: 'contract-1',
          status: 'failed',
          runType: 'manual',
          inputPayload: {},
          contextSnapshot: {},
          resultPayload: {},
          creditDebit: 0,
          rawCostEstimate: 0,
          createdAt: '2026-06-06T12:00:00.000Z',
          updatedAt: '2026-06-06T12:00:00.000Z',
        },
      ],
      agentRuns: [
        {
          id: 'agent-run-1',
          workflowRunId: 'run-1',
          agentType: 'multichannel_writer',
          status: 'succeeded',
          promptConfigSnapshot: {},
          inputPayload: {},
          outputPayload: {},
          qualityScore: 80,
          inputTokens: 100,
          outputTokens: 50,
          rawCostEstimate: 0.02,
          creditsCharged: 5,
          createdAt: '2026-06-06T12:00:00.000Z',
        },
        {
          id: 'agent-run-2',
          workflowRunId: 'run-2',
          agentType: 'brand_quality_reviewer',
          status: 'failed',
          promptConfigSnapshot: {},
          inputPayload: {},
          outputPayload: {},
          qualityScore: 60,
          inputTokens: 100,
          outputTokens: 50,
          rawCostEstimate: 0.02,
          creditsCharged: 3,
          createdAt: '2026-06-06T12:00:00.000Z',
        },
      ],
    })).toMatchObject({
      queuedWorkflowRuns: 1,
      failedWorkflowRuns: 1,
      totalCredits: 8,
      averageQualityScore: 70,
    })
  })
})
