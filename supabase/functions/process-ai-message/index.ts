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
  const webhookPayload = {
    conversation,
    messages: (recentMessages || []).reverse(),
    knowledge: selectPublishedKnowledge(knowledge || []),
    settings,
  }

  const { data: run, error: runError } = await admin.from('ai_message_runs').insert({
    organization_id: conversation.organization_id,
    conversation_id: conversation.id,
    inbound_message_id: inboundMessageId || null,
    logical_provider: settings?.ai_logical_provider || 'n8n',
    model: settings?.ai_model || 'provider-neutral',
    status: 'processing',
    metadata: { source: 'process-ai-message' },
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
    metadata = sanitizeWebhookMetadata(body) as Record<string, unknown>
  } else {
    const safeFallback = buildSafeAiFallback(webhookResult.error || 'AI webhook unavailable')
    text = safeFallback.text
    fallback = true
    protectedErrorText = safeFallback.protectedErrorText
    metadata = { webhook: sanitizeWebhookMetadata(webhookResult) }
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

  return { runId: run.id, outboundMessageId: outbound.id, dispatch, fallbackUsed: fallback }
}
