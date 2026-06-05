import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'
import { deriveTokenStateFromGraphStatus, sanitizeMetaGraphPayload } from '../_shared/metaChannel.ts'

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

    const nextStatus = deriveLocalHealthStatus(visible)
    const admin = getServiceRoleClient()
    const { data, error } = await admin.from('channel_connections').update({
      health_status: nextStatus,
      health_checked_at: new Date().toISOString(),
      health_summary: `Health checked locally with token state ${visible.token_state || 'not_configured'}`,
    }).eq('id', connectionId).select().single()
    if (error) return json({ error: error.message }, 400)

    await admin.from('channel_health_checks').insert({
      organization_id: data.organization_id,
      connection_id: data.id,
      channel: data.channel,
      previous_status: visible.health_status,
      next_status: nextStatus,
      check_type: 'manual',
      sanitized_response: sanitizeMetaGraphPayload({ status: deriveTokenStateFromGraphStatus(200), local: true }),
    })

    return json({ success: true, connection: data })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to refresh Meta channel health' }, 400)
  }
})

function deriveLocalHealthStatus(connection: Record<string, unknown>) {
  if (connection.disconnected_at) return 'disconnected'
  if (!connection.is_active) return 'disabled'
  if (connection.token_state === 'needs_reauth') return 'needs_reauth'
  if (connection.token_state === 'failed' || connection.provider_verify_state === 'failed') return 'failed'
  if (connection.token_state === 'stale') return 'stale'
  if (connection.provider_verify_state === 'verified' && connection.token_state === 'connected') return 'connected'
  return 'pending'
}
