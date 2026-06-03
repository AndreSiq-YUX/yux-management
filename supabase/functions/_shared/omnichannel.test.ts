import {
  buildCrmSyncPayload,
  buildIdempotencyKey,
  buildOutboundAdapterPayload,
  calculateAiRunCost,
  hashToken,
  parseInboundEvent,
  sanitizeProtectedError,
  sanitizeWebhookMetadata,
  validateWebchatEvent,
} from './omnichannel.ts'

function assertEquals(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`)
  }
}

function assert(condition: unknown, message = 'Assertion failed') {
  if (!condition) throw new Error(message)
}

Deno.test('normalizes inbound events for WhatsApp, Instagram, email and webchat', () => {
  const channels = ['whatsapp', 'instagram', 'email', 'webchat'] as const

  for (const channel of channels) {
    const event = parseInboundEvent({
      connectionId: 'connection-1',
      channel,
      externalEventId: `external-${channel}`,
      eventType: 'message.created',
      contact: { externalId: 'contact-1', displayName: 'Ana', email: 'ana@example.com' },
      message: { externalMessageId: 'message-1', body: 'Oi', contentType: 'text' },
      occurredAt: '2026-06-01T12:00:00Z',
    })

    assertEquals(event.channel, channel)
    assertEquals(event.contact.displayName, 'Ana')
    assertEquals(event.message.body, 'Oi')
  }
})

Deno.test('builds stable idempotency keys', () => {
  assertEquals(buildIdempotencyKey({
    connectionId: 'connection-1',
    externalEventId: 'event-1',
    eventType: 'message.created',
  }), 'connection-1:message.created:event-1')
})

Deno.test('builds outbound adapter payloads without credentials', () => {
  const payload = buildOutboundAdapterPayload({
    adapterKey: 'n8n-whatsapp',
    channel: 'whatsapp',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    recipient: { externalId: 'contact-1', phone: '+5511999999999' },
    content: { type: 'text', body: 'Resposta' },
    metadata: { template: false, secret: 'should-not-pass' },
  })

  assertEquals(payload.adapterKey, 'n8n-whatsapp')
  assertEquals(payload.content.body, 'Resposta')
  assert(!JSON.stringify(payload).includes('should-not-pass'), 'payload leaked raw metadata')
})

Deno.test('sanitizes protected errors and webhook metadata', () => {
  assertEquals(sanitizeProtectedError(new Error('token abc123 failed')).message, 'token [redacted] failed')
  assertEquals(sanitizeWebhookMetadata({
    body: 'ok',
    token: 'secret',
    authorization: 'Bearer secret',
    nested: { password: 'hidden', keep: true },
  }), {
    body: 'ok',
    token: '[redacted]',
    authorization: '[redacted]',
    nested: { password: '[redacted]', keep: true },
  })
})

Deno.test('hashes tokens deterministically', async () => {
  const first = await hashToken('token-value')
  const second = await hashToken('token-value')
  assertEquals(first, second)
  assert(/^[a-f0-9]{64}$/.test(first), 'hash is not sha-256 hex')
})

Deno.test('validates webchat events', () => {
  assertEquals(validateWebchatEvent({
    action: 'send_message',
    sessionToken: 'session',
    origin: 'https://site.example',
    body: { message: 'Oi' },
  }).valid, true)

  assertEquals(validateWebchatEvent({
    action: 'send_message',
    sessionToken: '',
    origin: 'not a url',
    body: {},
  }).valid, false)
})

Deno.test('calculates AI run cost from token usage', () => {
  assertEquals(calculateAiRunCost({
    inputTokens: '1000',
    outputTokens: 500,
    inputTokenPricePerMillion: '2',
    outputTokenPricePerMillion: 8,
  }), {
    inputTokens: 1000,
    outputTokens: 500,
    estimatedCost: 0.006,
  })
})

Deno.test('builds CRM sync payloads with sanitized metadata', () => {
  assertEquals(buildCrmSyncPayload({
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    contact: { displayName: 'Ana', email: 'ana@example.com', phone: '+5511999999999' },
    summary: 'Lead quer proposta',
    tags: ['enterprise'],
    metadata: { access_token: 'secret', source: 'whatsapp' },
  }), {
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    contact: { displayName: 'Ana', email: 'ana@example.com', phone: '+5511999999999' },
    summary: 'Lead quer proposta',
    tags: ['enterprise'],
    metadata: { access_token: '[redacted]', source: 'whatsapp' },
  })
})
