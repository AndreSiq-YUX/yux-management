import { createHmac } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'

const env = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'http://localhost:3000',
  META_APP_SECRET: 'meta-app-secret',
  META_WEBHOOK_VERIFY_TOKEN: 'verify-token',
  SMTP2GO_WEBHOOK_SECRET: 'smtp-webhook-secret',
}

const emailIds = {
  organization: '00000000-0000-4000-8000-000000000001',
  request: '00000000-0000-4000-8000-000000000002',
  lead: '00000000-0000-4000-8000-000000000003',
}

class FakePool {
  emailEventSeen = false
  calls: string[] = []

  async query(sql: string) {
    this.calls.push(sql)
    if (sql.includes('WHERE phone_number_id')) return { rows: [] }
    if (sql.includes('email_suppression_entries')) return { rows: [] }
    if (sql.includes('FROM public.email_send_requests')) return {
      rows: [{ id: emailIds.request, organization_id: emailIds.organization, lead_id: emailIds.lead, provider_message_id: 'provider-1', metadata: { correlationId: emailIds.request } }],
    }
    if (sql.includes('INSERT INTO public.email_send_events')) {
      if (this.emailEventSeen) return { rows: [] }
      this.emailEventSeen = true
      return { rows: [{ id: '00000000-0000-4000-8000-000000000004' }] }
    }
    if (sql.includes('INSERT INTO public.domain_events')) return { rows: [{ id: '00000000-0000-4000-8000-000000000005' }] }
    if (sql.includes('UPDATE public.email_send_requests')) return { rows: [] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  async end() { return undefined }
}

class BatchWebhookPool {
  readonly calls: Array<{ sql: string; params: unknown[] }> = []
  readonly connections = [
    { id: '00000000-0000-4000-8000-000000000101', organization_id: '00000000-0000-4000-8000-000000000201', phone_number_id: 'phone-a', is_active: false },
    { id: '00000000-0000-4000-8000-000000000102', organization_id: '00000000-0000-4000-8000-000000000202', phone_number_id: 'phone-b', is_active: true },
  ]
  readonly webhookEvents = new Map<string, { id: string; connectionId: string | null; payload: unknown }>()
  readonly domainEvents = new Map<string, Record<string, unknown>>()
  rejectedCount = 0
  commits = 0

  async query(sql: string, params: unknown[] = []) { return this.runQuery(sql, params) }
  async connect() {
    return {
      query: this.runQuery.bind(this),
      release() {},
    }
  }

  private async runQuery(sql: string, params: unknown[] = []) {
    this.calls.push({ sql, params })
    if (sql.includes('FROM public.channel_connections') && sql.includes('phone_number_id = ANY')) {
      const requested = params[0] as string[]
      return { rows: this.connections.filter(connection => requested.includes(connection.phone_number_id)) }
    }
    if (sql === 'BEGIN' || sql === 'ROLLBACK') return { rows: [] }
    if (sql === 'COMMIT') { this.commits += 1; return { rows: [] } }
    if (sql.includes("event_type, idempotency_key, sanitized_payload, status, protected_error_text")) {
      this.rejectedCount += 1
      return { rows: [] }
    }
    if (sql.includes('INSERT INTO public.channel_webhook_events')) {
      const [, externalEventId, , idempotencyKey, payload] = params as [string, string, string, string, string]
      const existing = this.webhookEvents.get(idempotencyKey)
      if (existing) return { rows: [] }
      const id = `00000000-0000-4000-8000-${String(this.webhookEvents.size + 1).padStart(12, '0')}`
      this.webhookEvents.set(idempotencyKey, { id, connectionId: String(params[0]), payload: JSON.parse(payload) })
      void externalEventId
      return { rows: [{ id }] }
    }
    if (sql.includes('FROM public.channel_webhook_events') && sql.includes('idempotency_key = $1')) {
      const existing = this.webhookEvents.get(String(params[0]))
      return { rows: existing ? [{ id: existing.id }] : [] }
    }
    if (sql.includes('INSERT INTO public.domain_events')) {
      const [id, organizationId, crmInstanceId, eventType, , aggregateType, aggregateId, leadId, correlationId, causationId, depth, actor, occurredAt, automationTrace, payload] = params
      const event = {
        id, organization_id: organizationId, crm_instance_id: crmInstanceId, event_type: eventType,
        aggregate_type: aggregateType, aggregate_id: aggregateId, lead_id: leadId,
        correlation_id: correlationId, causation_id: causationId, depth, actor,
        occurred_at: occurredAt, automation_trace: automationTrace, payload,
      }
      if (this.domainEvents.has(String(id))) return { rows: [] }
      this.domainEvents.set(String(id), event)
      return { rows: [event] }
    }
    if (sql.includes('FROM public.domain_events') && sql.includes('WHERE id = $1')) {
      const event = this.domainEvents.get(String(params[0]))
      return { rows: event ? [event] : [] }
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
}

const jobQueue: AppJobQueue = {
  async add() { return { id: 'job-1' } },
  async close() { return undefined },
}

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

const payload = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-id' }, contacts: [{ wa_id: '5511999999999' }], messages: [{ id: 'wamid.1', from: '5511999999999', timestamp: '1', type: 'text', text: { body: 'Olá' } }] } }] }],
})

describe('Meta webhook routes', () => {
  it('uses the raw body HMAC and safely ignores unknown tenant phone numbers', async () => {
    app = await buildServer(env, { pool: new FakePool() as never, jobQueue })
    const signature = createHmac('sha256', env.META_APP_SECRET).update(payload).digest('hex')
    const response = await app.inject({
      method: 'POST', url: '/api/webhooks/meta/channel-event', payload,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ accepted: true, ignored: 'unknown_phone_number' })
  })

  it('rejects an invalid signature before parsing or tenant lookup', async () => {
    const pool = new FakePool()
    app = await buildServer(env, { pool: pool as never, jobQueue })
    const response = await app.inject({
      method: 'POST', url: '/api/webhooks/meta/channel-event', payload,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'invalid_webhook_signature' })
    expect(pool.calls).toHaveLength(0)
  })

  it('does not acknowledge an operational database failure as an unsupported payload', async () => {
    const pool = new FakePool()
    pool.query = async (sql: string) => {
      pool.calls.push(sql)
      throw new Error('database unavailable')
    }
    app = await buildServer(env, { pool: pool as never, jobQueue })
    const signature = createHmac('sha256', env.META_APP_SECRET).update(payload).digest('hex')
    const response = await app.inject({
      method: 'POST', url: '/api/webhooks/meta/channel-event', payload,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` },
    })
    expect(response.statusCode).toBe(500)
    expect(response.json()).not.toMatchObject({ accepted: true, ignored: 'unsupported_payload' })
  })

  it('persists every valid message and receipt in a multi-tenant batch and deduplicates redelivery', async () => {
    const pool = new BatchWebhookPool()
    app = await buildServer(env, { pool: pool as never, jobQueue })
    const requestPayload = JSON.stringify({
      object: 'whatsapp_business_account',
      entry: [
        { id: 'waba-a', changes: [
          { field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-a' }, messages: [
            { id: 'wamid-a1', from: '5511999990001', timestamp: '1780507200', type: 'text', text: { body: 'Olá 1' } },
            { id: 'wamid-a2', from: '5511999990002', timestamp: '1780507201', type: 'text', text: { body: 'Olá 2' } },
          ] } },
          { field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-a' }, statuses: [
            { id: 'wamid-same', recipient_id: '5511999990001', timestamp: '1780507202', status: 'sent' },
            { id: 'wamid-same', recipient_id: '5511999990001', timestamp: '1780507203', status: 'delivered' },
          ] } },
        ] },
        { id: 'waba-b', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { phone_number_id: 'phone-b' }, messages: [
          { id: 'wamid-b1', from: '5511999990003', timestamp: '1780507204', type: 'text', text: { body: 'Olá empresa B' } },
          { from: '5511999990004', timestamp: 'invalid', type: 'text', text: { body: 'item inválido' } },
        ] } }] },
      ],
    })
    const signature = createHmac('sha256', env.META_APP_SECRET).update(requestPayload).digest('hex')
    const request = {
      method: 'POST' as const,
      url: '/api/webhooks/meta/channel-event',
      payload: requestPayload,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${signature}` },
    }

    const first = await app.inject(request)
    const second = await app.inject(request)
    expect(first.statusCode, JSON.stringify(first.json())).toBe(200)
    expect(first.json()).toMatchObject({
      accepted: true,
      persisted: 5,
      duplicates: 0,
      ignored: 0,
      rejected: [{ index: 'entry[1].changes[0].messages[1]', reason: 'item_invalid' }],
    })
    expect(second.json()).toMatchObject({ accepted: true, persisted: 5, duplicates: 5 })
    expect(pool.webhookEvents.size).toBe(5)
    expect([...pool.webhookEvents.values()].filter(event => event.connectionId === pool.connections[0].id)).toHaveLength(4)
    const connectionLookup = pool.calls.find(call => call.sql.includes('FROM public.channel_connections') && call.sql.includes('phone_number_id = ANY'))
    expect(connectionLookup?.sql).toContain('ORDER BY phone_number_id, is_active DESC, updated_at DESC')
    expect(connectionLookup?.sql).not.toMatch(/AND\s+is_active\s*=\s*TRUE/i)
    expect(pool.domainEvents.size).toBe(5)
    expect(pool.rejectedCount).toBe(2)
    expect(pool.commits).toBe(2)
    expect(pool.calls.filter(call => call.sql.includes('INSERT INTO public.domain_events'))).toHaveLength(10)
  })

  it('stores SMTP2GO bounce events only with its webhook secret', async () => {
    app = await buildServer(env, { pool: new FakePool() as never, jobQueue })
    const response = await app.inject({
      method: 'POST', url: '/api/webhooks/smtp2go',
      headers: { 'content-type': 'application/json', 'x-yux-webhook-secret': env.SMTP2GO_WEBHOOK_SECRET },
      payload: { organizationId: '00000000-0000-4000-8000-000000000001', event: 'bounce', email: 'bounced@example.com' },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ accepted: true, suppressed: true })
  })

  it('normalizes engagement events once and emits an automation event for the lead', async () => {
    const pool = new FakePool()
    app = await buildServer(env, { pool: pool as never, jobQueue })
    const request = {
      method: 'POST' as const,
      url: '/api/webhooks/smtp2go',
      headers: { 'content-type': 'application/json', 'x-yux-webhook-secret': env.SMTP2GO_WEBHOOK_SECRET },
      payload: {
        organizationId: emailIds.organization,
        event: 'open',
        event_id: 'event-open-1',
        message_id: 'provider-1',
        email: 'lead@example.com',
      },
    }

    const first = await app.inject(request)
    const second = await app.inject(request)

    expect(first.statusCode).toBe(200)
    expect(first.json()).toEqual({ accepted: true, duplicate: false, event: 'opened' })
    expect(second.json()).toEqual({ accepted: true, duplicate: true, event: 'opened' })
  })
})
