import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'

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
    await admin.from('channel_connection_audit_events').insert({
      organization_id: visible.organization_id,
      connection_id: visible.id,
      actor_user_id: user?.id || null,
      event_type: 'test_sent',
      source: 'portal',
      safe_after: {
        channel: visible.channel,
        adapterKey: visible.adapter_key,
        providerAssetId: visible.provider_asset_id,
        healthStatus: visible.health_status,
        tokenState: visible.token_state,
      },
    })

    return json({ success: true, message: 'Teste registrado. Envio real depende da janela e das permissoes do canal.' })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to send Meta channel test' }, 400)
  }
})
