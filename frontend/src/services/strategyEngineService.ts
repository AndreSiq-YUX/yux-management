import { invokeBackendFunction } from '@/lib/backendFunctions'
import { strategyEngineDataClient } from '@/lib/strategyEngineDataClient'
import type {
  AgentAutonomyPolicy,
  AgentExecutionRun,
  AgentExecutionStep,
  AgentImprovementRecommendation,
  AgentLearningSignal,
  AgentShadowExperiment,
  StrategyAgentBinding,
  StrategyAgentProfile,
  StrategyAgentProfileUpdateInput,
  StrategyAdminChatRequest,
  StrategyAdminChatResponse,
  StrategyAssistantRoutingRule,
  StrategyAssistantRoutingRuleInput,
  StrategyChatMessage,
  StrategyChatSession,
  StrategyConceptCard,
  StrategyConversationAssistant,
  StrategyConversationAssistantInput,
  StrategyHandoffInput,
  StrategyLlmProvider,
  StrategyModelRoute,
  StrategyModelRouteInput,
  StrategyOrganization,
  StrategyOutcomeInput,
  StrategyRecommendationInput,
  StrategyRetrievalQuery,
  StrategyWorkflowSpec,
  StrategySourceDocument,
  StrategySkill,
} from '@/types/strategyEngine'

type DbRow = Record<string, unknown>

const requireData = async <T>(request: PromiseLike<{ data: T | null; error: unknown }>) => {
  const { data, error } = await request
  if (error) throw error
  return data as T
}

const optional = (value?: string) => value && value.trim() ? value.trim() : null
const numberOrDefault = (value: unknown, fallback: number) => Number.isFinite(Number(value)) ? Number(value) : fallback

const toArray = (value: string[] | undefined) => Array.isArray(value) ? value.map(item => item.trim()).filter(Boolean) : []
const stringValue = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const stringArray = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
const rowArray = (value: unknown): DbRow[] => Array.isArray(value) ? value.filter((item): item is DbRow => typeof item === 'object' && item !== null) : []
const boolValue = (value: unknown) => Boolean(value)

export function mapStrategyProfile(row: DbRow): StrategyAgentProfile {
  return {
    id: stringValue(row.id),
    profileKey: stringValue(row.profile_key),
    name: stringValue(row.name),
    description: stringValue(row.description) || undefined,
    purpose: stringValue(row.purpose) || undefined,
    allowedModules: stringArray(row.allowed_modules),
    allowedTools: stringArray(row.allowed_tools),
    forbiddenActions: stringArray(row.forbidden_actions),
    requiresHumanApprovalFor: stringArray(row.requires_human_approval_for),
    maxContextChars: numberOrDefault(row.max_context_chars, 5000),
    maxCards: numberOrDefault(row.max_cards, 8),
    maxChunks: numberOrDefault(row.max_chunks, 4),
    status: stringValue(row.status, 'active'),
  }
}

export function mapStrategyModelRoute(row: DbRow): StrategyModelRoute {
  return {
    id: stringValue(row.id),
    agentType: stringValue(row.agent_type),
    routingTier: stringValue(row.routing_tier, 'default'),
    provider: stringValue(row.provider),
    modelName: stringValue(row.model_name),
    fallbackModelName: stringValue(row.fallback_model_name) || undefined,
    maxInputTokens: numberOrDefault(row.max_input_tokens, 0),
    maxOutputTokens: numberOrDefault(row.max_output_tokens, 0),
    temperature: numberOrDefault(row.temperature, 0),
    maxCostPerRun: numberOrDefault(row.max_cost_per_run, 0),
    status: stringValue(row.status, 'active'),
  }
}

