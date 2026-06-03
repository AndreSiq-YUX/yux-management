import { corsHeaders, getServiceRoleClient, getUserClient, json } from '../_shared/edge.ts'
import { processChannelEvent } from '../receive-channel-event/index.ts'

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const authorization = req.headers.get('Authorization')
    if (!authorization) return json({ error: 'Unauthorized' }, 401)

    const body = await req.json()
    const connectionId = body.connectionId || body.event?.connectionId
    if (!connectionId) return json({ error: 'connectionId is required' }, 400)

    const userClient = getUserClient(authorization)
    const { data: visibleConnection, error: visibleError } = await userClient
      .from('channel_connections')
      .select('id, channel, organization_id')
      .eq('id', connectionId)
      .single()

    if (visibleError || !visibleConnection) return json({ error: 'Connection not found' }, 404)

    const event = {
      connectionId: visibleConnection.id,
      channel: body.channel || visibleConnection.channel,
      externalEventId: body.externalEventId || `sim-${crypto.randomUUID()}`,
      eventType: body.eventType || 'message.created',
      contact: body.contact || {
        externalId: `sim-contact-${crypto.randomUUID()}`,
        displayName: 'Contato simulado',
        email: body.email,
        phone: body.phone,
      },
      message: body.message || {
        externalMessageId: body.externalMessageId || `sim-message-${crypto.randomUUID()}`,
        body: body.body || 'Mensagem simulada',
        contentType: 'text',
      },
      occurredAt: body.occurredAt || new Date().toISOString(),
    }

    const result = await processChannelEvent(getServiceRoleClient(), event, {
      simulatorUserId: visibleConnection.organization_id,
    })

    return json({ success: true, simulated: true, ...result })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Simulation failed' }, 400)
  }
})
