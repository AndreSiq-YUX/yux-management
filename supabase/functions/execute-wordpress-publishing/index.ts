import { corsHeaders, formatProtectedError, getAdminClient, json, requireAuthenticatedUser } from '../_shared/edge.ts'

type PublishingAction = 'create_draft' | 'update_draft' | 'publish'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let runId: string | undefined
  try {
    const authorization = req.headers.get('Authorization')
    const { user } = await requireAuthenticatedUser(authorization)
    const admin = getAdminClient()
    const body = await req.json()
    const run = body.publishingRunId
      ? await loadPublishingRun(admin, requireString(body.publishingRunId, 'publishingRunId'))
      : await createPublishingRun(admin, body, user.id)
    runId = run.id

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
    validateContentForAction(content, run.action)

    await admin
      .from('publishing_runs')
      .update({ status: 'running', protected_error: null, started_at: new Date().toISOString() })
      .eq('id', run.id)

    const response = await executeWordPressAction(connection, content, run)
    const completedAt = new Date().toISOString()
    const { data: completedRun, error: updateError } = await admin
      .from('publishing_runs')
      .update({
        status: 'succeeded',
        provider_post_id: String(response.id),
        published_url: response.link || null,
        response_payload: response,
        protected_error: null,
        completed_at: completedAt,
      })
      .eq('id', run.id)
      .select('*')
      .single()
    if (updateError) throw updateError

    await updateContentAfterPublishing(admin, content.id, run.action, response, completedAt)
    return json({ success: true, run: completedRun })
  } catch (error) {
    const protectedError = formatProtectedError(error)
    if (runId) {
      try {
        await getAdminClient()
          .from('publishing_runs')
          .update({ status: 'failed', protected_error: protectedError, completed_at: new Date().toISOString() })
          .eq('id', runId)
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
  if (connection.provider !== 'wordpress') throw new Error('unsupported_publishing_provider')
  if (!['connected', 'stale'].includes(connection.status)) throw new Error('publishing_connection_not_connected')
  if (!connection.site_url) throw new Error('wordpress_site_url_required')
  if (!connection.username) throw new Error('wordpress_username_required')
  if (!connection.token_reference) throw new Error('wordpress_token_reference_required')
  if (!Deno.env.get(connection.token_reference)) throw new Error('wordpress_secret_not_configured')
}

function validateContentForAction(content: any, action: PublishingAction) {
  if (content.channel !== 'blog') throw new Error('wordpress_requires_blog_channel')
  if (!content.title || !content.body) throw new Error('wordpress_content_incomplete')
  if (action === 'publish' && !['approved', 'scheduled'].includes(content.status)) {
    throw new Error('wordpress_publish_requires_approved_content')
  }
}

async function executeWordPressAction(connection: any, content: any, run: any) {
  const token = Deno.env.get(connection.token_reference)!
  const postId = optionalString(run.request_payload?.providerPostId) || run.provider_post_id
  const status = run.action === 'publish' ? 'publish' : 'draft'
  const endpoint = run.action === 'create_draft'
    ? `${normalizeSiteUrl(connection.site_url)}/wp-json/wp/v2/posts`
    : `${normalizeSiteUrl(connection.site_url)}/wp-json/wp/v2/posts/${requireString(postId, 'providerPostId')}`

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${btoa(`${connection.username}:${token}`)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: content.title,
      content: content.body,
      excerpt: content.cta || undefined,
      status,
    }),
  })

  const text = await response.text()
  let payload: any = text
  try {
    payload = text ? JSON.parse(text) : {}
  } catch {
    payload = { text }
  }
  if (!response.ok) throw new Error(`wordpress_http_${response.status}:${JSON.stringify(payload).slice(0, 240)}`)
  return payload
}

async function updateContentAfterPublishing(admin: any, contentId: string, action: PublishingAction, response: any, completedAt: string) {
  const update: Record<string, unknown> = {
    published_url: response.link || null,
  }
  if (action === 'publish') {
    update.status = 'published'
    update.published_at = completedAt
  }
  const { error } = await admin.from('content_items').update(update).eq('id', contentId)
  if (error) throw error
}

function requireAction(value: unknown): PublishingAction {
  const action = requireString(value, 'action')
  if (!['create_draft', 'update_draft', 'publish'].includes(action)) throw new Error(`unsupported_publishing_action:${action}`)
  return action as PublishingAction
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

function normalizeSiteUrl(value: string) {
  return value.trim().replace(/\/$/, '')
}
