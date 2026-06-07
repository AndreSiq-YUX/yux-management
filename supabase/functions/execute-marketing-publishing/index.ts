import { corsHeaders, formatProtectedError, getAdminClient, json, requireAuthenticatedUser } from '../_shared/edge.ts'
import { loadProviderSecret } from '../_shared/providerSecrets.ts'
import {
  executeSocialPublishingAction,
  SocialPublishingProviderError,
  type SocialPublishingAction,
} from '../_shared/socialPublishingProvider.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let runId: string | undefined
  let connectionId: string | undefined
  try {
    const authorization = req.headers.get('Authorization')
    const { user } = await requireAuthenticatedUser(authorization)
    const admin = getAdminClient()
    const body = await req.json()
    const run = body.publishingRunId
      ? await loadPublishingRun(admin, requireString(body.publishingRunId, 'publishingRunId'))
      : await createPublishingRun(admin, body, user.id)
    runId = run.id
    connectionId = run.connection_id

    await requireMarketingAccess(admin, user.id, run.organization_id, run.action === 'publish' ? 'supervise' : 'write')

    if (run.status === 'succeeded') return json({ success: true, duplicate: true, run })
    if (run.status === 'running') throw new Error('publishing_run_already_running')

    const [{ data: connection, error: connectionError }, { data: content, error: contentError }] = await Promise.all([
      admin.from('publishing_connections').select('*').eq('id', run.connection_id).single(),
      admin.from('content_items').select('*').eq('id', run.content_item_id).single(),
    ])
    if (connectionError) throw connectionError
    if (contentError) throw contentError
    validateConnection(connection)
    validateContentForAction(connection, content, run.action)

    await admin
      .from('publishing_runs')
      .update({ status: 'running', protected_error: null, started_at: new Date().toISOString() })
      .eq('id', run.id)

    const accessToken = await loadAccessToken(admin, connection)
    const response = await executeSocialPublishingAction({
      connection,
      content,
      run,
      accessToken,
      graphVersion: Deno.env.get('META_GRAPH_VERSION') || 'v20.0',
    })
    const completedAt = new Date().toISOString()
    const { data: completedRun, error: updateError } = await admin
      .from('publishing_runs')
      .update({
        status: 'succeeded',
        provider_post_id: response.providerPostId,
        published_url: response.publishedUrl || null,
        external_asset_id: response.externalAssetId || null,
        external_parent_id: response.externalParentId || null,
        response_payload: response.responsePayload,
        protected_error: null,
        completed_at: completedAt,
      })
      .eq('id', run.id)
      .select('*')
      .single()
    if (updateError) throw updateError

    await Promise.all([
      updateContentAfterPublishing(admin, content.id, run.action, response, completedAt),
      updateConnectionAfterPublishing(admin, connection.id, run.action, completedAt),
    ])
    return json({ success: true, run: completedRun })
  } catch (error) {
    const protectedError = formatProtectedError(error)
    const authFailure = error instanceof SocialPublishingProviderError && error.authFailure
    if (runId) {
      try {
        const admin = getAdminClient()
        await Promise.all([
          admin
            .from('publishing_runs')
            .update({ status: 'failed', protected_error: protectedError, completed_at: new Date().toISOString() })
            .eq('id', runId),
          authFailure && connectionId
            ? admin
              .from('publishing_connections')
              .update({ status: 'needs_reauth', protected_error: protectedError, reauth_required_at: new Date().toISOString() })
              .eq('id', connectionId)
            : Promise.resolve(),
        ])
      } catch {
        // Preserve original error response.
      }
    }
    return json({ error: protectedError }, 500)
  }
})

async function loadPublishingRun(admin: any, publishingRunId: string) {
  const { data, error } = await admin.from('publishing_runs').select('*').eq('id', publishingRunId).single()
  if (error) throw error
  return data
}

async function createPublishingRun(admin: any, body: Record<string, unknown>, userId: string) {
  const action = requireAction(body.action)
  const organizationId = requireString(body.organizationId, 'organizationId')
  const clientId = requireString(body.clientId, 'clientId')
  const contractId = requireString(body.contractId, 'contractId')
  const connectionId = requireString(body.connectionId, 'connectionId')
  const contentItemId = requireString(body.contentItemId, 'contentItemId')
  const idempotencyKey = optionalString(body.idempotencyKey) || `${connectionId}:${contentItemId}:${action}:latest`

  const { data, error } = await admin.from('publishing_runs').upsert({
    organization_id: organizationId,
    client_id: clientId,
    contract_id: contractId,
    connection_id: connectionId,
    content_item_id: contentItemId,
    calendar_item_id: optionalString(body.calendarItemId) || null,
    workflow_run_id: optionalString(body.workflowRunId) || null,
    action,
    status: 'queued',
    idempotency_key: idempotencyKey,
    request_payload: safeObject(body.requestPayload),
    requested_by: userId,
    approved_by: action === 'publish' ? userId : null,
  }, { onConflict: 'connection_id,idempotency_key' }).select('*').single()
  if (error) throw error
  return data
}