export function mapStrategyAssistant(row: DbRow): StrategyConversationAssistant {
  return {
    id: stringValue(row.id),
    organizationId: stringValue(row.organization_id),
    clientId: stringValue(row.client_id) || undefined,
    contractId: stringValue(row.contract_id) || undefined,
    name: stringValue(row.name),
    tone: stringValue(row.tone),
    status: stringValue(row.status, 'draft'),
    assistantRole: stringValue(row.assistant_role) || undefined,
    strategyProfileId: stringValue(row.strategy_profile_id) || undefined,
    routingPriority: numberOrDefault(row.routing_priority, 100),
    routingMetadata: typeof row.routing_metadata === 'object' && row.routing_metadata !== null ? row.routing_metadata as Record<string, unknown> : {},
    summaryEnabled: boolValue(row.summary_enabled),
    classificationEnabled: boolValue(row.classification_enabled),
    rules: rowArray(row.ai_assistant_routing_rules) as unknown as StrategyAssistantRoutingRule[],
  }
}

export function mapStrategyChatSession(row: DbRow): StrategyChatSession {
  return {
    id: stringValue(row.id),
    actorUserId: stringValue(row.actor_user_id) || undefined,
    organizationId: stringValue(row.organization_id) || undefined,
    clientId: stringValue(row.client_id) || undefined,
    contractId: stringValue(row.contract_id) || undefined,
    profileKey: stringValue(row.profile_key, 'growth_strategist'),
    title: stringValue(row.title, 'Nova conversa estrategica'),
    mode: stringValue(row.mode, 'general') as StrategyChatSession['mode'],
    status: stringValue(row.status, 'active'),
    contextSnapshot: typeof row.context_snapshot === 'object' && row.context_snapshot !== null ? row.context_snapshot as Record<string, unknown> : {},
    lastMessageAt: stringValue(row.last_message_at),
    createdAt: stringValue(row.created_at),
    updatedAt: stringValue(row.updated_at) || undefined,
  }
}

export function mapStrategyChatMessage(row: DbRow): StrategyChatMessage {
  return {
    id: stringValue(row.id),
    sessionId: stringValue(row.session_id),
    role: stringValue(row.role, 'assistant') as StrategyChatMessage['role'],
    content: stringValue(row.content),
    status: stringValue(row.status, 'completed'),
    modelProvider: stringValue(row.model_provider) || undefined,
    modelName: stringValue(row.model_name) || undefined,
    routingRuleId: stringValue(row.routing_rule_id) || undefined,
    inputTokens: numberOrDefault(row.input_tokens, 0),
    outputTokens: numberOrDefault(row.output_tokens, 0),
    safeContext: typeof row.safe_context === 'object' && row.safe_context !== null ? row.safe_context as Record<string, unknown> : {},
    toolResults: rowArray(row.tool_results),
    errorMessage: stringValue(row.error_message) || undefined,
    createdAt: stringValue(row.created_at),
  }
}

export function mapAgentExecutionRun(row: DbRow): AgentExecutionRun {
  return {
    id: stringValue(row.id),
    organizationId: stringValue(row.organization_id) || undefined,
    clientId: stringValue(row.client_id) || undefined,
    conversationId: stringValue(row.conversation_id) || undefined,
    runSource: stringValue(row.run_source, 'runtime'),
    profileKey: stringValue(row.profile_key),
    agentRole: stringValue(row.agent_role) || undefined,
    workflowKey: stringValue(row.workflow_key) || undefined,
    autonomyMode: stringValue(row.autonomy_mode, 'suggestion'),
    status: stringValue(row.status, 'queued'),
    riskLevel: stringValue(row.risk_level, 'medium'),
    confidence: numberOrDefault(row.confidence, 0),
    modelProvider: stringValue(row.model_provider) || undefined,
    modelName: stringValue(row.model_name) || undefined,
    inputTokens: numberOrDefault(row.input_tokens, 0),
    outputTokens: numberOrDefault(row.output_tokens, 0),
    estimatedCost: numberOrDefault(row.estimated_cost, 0),
    decisionSummary: stringValue(row.decision_summary),
    createdAt: stringValue(row.created_at),
    startedAt: stringValue(row.started_at) || undefined,
    completedAt: stringValue(row.completed_at) || undefined,
  }
}

