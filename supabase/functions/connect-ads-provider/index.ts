import { corsHeaders, getAdminClient, json, requireAuthenticatedUser, hashToken } from '../_shared/edge.ts'
import { sanitizeProviderError, sanitizeProviderMetadata } from '../_shared/adsProvider.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authorization = req.headers.get('Authorization')
    const { user } = await requireAuthenticatedUser(authorization)
    const admin = getAdminClient()
    await requireInternalUser(admin, user.id)

    const body = await req.json()
    const provider = requireProvider(body.provider)
    const organizationId = requireString(body.organizationId, 'organizationId')
    const name = requireString(body.name, 'name')
    const accessToken = optionalString(body.accessToken)
    const tokenReference = optionalString(body.tokenReference)

    const { data, error } = await admin.from('ad_provider_connections').upsert({
      organization_id: organizationId,
      provider,
      name,
      status: accessToken || tokenReference ? 'connected' : 'needs_reauth',
      token_reference: accessToken ? await hashToken(accessToken) : tokenReference || null,
      protected_error: null,
      metadata: sanitizeProviderMetadata(body.metadata || {}),
      last_sync_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,provider,name' }).select('id, organization_id, provider, name, status, last_sync_at, created_at, updated_at').single()

    if (error) throw error
    return json({ success: true, connection: data })
  } catch (error) {
    return json({ error: sanitizeProviderError(error) }, 500)
  }
})

async function requireInternalUser(admin: any, userId: string) {
  const { data, error } = await admin
    .from('memberships')
    .select('roles(scope)')
    .eq('user_id', userId)
  if (error) throw error
  if (!data?.some((membership: any) => membership.roles?.scope === 'internal')) {
    throw new Error('Internal permission required')
  }
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function requireProvider(value: unknown) {
  const provider = requireString(value, 'provider')
  if (provider !== 'meta' && provider !== 'google') throw new Error(`Unsupported provider: ${provider}`)
  return provider
}
