import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'
import { sanitizeWebhookMetadata } from '../_shared/omnichannel.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Unauthorized' }, 401)

  try {
    const { connectionId } = await req.json()
    if (!connectionId) return json({ error: 'connectionId is required' }, 400)

    const userClient = getUserClient(authorization)
    const { data: visible } = await userClient.from('channel_connections').select('*').eq('id', connectionId).single()
    if (!visible) return json({ error: 'Connection not found' }, 404)
    const { data: { user } } = await userClient.auth.getUser()

    const admin = getServiceRoleClient()
    const now = new Date().toISOString()
    const { data, error } = await admin.from('channel_connections').update({
      is_active: false,
      disconnected_at: now,
      health_status: 'disconnected',
      token_state: 'not_configured',
      updated_at: now,
    }).eq('id', connectionId).select().single()
    if (error) return json({ error: error.message }, 400)

    await admin.from('channel_connection_audit_events').insert({
      organization_id: data.organization_id,
      connection_id: data.id,
      actor_user_id: user?.id || null,
      event_type: 'disconnected',
      source: 'portal',
      safe_before: sanitizeWebhookMetadata(visible),
      safe_after: sanitizeWebhookMetadata(data),
    })

    return json({ success: true, connection: data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to disconnect Meta channel' }, 400)
  }
})