export function mapAgentExecutionStep(row: DbRow): AgentExecutionStep {
  return {
    id: stringValue(row.id),
    runId: stringValue(row.run_id),
    stepKey: stringValue(row.step_key),
    stepType: stringValue(row.step_type),
    status: stringValue(row.status, 'queued'),
    attemptNumber: numberOrDefault(row.attempt_number, 1),
    modelName: stringValue(row.model_name) || undefined,
    promptHash: stringValue(row.prompt_hash) || undefined,
    contextHash: stringValue(row.context_hash) || undefined,
    latencyMs: numberOrDefault(row.latency_ms, 0),
    estimatedCost: numberOrDefault(row.estimated_cost, 0),
    warnings: stringArray(row.warnings),
    createdAt: stringValue(row.created_at),
  }
}

export function mapAgentAutonomyPolicy(row: DbRow): AgentAutonomyPolicy {
  return {
    id: stringValue(row.id),
    organizationId: stringValue(row.organization_id) || undefined,
    clientId: stringValue(row.client_id) || undefined,
    assistantId: stringValue(row.assistant_id) || undefined,
    profileKey: stringValue(row.profile_key) || undefined,
    channel: stringValue(row.channel) || undefined,
    intentKey: stringValue(row.intent_key) || undefined,
    stageKey: stringValue(row.stage_key) || undefined,
    actionKey: stringValue(row.action_key) || undefined,
    autonomyMode: stringValue(row.autonomy_mode, 'suggestion'),
    riskLevel: stringValue(row.risk_level, 'medium'),
    confidenceThreshold: numberOrDefault(row.confidence_threshold, 0.75),
    status: stringValue(row.status, 'active'),
    config: typeof row.config === 'object' && row.config !== null ? row.config as Record<string, unknown> : {},
    createdAt: stringValue(row.created_at),
  }
}

export function mapStrategyWorkflowSpec(row: DbRow): StrategyWorkflowSpec {
  return {
    id: stringValue(row.id),
    workflowKey: stringValue(row.workflow_key),
    name: stringValue(row.name),
    description: stringValue(row.description),
    profileKey: stringValue(row.profile_key),
    workflowType: stringValue(row.workflow_type, 'strategic'),
    maxSubagents: numberOrDefault(row.max_subagents, 0),
    maxRetriesPerNode: numberOrDefault(row.max_retries_per_node, 0),
    maxCostPerRun: numberOrDefault(row.max_cost_per_run, 0),
    status: stringValue(row.status, 'active'),
    version: numberOrDefault(row.version, 1),
  }
}

export function mapAgentLearningSignal(row: DbRow): AgentLearningSignal {
  return {
    id: stringValue(row.id),
    runId: stringValue(row.run_id) || undefined,
    organizationId: stringValue(row.organization_id) || undefined,
    profileKey: stringValue(row.profile_key),
    signalType: stringValue(row.signal_type),
    targetType: stringValue(row.target_type),
    targetId: stringValue(row.target_id) || undefined,
    signalScore: numberOrDefault(row.signal_score, 0),
    confidence: numberOrDefault(row.confidence, 0),
    createdAt: stringValue(row.created_at),
  }
}

export function mapAgentImprovementRecommendation(row: DbRow): AgentImprovementRecommendation {
  return {
    id: stringValue(row.id),
    organizationId: stringValue(row.organization_id) || undefined,
    profileKey: stringValue(row.profile_key),
    recommendationType: stringValue(row.recommendation_type),
    title: stringValue(row.title),
    rationale: stringValue(row.rationale),
    targetType: stringValue(row.target_type) || undefined,
    targetId: stringValue(row.target_id) || undefined,
    status: stringValue(row.status, 'proposed'),
    riskLevel: stringValue(row.risk_level, 'medium'),
    createdAt: stringValue(row.created_at),
  }
}

export function mapAgentShadowExperiment(row: DbRow): AgentShadowExperiment {
  return {
    id: stringValue(row.id),
    recommendationId: stringValue(row.recommendation_id) || undefined,
    organizationId: stringValue(row.organization_id) || undefined,
    experimentKey: stringValue(row.experiment_key),
    baselineVersion: stringValue(row.baseline_version, 'current'),
    candidateVersion: stringValue(row.candidate_version),
    status: stringValue(row.status, 'running'),
    sampleSize: numberOrDefault(row.sample_size, 0),
    successMetric: stringValue(row.success_metric, 'quality_score'),
    baselineScore: row.baseline_score === null || row.baseline_score === undefined ? undefined : numberOrDefault(row.baseline_score, 0),
    candidateScore: row.candidate_score === null || row.candidate_score === undefined ? undefined : numberOrDefault(row.candidate_score, 0),
    resultSummary: stringValue(row.result_summary),
    createdAt: stringValue(row.created_at),
  }
}

