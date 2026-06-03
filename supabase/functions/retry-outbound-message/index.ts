import { corsHeaders, formatProtectedError, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'
import { dispatchOutboundMessage } from '../dispatch-outbound-message/index.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)
    const { messageId } = await req.json()
    if (!messageId) return json({ error: 'messageId is required' }, 400)

    const { data: visible } = await getUserClient(authorization)
      .from('messages')
      .select('id, delivery_status')
      .eq('id', messageId)
      .eq('delivery_status', 'failed')
      .single()
    if (!visible) return json({ error: 'Failed outbound message not found' }, 404)

    return json({ success: true, retry: await dispatchOutboundMessage(getServiceRoleClient(), messageId) })
  } catch (error) {
    return json({ error: formatProtectedError(error) }, 500)
  }
})
