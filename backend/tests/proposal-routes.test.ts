import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import type { AppJobQueue } from '../src/server.js'
import type { JobName, QueueJobData } from '../src/jobs/queue.js'
import { buildServer } from '../src/server.js'

const testEnv = {
  NODE_ENV: 'test' as const,
  PORT: 4000,
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/yux_test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session',
  SESSION_SECRET: 'test-secret-value-with-at-least-32-chars',
  CORS_ORIGIN: 'https://hub.yux.com.br',
}

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002',
  lead: '00000000-0000-4000-8000-000000000003',
  package: '00000000-0000-4000-8000-000000000004',
  proposal: '00000000-0000-4000-8000-000000000005',
  item: '00000000-0000-4000-8000-000000000006',
  version: '00000000-0000-4000-8000-000000000007',
  decision: '00000000-0000-4000-8000-000000000008',
}

const proposalRow = {
  id: ids.proposal,
  organization_id: ids.org,
  lead_id: ids.lead,
  crm_instance_id: null,
  client_id: null,
  package_id: ids.package,
  recommended_package_id: null,
  blueprint_id: null,
  assigned_to: null,
  status: 'draft',
  title: 'Proposta YUX',
  scope: 'Escopo',
  whatsapp_message: 'Mensagem',
  email_subject: 'Assunto',
  email_body: 'Corpo',
  billing_cycle: 'monthly',
  selected_module_keys: ['crm'],
  final_value: '4500.00',
  override_reason: null,
  current_version_id: ids.version,
  converted_client_id: null,
  contract_id: null,
  project_id: null,
}

const itemRow = {
  id: ids.item,
  proposal_id: ids.proposal,
  item_key: 'base',
  label: 'Pacote',
  description: null,
  quantity: '1',
  unit_value: '4500',
  total_value: '4500',
  order_index: 0,
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
    if (sql.includes('FROM public.proposal_access_tokens')) {
      return {
        rows: [{
          id: ids.version,
          proposal_id: ids.proposal,
          version_number: 1,
          snapshot: { id: ids.proposal, title: 'Proposta YUX', selectedModuleKeys: ['crm'], items: [] },
          status: 'pending',
          sent_at: '2026-01-01T00:00:00.000Z',
          decided_at: null,
          expires_at: '2026-02-01T00:00:00.000Z',
          current_version_id: ids.version,
        }],
      }
    }

    if (sql.includes('INSERT INTO public.proposal_decisions')) {
      return {
        rows: [{
          id: ids.decision,
          proposal_version_id: ids.version,
          decision: 'approved',
          source: sql.includes('public_token') ? 'public_token' : 'portal',
          comment: null,
          decided_by: null,
          created_at: '2026-01-03T00:00:00.000Z',
        }],
      }
    }

    if (sql.includes('INSERT INTO public.proposal_versions')) {
      return {
        rows: [{
          id: ids.version,
          proposal_id: ids.proposal,
          version_number: 1,
          snapshot: { ...proposalRow, items: [itemRow] },
          status: 'pending',
          sent_at: '2026-01-02T00:00:00.000Z',
          decided_at: null,
        }],
      }
    }

    if (sql.includes('UPDATE public.proposal_access_tokens') || sql.includes('INSERT INTO public.proposal_access_tokens')) {
      return { rows: [] }
    }

    if (sql.includes('FROM public.proposal_price_rules')) {
      return {
        rows: [{
          id: '00000000-0000-4000-8000-000000000009',
          organization_id: ids.org,
          package_id: ids.package,
          item_key: 'base',
          label: 'Pacote',
          minimum_value: '1000',
          recommended_value: '4500',
          maximum_value: '9000',
        }],
      }
    }

    if (sql.includes('SELECT version_number')) {
      return { rows: [] }
    }

    if (sql.includes('FROM public.proposal_items')) {
      return { rows: [itemRow] }
    }

    if (sql.includes('FROM public.proposals p')) {
      return { rows: [proposalRow] }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() {
    return undefined
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

function sessionCookie(rawToken: string) {
  return `${testEnv.SESSION_COOKIE_NAME}=${rawToken}`
}

describe('proposal routes', () => {
  it('rejects unauthenticated proposal requests', async () => {
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never, jobQueue: new FakeJobQueue() })

    const response = await app.inject({ method: 'GET', url: '/api/proposals' })

    expect(response.statusCode).toBe(401)
  })

  it('lists and sends proposals through the backend API', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never, jobQueue: new FakeJobQueue() })

    const list = await app.inject({
      method: 'GET',
      url: `/api/proposals?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })
    const sent = await app.inject({
      method: 'POST',
      url: `/api/proposals/${ids.proposal}/send`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(list.statusCode).toBe(200)
    expect(list.json()).toEqual([
      expect.objectContaining({
        id: ids.proposal,
        organizationId: ids.org,
        items: [expect.objectContaining({ itemKey: 'base', totalValue: 4500 })],
      }),
    ])
    expect(sent.statusCode).toBe(200)
    expect(sent.json()).toMatchObject({
      success: true,
      versionId: ids.version,
      publicUrl: expect.stringContaining('https://hub.yux.com.br/proposal/review/'),
    })
  })

  it('accepts public proposal decisions and queues conversion jobs', async () => {
    const jobQueue = new FakeJobQueue()
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never, jobQueue })

    const review = await app.inject({
      method: 'GET',
      url: '/api/public/proposals/public-token/decision',
    })
    const decision = await app.inject({
      method: 'POST',
      url: '/api/public/proposals/public-token/decision',
      payload: { decision: 'approved' },
    })

    expect(review.statusCode).toBe(200)
    expect(review.json()).toMatchObject({ versionId: ids.version, status: 'pending' })
    expect(decision.statusCode).toBe(200)
    expect(decision.json()).toMatchObject({ success: true, decision: 'approved' })
    expect(jobQueue.jobs).toEqual([
      { name: 'proposal.convert', data: { proposalId: ids.proposal, source: 'public_token' } },
    ])
  })
})
