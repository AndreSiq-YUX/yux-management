import {
  callN8nWebhookWithTimeout,
  corsHeaders,
  formatProtectedError,
  getServiceRoleClient,
  getUserClient,
  json,
} from '../_shared/edge.ts'
import {
  buildSafeAiFallback,
  buildCrmAiInsightPayload,
  calculateAiRunCost,
  planAiResponse,
  sanitizeWebhookMetadata,
  selectPublishedKnowledge,
} from '../_shared/omnichannel.ts'
import { selectStrategyAssistantForConversation } from '../_shared/strategy.ts'
import { dispatchOutboundMessage } from '../dispatch-outbound-message/index.ts'

if (import.meta.main) {
  Deno.serve(async req => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    try {
      const authorization = req.headers.get('Authorization')
      if (!authorization) return json({ error: 'Unauthorized' }, 401)
      const { conversationId, inboundMessageId } = await req.json()
      if (!conversationId) return json({ error: 'conversationId is required' }, 400)

      const { data: visible } = await getUserClient(authorization)
        .from('conversations')
        .select('id')
        .eq('id', conversationId)
        .single()
      if (!visible) return json({ error: 'Conversation not found' }, 404)

      return json({ success: true, ai: await processAiMessage(getServiceRoleClient(), conversationId, inboundMessageId) })
    } catch (error) {
      return json({ error: formatProtectedError(error) }, 500)
    }
  })
}

