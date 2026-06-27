import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppJobQueue } from '../src/server.js'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import type { JobName, QueueJobData } from '../src/jobs/queue.js'
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
  flow: '00000000-0000-4000-8000-000000000003',
  trigger: '00000000-0000-4000-8000-000000000004',
  condition: '00000000-0000-4000-8000-000000000005',
  action: '00000000-0000-4000-8000-000000000006',
  run: '00000000-0000-4000-8000-000000000007',
  sequence: '00000000-0000-4000-8000-000000000008',
  sequenceStep: '00000000-0000-4000-8000-000000000009',
  material: '00000000-0000-4000-8000-000000000010',
}

const flowRow = {
  id: ids.flow,
  organization_id: ids.org,
  name: 'Follow-up',
  description: 'Fluxo comercial',
  status: 'published',
  is_enabled: true,
  automation_kind: 'flow',
  builder_mode: 'guided',
  published_version: 1,
  active_version_id: null,
  daily_run_limit: 500,
  requires_human_approval: false,
  risk_level: 'low',
  sector_template_key: 'clinic',
  last_error: null,
  graph: null,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-02T00:00:00.000Z',
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

class FakePool {
  async query(sql: string) {
    if (sql.includes('FROM public.organization_materials')) {
      return {
        rows: [{
          id: ids.material,
          organization_id: ids.org,
          name: 'briefing.pdf',
          file_url: `/api/automations/materials/${ids.material}/file`,
          file_type: 'application/pdf',
          byte_size: 1200,
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-02T00:00:00.000Z',
        }],
      }
    }

    if (sql.includes('FROM public.system_config')) {
      return { rows: [{ value: { limit: 20 } }] }
    }

    if (sql.includes('FROM public.omnichannel_settings')) {
      return { rows: [{ max_upload_size_mb: 12 }] }
    }

    if (sql.includes('FROM public.crm_sequence_steps')) {
      return {
        rows: [{
          id: ids.sequenceStep,
          sequence_id: ids.sequence,
          order_index: 1,
          step_kind: 'message',
          channel: 'email',
          subject: 'Ola',
          body: 'Mensagem',
          delay_minutes: 15,
          template_id: null,
          requires_human_approval: false,
          is_active: true,
        }],
      }
    }

    if (sql.includes('FROM public.crm_sequences')) {
      return {
        rows: [{
          id: ids.sequence,
          organization_id: ids.org,
          name: 'Sequencia comercial',
          description: null,
          is_active: true,
          channel: 'mixed',
          status: 'active',
          sector_template_key: 'clinic',
          conversion_goal: 'meeting_booked',
          active_enrollment_count: 3,
          converted_enrollment_count: 1,
        }],
      }
    }

    if (sql.includes('FROM public.automation_triggers')) {
      return {
        rows: [{ id: ids.trigger, flow_id: ids.flow, trigger_type: 'lead.created', config: { source: 'manual' } }],
      }
    }

    if (sql.includes('FROM public.automation_conditions')) {
      return {
        rows: [{ id: ids.condition, flow_id: ids.flow, field: 'source', operator: 'exists', value: null, order_index: 0 }],
      }
    }

    if (sql.includes('FROM public.automation_actions')) {
      return {
        rows: [{ id: ids.action, flow_id: ids.flow, action_type: 'create_task', order_index: 1, payload: { title: 'Ligar' } }],
      }
    }

    if (sql.includes('FROM public.automation_execution_runs')) {
      return {
        rows: [{
          id: ids.run,
          flow_id: ids.flow,
          status: 'queued',
          event_type: 'lead.created',
          lead_id: null,
          last_error: null,
          started_at: '2026-01-03T00:00:00.000Z',
          completed_at: null,
        }],
      }
    }

    if (sql.includes('INSERT INTO public.automation_flows')) {
      return { rows: [flowRow] }
    }

    if (sql.includes('UPDATE public.automation_flows')) {
      return { rows: [] }
    }

    if (sql.includes('FROM public.automation_flows')) {
      return { rows: [flowRow] }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() {
    return undefined
  }
}

class FakeJobQueue implements AppJobQueue {
  jobs: Array<{ name: JobName; data: QueueJobData }> = []

  async add(name: JobName, data: QueueJobData) {
    this.jobs.push({ name, data })
    return { id: 'job-1' }
  }

  async close() {
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

describe('automation routes', () => {
  it('rejects unauthenticated automation requests', async () => {
    app = await buildServer(testEnv, {
      authStore: new FakeAuthStore(),
      pool: new FakePool() as never,
      jobQueue: new FakeJobQueue(),
    })

    const response = await app.inject({ method: 'GET', url: '/api/automations/flows' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'not_authenticated' })
  })

  it('returns automation flows with nested blocks', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, {
      authStore,
      pool: new FakePool() as never,
      jobQueue: new FakeJobQueue(),
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/automations/flows?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: ids.flow,
        organizationId: ids.org,
        triggers: [{ id: ids.trigger, triggerType: 'lead.created', config: { source: 'manual' } }],
        conditions: [{ id: ids.condition, field: 'source', operator: 'exists' }],
        actions: [{ id: ids.action, actionType: 'create_task', orderIndex: 1, payload: { title: 'Ligar' } }],
        executionRuns: [expect.objectContaining({ id: ids.run, status: 'queued' })],
      }),
    ])
  })

  it('enqueues automation dispatch jobs', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    const jobQueue = new FakeJobQueue()
    app = await buildServer(testEnv, {
      authStore,
      pool: new FakePool() as never,
      jobQueue,
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/automations/dispatch',
      headers: { cookie: sessionCookie(token) },
      payload: { event: { type: 'lead.created', organizationId: ids.org } },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ ok: true, jobId: 'job-1' })
    expect(jobQueue.jobs).toEqual([
      {
        name: 'automation.dispatch',
        data: {
          requestedBy: ids.user,
          event: { type: 'lead.created', organizationId: ids.org },
        },
      },
    ])
  })

  it('returns automation sequences with nested steps', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, {
      authStore,
      pool: new FakePool() as never,
      jobQueue: new FakeJobQueue(),
    })

    const response = await app.inject({
      method: 'GET',
      url: `/api/automations/sequences?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      expect.objectContaining({
        id: ids.sequence,
        organizationId: ids.org,
        channel: 'mixed',
        status: 'active',
        activeEnrollmentCount: 3,
        convertedEnrollmentCount: 1,
        steps: [expect.objectContaining({ id: ids.sequenceStep, stepKind: 'message', channel: 'email' })],
      }),
    ])
  })

  it('returns organization materials and upload limit', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, {
      authStore,
      pool: new FakePool() as never,
      jobQueue: new FakeJobQueue(),
    })

    const materials = await app.inject({
      method: 'GET',
      url: `/api/automations/materials?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })
    const limit = await app.inject({
      method: 'GET',
      url: `/api/automations/materials/upload-limit?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(materials.statusCode).toBe(200)
    expect(materials.json()).toEqual([
      expect.objectContaining({
        id: ids.material,
        organizationId: ids.org,
        fileUrl: `/api/automations/materials/${ids.material}/file`,
      }),
    ])
    expect(limit.statusCode).toBe(200)
    expect(limit.json()).toEqual({ limitMb: 12 })
  })
})