export function buildRecommendationPayload(input: StrategyRecommendationInput) {
  return {
    organization_id: optional(input.organizationId),
    client_id: optional(input.clientId),
    profile_key: input.profileKey,
    objective: input.objective.trim(),
    audience: input.audience.trim(),
    stage: input.stage,
    action: input.action.trim(),
    channel: input.channel.trim(),
    owner: input.owner.trim(),
    metric: input.metric.trim(),
    next_step: input.nextStep.trim(),
    confidence: input.confidence,
    requires_approval: input.requiresApproval,
    supporting_cards: input.supportingCards,
  }
}

export function buildHandoffPayload(input: StrategyHandoffInput) {
  return {
    organization_id: optional(input.organizationId),
    client_id: optional(input.clientId),
    source_profile_key: input.sourceProfileKey,
    target_profile_key: input.targetProfileKey,
    reason: input.reason.trim(),
    requested_output: input.requestedOutput?.trim() || '',
    related_module: optional(input.relatedModule),
    related_record_id: optional(input.relatedRecordId),
    urgency: input.urgency || 'normal',
    context_summary: input.contextSummary?.trim() || '',
    allowed_tools: input.allowedTools || [],
    status: 'pending',
  }
}

export function buildOutcomePayload(input: StrategyOutcomeInput) {
  return {
    organization_id: optional(input.organizationId),
    client_id: optional(input.clientId),
    event_type: input.eventType,
    recommendation_id: optional(input.recommendationId),
    handoff_id: optional(input.handoffId),
    lead_id: optional(input.leadId),
    conversation_id: optional(input.conversationId),
    proposal_id: optional(input.proposalId),
    campaign_id: optional(input.campaignId),
    content_item_id: optional(input.contentItemId),
    outcome_score: input.outcomeScore ?? null,
    metadata: input.metadata || {},
  }
}

export function buildStrategyProfilePayload(input: StrategyAgentProfileUpdateInput) {
  return {
    status: input.status,
    max_context_chars: input.maxContextChars,
    max_cards: input.maxCards,
    max_chunks: input.maxChunks,
    allowed_modules: toArray(input.allowedModules),
    allowed_tools: toArray(input.allowedTools),
    forbidden_actions: toArray(input.forbiddenActions),
    requires_human_approval_for: toArray(input.requiresHumanApprovalFor),
  }
}

export function buildStrategyModelRoutePayload(input: StrategyModelRouteInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    agent_type: input.agentType.trim(),
    routing_tier: input.routingTier || 'default',
    provider: input.provider.trim(),
    model_name: input.modelName.trim(),
    fallback_model_name: input.fallbackModelName?.trim() || null,
    max_input_tokens: input.maxInputTokens ?? 8000,
    max_output_tokens: input.maxOutputTokens ?? 1200,
    temperature: input.temperature ?? 0.4,
    max_cost_per_run: input.maxCostPerRun ?? 0,
    status: input.status || 'active',
  }
}

export function buildStrategyAssistantPayload(input: StrategyConversationAssistantInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    organization_id: input.organizationId,
    client_id: optional(input.clientId),
    contract_id: optional(input.contractId),
    name: input.name.trim(),
    tone: input.tone.trim() || 'consultivo',
    status: input.status || 'draft',
    assistant_role: input.assistantRole,
    strategy_profile_id: optional(input.strategyProfileId),
    routing_priority: input.routingPriority,
    routing_metadata: input.routingMetadata || {},
    summary_enabled: input.summaryEnabled ?? true,
    classification_enabled: input.classificationEnabled ?? true,
  }
}