export async function processAiMessage(admin: ReturnType<typeof getServiceRoleClient>, conversationId: string, inboundMessageId?: string) {
  const { data: conversation, error: conversationError } = await admin
    .from('conversations')
    .select('*, omnichannel_contacts(*), omnichannel_settings(*)')
    .eq('id', conversationId)
    .single()
  if (conversationError || !conversation) throw conversationError || new Error('Conversation not found')

  const plan = planAiResponse({ responseMode: conversation.response_mode, inboundMessageId })
  if (!plan.shouldGenerate) return { skipped: true, reason: 'manual_mode' }

  const startedAt = Date.now()
  const { data: recentMessages } = await admin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(12)

  const { data: knowledge } = await admin
    .from('knowledge_publications')
    .select('status, body_snapshot')
    .eq('organization_id', conversation.organization_id)
    .order('published_at', { ascending: false })
    .limit(8)

  const settings = Array.isArray(conversation.omnichannel_settings)
    ? conversation.omnichannel_settings[0]
    : conversation.omnichannel_settings
  const routing = await loadAssistantSettings(admin, conversation, recentMessages || [])
  const assistant = routing.assistant
  const modelRoute = await loadStrategyModelRoute(admin, routing.strategyProfileKey || assistant?.yux_strategy_agent_profiles?.profile_key || null)
  const autonomyPolicies = await loadAgentAutonomyPolicies(admin, conversation, assistant, routing)
  const assistantMetadata = buildAssistantRunMetadata(assistant, routing)
  const webhookPayload = {
    conversation,
    messages: (recentMessages || []).reverse(),
    knowledge: selectPublishedKnowledge(knowledge || []),
    settings,
    assistant,
    strategy: {
      assistantRole: routing.assistantRole,
      strategyProfileId: routing.strategyProfileId,
      strategyProfileKey: routing.strategyProfileKey,
      routingRuleId: routing.routingRuleId,
      routingScore: routing.routingScore,
      conversationCurrentRole: routing.conversationCurrentRole,
      conversationStage: routing.conversationStage,
      roleLockedUntil: routing.roleLockedUntil,
      modelRoute,
      autonomyPolicies,
    },
  }

  const { data: run, error: runError } = await admin.from('ai_message_runs').insert({
    organization_id: conversation.organization_id,
    conversation_id: conversation.id,
    inbound_message_id: inboundMessageId || null,
    logical_provider: modelRoute?.provider || settings?.ai_logical_provider || 'n8n',
    model: modelRoute?.model_name || settings?.ai_model || 'provider-neutral',
    status: 'processing',
    metadata: { source: 'process-ai-message', assistant: assistantMetadata, modelRoute },
  }).select().single()
  if (runError) throw runError

  let text = ''
  let fallback = false
  let tokenUsage = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 }
  let metadata: Record<string, unknown> = {}
  let protectedErrorText: string | null = null

  const runtimeResult = await callAgentHarnessRuntime(Deno.env.get('YUX_AGENT_RUNTIME_URL'), Deno.env.get('YUX_AGENT_RUNTIME_TOKEN'), webhookPayload)
  const webhookResult = runtimeResult.configured
    ? runtimeResult
    : await callN8nWebhookWithTimeout(Deno.env.get('N8N_OMNICHANNEL_AI_WEBHOOK_URL'), webhookPayload)

  if (webhookResult.configured && webhookResult.ok && typeof webhookResult.body === 'object' && webhookResult.body) {
    const body = normalizeAiProviderBody(webhookResult.body as Record<string, unknown>)
    text = typeof body.text === 'string' ? body.text : 'Resposta gerada para revisao.'
    tokenUsage = calculateAiRunCost({
      inputTokens: body.inputTokens as number | string || 0,
      outputTokens: body.outputTokens as number | string || 0,
      inputTokenPricePerMillion: settings?.ai_token_prices?.inputPerMillion || 0,
      outputTokenPricePerMillion: settings?.ai_token_prices?.outputPerMillion || 0,
    })
    metadata = {
      assistant: assistantMetadata,
      modelRoute,
      runtime: runtimeResult.configured ? sanitizeWebhookMetadata(runtimeResult) : undefined,
      provider: sanitizeWebhookMetadata(body),
    }
  } else {
    const safeFallback = buildSafeAiFallback(webhookResult.error || 'AI webhook unavailable')
    text = safeFallback.text
    fallback = true
    protectedErrorText = safeFallback.protectedErrorText
    metadata = {
      assistant: assistantMetadata,
      modelRoute,
      webhook: sanitizeWebhookMetadata(webhookResult),
    }
  }

  const { data: outbound, error: outboundError } = await admin.from('messages').insert({
    conversation_id: conversation.id,
    connection_id: conversation.connection_id,
    direction: 'outbound',
    author_type: 'ai',
    content_type: 'text',
    body: text,
    delivery_status: 'queued',
    metadata: { suggestionOnly: plan.suggestionOnly, aiRunId: run.id },
  }).select().single()
  if (outboundError) throw outboundError

  let dispatch = null
  if (plan.shouldDispatch) {
    dispatch = await dispatchOutboundMessage(admin, outbound.id)
  }

  await admin.from('ai_message_runs').update({
    outbound_message_id: outbound.id,
    status: fallback ? 'fallback' : 'completed',
    input_tokens: tokenUsage.inputTokens,
    output_tokens: tokenUsage.outputTokens,
    estimated_cost: tokenUsage.estimatedCost,
    latency_ms: Date.now() - startedAt,
    fallback_used: fallback,
    protected_error_text: protectedErrorText,
    metadata,
  }).eq('id', run.id)

  const crmInsight = await persistCrmAiInsight(admin, conversation, run.id, text, metadata)

  return { runId: run.id, outboundMessageId: outbound.id, dispatch, fallbackUsed: fallback, crmInsightId: crmInsight?.id || null }
}

async function persistCrmAiInsight(
  admin: ReturnType<typeof getServiceRoleClient>,
  conversation: Record<string, any>,
  aiRunId: string,
  outputText: string,
  metadata: Record<string, unknown>,
) {
  const contact = Array.isArray(conversation.omnichannel_contacts)
    ? conversation.omnichannel_contacts[0]
    : conversation.omnichannel_contacts
  const leadId = conversation.lead_id || contact?.lead_id

  if (!leadId) return null

  const { data: lead, error: leadError } = await admin
    .from('leads')
    .select('id, organization_id, crm_instance_id')
    .eq('id', leadId)
    .maybeSingle()

  if (leadError || !lead?.crm_instance_id) return null

  const payload = buildCrmAiInsightPayload({
    organizationId: conversation.organization_id,
    crmInstanceId: lead.crm_instance_id,
    leadId: lead.id,
    conversationId: conversation.id,
    aiRunId,
    outputText,
    metadata,
  })

  const { data: insight, error: insightError } = await admin
    .from('lead_ai_insights')
    .insert(payload)
    .select('id')
    .single()

  if (insightError) {
    console.warn('CRM AI insight persistence failed:', insightError.message)
    return null
  }

  await admin
    .from('leads')
    .update({
      ai_summary: payload.summary,
      intent: payload.intent,
      sentiment: payload.sentiment,
      urgency_detected_at: payload.urgency === 'high' ? new Date().toISOString() : null,
      last_conversation_at: new Date().toISOString(),
    })
    .eq('id', lead.id)

  return insight
}

