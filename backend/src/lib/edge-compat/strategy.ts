export interface StrategyContextItem {
  id?: string
  type?: 'card' | 'chunk' | 'asset' | string
  visibility?: 'internal_only' | 'client_safe' | string
  source_scope?: 'internal' | 'client' | 'public' | 'system' | string
  sourceScope?: 'internal' | 'client' | 'public' | 'system' | string
  concept?: string
  category?: string
  title?: string
  problem_solved?: string
  problemSolved?: string
  decision_rules?: string[]
  decisionRules?: string[]
  recommended_actions?: string[]
  recommendedActions?: string[]
  chunk_text?: string
  chunkText?: string
  storage_path?: string
  storagePath?: string
  [key: string]: unknown
}

export interface StrategyContextPack {
  profile_key?: string
  query?: string
  cards?: StrategyContextItem[]
  chunks?: StrategyContextItem[]
  assets?: StrategyContextItem[]
  context_text?: string
  contextText?: string
  retrieval_log?: Record<string, unknown>
  retrievalLog?: Record<string, unknown>
  [key: string]: unknown
}

export interface StrategySanitizeOptions {
  allowInternalSources?: boolean
  includeRawChunks?: boolean
  maxChunkChars?: number
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function sourceScope(item: StrategyContextItem) {
  return String(item.source_scope || item.sourceScope || '')
}

function isInternal(item: StrategyContextItem) {
  return item.visibility === 'internal_only' || sourceScope(item) === 'internal'
}

function stripInternalFields(item: StrategyContextItem) {
  const {
    chunk_text: _chunkTextSnake,
    chunkText: _chunkTextCamel,
    storage_path: _storagePathSnake,
    storagePath: _storagePathCamel,
    source_document_id: _sourceDocumentId,
    sourceDocumentId: _sourceDocumentIdCamel,
    source_chunk_id: _sourceChunkId,
    sourceChunkId: _sourceChunkIdCamel,
    ...rest
  } = item
  return rest
}

function publicCard(item: StrategyContextItem) {
  return {
    id: item.id,
    type: item.type || 'card',
    concept: item.concept || item.title,
    category: item.category,
    problemSolved: item.problemSolved || item.problem_solved,
    decisionRules: item.decisionRules || item.decision_rules || [],
    recommendedActions: item.recommendedActions || item.recommended_actions || [],
    visibility: item.visibility,
  }
}

function publicChunk(item: StrategyContextItem, options: StrategySanitizeOptions) {
  const maxChunkChars = Math.max(0, Number(options.maxChunkChars || 800))
  const rawChunk = String(item.chunkText || item.chunk_text || '')
  return {
    id: item.id,
    type: item.type || 'chunk',
    title: item.title,
    chunkText: options.includeRawChunks ? rawChunk.slice(0, maxChunkChars) : undefined,
    visibility: item.visibility,
  }
}

function publicAsset(item: StrategyContextItem) {
  return {
    id: item.id,
    type: item.type || 'asset',
    title: item.title,
    assetType: item.asset_type || item.assetType,
    visibility: item.visibility,
  }
}

export async function loadStrategyProfileContext(admin: any, profileKey: string) {
  const { data: profile, error: profileError } = await admin
    .from('yux_strategy_agent_profiles')
    .select('*')
    .eq('profile_key', profileKey)
    .eq('status', 'active')
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile) return null

  const [{ data: profileSkills, error: skillsError }, { data: actionPolicies, error: actionError }, { data: toolPolicies, error: toolError }] = await Promise.all([
    admin
      .from('yux_strategy_agent_profile_skills')
      .select('priority, yux_strategy_skills(*, yux_strategy_skill_sections(*))')
      .eq('profile_id', profile.id)
      .order('priority', { ascending: true }),
    admin
      .from('yux_strategy_profile_action_policies')
      .select('*')
      .eq('profile_id', profile.id)
      .order('action_key', { ascending: true }),
    admin
      .from('yux_strategy_profile_tool_policies')
      .select('*')
      .eq('profile_id', profile.id)
      .order('tool_key', { ascending: true }),
  ])

  if (skillsError) throw skillsError
  if (actionError) throw actionError
  if (toolError) throw toolError

  return {
    profile,
    skills: profileSkills || [],
    actionPolicies: actionPolicies || [],
    toolPolicies: toolPolicies || [],
  }
}

export function sanitizeStrategyContextForWebhook(
  context: StrategyContextPack | null | undefined,
  options: StrategySanitizeOptions = {},
) {
  if (!context) {
    return {
      profileKey: undefined,
      query: undefined,
      cards: [],
      chunks: [],
      assets: [],
    }
  }

  const allowInternalSources = Boolean(options.allowInternalSources)
  const visibleCards = asArray<StrategyContextItem>(context.cards)
    .filter((item) => allowInternalSources || !isInternal(item))
    .map((item) => allowInternalSources ? stripInternalFields(item) : publicCard(item))
  const visibleChunks = asArray<StrategyContextItem>(context.chunks)
    .filter((item) => allowInternalSources || !isInternal(item))
    .map((item) => allowInternalSources ? stripInternalFields(item) : publicChunk(item, options))
  const visibleAssets = asArray<StrategyContextItem>(context.assets)
    .filter((item) => allowInternalSources || !isInternal(item))
    .map((item) => allowInternalSources ? stripInternalFields(item) : publicAsset(item))

  return {
    profileKey: context.profile_key,
    query: context.query,
    cards: visibleCards,
    chunks: visibleChunks,
    assets: visibleAssets,
    retrievalLog: context.retrieval_log || context.retrievalLog,
  }
}