export function buildAssistantRoutingRulePayload(input: StrategyAssistantRoutingRuleInput) {
  return {
    ...(input.id ? { id: input.id } : {}),
    assistant_id: input.assistantId,
    channel: optional(input.channel),
    required_role: optional(input.requiredRole),
    stage_keys: toArray(input.stageKeys),
    intent_keys: toArray(input.intentKeys),
    keyword_patterns: toArray(input.keywordPatterns),
    default_rule: Boolean(input.defaultRule),
    score_weight: input.scoreWeight ?? 10,
    lock_role_minutes: input.lockRoleMinutes ?? 30,
    status: input.status || 'active',
    config: input.config || {},
  }
}

export const strategyEngineService = {
  async getAgentProfiles() {
    const data = await requireData<DbRow[]>(strategyEngineDataClient.from('yux_strategy_agent_profiles').select('*').order('profile_key'))
    return data.map(mapStrategyProfile)
  },

  async updateAgentProfile(input: StrategyAgentProfileUpdateInput) {
    return requireData<DbRow>(
      strategyEngineDataClient
        .from('yux_strategy_agent_profiles')
        .update(buildStrategyProfilePayload(input))
        .eq('id', input.id)
        .select()
        .single(),
    )
  },

  async getSkills() {
    return requireData<StrategySkill[]>(strategyEngineDataClient.from('yux_strategy_skills').select('*').order('skill_key'))
  },

  async getConceptCards(filters: { profileKey?: string; stage?: string; visibility?: string } = {}) {
    let query = strategyEngineDataClient.from('yux_strategy_concept_cards').select('*').order('updated_at', { ascending: false })
    if (filters.profileKey) query = query.contains('allowed_agent_profile_keys', [filters.profileKey])
    if (filters.stage) query = query.contains('stage_tags', [filters.stage])
    if (filters.visibility) query = query.eq('visibility', filters.visibility)
    return requireData<StrategyConceptCard[]>(query)
  },

  async getSourceDocuments(filters: { visibility?: string } = {}) {
    let query = strategyEngineDataClient.from('yux_strategy_source_documents').select('*').order('updated_at', { ascending: false })
    if (filters.visibility) query = query.eq('visibility', filters.visibility)
    return requireData<StrategySourceDocument[]>(query)
  },

  async getKnowledgeStats() {
    const [documents, chunks, assets, cards, retrievals] = await Promise.all([
      strategyEngineDataClient.from('yux_strategy_source_documents').select('id', { count: 'exact', head: true }),
      strategyEngineDataClient.from('yux_strategy_source_chunks').select('id', { count: 'exact', head: true }),
      strategyEngineDataClient.from('yux_strategy_source_assets').select('id', { count: 'exact', head: true }),
      strategyEngineDataClient.from('yux_strategy_concept_cards').select('id', { count: 'exact', head: true }),
      strategyEngineDataClient.from('yux_strategy_retrieval_queries').select('id', { count: 'exact', head: true }),
    ])
    const errors = [documents.error, chunks.error, assets.error, cards.error, retrievals.error].filter(Boolean)
    if (errors.length > 0) throw errors[0]
    return {
      documents: documents.count || 0,
      chunks: chunks.count || 0,
      assets: assets.count || 0,
      cards: cards.count || 0,
      retrievals: retrievals.count || 0,
    }
  },

  async getRetrievalQueries(filters: { profileKey?: string; limit?: number } = {}) {
    let query = strategyEngineDataClient.from('yux_strategy_retrieval_queries').select('*').order('created_at', { ascending: false }).limit(filters.limit || 50)
    if (filters.profileKey) query = query.eq('profile_key', filters.profileKey)
    return requireData<StrategyRetrievalQuery[]>(query)
  },

  async getAgentBindings(filters: { profileId?: string } = {}) {
    let query = strategyEngineDataClient.from('yux_strategy_agent_bindings').select('*').order('created_at', { ascending: false })
    if (filters.profileId) query = query.eq('profile_id', filters.profileId)
    return requireData<StrategyAgentBinding[]>(query)
  },

  async getLlmProviders() {
    return requireData<StrategyLlmProvider[]>(
      strategyEngineDataClient
        .from('platform_provider_connections')
        .select('*')
        .eq('provider_type', 'llm')
        .order('provider_key'),
    )
  },

  async getModelRoutes(filters: { agentType?: string } = {}) {
    let query = strategyEngineDataClient.from('model_routing_rules').select('*').order('agent_type').order('routing_tier')
    if (filters.agentType) query = query.eq('agent_type', filters.agentType)
    const data = await requireData<DbRow[]>(query)
    return data.map(mapStrategyModelRoute)
  },

  async upsertModelRoute(input: StrategyModelRouteInput) {
    const payload = buildStrategyModelRoutePayload(input)
    const mutation = input.id
      ? strategyEngineDataClient.from('model_routing_rules').update(payload).eq('id', input.id)
      : strategyEngineDataClient.from('model_routing_rules').insert(payload)
    const data = await requireData<DbRow>(mutation.select().single())
    return mapStrategyModelRoute(data)
  },

  async getClientOrganizations() {
    return requireData<StrategyOrganization[]>(
      strategyEngineDataClient
        .from('organizations')
        .select('id, name, slug')
        .eq('kind', 'client')
        .order('name'),
    )
  },

  async getConversationAssistants(filters: { organizationId?: string } = {}) {
    let query = strategyEngineDataClient
      .from('ai_assistants')
      .select('*, ai_assistant_routing_rules(*)')
      .order('updated_at', { ascending: false })
    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId)
    const data = await requireData<DbRow[]>(query)
    return data.map(mapStrategyAssistant)
  },

  async upsertConversationAssistant(input: StrategyConversationAssistantInput) {
    const payload = buildStrategyAssistantPayload(input)
    const mutation = input.id
      ? strategyEngineDataClient.from('ai_assistants').update(payload).eq('id', input.id)
      : strategyEngineDataClient.from('ai_assistants').insert(payload)
    const data = await requireData<DbRow>(mutation.select().single())
    return mapStrategyAssistant(data)
  },

  async upsertAssistantRoutingRule(input: StrategyAssistantRoutingRuleInput) {
    const payload = buildAssistantRoutingRulePayload(input)
    const mutation = input.id
      ? strategyEngineDataClient.from('ai_assistant_routing_rules').update(payload).eq('id', input.id)
      : strategyEngineDataClient.from('ai_assistant_routing_rules').insert(payload)
    return requireData<StrategyAssistantRoutingRule>(mutation.select().single())
  },

  async upsertAgentBinding(input: Record<string, unknown>) {
    return requireData<StrategyAgentBinding>(strategyEngineDataClient.from('yux_strategy_agent_bindings').upsert(input).select().single())
  },

  async getRecommendations(filters: { profileKey?: string; status?: string } = {}) {
    let query = strategyEngineDataClient.from('yux_strategy_agent_recommendations').select('*').order('created_at', { ascending: false })
    if (filters.profileKey) query = query.eq('profile_key', filters.profileKey)
    if (filters.status) query = query.eq('status', filters.status)
    return requireData<DbRow[]>(query)
  },

  async createRecommendation(input: StrategyRecommendationInput) {
    return requireData<DbRow>(strategyEngineDataClient.from('yux_strategy_agent_recommendations').insert(buildRecommendationPayload(input)).select().single())
  },

  async createHandoff(input: StrategyHandoffInput) {
    return requireData<DbRow>(strategyEngineDataClient.from('yux_strategy_agent_handoffs').insert(buildHandoffPayload(input)).select().single())
  },

  async updateHandoffStatus(id: string, status: string) {
    return requireData<DbRow>(strategyEngineDataClient.from('yux_strategy_agent_handoffs').update({ status }).eq('id', id).select().single())
  },

  async recordOutcome(input: StrategyOutcomeInput) {
    return requireData<DbRow>(strategyEngineDataClient.from('yux_strategy_outcome_events').insert(buildOutcomePayload(input)).select().single())
  },

  async getObjectionPlaybook(filters: { categoryKey?: string; visibility?: string } = {}) {
    let query = strategyEngineDataClient.from('yux_objection_playbook_items').select('*').order('category_key')
    if (filters.categoryKey) query = query.eq('category_key', filters.categoryKey)
    if (filters.visibility) query = query.eq('visibility', filters.visibility)
    return requireData<DbRow[]>(query)
  },

  async getMetricsSnapshots(filters: { organizationId?: string } = {}) {
    let query = strategyEngineDataClient.from('yux_metrics_cash_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(50)
    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId)
    return requireData<DbRow[]>(query)
  },

  async getAgentExecutionRuns(filters: { organizationId?: string; status?: string; limit?: number } = {}) {
    let query = strategyEngineDataClient.from('agent_execution_runs').select('*').order('created_at', { ascending: false }).limit(filters.limit || 25)
    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters.status) query = query.eq('status', filters.status)
    const data = await requireData<DbRow[]>(query)
    return data.map(mapAgentExecutionRun)
  },

  async getAgentExecutionSteps(runId: string) {
    if (!runId) return []
    const data = await requireData<DbRow[]>(
      strategyEngineDataClient
        .from('agent_execution_steps')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true }),
    )
    return data.map(mapAgentExecutionStep)
  },

  async getAgentAutonomyPolicies(filters: { organizationId?: string; profileKey?: string } = {}) {
    let query = strategyEngineDataClient.from('agent_autonomy_policies').select('*').order('created_at', { ascending: false })
    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters.profileKey) query = query.eq('profile_key', filters.profileKey)
    const data = await requireData<DbRow[]>(query)
    return data.map(mapAgentAutonomyPolicy)
  },

  async getStrategyWorkflowSpecs() {
    const data = await requireData<DbRow[]>(strategyEngineDataClient.from('strategy_workflow_specs').select('*').order('workflow_key').order('version', { ascending: false }))
    return data.map(mapStrategyWorkflowSpec)
  },

  async getAgentLearningSignals(filters: { organizationId?: string; profileKey?: string; limit?: number } = {}) {
    let query = strategyEngineDataClient.from('agent_learning_signals').select('*').order('created_at', { ascending: false }).limit(filters.limit || 50)
    if (filters.organizationId) query = query.eq('organization_id', filters.organizationId)
    if (filters.profileKey) query = query.eq('profile_key', filters.profileKey)
    const data = await requireData<DbRow[]>(query)
    return data.map(mapAgentLearningSignal)
  },

  async getAgentImprovementRecommendations(filters: { status?: string; limit?: number } = {}) {
    let query = strategyEngineDataClient.from('agent_improvement_recommendations').select('*').order('created_at', { ascending: false }).limit(filters.limit || 50)
    if (filters.status) query = query.eq('status', filters.status)
    const data = await requireData<DbRow[]>(query)
    return data.map(mapAgentImprovementRecommendation)
  },

  async getAgentShadowExperiments(filters: { status?: string; limit?: number } = {}) {
    let query = strategyEngineDataClient.from('agent_shadow_experiments').select('*').order('created_at', { ascending: false }).limit(filters.limit || 50)
    if (filters.status) query = query.eq('status', filters.status)
    const data = await requireData<DbRow[]>(query)
    return data.map(mapAgentShadowExperiment)
  },

  async getStrategyChatSessions() {
    const data = await requireData<DbRow[]>(
      strategyEngineDataClient
        .from('yux_strategy_chat_sessions')
        .select('*')
        .eq('profile_key', 'growth_strategist')
        .eq('status', 'active')
        .order('last_message_at', { ascending: false })
        .limit(20),
    )
    return data.map(mapStrategyChatSession)
  },

  async getStrategyChatMessages(sessionId: string) {
    if (!sessionId) return []
    const data = await requireData<DbRow[]>(
      strategyEngineDataClient
        .from('yux_strategy_chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true }),
    )
    return data.map(mapStrategyChatMessage)
  },

  async runStrategyAdminChat(input: StrategyAdminChatRequest): Promise<StrategyAdminChatResponse> {
    const row = await invokeBackendFunction<{
      session: DbRow
      userMessage: DbRow
      assistantMessage: DbRow
      route?: StrategyAdminChatResponse['route']
    }>('run-strategy-admin-chat', input)
    return {
      session: mapStrategyChatSession(row.session),
      userMessage: mapStrategyChatMessage(row.userMessage),
      assistantMessage: mapStrategyChatMessage(row.assistantMessage),
      route: row.route,
    }
  },
}