async function loadAssistantSettings(admin: ReturnType<typeof getServiceRoleClient>, conversation: Record<string, any>, recentMessages: Array<Record<string, any>>) {
  const contact = Array.isArray(conversation.omnichannel_contacts)
    ? conversation.omnichannel_contacts[0]
    : conversation.omnichannel_contacts
  const { data, error } = await admin
    .from('ai_assistants')
    .select(`
      *,
      ai_assistant_objectives(*),
      ai_assistant_required_fields(*),
      ai_assistant_handoff_rules(*),
      ai_assistant_safety_rules(*),
      ai_assistant_knowledge_links(*, knowledge_entries(id, title, status)),
      yux_strategy_agent_profiles(profile_key)
    `)
    .eq('organization_id', conversation.organization_id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(10)
  if (error) throw error

  const assistants = data || []
  const scopedAssistants = assistants.filter((assistant: Record<string, unknown>) => (
    assistant.client_id && assistant.client_id === contact?.client_id
  ))
  const fallbackAssistants = assistants.filter((assistant: Record<string, unknown>) => !assistant.client_id && !assistant.contract_id)
  const candidates = scopedAssistants.length > 0 ? scopedAssistants : fallbackAssistants
  if (candidates.length === 0) {
    return { assistant: null, routingScore: 0 }
  }

  const { data: routingRules, error: routingError } = await admin
    .from('ai_assistant_routing_rules')
    .select('*')
    .in('assistant_id', candidates.map((assistant: Record<string, unknown>) => assistant.id))
  if (routingError) throw routingError

  const latestInbound = [...recentMessages].reverse().find(message => message.direction === 'inbound') || recentMessages[0]
  const routing = selectStrategyAssistantForConversation({
    conversation,
    assistants: candidates,
    routingRules: routingRules || [],
    messageText: latestInbound?.body || '',
    intent: conversation.intent || latestInbound?.metadata?.intent || null,
    stage: conversation.conversation_stage || contact?.commercial_stage || null,
    channel: conversation.channel || null,
  })

  if (routing.assistant && routing.assistantRole && routing.assistantRole !== conversation.conversation_current_role) {
    const lockMinutes = Number(routing.assistant.routing_metadata?.lockRoleMinutes || 30)
    await admin
      .from('conversations')
      .update({
        conversation_current_role: routing.assistantRole,
        conversation_current_strategy_profile_id: routing.strategyProfileId || null,
        conversation_stage: routing.conversationStage || conversation.conversation_stage || null,
        role_locked_until: new Date(Date.now() + lockMinutes * 60_000).toISOString(),
      })
      .eq('id', conversation.id)
  }

  return routing
}

async function callAgentHarnessRuntime(runtimeUrl: string | undefined, runtimeToken: string | undefined, payload: Record<string, any>) {
  if (!runtimeUrl) return { configured: false, ok: false, error: 'runtime_not_configured' }
  const latestMessage = [...(payload.messages || [])].reverse().find((message: Record<string, any>) => message.direction === 'inbound') || {}
  const strategy = payload.strategy || {}
  const response = await fetch(`${runtimeUrl.replace(/\/$/, '')}/workflows/execute`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(runtimeToken ? { Authorization: `Bearer ${runtimeToken}` } : {}),
    },
    body: JSON.stringify({
      message: latestMessage.body || '',
      profile_key: strategy.strategyProfileKey || 'ai_sdr_comercial_1',
      source: 'whatsapp',
      organization_id: payload.conversation?.organization_id || null,
      client_id: payload.conversation?.client_id || null,
      conversation_id: payload.conversation?.id || null,
      assistant_id: payload.assistant?.id || null,
      mode: 'conversation_turn',
      retrieval_context: null,
      autonomy_policies: strategy.autonomyPolicies || [],
    }),
  }).catch(error => ({ ok: false, status: 0, text: () => Promise.resolve(String(error)) } as Response))
  const text = await response.text()
  const body = safeJson(text)
  if (!response.ok) {
    return { configured: true, ok: false, error: `runtime_${response.status}:${text.slice(0, 500)}`, body }
  }
  return { configured: true, ok: true, body }
}