export function buildRetrievalLogPayload(input: {
  organizationId?: string | null
  clientId?: string | null
  contractId?: string | null
  profileId?: string | null
  profileKey: string
  query: string
  intent?: string | null
  stage?: string | null
  includeImages?: boolean
  portalSafe?: boolean
  filters?: Record<string, unknown>
  cards?: StrategyContextItem[]
  chunks?: StrategyContextItem[]
  assets?: StrategyContextItem[]
  scoreMetadata?: Record<string, unknown>
  contextText?: string
  status?: 'succeeded' | 'empty' | 'failed'
  errorMessage?: string | null
}) {
  return {
    organization_id: input.organizationId || null,
    client_id: input.clientId || null,
    contract_id: input.contractId || null,
    profile_id: input.profileId || null,
    profile_key: input.profileKey,
    query: input.query,
    intent: input.intent || null,
    stage: input.stage || null,
    include_images: Boolean(input.includeImages),
    portal_safe: Boolean(input.portalSafe),
    filters: input.filters || {},
    result_card_ids: asArray<StrategyContextItem>(input.cards).map((item) => item.id).filter(Boolean),
    result_chunk_ids: asArray<StrategyContextItem>(input.chunks).map((item) => item.id).filter(Boolean),
    result_asset_ids: asArray<StrategyContextItem>(input.assets).map((item) => item.id).filter(Boolean),
    score_metadata: input.scoreMetadata || {},
    context_chars: String(input.contextText || '').length,
    status: input.status || 'succeeded',
    error_message: input.errorMessage || null,
  }
}

export interface AssistantRoutingResult {
  assistant: Record<string, any> | null
  routingRuleId?: string | null
  routingScore: number
  assistantRole?: string | null
  strategyProfileId?: string | null
  strategyProfileKey?: string | null
  conversationCurrentRole?: string | null
  conversationStage?: string | null
  roleLockedUntil?: string | null
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function lowerText(value: unknown) {
  return String(value || '').toLowerCase()
}

function arrayIncludes(values: unknown, target: string | undefined) {
  if (!target || !Array.isArray(values) || values.length === 0) return false
  return values.map(value => String(value)).includes(target)
}

function roleLockActive(conversation: Record<string, any>) {
  const lockedUntil = optionalString(conversation.role_locked_until)
  return Boolean(lockedUntil && new Date(lockedUntil).getTime() > Date.now())
}

export function selectStrategyAssistantForConversation(input: {
  conversation: Record<string, any>
  assistants: Array<Record<string, any>>
  routingRules?: Array<Record<string, any>>
  messageText?: string
  intent?: string | null
  stage?: string | null
  channel?: string | null
}): AssistantRoutingResult {
  const activeAssistants = input.assistants.filter(assistant => assistant.status === 'active')
  if (activeAssistants.length === 0) return { assistant: null, routingScore: 0 }

  const currentRole = optionalString(input.conversation.conversation_current_role)
  if (currentRole && roleLockActive(input.conversation)) {
    const lockedAssistant = activeAssistants
      .filter(assistant => assistant.assistant_role === currentRole)
      .sort((left, right) => Number(left.routing_priority || 100) - Number(right.routing_priority || 100))[0]
    if (lockedAssistant) {
      return {
        assistant: lockedAssistant,
        routingScore: 10_000,
        assistantRole: lockedAssistant.assistant_role,
        strategyProfileId: lockedAssistant.strategy_profile_id,
        strategyProfileKey: lockedAssistant.yux_strategy_agent_profiles?.profile_key || null,
        conversationCurrentRole: currentRole,
        conversationStage: input.conversation.conversation_stage || input.stage || null,
        roleLockedUntil: input.conversation.role_locked_until,
      }
    }
  }

  const messageText = lowerText(input.messageText)
  const scored = activeAssistants.map((assistant) => {
    const assistantRules = (input.routingRules || []).filter(rule => rule.assistant_id === assistant.id && rule.status === 'active')
    let bestRule: Record<string, any> | null = null
    let bestRuleScore = 0

    for (const rule of assistantRules) {
      let score = Number(rule.score_weight || 0)
      if (rule.default_rule) score += 1
      if (rule.channel && rule.channel === input.channel) score += 3
      if (rule.required_role && rule.required_role === assistant.assistant_role) score += 3
      if (arrayIncludes(rule.stage_keys, input.stage || undefined)) score += 4
      if (arrayIncludes(rule.intent_keys, input.intent || undefined)) score += 4
      if (Array.isArray(rule.keyword_patterns) && rule.keyword_patterns.some((keyword: unknown) => messageText.includes(lowerText(keyword)))) {
        score += 5
      }
      if (score > bestRuleScore) {
        bestRuleScore = score
        bestRule = rule
      }
    }

    const roleScore = assistant.assistant_role === currentRole ? 2 : 0
    const priorityScore = Math.max(0, 1000 - Number(assistant.routing_priority || 100)) / 1000
    return {
      assistant,
      bestRule,
      score: bestRuleScore + roleScore + priorityScore,
    }
  }).sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    const priorityDiff = Number(left.assistant.routing_priority || 100) - Number(right.assistant.routing_priority || 100)
    if (priorityDiff !== 0) return priorityDiff
    return lowerText(right.assistant.updated_at).localeCompare(lowerText(left.assistant.updated_at))
  })

  const selected = scored[0]
  return {
    assistant: selected.assistant,
    routingRuleId: selected.bestRule?.id || null,
    routingScore: selected.score,
    assistantRole: selected.assistant.assistant_role || null,
    strategyProfileId: selected.assistant.strategy_profile_id || null,
    strategyProfileKey: selected.assistant.yux_strategy_agent_profiles?.profile_key || null,
    conversationCurrentRole: currentRole || null,
    conversationStage: input.conversation.conversation_stage || input.stage || null,
    roleLockedUntil: input.conversation.role_locked_until || null,
  }
}
