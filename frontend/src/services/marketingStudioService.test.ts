import { describe, expect, it } from 'vitest'
import {
  buildContentInsertPayload,
  buildCalendarItemPayload,
  buildBrandProfilePayload,
  buildContentReviewPayload,
  buildContentVersionPayload,
  buildIdeaInsertPayload,
  buildKnowledgeChunkPayload,
  buildKnowledgeDocumentPayload,
  buildAgentPayload,
  buildRadarRunPayload,
  buildResearchCachePayload,
  buildSourceItemPayload,
  buildWorkflowPayload,
  buildWorkflowRunPayload,
  buildProductServicePayload,
  buildUsageLedgerPayload,
  mapAgentBudgetPolicy,
  mapMarketingAgent,
  mapMarketingAgentGlobalPrompt,
  mapMarketingAgentRun,
  mapMarketingAgentTemplate,
  mapMarketingAgentToolPolicy,
  mapMarketingBrandProfile,
  mapMarketingCalendarItem,
  mapMarketingContent,
  mapMarketingContentReview,
  mapMarketingContentVersion,
  mapMarketingKnowledgeChunk,
  mapMarketingKnowledgeDocument,
  mapMarketingKnowledgeMatch,
  mapMarketingIdea,
  mapMarketingProductService,
  mapMarketingRadarRun,
  mapMarketingResearchCacheEntry,
  mapMarketingSettings,
  mapMarketingSource,
  mapMarketingSourceItem,
  mapMarketingToolRun,
  mapMarketingWorkflow,
  mapMarketingWorkflowEdge,
  mapMarketingWorkflowNode,
  mapMarketingWorkflowRun,
  mapModelRoutingRule,
} from './marketingStudioService'