async function requireMarketingAccess(admin: any, userId: string, organizationId: string, action: 'write' | 'supervise') {
  const acceptedPermissions = action === 'supervise'
    ? ['marketing_studio.supervise', 'platform.manage']
    : ['marketing_studio.write', 'marketing_studio.configure', 'marketing_studio.supervise', 'platform.manage']

  const { data, error } = await admin
    .from('memberships')
    .select('organization_id, role_key, roles(scope)')
    .eq('user_id', userId)
  if (error) throw error
  const roleKeys = [...new Set((data || []).map((membership: any) => membership.role_key).filter(Boolean))]
  const { data: rolePermissions, error: permissionsError } = roleKeys.length
    ? await admin.from('role_permissions').select('role_key, permission_key').in('role_key', roleKeys)
    : { data: [], error: null }
  if (permissionsError) throw permissionsError
  const permissionMap = new Map<string, string[]>()
  for (const row of rolePermissions || []) {
    const current = permissionMap.get(row.role_key) || []
    current.push(row.permission_key)
    permissionMap.set(row.role_key, current)
  }

  const allowed = (data || []).some((membership: any) => {
    const permissions = permissionMap.get(membership.role_key) || []
    if (membership.roles?.scope === 'internal') {
      return permissions.some((permission: string) => acceptedPermissions.includes(permission))
    }
    return membership.organization_id === organizationId
      && permissions.some((permission: string) => acceptedPermissions.includes(permission))
  })

  if (!allowed) throw new Error('marketing_studio_permission_required')
}

function validateConnection(connection: any) {
  if (!['wordpress', 'meta_facebook', 'meta_instagram', 'google_business_profile'].includes(connection.provider)) {
    throw new Error('unsupported_publishing_provider')
  }
  if (!['connected', 'stale'].includes(connection.status)) throw new Error('publishing_connection_not_connected')
  if (!connection.token_reference) throw new Error('publishing_token_reference_required')
  if (connection.provider === 'wordpress') {
    if (!connection.site_url) throw new Error('wordpress_site_url_required')
    if (!connection.username) throw new Error('wordpress_username_required')
  } else if (!connection.provider_asset_id && !connection.provider_account_id) {
    throw new Error('provider_asset_id_required')
  }
}

function validateContentForAction(connection: any, content: any, action: SocialPublishingAction) {
  if (!content.title && !content.body) throw new Error('publishing_content_incomplete')
  if (connection.provider === 'wordpress' && content.channel !== 'blog') throw new Error('wordpress_requires_blog_channel')
  if (action === 'publish' && !['approved', 'scheduled'].includes(content.status)) {
    throw new Error('publish_requires_approved_content')
  }
}

async function loadAccessToken(admin: any, connection: any) {
  const tokenReference = requireString(connection.token_reference, 'token_reference')
  if (connection.provider === 'wordpress') {
    const envToken = Deno.env.get(tokenReference)
    if (envToken) return envToken
  }
  const secret = await loadProviderSecret(admin, tokenReference)
  if (secret.expired) {
    throw new SocialPublishingProviderError('provider_access_token_expired', { authFailure: true })
  }
  return secret.value
}

async function updateContentAfterPublishing(admin: any, contentId: string, action: SocialPublishingAction, response: { publishedUrl?: string | null }, completedAt: string) {
  const update: Record<string, unknown> = {
    published_url: response.publishedUrl || null,
  }
  if (action === 'publish') {
    update.status = 'published'
    update.published_at = completedAt
  }
  const { error } = await admin.from('content_items').update(update).eq('id', contentId)
  if (error) throw error
}

async function updateConnectionAfterPublishing(admin: any, connectionId: string, action: SocialPublishingAction, completedAt: string) {
  const update: Record<string, unknown> = {
    protected_error: null,
    last_health_check_at: completedAt,
  }
  if (action === 'publish') update.last_published_at = completedAt
  const { error } = await admin.from('publishing_connections').update(update).eq('id', connectionId)
  if (error) throw error
}

function requireAction(value: unknown): SocialPublishingAction {
  const action = requireString(value, 'action')
  if (!['create_draft', 'update_draft', 'publish'].includes(action)) throw new Error(`unsupported_publishing_action:${action}`)
  return action as SocialPublishingAction
}

function requireString(value: unknown, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`)
  return value.trim()
}

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function safeObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}
