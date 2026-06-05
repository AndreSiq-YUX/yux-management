import { corsHeaders, getUserClient, json } from '../_shared/edge.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const organizationId = requireString(body.organizationId, 'organizationId')
    const { data, error } = await getUserClient(authorization)
      .from('channel_connections')
      .select([
        'id',
        'organization_id',
        'channel',
        'name',
        'is_active',
        'adapter_key',
        'provider_account_id',
        'provider_asset_id',
        'provider_business_id',
        'provider_display_name',
        'provider_username',
        'provider_scopes',
        'phone_number_id',
        'provider_verify_state',
        'token_state',
        'last_provider_sync_at',
        'connected_at',
        'disconnected_at',
        'reauth_required_at',
        'health_checked_at',
        'health_status',
        'health_summary',
        'fallback_mode',
        'created_at',
        'updated_at',
      ].join(', '))
      .eq('organization_id', organizationId)
      .in('channel', ['whatsapp', 'instagram', 'messenger'])
      .is('disconnected_at', null)
      .order('channel')
    if (error) return json({ error: error.message }, 400)
    return json({ connections: data || [] })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to list Meta channel assets' }, 400)
  }
})

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}