describe('marketingStudioService mapping helpers', () => {
  it('maps settings rows to camelCase domain objects', () => {
    expect(mapMarketingSettings({
      id: 'settings-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      operation_mode: 'managed_by_yux',
      monthly_credit_limit: 500,
      current_credit_balance: 120,
      approval_policy: { publishSocial: true },
      allowed_channels: ['linkedin'],
      tone_of_voice: 'consultivo',
      persona: null,
      visual_preferences: null,
      forbidden_topics: ['promessa garantida'],
      priority_topics: ['ia para pmes'],
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'settings-1',
      organizationId: 'org-1',
      operationMode: 'managed_by_yux',
      monthlyCreditLimit: 500,
      currentCreditBalance: 120,
      allowedChannels: ['linkedin'],
      toneOfVoice: 'consultivo',
    })
  })

  it('builds idea insert payload with trimmed fields', () => {
    expect(buildIdeaInsertPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: '  Topico  ',
      summary: '  Resumo  ',
      sourceType: 'manual',
      priority: 'high',
      opportunityScore: 80,
    })).toMatchObject({
      organization_id: 'org-1',
      title: 'Topico',
      summary: 'Resumo',
      source_type: 'manual',
      priority: 'high',
      opportunity_score: 80,
    })
  })

  it('builds content insert payload with optional references', () => {
    expect(buildContentInsertPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: '  Post  ',
      contentType: 'social_post',
      channel: 'linkedin',
      brief: ' Brief ',
      body: ' Body ',
      cta: ' CTA ',
      campaignId: 'campaign-1',
      landingPageId: 'landing-1',
      sourceIdeaId: 'idea-1',
    })).toMatchObject({
      organization_id: 'org-1',
      title: 'Post',
      brief: 'Brief',
      body: 'Body',
      cta: 'CTA',
      campaign_id: 'campaign-1',
      landing_page_id: 'landing-1',
      source_idea_id: 'idea-1',
    })
  })

  it('maps content rows including internal notes for internal callers', () => {
    const mapped = mapMarketingContent({
      id: 'content-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      title: 'Post',
      content_type: 'social_post',
      channel: 'linkedin',
      status: 'draft',
      brief: null,
      body: 'Body',
      cta: null,
      campaign_id: null,
      landing_page_id: null,
      source_idea_id: null,
      created_by_agent_id: null,
      approved_by: null,
      scheduled_at: null,
      published_at: null,
      published_url: null,
      internal_notes: 'Custo interno',
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })

    expect(mapped.internalNotes).toBe('Custo interno')
  })

  it('builds usage ledger payload with numeric defaults', () => {
    expect(buildUsageLedgerPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      action: 'generate_social_post',
      creditsCharged: 5,
      workflowRunId: 'run-1',
    })).toMatchObject({
      organization_id: 'org-1',
      workflow_run_id: 'run-1',
      action: 'generate_social_post',
      input_tokens: 0,
      output_tokens: 0,
      raw_cost_estimate: 0,
      credits_charged: 5,
      status: 'pending',
    })
  })

  it('maps content versions and builds version payloads', () => {
    expect(mapMarketingContentVersion({
      id: 'version-1',
      content_item_id: 'content-1',
      version_number: 2,
      title: 'Post v2',
      body: 'Body',
      change_summary: 'Ajuste de CTA',
      created_by: null,
      created_by_agent_id: 'agent-1',
      created_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'version-1',
      contentItemId: 'content-1',
      versionNumber: 2,
      changeSummary: 'Ajuste de CTA',
      createdByAgentId: 'agent-1',
    })

    expect(buildContentVersionPayload({
      contentItemId: 'content-1',
      versionNumber: 3,
      title: '  Post v3  ',
      body: ' Body ',
      changeSummary: ' CTA ',
    })).toMatchObject({
      content_item_id: 'content-1',
      version_number: 3,
      title: 'Post v3',
      body: 'Body',
      change_summary: 'CTA',
    })
  })

  it('maps reviews and builds review payloads', () => {
    expect(mapMarketingContentReview({
      id: 'review-1',
      content_item_id: 'content-1',
      reviewer_id: 'user-1',
      status: 'changes_requested',
      quality_score: 72,
      comments: 'Ajustar promessa',
      checklist: { cta: true },
      decided_at: null,
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:30:00.000Z',
    })).toMatchObject({
      id: 'review-1',
      contentItemId: 'content-1',
      reviewerId: 'user-1',
      status: 'changes_requested',
      qualityScore: 72,
      checklist: { cta: true },
    })

    expect(buildContentReviewPayload({
      contentItemId: 'content-1',
      comments: ' Aprovar com ajuste ',
      checklist: { tone: true },
    })).toMatchObject({
      content_item_id: 'content-1',
      status: 'pending',
      comments: 'Aprovar com ajuste',
      checklist: { tone: true },
    })
  })

  it('maps calendar items and builds calendar payloads', () => {
    expect(mapMarketingCalendarItem({
      id: 'calendar-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      content_item_id: 'content-1',
      title: 'Post LinkedIn',
      channel: 'linkedin',
      status: 'planned',
      starts_at: '2026-06-08T12:00:00.000Z',
      ends_at: null,
      responsible_user_id: null,
      metadata: { slot: 'manha' },
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'calendar-1',
      contentItemId: 'content-1',
      startsAt: '2026-06-08T12:00:00.000Z',
      metadata: { slot: 'manha' },
    })

    expect(buildCalendarItemPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      contentItemId: 'content-1',
      title: '  Post LinkedIn  ',
      channel: 'linkedin',
      startsAt: '2026-06-08T12:00:00.000Z',
    })).toMatchObject({
      organization_id: 'org-1',
      content_item_id: 'content-1',
      title: 'Post LinkedIn',
      channel: 'linkedin',
      status: 'planned',
    })
  })

  it('maps brand profiles and builds profile payloads', () => {
    expect(mapMarketingBrandProfile({
      id: 'brand-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      tone_of_voice: 'consultivo',
      persona: 'especialista',
      brand_voice_summary: 'Voz clara',
      vocabulary_do: ['clareza'],
      vocabulary_dont: ['garantido'],
      forbidden_topics: ['promessa'],
      priority_topics: ['ia'],
      visual_guidelines: 'minimalista',
      compliance_notes: 'sem promessas',
      status: 'active',
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'brand-1',
      toneOfVoice: 'consultivo',
      vocabularyDo: ['clareza'],
      complianceNotes: 'sem promessas',
    })

    expect(buildBrandProfilePayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      toneOfVoice: ' consultivo ',
      persona: ' especialista ',
      brandVoiceSummary: ' resumo ',
      status: 'active',
    })).toMatchObject({
      organization_id: 'org-1',
      tone_of_voice: 'consultivo',
      persona: 'especialista',
      brand_voice_summary: 'resumo',
      status: 'active',
    })
  })

  it('maps products and builds product payloads', () => {
    expect(mapMarketingProductService({
      id: 'product-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      name: 'CRM',
      category: 'software',
      description: 'CRM comercial',
      value_proposition: 'Organizar vendas',
      target_audience: 'PMEs',
      proof_points: ['pipeline'],
      objections: ['tempo'],
      cta: 'Agendar',
      status: 'active',
      metadata: { tier: 'growth' },
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({
      id: 'product-1',
      name: 'CRM',
      proofPoints: ['pipeline'],
      metadata: { tier: 'growth' },
    })

    expect(buildProductServicePayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      name: ' CRM ',
      proofPoints: ['pipeline'],
    })).toMatchObject({
      name: 'CRM',
      proof_points: ['pipeline'],
      status: 'active',
    })
  })

  it('maps knowledge documents, chunks and search matches', () => {
    expect(mapMarketingKnowledgeDocument({
      id: 'doc-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      source_id: null,
      title: 'Guia da marca',
      document_type: 'brand',
      status: 'published',
      storage_path: null,
      source_url: 'https://example.com',
      summary: 'Resumo',
      metadata: {},
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({ id: 'doc-1', documentType: 'brand', status: 'published' })

    expect(buildKnowledgeDocumentPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: ' Guia ',
      documentType: 'brand',
    })).toMatchObject({ title: 'Guia', document_type: 'brand', status: 'draft' })

    expect(mapMarketingKnowledgeChunk({
      id: 'chunk-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      document_id: 'doc-1',
      entry_id: null,
      chunk_index: 2,
      title: 'Parte',
      body: 'Texto',
      token_count: 10,
      embedding_model: null,
      metadata: {},
      created_at: '2026-06-05T12:00:00.000Z',
      updated_at: '2026-06-05T12:00:00.000Z',
    })).toMatchObject({ id: 'chunk-1', documentId: 'doc-1', chunkIndex: 2 })

    expect(buildKnowledgeChunkPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      documentId: 'doc-1',
      body: ' Texto ',
    })).toMatchObject({ document_id: 'doc-1', body: 'Texto', chunk_index: 0 })

    expect(mapMarketingKnowledgeMatch({
      chunk_id: 'chunk-1',
      document_id: 'doc-1',
      title: 'Guia',
      body: 'Texto',
      rank: 0.8,
    })).toEqual({ chunkId: 'chunk-1', documentId: 'doc-1', title: 'Guia', body: 'Texto', rank: 0.8 })
  })

  it('maps sources, source items, research cache and radar runs', () => {
    expect(mapMarketingSource({
      id: 'source-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      source_type: 'blog',
      name: 'Blog YUX',
      source_url: 'https://example.com',
      status: 'active',
      last_read_at: null,
      metadata: { cadence: 'weekly' },
      created_at: '2026-06-07T12:00:00.000Z',
      updated_at: '2026-06-07T12:00:00.000Z',
    })).toMatchObject({ sourceType: 'blog', metadata: { cadence: 'weekly' } })

    expect(mapMarketingSourceItem({
      id: 'item-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      source_id: 'source-1',
      radar_run_id: 'radar-1',
      item_type: 'article',
      title: 'Tendencia CRM',
      source_url: 'https://example.com/post',
      normalized_url: 'https://example.com/post',
      author: null,
      published_at: null,
      summary: 'Resumo',
      raw_excerpt: null,
      language: 'pt',
      content_hash: 'hash',
      dedupe_key: 'dedupe',
      relevance_score: 80,
      novelty_score: 70,
      commercial_score: 90,
      status: 'captured',
      metadata: {},
      created_at: '2026-06-07T12:00:00.000Z',
      updated_at: '2026-06-07T12:00:00.000Z',
    })).toMatchObject({ sourceId: 'source-1', radarRunId: 'radar-1', commercialScore: 90 })

    expect(buildSourceItemPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: ' Tendencia CRM ',
      contentHash: 'hash',
      dedupeKey: 'dedupe',
      relevanceScore: 80,
    })).toMatchObject({ title: 'Tendencia CRM', content_hash: 'hash', dedupe_key: 'dedupe', relevance_score: 80 })

    expect(mapMarketingResearchCacheEntry({
      id: 'cache-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      provider: 'jina_reader',
      request_type: 'reader',
      request_key: 'reader:https://example.com/post',
      request_payload: { url: 'https://example.com/post' },
      response_summary: 'Resumo',
      response_payload: { title: 'Post' },
      raw_cost_estimate: 0.01,
      credits_charged: 2,
      expires_at: null,
      created_at: '2026-06-07T12:00:00.000Z',
    })).toMatchObject({ provider: 'jina_reader', creditsCharged: 2 })

    expect(buildResearchCachePayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      provider: 'jina_search',
      requestType: 'search',
      requestKey: 'search:crm',
    })).toMatchObject({ provider: 'jina_search', request_type: 'search', request_key: 'search:crm' })

    expect(mapMarketingRadarRun({
      id: 'radar-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      workflow_run_id: 'workflow-run-1',
      agent_id: 'agent-1',
      status: 'completed',
      period_start: '2026-06-01',
      period_end: '2026-06-07',
      query: 'crm pmes',
      source_count: 4,
      item_count: 12,
      idea_count: 6,
      rejected_count: 2,
      summary: 'Radar semanal',
      error_message: null,
      metadata: {},
      started_at: null,
      completed_at: null,
      created_by: null,
      created_at: '2026-06-07T12:00:00.000Z',
      updated_at: '2026-06-07T12:00:00.000Z',
    })).toMatchObject({ workflowRunId: 'workflow-run-1', ideaCount: 6 })

    expect(buildRadarRunPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      query: ' crm pmes ',
    })).toMatchObject({ query: 'crm pmes', status: 'queued' })
  })

  it('maps radar-linked ideas and builds conversion payloads', () => {
    expect(mapMarketingIdea({
      id: 'idea-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      title: 'Ideia CRM',
      summary: 'Resumo',
      status: 'curated',
      source_type: 'radar',
      source_url: 'https://example.com',
      source_reference_id: null,
      source_item_id: 'item-1',
      radar_run_id: 'radar-1',
      priority: 'high',
      opportunity_score: 82,
      suggested_channel: 'linkedin',
      rejection_reason: null,
      curation_notes: 'Boa relacao comercial',
      next_action: 'briefing',
      created_at: '2026-06-07T12:00:00.000Z',
      updated_at: '2026-06-07T12:00:00.000Z',
    })).toMatchObject({ sourceItemId: 'item-1', radarRunId: 'radar-1', opportunityScore: 82 })

    expect(buildIdeaInsertPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      title: ' Ideia CRM ',
      summary: ' Resumo ',
      sourceType: 'radar',
      sourceItemId: 'item-1',
      radarRunId: 'radar-1',
      curationNotes: ' Boa ',
      nextAction: ' briefing ',
    })).toMatchObject({
      title: 'Ideia CRM',
      source_item_id: 'item-1',
      radar_run_id: 'radar-1',
      curation_notes: 'Boa',
      next_action: 'briefing',
    })
  })

  it('maps agent templates, global prompts and editable agent prompts', () => {
    expect(mapMarketingAgentTemplate({
      id: 'template-1',
      agent_type: 'multichannel_writer',
      name: 'Redator',
      description: 'Escreve posts',
      default_tools: ['rag_search'],
      requires_human_approval: true,
      default_model: 'openai/gpt-4o-mini',
      fallback_model: null,
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ agentType: 'multichannel_writer', defaultTools: ['rag_search'] })

    expect(mapMarketingAgentGlobalPrompt({
      id: 'global-1',
      template_id: 'template-1',
      agent_type: 'multichannel_writer',
      system_prompt: 'System prompt global da YUX',
      prompt_version: 2,
      default_context_policy: { includeBrandProfile: true },
      default_model_policy: { routingTier: 'default' },
      default_quality_gates: { minimumQualityScore: 70 },
      status: 'active',
      updated_by: null,
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({
      agentType: 'multichannel_writer',
      systemPrompt: 'System prompt global da YUX',
      promptVersion: 2,
    })

    expect(mapMarketingAgent({
      id: 'agent-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      name: 'Redator do Cliente',
      agent_type: 'multichannel_writer',
      description: 'Prompt editavel pelo cliente',
      status: 'active',
      default_model: 'openai/gpt-4o-mini',
      fallback_model: 'openai/gpt-4o',
      allowed_tools: ['rag_search'],
      requires_human_approval: true,
      max_cost_per_run: 1.5,
      max_runs_per_day: 10,
      base_prompt: 'Use exemplos do cliente.',
      prompt_config: { channel: 'linkedin' },
      context_policy: { includeProducts: true },
      quality_gates: { minimumQualityScore: 75 },
      model_parameters: { temperature: 0.6 },
      prompt_version: 3,
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({
      name: 'Redator do Cliente',
      basePrompt: 'Use exemplos do cliente.',
      promptConfig: { channel: 'linkedin' },
      promptVersion: 3,
    })

    expect(buildAgentPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      name: ' Redator ',
      agentType: 'multichannel_writer',
      basePrompt: ' Siga a voz da marca ',
      allowedTools: ['rag_search'],
      promptConfig: { channel: 'linkedin' },
    })).toMatchObject({
      organization_id: 'org-1',
      name: 'Redator',
      base_prompt: 'Siga a voz da marca',
      allowed_tools: ['rag_search'],
      prompt_config: { channel: 'linkedin' },
    })
  })

  it('maps workflows, run logs, budget, routing and tool policies', () => {
    expect(mapMarketingWorkflow({
      id: 'workflow-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      workflow_key: 'post_creation',
      name: 'Criacao de post',
      description: 'Fluxo',
      status: 'active',
      trigger_type: 'manual',
      config: { mode: 'dry_run' },
      created_by: null,
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ workflowKey: 'post_creation', status: 'active' })

    expect(buildWorkflowPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      workflowKey: ' post_creation ',
      name: ' Criacao ',
    })).toMatchObject({ workflow_key: 'post_creation', name: 'Criacao', trigger_type: 'manual' })

    expect(mapMarketingWorkflowNode({
      id: 'node-1',
      workflow_id: 'workflow-1',
      node_key: 'writer',
      node_type: 'agent',
      agent_id: 'agent-1',
      tool_key: null,
      name: 'Writer',
      position_x: 10,
      position_y: 20,
      config: {},
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ nodeKey: 'writer', positionX: 10 })

    expect(mapMarketingWorkflowEdge({
      id: 'edge-1',
      workflow_id: 'workflow-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      condition_key: '',
      config: {},
      created_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ sourceNodeId: 'node-1', targetNodeId: 'node-2' })

    expect(mapMarketingWorkflowRun({
      id: 'run-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      workflow_id: 'workflow-1',
      status: 'queued',
      run_type: 'manual',
      input_payload: { topic: 'CRM' },
      context_snapshot: {},
      result_payload: {},
      credit_debit: 5,
      raw_cost_estimate: 0.1,
      error_message: null,
      requested_by: null,
      started_at: null,
      completed_at: null,
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ id: 'run-1', creditDebit: 5, inputPayload: { topic: 'CRM' } })

    expect(buildWorkflowRunPayload({
      organizationId: 'org-1',
      clientId: 'client-1',
      contractId: 'contract-1',
      workflowId: 'workflow-1',
      inputPayload: { topic: 'CRM' },
    })).toMatchObject({ workflow_id: 'workflow-1', status: 'queued', input_payload: { topic: 'CRM' } })

    expect(mapMarketingAgentRun({
      id: 'agent-run-1',
      workflow_run_id: 'run-1',
      workflow_node_id: 'node-1',
      agent_id: 'agent-1',
      template_id: 'template-1',
      global_prompt_id: 'global-1',
      agent_type: 'multichannel_writer',
      status: 'succeeded',
      agent_prompt_snapshot: 'Prompt do cliente',
      prompt_config_snapshot: { channel: 'linkedin' },
      context_summary: 'Marca e produto',
      compiled_prompt_hash: 'hash',
      model_provider: 'openrouter',
      model_name: 'openai/gpt-4o-mini',
      fallback_model_name: 'openai/gpt-4o',
      input_payload: {},
      output_payload: { title: 'Post' },
      quality_score: 82,
      input_tokens: 100,
      output_tokens: 50,
      raw_cost_estimate: 0.02,
      credits_charged: 5,
      error_message: null,
      started_at: null,
      completed_at: null,
      created_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ globalPromptId: 'global-1', agentPromptSnapshot: 'Prompt do cliente', qualityScore: 82 })

    expect(mapMarketingToolRun({
      id: 'tool-run-1',
      workflow_run_id: 'run-1',
      agent_run_id: 'agent-run-1',
      tool_key: 'rag_search',
      status: 'succeeded',
      input_payload: { query: 'CRM' },
      output_payload: { matches: 2 },
      raw_cost_estimate: 0,
      credits_charged: 1,
      error_message: null,
      started_at: null,
      completed_at: null,
      created_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ toolKey: 'rag_search', outputPayload: { matches: 2 } })

    expect(mapAgentBudgetPolicy({
      id: 'budget-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      agent_id: null,
      agent_type: 'multichannel_writer',
      max_cost_per_run: 1,
      max_credits_per_run: 12,
      max_runs_per_day: 10,
      monthly_credit_limit: 300,
      require_approval_over_credits: 20,
      status: 'active',
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ agentType: 'multichannel_writer', maxCreditsPerRun: 12 })

    expect(mapModelRoutingRule({
      id: 'route-1',
      organization_id: null,
      client_id: null,
      contract_id: null,
      agent_id: null,
      agent_type: 'multichannel_writer',
      routing_tier: 'default',
      provider: 'openrouter',
      model_name: 'openai/gpt-4o-mini',
      fallback_model_name: 'openai/gpt-4o',
      max_input_tokens: 12000,
      max_output_tokens: 2200,
      temperature: 0.7,
      max_cost_per_run: 0,
      status: 'active',
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ provider: 'openrouter', temperature: 0.7 })

    expect(mapMarketingAgentToolPolicy({
      id: 'tool-policy-1',
      organization_id: 'org-1',
      client_id: 'client-1',
      contract_id: 'contract-1',
      agent_id: null,
      agent_type: 'multichannel_writer',
      tool_key: 'rag_search',
      enabled: true,
      requires_human_approval: false,
      max_calls_per_run: 3,
      config: { limit: 5 },
      created_at: '2026-06-06T12:00:00.000Z',
      updated_at: '2026-06-06T12:00:00.000Z',
    })).toMatchObject({ toolKey: 'rag_search', maxCallsPerRun: 3 })
  })
})
