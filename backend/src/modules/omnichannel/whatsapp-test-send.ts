import type pg from 'pg'
import { z } from 'zod'
import { ApiError } from '../../http/errors.js'
import { recordDomainEvent } from '../events/repository.js'

export const whatsAppTestSendSchema = z.object({
  connectionId: z.string().uuid(),
  requestId: z.string().uuid(),
  recipient: z.string().trim().transform(value => value.replace(/[\s()+-]/g, '')).pipe(z.string().regex(/^[1-9]\d{7,14}$/)),
  message: z.string().trim().min(1).max(4096),
  confirmed: z.literal(true),
})

// Use the ordinary messages/worker path. Never synthesize an inbound message or
// a customer-service window just to make a demonstration send succeed.
export async function prepareWhatsAppTestSend(pool: pg.Pool, organizationId: string, userId: string, input: z.infer<typeof whatsAppTestSendSchema>) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1,0))`, [`whatsapp-test:${organizationId}:${input.requestId}`])
    const existing = await client.query<{
      id: string; conversation_id: string; connection_id: string; organization_id: string; body: string
      delivery_status: string; metadata: Record<string, unknown>
    }>(`SELECT m.id,m.conversation_id,m.connection_id,c.organization_id,m.body,m.delivery_status,m.metadata
        FROM public.messages m JOIN public.conversations c ON c.id=m.conversation_id WHERE m.id=$1`, [input.requestId])
    const prior = existing.rows[0]
    if (prior) {
      if (prior.organization_id !== organizationId || prior.connection_id !== input.connectionId || prior.body !== input.message
        || prior.metadata.testRecipient !== input.recipient || prior.metadata.source !== 'channel_test' || prior.metadata.requestedBy !== userId) {
        throw new ApiError(409, 'whatsapp_test_request_conflict')
      }
      await client.query('COMMIT')
      return { messageId: prior.id, conversationId: prior.conversation_id, deliveryStatus: prior.delivery_status, duplicate: true }
    }
    const connection = await client.query<{ id: string }>(`SELECT id FROM public.channel_connections
      WHERE id=$1 AND organization_id=$2 AND channel='whatsapp' AND is_active=TRUE AND token_state='connected' FOR SHARE`,
    [input.connectionId, organizationId])
    if (!connection.rows[0]) throw new ApiError(409, 'whatsapp_connection_unavailable')

    const conversations = await client.query<{ id: string }>(`SELECT c.id FROM public.conversations c
      JOIN public.omnichannel_contacts contact ON contact.id=c.contact_id AND contact.organization_id=c.organization_id
      WHERE c.organization_id=$1 AND c.connection_id=$2 AND c.channel='whatsapp' AND c.status NOT IN ('resolved','archived')
        AND regexp_replace(contact.phone,'[^0-9]','','g')=$3
        AND EXISTS (SELECT 1 FROM public.messages inbound WHERE inbound.conversation_id=c.id
          AND inbound.connection_id=c.connection_id AND inbound.direction='inbound'
          AND inbound.created_at>=NOW()-INTERVAL '24 hours' AND inbound.created_at<=NOW())
      ORDER BY c.updated_at DESC LIMIT 1 FOR SHARE OF c`, [organizationId, input.connectionId, input.recipient])
    const conversationId = conversations.rows[0]?.id
    if (!conversationId) throw new ApiError(409, 'whatsapp_test_recent_conversation_required')

    await client.query(`INSERT INTO public.messages
      (id,conversation_id,connection_id,direction,author_type,author_user_id,content_type,body,delivery_status,metadata)
      VALUES ($1,$2,$3,'outbound','agent',$4,'text',$5,'queued',$6::jsonb)`,
    [input.requestId, conversationId, input.connectionId, userId, input.message,
      JSON.stringify({ source: 'channel_test', messagingPurpose: 'service', testRecipient: input.recipient, requestedBy: userId })])
    await recordDomainEvent(client, {
      eventType: 'omnichannel.outbound.requested', organizationId, aggregateType: 'message', aggregateId: input.requestId,
      actor: { type: 'user', id: userId }, payload: { messageId: input.requestId, connectionId: input.connectionId },
    })
    await client.query('COMMIT')
    return { messageId: input.requestId, conversationId, deliveryStatus: 'queued', duplicate: false }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}
