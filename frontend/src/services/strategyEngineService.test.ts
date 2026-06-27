import { describe, expect, it } from 'vitest'
import {
  buildAssistantRoutingRulePayload,
  buildHandoffPayload,
  buildOutcomePayload,
  buildRecommendationPayload,
  buildStrategyAssistantPayload,
  buildStrategyModelRoutePayload,
  buildStrategyProfilePayload,
  mapStrategyChatMessage,
  mapStrategyChatSession,
} from './strategyEngineService'

describe('strategyEngineService payload builders', () => {
  it('builds recommendation payload with required operational fields', () => {
    expect(buildRecommendationPayload({
      organizationId: 'org-1',
      profileKey: 'crm_controller',
      objective: ' Corrigir follow-up ',
      audience: 'raised hands',
      stage: 'raised_hand',
      action: 'Criar tarefa',
      channel: 'crm',
      owner: 'vendedor',
      metric: 'sla_follow_up',
      nextStep: 'Executar hoje',
      confidence: 0.81,
      requiresApproval: false,
      supportingCards: ['card-1'],
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      profile_key: 'crm_controller',
      objective: 'Corrigir follow-up',
      next_step: 'Executar hoje',
      supporting_cards: ['card-1'],
    }))
  })

  it('builds structured handoff payload', () => {
    expect(buildHandoffPayload({
      sourceProfileKey: 'ai_sdr_comercial_1',
      targetProfileKey: 'ai_closer',
      reason: 'Objeção de preço',
      relatedRecordId: '650e8400-e29b-41d4-a716-446655440001',
      allowedTools: ['proposal_read'],
    })).toEqual(expect.objectContaining({
      source_profile_key: 'ai_sdr_comercial_1',
      target_profile_key: 'ai_closer',
      status: 'pending',
      allowed_tools: ['proposal_read'],
    }))
  })

  it('builds outcome payload for learning events', () => {
    expect(buildOutcomePayload({
      eventType: 'meeting_scheduled',
      recommendationId: '650e8400-e29b-41d4-a716-446655440001',
      outcomeScore: 1,
      metadata: { channel: 'whatsapp' },
    })).toEqual(expect.objectContaining({
      event_type: 'meeting_scheduled',
      recommendation_id: '650e8400-e29b-41d4-a716-446655440001',
      outcome_score: 1,
      metadata: { channel: 'whatsapp' },
    }))
  })

  it('builds profile configuration payloads for guardrails', () => {
    expect(buildStrategyProfilePayload({
      id: 'profile-1',
      status: 'active',
      maxContextChars: 7000,
      maxCards: 8,
      maxChunks: 4,
      allowedModules: ['crm', ' omnichannel '],
      allowedTools: ['strategy_retrieval'],
      forbiddenActions: ['activate_campaign'],
      requiresHumanApprovalFor: ['send_external_message'],
    })).toEqual(expect.objectContaining({
      max_context_chars: 7000,
      allowed_modules: ['crm', 'omnichannel'],
      forbidden_actions: ['activate_campaign'],
    }))
  })

  it('builds model routes by strategy profile key', () => {
    expect(buildStrategyModelRoutePayload({
      agentType: 'ai_sdr_comercial_1',
      routingTier: 'default',
      provider: 'openrouter',
      modelName: 'openai/gpt-4.1-mini',
      fallbackModelName: 'openai/gpt-4o',
    })).toEqual(expect.objectContaining({
      agent_type: 'ai_sdr_comercial_1',
      routing_tier: 'default',
      provider: 'openrouter',
      model_name: 'openai/gpt-4.1-mini',
      fallback_model_name: 'openai/gpt-4o',
    }))
  })

  it('builds conversational assistant and routing rule payloads', () => {
    expect(buildStrategyAssistantPayload({
      organizationId: 'org-1',
      name: 'IA SDR',
      tone: 'consultivo',
      status: 'active',
      assistantRole: 'sdr',
      strategyProfileId: 'profile-1',
      routingPriority: 50,
      routingMetadata: { lockRoleMinutes: 30 },
    })).toEqual(expect.objectContaining({
      organization_id: 'org-1',
      assistant_role: 'sdr',
      strategy_profile_id: 'profile-1',
      routing_priority: 50,
    }))

    expect(buildAssistantRoutingRulePayload({
      assistantId: 'assistant-1',
      channel: 'whatsapp',
      requiredRole: 'sdr',
      stageKeys: ['lead_warm', ' raised_hand '],
      keywordPatterns: ['preco'],
      defaultRule: true,
    })).toEqual(expect.objectContaining({
      assistant_id: 'assistant-1',
      channel: 'whatsapp',
      required_role: 'sdr',
      stage_keys: ['lead_warm', 'raised_hand'],
      keyword_patterns: ['preco'],
      default_rule: true,
    }))
  })

  it('maps strategic admin chat rows', () => {
    expect(mapStrategyChatSession({
      id: 'session-1',
      actor_user_id: 'user-1',
      organization_id: 'org-1',
      profile_key: 'growth_strategist',
      title: 'Diagnostico',
      mode: 'diagnostic_48h',
      status: 'active',
      context_snapshot: { leads: 3 },
      last_message_at: '2026-06-12T10:00:00.000Z',
      created_at: '2026-06-12T09:00:00.000Z',
    })).toMatchObject({
      id: 'session-1',
      organizationId: 'org-1',
      profileKey: 'growth_strategist',
      mode: 'diagnostic_48h',
      contextSnapshot: { leads: 3 },
    })

    expect(mapStrategyChatMessage({
      id: 'message-1',
      session_id: 'session-1',
      role: 'assistant',
      content: 'Plano recomendado',
      model_provider: 'openrouter',
      model_name: 'openai/gpt-4.1-mini',
      input_tokens: 120,
      output_tokens: 80,
      safe_context: { profile: 'growth_strategist' },
      tool_results: [{ tool: 'crm_leads', count: 2 }],
      created_at: '2026-06-12T10:01:00.000Z',
    })).toMatchObject({
      id: 'message-1',
      sessionId: 'session-1',
      role: 'assistant',
      modelName: 'openai/gpt-4.1-mini',
      toolResults: [{ tool: 'crm_leads', count: 2 }],
    })
  })
})
