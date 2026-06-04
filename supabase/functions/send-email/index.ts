import { corsHeaders, formatProtectedError, getAdminClient, getUserClient, json } from '../_shared/edge.ts'

const SMTP2GO_SEND_URL = 'https://api.smtp2go.com/v3/email/send'
const SENT_STATUSES = new Set(['sent', 'delivered'])

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let requestId = ''

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    requestId = String(body.requestId || '')
    if (!requestId) return json({ error: 'requestId is required' }, 400)

    const userClient = getUserClient(authorization)
    const admin = getAdminClient()
    const { data: visibleRequest, error: visibleError } = await userClient
      .from('email_send_requests')
      .select('id')
      .eq('id', requestId)
      .single()

    if (visibleError || !visibleRequest) return json({ error: 'Email request not found' }, 404)

    const { data: request, error } = await admin
      .from('email_send_requests')
      .select('*, email_provider_connections(*), smtp2go_subaccounts(*)')
      .eq('id', requestId)
      .single()

    if (error || !request) return json({ error: 'Email request not found' }, 404)
    if (SENT_STATUSES.has(request.status)) return json({ success: true, duplicate: true })
    if (request.status === 'suppressed') return json({ error: 'Recipient suppressed' }, 409)

    const provider = Array.isArray(request.email_provider_connections)
      ? request.email_provider_connections[0]
      : request.email_provider_connections
    const subaccount = Array.isArray(request.smtp2go_subaccounts)
      ? request.smtp2go_subaccounts[0]
      : request.smtp2go_subaccounts
    const apiKey = Deno.env.get(provider?.token_reference || 'SMTP2GO_API_KEY')

    if (!apiKey) return markFailed(admin, requestId, 'SMTP2GO API key not configured')
    if (!provider?.default_from_email) return markFailed(admin, requestId, 'Default sender email is not configured')

    await admin.from('email_send_requests').update({
      status: 'sending',
      protected_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)

    const smtp2goPayload = {
      sender: provider.default_from_name
        ? `${provider.default_from_name} <${provider.default_from_email}>`
        : provider.default_from_email,
      to: [request.recipient_email],
      subject: request.subject,
      html_body: request.body_html || undefined,
      text_body: request.body_text || undefined,
      custom_headers: [
        { header: 'X-YUX-Email-Request-ID', value: request.id },
        { header: 'X-YUX-Organization-ID', value: request.organization_id },
        { header: 'X-YUX-Module', value: request.module_key },
      ],
      subaccount: subaccount?.smtp2go_account_id || undefined,
    }

    const response = await fetch(SMTP2GO_SEND_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Smtp2go-Api-Key': apiKey,
      },
      body: JSON.stringify(smtp2goPayload),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) return markFailed(admin, requestId, `SMTP2GO returned ${response.status}`)

    const providerMessageId = result?.data?.email_id || result?.data?.email_ids?.[0] || result?.data?.message_id || null
    await admin.from('email_send_requests').update({
      status: 'sent',
      provider_message_id: providerMessageId,
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)
    await admin.from('email_send_events').insert({
      request_id: requestId,
      event_type: 'sent',
      provider_payload: result,
    })
    await incrementUsage(admin, request.organization_id, request.subaccount_id, 'sent_count')

    return json({ success: true, providerMessageId })
  } catch (error) {
    const message = formatProtectedError(error)
    if (requestId) {
      try {
        await markFailed(getAdminClient(), requestId, message)
      } catch {
        // Preserve the original failure response.
      }
    }
    return json({ error: message }, 500)
  }
})

async function markFailed(admin: any, requestId: string, error: string) {
  await admin.from('email_send_requests').update({
    status: 'failed',
    protected_error: error,
    updated_at: new Date().toISOString(),
  }).eq('id', requestId)
  await admin.from('email_send_events').insert({
    request_id: requestId,
    event_type: 'failed',
    provider_payload: { error },
  })
  return json({ error }, 500)
}

async function incrementUsage(admin: any, organizationId: string, subaccountId: string | null, field: 'sent_count' | 'failed_count') {
  const periodDate = new Date().toISOString().slice(0, 10)
  let counterQuery = admin
    .from('email_usage_counters')
    .select('*')
    .eq('organization_id', organizationId)
    .eq('period_date', periodDate)
  counterQuery = subaccountId ? counterQuery.eq('subaccount_id', subaccountId) : counterQuery.is('subaccount_id', null)
  const { data: counter } = await counterQuery.maybeSingle()

  if (counter) {
    await admin.from('email_usage_counters').update({
      [field]: Number(counter[field] || 0) + 1,
      updated_at: new Date().toISOString(),
    }).eq('id', counter.id)
    return
  }

  await admin.from('email_usage_counters').insert({
    organization_id: organizationId,
    subaccount_id: subaccountId,
    period_date: periodDate,
    [field]: 1,
  })
}
