import {
  callN8nWebhookWithTimeout,
  corsHeaders,
  formatProtectedError,
  getServiceRoleClient,
  getUserClient,
  json,
} from '../_shared/edge.ts'
import { buildPendingSchedulingRequest, sanitizeWebhookMetadata } from '../_shared/omnichannel.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)
    const body = await req.json()
    if (!body.conversationId || !body.requestedSlot) return json({ error: 'conversationId and requestedSlot are required' }, 400)

    const { data: visibleConversation } = await getUserClient(authorization)
      .from('conversations')
      .select('id, organization_id, contact_id, lead_id')
      .eq('id', body.conversationId)
      .single()
    if (!visibleConversation) return json({ error: 'Conversation not found' }, 404)

    const pending = buildPendingSchedulingRequest({
      conversationId: visibleConversation.id,
      contactId: visibleConversation.contact_id,
      requestedSlot: body.requestedSlot,
    })

    const webhookResult = await callN8nWebhookWithTimeout(Deno.env.get('N8N_OMNICHANNEL_SCHEDULING_WEBHOOK_URL'), {
      ...pending,
      leadId: visibleConversation.lead_id,
    })
    const configured = Boolean(webhookResult.configured)
    const success = Boolean(configured && webhookResult.ok)
    const admin = getServiceRoleClient()
    const { data: requestRow, error } = await admin.from('scheduling_requests').insert({
      organization_id: visibleConversation.organization_id,
      conversation_id: visibleConversation.id,
      contact_id: visibleConversation.contact_id,
      lead_id: visibleConversation.lead_id,
      requested_slot: body.requestedSlot,
      status: success ? 'requested' : 'pending',
      external_reference: success && typeof webhookResult.body === 'object' ? (webhookResult.body as Record<string, unknown>).externalReference || null : null,
      n8n_metadata: configured ? sanitizeWebhookMetadata(webhookResult) : pending.n8nMetadata,
    }).select().single()
    if (error) throw error

    return json({ success: true, schedulingRequest: requestRow })
  } catch (error) {
    return json({ error: formatProtectedError(error) }, 500)
  }
})