function normalizeAiProviderBody(body: Record<string, unknown>) {
  const synthesis = body.synthesis as Record<string, unknown> | undefined
  const run = body.run as Record<string, unknown> | undefined
  if (synthesis && typeof synthesis.answer === 'string') {
    return {
      ...body,
      text: synthesis.answer,
      inputTokens: run?.input_tokens || 0,
      outputTokens: run?.output_tokens || 0,
    }
  }
  return body
}

async function loadStrategyModelRoute(admin: ReturnType<typeof getServiceRoleClient>, profileKey?: string | null) {
  if (!profileKey) return null

  const { data, error } = await admin
    .from('model_routing_rules')
    .select('*')
    .eq('agent_type', profileKey)
    .eq('routing_tier', 'default')
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    console.warn('Strategy model route lookup failed:', error.message)
    return null
  }

  return data
    ? sanitizeWebhookMetadata({
      id: data.id,
      agent_type: data.agent_type,
      routing_tier: data.routing_tier,
      provider: data.provider,
      model_name: data.model_name,
      fallback_model_name: data.fallback_model_name,
      max_input_tokens: data.max_input_tokens,
      max_output_tokens: data.max_output_tokens,
      temperature: data.temperature,
      max_cost_per_run: data.max_cost_per_run,
    }) as Record<string, unknown>
    : null
}

async function loadAgentAutonomyPolicies(
  admin: ReturnType<typeof getServiceRoleClient>,
  conversation: Record<string, any>,
  assistant: Record<string, any> | null,
  routing: Record<string, any>,
) {
  const profileKey = routing.strategyProfileKey || assistant?.yux_strategy_agent_profiles?.profile_key || null
  let query = admin
    .from('agent_autonomy_policies')
    .select('*')
    .eq('status', 'active')
    .or(`organization_id.is.null,organization_id.eq.${conversation.organization_id}`)
    .limit(20)
  if (profileKey) {
    query = query.or(`profile_key.is.null,profile_key.eq.${profileKey}`)
  }
  const { data, error } = await query
  if (error) {
    console.warn('Agent autonomy policies lookup failed:', error.message)
    return []
  }
  return (data || []).filter((policy: Record<string, unknown>) => {
    if (policy.assistant_id && policy.assistant_id !== assistant?.id) return false
    if (policy.channel && policy.channel !== conversation.channel) return false
    return true
  }).map((policy: Record<string, unknown>) => sanitizeWebhookMetadata(policy))
}

function buildAssistantRunMetadata(assistant: Record<string, any> | null, routing?: unknown) {
  if (!assistant) return { assistantConfigured: false }

  return sanitizeWebhookMetadata({
    assistantConfigured: true,
    assistantId: assistant.id,
    assistantRole: assistant.assistant_role,
    strategyProfileId: assistant.strategy_profile_id,
    routing,
    name: assistant.name,
    tone: assistant.tone,
    objectives: (assistant.ai_assistant_objectives || []).map((objective: Record<string, unknown>) => objective.label),
    requiredFields: (assistant.ai_assistant_required_fields || []).map((field: Record<string, unknown>) => field.field_key),
    handoffRules: (assistant.ai_assistant_handoff_rules || [])
      .filter((rule: Record<string, unknown>) => rule.is_enabled)
      .map((rule: Record<string, unknown>) => rule.name),
    safetyRules: (assistant.ai_assistant_safety_rules || [])
      .filter((rule: Record<string, unknown>) => rule.is_enabled)
      .map((rule: Record<string, unknown>) => rule.name),
    knowledgeLinks: (assistant.ai_assistant_knowledge_links || []).map((link: Record<string, any>) => link.knowledge_entries?.title),
    summaryEnabled: assistant.summary_enabled,
    classificationEnabled: assistant.classification_enabled,
  }) as Record<string, unknown>
}

function safeJson(text: string) {
  try {
    return text ? JSON.parse(text) : null
  } catch {
    return null
  }
}
