import { formatProtectedError, getAdminClient, json } from '../_shared/edge.ts'

const statusByEvent: Record<string, string> = {
  delivered: 'delivered',
  bounce: 'failed',
  spam: 'failed',
  unsubscribe: 'suppressed',
  reject: 'rejected',
}

const suppressionReasonByEvent: Record<string, string> = {
  bounce: 'bounce',
  spam: 'spam',
  unsubscribe: 'unsubscribe',
  reject: 'provider_reject',
}

Deno.serve(async req => {
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const configuredSecret = Deno.env.get('SMTP2GO_WEBHOOK_SECRET')
    const providedSecret = req.headers.get('X-YUX-Webhook-Secret') || req.headers.get('X-SMTP2GO-Webhook-Secret')
    if (configuredSecret && configuredSecret !== providedSecret) return json({ error: 'Unauthorized webhook' }, 401)

    const payload = await req.json()
    const events = Array.isArray(payload.events) ? payload.events : [payload]
    const admin = getAdminClient()
    let processed = 0

    for (const event of events) {
      const requestId = extractRequestId(event)
      if (!requestId) continue

      const eventType = String(event.event || event.type || 'unknown')
      await admin.from('email_send_events').insert({
        request_id: requestId,
        event_type: eventType,
        provider_payload: event,
        occurred_at: event.timestamp ? new Date(Number(event.timestamp) * 1000).toISOString() : new Date().toISOString(),
      })
      await applyStatus(admin, requestId, eventType, event)
      processed += 1
    }

    return json({ success: true, processed })
  } catch (error) {
    return json({ error: formatProtectedError(error) }, 500)
  }
})

function extractRequestId(event: Record<string, any>) {
  return event.headers?.['X-YUX-Email-Request-ID']
    || event.headers?.['x-yux-email-request-id']
    || event.custom_headers?.['X-YUX-Email-Request-ID']
    || event.custom_headers?.['x-yux-email-request-id']
    || event['X-YUX-Email-Request-ID']
    || event.yux_email_request_id
}

async function applyStatus(admin: any, requestId: string, eventType: string, event: Record<string, any>) {
  const status = statusByEvent[eventType]
  if (status) {
    await admin.from('email_send_requests').update({
      status,
      updated_at: new Date().toISOString(),
    }).eq('id', requestId)
  }

  const suppressionReason = suppressionReasonByEvent[eventType]
  const recipient = event.recipient || event.email || event.rcpt
  if (!suppressionReason || !recipient) return

  const { data: request } = await admin
    .from('email_send_requests')
    .select('organization_id')
    .eq('id', requestId)
    .single()

  if (!request?.organization_id) return

  await admin.from('email_suppression_entries').upsert({
    organization_id: request.organization_id,
    email: String(recipient).toLowerCase(),
    reason: suppressionReason,
    source: 'smtp2go',
  }, { onConflict: 'organization_id,email' })
}
