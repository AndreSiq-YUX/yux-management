import { describe, expect, it } from 'vitest'
import { handleOutboundMessage } from '../src/jobs/handlers/omnichannel.js'

class FakePool {
  readonly queries: string[] = []

  constructor(private readonly message: Record<string, unknown>) {}

  async query(sql: string) {
    this.queries.push(sql)
    if (sql.includes('FROM public.outbound_message_runs')) return { rows: [] }
    if (sql.includes('FROM public.messages m')) return { rows: [this.message] }
    return { rows: [] }
  }
}

describe('WhatsApp outbound connection isolation', () => {
  it('rejects a message whose connection differs from its conversation before creating a send run', async () => {
    const pool = new FakePool(message({ message_connection_id: 'connection-org-b' }))

    await expect(handleOutboundMessage(pool as never, { messageId: 'message-1' }))
      .rejects.toThrow('outbound_message_connection_mismatch')

    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.outbound_message_runs'))).toBe(false)
  })

  it('rejects a conversation bound to a connection owned by another organization', async () => {
    const pool = new FakePool(message({ connection_organization_id: 'org-b' }))

    await expect(handleOutboundMessage(pool as never, { messageId: 'message-1' }))
      .rejects.toThrow('outbound_message_connection_tenant_mismatch')

    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.outbound_message_runs'))).toBe(false)
  })
})

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversation_id: 'conversation-1',
    organization_id: 'org-a',
    connection_id: 'connection-org-a',
    message_connection_id: 'connection-org-a',
    connection_organization_id: 'org-a',
    connection_channel: 'whatsapp',
    body: 'Olá',
    direction: 'outbound',
    author_type: 'human',
    content_type: 'text',
    metadata: {},
    channel: 'whatsapp',
    phone: '+5511999999999',
    phone_number_id: 'phone-number-org-a',
    protected_metadata_references: {},
    consent_metadata: {},
    inside_customer_window: true,
    opted_out: false,
    permission_revoked: false,
    ...overrides,
  }
}
