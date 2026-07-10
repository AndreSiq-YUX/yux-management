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

class FakePool {
  async query(sql: string) {
    if (sql.includes('WHERE phone_number_id')) return { rows: [] }
    if (sql.includes('email_suppression_entries')) return { rows: [] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }
  async end() { return undefined }
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
    app = await buildServer(env, { pool: new FakePool() as never, jobQueue })
    const response = await app.inject({
      method: 'POST', url: '/api/webhooks/meta/channel-event', payload,
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': 'sha256=invalid' },
    })
    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'invalid_webhook_signature' })
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
})
