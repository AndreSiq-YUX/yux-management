import { afterEach, describe, expect, it, vi } from 'vitest'
import { decodeProviderSecretEncryptionKey, encryptProviderSecretValue } from '../src/lib/edge-compat/providerSecrets.js'
import { handleOutboundMessage } from '../src/jobs/handlers/omnichannel.js'

class FakePool {
  readonly queries: string[] = []

  runStatus: string | null = null

  constructor(
    private readonly message: Record<string, unknown>,
    private readonly options: { failAmbiguousMessageUpdate?: boolean; connectionAvailable?: boolean; secret?: { reference: string; ciphertext: string; nonce: string } } = {},
  ) {}

  async connect() { return { query: this.query.bind(this), release() {} } }

  async query(sql: string, params: unknown[] = []) {
    this.queries.push(sql)
    if (sql.includes('SELECT id, delivery_status FROM public.messages')) return { rows: [{ id: this.message.id, delivery_status: 'queued' }] }
    if (this.options.failAmbiguousMessageUpdate && sql.includes('UPDATE public.messages') && sql.includes("'dispatchOutcome','ambiguous'")) throw new Error('database_write_failed')
    if (sql.includes('SELECT id, status, created_at FROM public.outbound_message_runs')) {
      return { rows: this.runStatus ? [{ id: 'run-1', status: this.runStatus, created_at: new Date() }] : [] }
    }
    if (sql.includes('FROM public.messages m')) return { rows: [this.message] }
    if (sql.includes('FROM public.provider_integration_secrets')) {
      return { rows: this.options.secret ? [{ ...this.options.secret, expires_at: null, metadata: {} }] : [] }
    }
    if (sql.includes('INSERT INTO public.outbound_message_runs')) {
      this.runStatus = 'processing'
      return { rows: [{ id: 'run-1' }] }
    }
    if (sql.includes('FROM public.outbound_message_runs')) return { rows: this.runStatus ? [{ id: 'run-1', status: this.runStatus }] : [] }
    if (sql.includes('UPDATE public.outbound_message_runs')) {
      if (sql.includes("status = 'ambiguous'")) this.runStatus = 'ambiguous'
      if (sql.includes("status = 'failed'")) this.runStatus = 'failed'
      if (sql.includes("status = 'sent'")) this.runStatus = 'sent'
      return { rows: [] }
    }
    if (sql.includes('FROM public.channel_connections')) {
      return { rows: this.options.connectionAvailable === false ? [] : [{ id: params[0] }] }
    }
    return { rows: [] }
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('WhatsApp outbound connection isolation', () => {
  it('uses the explicitly confirmed test phone when Meta returns its Brazilian legacy mobile identity', async () => {
    const keyB64 = Buffer.alloc(32, 9).toString('base64')
    const secret = await encryptProviderSecretValue('access-token', decodeProviderSecretEncryptionKey(keyB64))
    const pool = new FakePool(message({ phone: '+551199990000', metadata: { source: 'channel_test', testRecipient: '5511999990000' } }), { secret: { reference: 'secret-reference', ...secret } })
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ messages: [{ id: 'provider-test' }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchFn)
    await handleOutboundMessage(pool as never, { messageId: 'message-1' }, { providerSecretEncryptionKey: keyB64 })
    const payload = JSON.parse((fetchFn.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
    expect(payload.to).toBe('5511999990000')
  })

  it.each([
    { phone: '+551199990000', recipient: '5531999990000' },
    { phone: '+551132340000', recipient: '5511932340000' },
    { phone: '+14155550000', recipient: '141595550000' },
  ])('rejects a test destination that is not the same verified mobile identity: $recipient', async ({ phone, recipient }) => {
    const pool = new FakePool(message({ phone, metadata: { source: 'channel_test', testRecipient: recipient } }))
    await expect(handleOutboundMessage(pool as never, { messageId: 'message-1' }))
      .rejects.toThrow('whatsapp_test_recipient_mismatch')
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.outbound_message_runs'))).toBe(false)
  })

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

  it('revalidates that the number is still active immediately before sending', async () => {
    const keyB64 = Buffer.alloc(32, 9).toString('base64')
    const key = decodeProviderSecretEncryptionKey(keyB64)
    const secret = await encryptProviderSecretValue('access-token', key)
    const pool = new FakePool(message(), { connectionAvailable: false, secret: { reference: 'secret-reference', ...secret } })
    const fetchFn = vi.fn()
    vi.stubGlobal('fetch', fetchFn)

    const result = await handleOutboundMessage(pool as never, { messageId: 'message-1' }, { providerSecretEncryptionKey: keyB64 })

    expect(result).toMatchObject({ sent: false, blocked: true, reason: 'whatsapp_connection_unavailable' })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(pool.queries.some(sql => sql.includes('INSERT INTO public.outbound_message_runs'))).toBe(true)
  })

  it('records an ambiguous timeout and refuses a blind retry', async () => {
    const keyB64 = Buffer.alloc(32, 9).toString('base64')
    const secret = await encryptProviderSecretValue('access-token', decodeProviderSecretEncryptionKey(keyB64))
    const pool = new FakePool(message(), { secret: { reference: 'secret-reference', ...secret } })
    const fetchFn = vi.fn(async () => { throw new Error('socket timeout') })
    vi.stubGlobal('fetch', fetchFn)

    const first = await handleOutboundMessage(pool as never, { messageId: 'message-1' }, { providerSecretEncryptionKey: keyB64 })
    const second = await handleOutboundMessage(pool as never, { messageId: 'message-1' }, { providerSecretEncryptionKey: keyB64 })

    expect(first).toMatchObject({ sent: false, ambiguous: true, retryBlocked: true })
    expect(second).toMatchObject({ ambiguous: true, retryBlocked: true })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(pool.runStatus).toBe('ambiguous')
  })

  it('preserves the send block when persistence fails after an ambiguous provider response', async () => {
    const keyB64 = Buffer.alloc(32, 9).toString('base64')
    const secret = await encryptProviderSecretValue('access-token', decodeProviderSecretEncryptionKey(keyB64))
    const pool = new FakePool(message(), { failAmbiguousMessageUpdate: true, secret: { reference: 'secret-reference', ...secret } })
    const fetchFn = vi.fn(async () => { throw new Error('socket response lost after acceptance') })
    vi.stubGlobal('fetch', fetchFn)
    await expect(handleOutboundMessage(pool as never, { messageId: 'message-1' }, { providerSecretEncryptionKey: keyB64 })).rejects.toThrow('database_write_failed')
    expect(pool.runStatus).toBe('ambiguous')
    await handleOutboundMessage(pool as never, { messageId: 'message-1' }, { providerSecretEncryptionKey: keyB64 })
    expect(fetchFn).toHaveBeenCalledTimes(1)
  })
})

function message(overrides: Record<string, unknown> = {}) {
  return {
    id: 'message-1',
    conversation_id: 'conversation-1',
    organization_id: 'org-a',
    connection_id: 'connection-org-a',
    message_connection_id: 'connection-org-a',
    connection_connection_id: 'connection-org-a',
    connection_organization_id: 'org-a',
    connection_channel: 'whatsapp',
    connection_active: true,
    token_state: 'connected',
    waba_id: 'waba-org-a',
    body: 'Olá',
    direction: 'outbound',
    author_type: 'human',
    content_type: 'text',
    metadata: {},
    channel: 'whatsapp',
    phone: '+5511999999999',
    phone_number_id: 'phone-number-org-a',
    consent_metadata: {},
    inside_customer_window: true,
    opted_out: false,
    permission_revoked: false,
    protected_metadata_references: { accessTokenReference: 'secret-reference' },
    ...overrides,
  }
}
