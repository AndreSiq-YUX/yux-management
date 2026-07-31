import type { FastifyInstance } from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import type { JobName, QueueJobData } from '../src/jobs/queue.js'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'http://localhost:3000',
}

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002',
  conversation: '00000000-0000-4000-8000-000000000003',
  contact: '00000000-0000-4000-8000-000000000004',
  connection: '00000000-0000-4000-8000-000000000005',
  message: '00000000-0000-4000-8000-000000000006',
  scheduling: '00000000-0000-4000-8000-000000000007',
  attachment: '00000000-0000-4000-8000-000000000008',
}

const conversationRow = {
  id: ids.conversation,
  organization_id: ids.org,
  contact_id: ids.contact,
  connection_id: ids.connection,
  channel: 'whatsapp',
  status: 'open',
  response_mode: 'assisted',
  queue_id: null,
  team_id: null,
  assigned_user_id: null,
  lead_id: null,
  subject: 'Lead',
  summary: 'Resumo',
  classification: 'sales',
  sentiment: 'positive',
  commercial_intent: 'high',
  scheduling_intent: 'none',
  last_message_at: '2026-01-01T00:00:00.000Z',
  sla_deadline_at: null,
  resolved_at: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  omnichannel_contacts: { id: ids.contact, display_name: 'Ana', email: 'ana@yux.com.br', phone: null, lead_id: null, client_id: null },
  channel_connections: {
    id: ids.connection,
    channel: 'whatsapp',
    name: 'WhatsApp',
    adapter_key: 'meta-whatsapp',
    is_active: true,
    provider_account_id: null,
    phone_number_id: 'phone-1',
    provider_verify_state: 'verified',
    token_state: 'connected',
    last_provider_sync_at: null,
    protected_metadata_references: {},
  },
  conversation_queues: null,
  omnichannel_teams: null,
  users: null,
  conversation_tags: [{ tag: 'vip' }],
}

class FakeAuthStore implements AuthStore {
  user: AuthUser | null = null
  sessionHash: string | null = null

  async findActiveUserByEmail() {
    return null
  }

  async createSession() {
    return undefined
  }

  async deleteSession() {
    return undefined
  }

  async findUserBySession(sessionTokenHash: string) {
    if (this.user && this.sessionHash === sessionTokenHash) return this.user
    return null
  }
}

class FakeJobQueue implements AppJobQueue {
  jobs: Array<{ name: JobName; data: QueueJobData }> = []

  async add(name: JobName, data: QueueJobData) {
    this.jobs.push({ name, data })
    return { id: `job-${this.jobs.length}` }
  }

  async close() {
    return undefined
  }
}

class FakePool {
  async query(sql: string) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
    if (sql.includes('SELECT m.id, c.organization_id')) {
      return { rows: [{ id: ids.message, organization_id: ids.org }] }
    }

    if (sql.includes('FROM public.omnichannel_settings')) {
      return { rows: [{ max_upload_size_mb: 10 }] }
    }

    if (sql.includes('INSERT INTO public.message_attachments')) {
      return {
        rows: [{
          id: ids.attachment,
          message_id: ids.message,
          storage_path: `${ids.org}/${ids.message}/${ids.attachment}-briefing.pdf`,
          filename: 'briefing.pdf',
          mime_type: 'application/pdf',
          byte_size: 9,
          retention_deadline_at: null,
          created_at: '2026-01-01T00:02:00.000Z',
          updated_at: '2026-01-01T00:02:00.000Z',
        }],
      }
    }

    if (sql.includes('INSERT INTO public.messages')) {
      return {
        rows: [{
          id: ids.message,
          conversation_id: ids.conversation,
          connection_id: ids.connection,
          direction: 'outbound',
          author_type: 'agent',
          author_user_id: ids.user,
          content_type: 'text',
          body: 'Ola',
          external_message_id: null,
          delivery_status: 'queued',
          metadata: {},
          created_at: '2026-01-01T00:01:00.000Z',
          updated_at: '2026-01-01T00:01:00.000Z',
        }],
      }
    }

    if (sql.includes('INSERT INTO public.scheduling_requests')) {
      return {
        rows: [{
          id: ids.scheduling,
          organization_id: ids.org,
          conversation_id: ids.conversation,
          contact_id: ids.contact,
          lead_id: null,
          requested_slot: { startAt: '2026-01-02T12:00:00.000Z' },
          status: 'pending',
        }],
      }
    }

    if (sql.includes('FROM public.conversations c')) {
      return { rows: [conversationRow] }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() {
    return undefined
  }
}

class ForeignOrganizationPool extends FakePool {
  override async query(sql: string) {
    if (sql.includes('FROM public.memberships') && sql.includes('WHERE user_id = $1')) return { rows: [] }
    return super.query(sql)
  }
}

class NoMessageAccessPool extends FakePool {
  override async query(sql: string) {
    if (sql.includes('SELECT m.id, c.organization_id')) return { rows: [] }
    return super.query(sql)
  }
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

function buildAuthenticatedAuthStore() {
  const token = 'session-token'
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = {
    id: ids.user,
    email: 'admin@yux.com.br',
    name: 'Admin YUX',
    role: 'yux_admin',
  }
  return { authStore, token }
}

function buildClientAuthStore() {
  const token = 'client-session-token'
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = {
    id: ids.user,
    email: 'client@yux.com.br',
    name: 'Cliente YUX',
    role: 'client_admin',
  }
  return { authStore, token }
}

function sessionCookie(rawToken: string) {
  return `${testEnv.SESSION_COOKIE_NAME}=${rawToken}`
}

describe('omnichannel routes', () => {
  it('rejects unauthenticated inbox requests', async () => {
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never, jobQueue: new FakeJobQueue() })

    const response = await app.inject({ method: 'GET', url: '/api/omnichannel/conversations' })

    expect(response.statusCode).toBe(401)
  })

