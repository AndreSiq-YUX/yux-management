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
  const assistant = await loadAssistantSettings(admin, conversation)
  const assistantMetadata = buildAssistantRunMetadata(assistant)
  const webhookPayload = {
    conversation,
    messages: (recentMessages || []).reverse(),
    knowledge: selectPublishedKnowledge(knowledge || []),
    settings,
    assistant,
  }

  const { data: run, error: runError } = await admin.from('ai_message_runs').insert({
    organization_id: conversation.organization_id,
    conversation_id: conversation.id,
    inbound_message_id: inboundMessageId || null,
    logical_provider: settings?.ai_logical_provider || 'n8n',
    model: settings?.ai_model || 'provider-neutral',
    status: 'processing',
    metadata: { source: 'process-ai-message', assistant: assistantMetadata },
  }).select().single()
  if (runError) throw runError

  let text = ''
  let fallback = false
  let tokenUsage = { inputTokens: 0, outputTokens: 0, estimatedCost: 0 }
  let metadata: Record<string, unknown> = {}
  let protectedErrorText: string | null = null

  const webhookResult = await callN8nWebhookWithTimeout(Deno.env.get('N8N_OMNICHANNEL_AI_WEBHOOK_URL'), webhookPayload)
  if (webhookResult.configured && webhookResult.ok && typeof webhookResult.body === 'object' && webhookResult.body) {
    const body = webhookResult.body as Record<string, unknown>
    text = typeof body.text === 'string' ? body.text : 'Resposta gerada para revisao.'
    tokenUsage = calculateAiRunCost({
      inputTokens: body.inputTokens as number | string || 0,
      outputTokens: body.outputTokens as number | string || 0,
      inputTokenPricePerMillion: settings?.ai_token_prices?.inputPerMillion || 0,
      outputTokenPricePerMillion: settings?.ai_token_prices?.outputPerMillion || 0,
    })
    metadata = {
      assistant: assistantMetadata,
      provider: sanitizeWebhookMetadata(body),
    }
  } else {
    const safeFallback = buildSafeAiFallback(webhookResult.error || 'AI webhook unavailable')
    text = safeFallback.text
    fallback = true
    protectedErrorText = safeFallback.protectedErrorText
    metadata = {
      assistant: assistantMetadata,
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

async function loadAssistantSettings(admin: ReturnType<typeof getServiceRoleClient>, conversation: Record<string, any>) {
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
      ai_assistant_knowledge_links(*, knowledge_entries(id, title, status))
    `)
    .eq('organization_id', conversation.organization_id)
    .eq('status', 'active')
    .order('updated_at', { ascending: false })
    .limit(10)
  if (error) throw error

  const assistants = data || []
  return assistants.find((assistant: Record<string, unknown>) => (
    assistant.client_id && assistant.client_id === contact?.client_id
  )) || assistants.find((assistant: Record<string, unknown>) => !assistant.client_id && !assistant.contract_id) || null
}

function buildAssistantRunMetadata(assistant: Record<string, any> | null) {
  if (!assistant) return { assistantConfigured: false }

  return sanitizeWebhookMetadata({
    assistantConfigured: true,
    assistantId: assistant.id,
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
