import { corsHeaders, getUserClient, json } from '../_shared/edge.ts'
import { hashToken } from '../_shared/omnichannel.ts'
import { validateMetaChannel } from '../_shared/metaChannel.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const authorization = req.headers.get('Authorization')
  if (!authorization) return json({ error: 'Unauthorized' }, 401)

  try {
    const body = await req.json()
    const organizationId = requireString(body.organizationId, 'organizationId')
    const channel = validateMetaChannel(body.channel)
    const state = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString()
    const userClient = getUserClient(authorization)
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Unauthorized' }, 401)

    const { error } = await userClient.from('meta_oauth_sessions').insert({
      organization_id: organizationId,
      user_id: user.id,
      requested_channel: channel,
      state_hash: await hashToken(state),
      expires_at: expiresAt,
    })
    if (error) throw error

    return json({
      channel,
      state,
      appId: Deno.env.get('META_APP_ID'),
      graphVersion: Deno.env.get('META_GRAPH_VERSION') || 'v20.0',
      embeddedSignupConfigId: Deno.env.get('META_WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID'),
      redirectUri: Deno.env.get('META_OAUTH_REDIRECT_URI'),
      expiresAt,
    })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Failed to start Meta connection' }, 400)
  }
})

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}