  it('returns inbox conversations through the backend API', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue: new FakeJobQueue() })

    const response = await app.inject({
      method: 'GET',
      url: `/api/omnichannel/conversations?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: ids.conversation,
        contact: expect.objectContaining({ displayName: 'Ana' }),
        connection: expect.objectContaining({ health: { state: 'healthy', label: 'WhatsApp conectado' } }),
        tags: ['vip'],
      }),
    ])
  })

  it('rejects a client reading channel connections from another organization', async () => {
    const { authStore, token } = buildClientAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new ForeignOrganizationPool() as never, jobQueue: new FakeJobQueue() })

    const response = await app.inject({
      method: 'GET',
      url: `/api/omnichannel/channel-connections?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'organization_forbidden' })
  })

  it('creates human replies and queues outbound dispatch', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    const jobQueue = new FakeJobQueue()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/omnichannel/messages/human-reply',
      headers: { cookie: sessionCookie(token) },
      payload: { conversationId: ids.conversation, body: 'Ola' },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ id: ids.message, body: 'Ola', deliveryStatus: 'queued' })
    expect(jobQueue.jobs).toEqual([{ name: 'omnichannel.dispatchOutbound', data: { messageId: ids.message } }])
  })

  it('queues outbound dispatch on approve after proving message access', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    const jobQueue = new FakeJobQueue()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/omnichannel/messages/${ids.message}/approve`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(jobQueue.jobs).toEqual([{ name: 'omnichannel.dispatchOutbound', data: { messageId: ids.message, requestedBy: ids.user } }])
  })

  it.each(['approve', 'retry'])('rejects %s of a message outside the caller organizations', async (action) => {
    const { authStore, token } = buildClientAuthStore()
    const jobQueue = new FakeJobQueue()
    app = await buildServer(testEnv, { authStore, pool: new NoMessageAccessPool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/omnichannel/messages/${ids.message}/${action}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(404)
    expect(jobQueue.jobs).toEqual([])
  })

  it('rejects client roles on the channel event simulator', async () => {
    const { authStore, token } = buildClientAuthStore()
    const jobQueue = new FakeJobQueue()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/omnichannel/simulate-channel-event',
      headers: { cookie: sessionCookie(token) },
      payload: { channel: 'whatsapp', text: 'evento falso' },
    })

    expect(response.statusCode).toBe(403)
    expect(jobQueue.jobs).toEqual([])
  })

  it('stores message attachments through the backend API', async () => {
    const previousDir = process.env.OMNICHANNEL_ATTACHMENTS_DIR
    const tempDir = await mkdtemp(path.join(tmpdir(), 'yux-attachments-'))
    process.env.OMNICHANNEL_ATTACHMENTS_DIR = tempDir
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue: new FakeJobQueue() })

    try {
      const pdfContent = Buffer.from('%PDF-1.4\n')
      const response = await app.inject({
        method: 'POST',
        url: '/api/omnichannel/attachments',
        headers: { cookie: sessionCookie(token) },
        payload: {
          messageId: ids.message,
          filename: 'briefing.pdf',
          mimeType: 'application/pdf',
          byteSize: pdfContent.byteLength,
          contentBase64: pdfContent.toString('base64'),
        },
      })

      expect(response.statusCode).toBe(201)
      expect(response.json()).toMatchObject({
        id: ids.attachment,
        messageId: ids.message,
        filename: 'briefing.pdf',
        mimeType: 'application/pdf',
        byteSize: 9,
        fileUrl: `/api/omnichannel/attachments/${ids.attachment}/file`,
      })
    } finally {
      if (previousDir === undefined) delete process.env.OMNICHANNEL_ATTACHMENTS_DIR
      else process.env.OMNICHANNEL_ATTACHMENTS_DIR = previousDir
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  it('rejects attachments whose magic bytes do not match the declared MIME type', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue: new FakeJobQueue() })

    const fakePdf = Buffer.from('apenas texto disfarçado')
    const response = await app.inject({
      method: 'POST',
      url: '/api/omnichannel/attachments',
      headers: { cookie: sessionCookie(token) },
      payload: {
        messageId: ids.message,
        filename: 'malicioso.pdf',
        mimeType: 'application/pdf',
        byteSize: fakePdf.byteLength,
        contentBase64: fakePdf.toString('base64'),
      },
    })

    expect(response.statusCode).toBe(400)
  })

  it('creates scheduling requests and queues scheduling jobs', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    const jobQueue = new FakeJobQueue()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/omnichannel/scheduling',
      headers: { cookie: sessionCookie(token) },
      payload: { conversationId: ids.conversation, requestedSlot: { startAt: '2026-01-02T12:00:00.000Z' } },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ success: true, schedulingRequest: { id: ids.scheduling } })
    expect(jobQueue.jobs).toEqual([
      { name: 'omnichannel.requestScheduling', data: { conversationId: ids.conversation, requestedSlot: { startAt: '2026-01-02T12:00:00.000Z' }, requestedBy: ids.user } },
    ])
  })
})
