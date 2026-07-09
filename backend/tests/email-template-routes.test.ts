import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'
import { sendConfiguredSmtp2GoEmail } from '../src/email/smtp2goConfigured.js'
import {
  buildTemplateListWhere,
  mapEmailTemplateRow,
} from '../src/modules/emailTemplates/repository.js'

vi.mock('../src/email/smtp2goConfigured.js', () => ({
  sendConfiguredSmtp2GoEmail: vi.fn(async () => ({ sent: true, providerMessageId: 'provider-message-1' })),
}))

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
  systemTemplate: '00000000-0000-4000-8000-000000000003',
  invalidTemplate: '00000000-0000-4000-8000-000000000004',
  orgTemplate: '00000000-0000-4000-8000-000000000005',
  blueprint: '00000000-0000-4000-8000-000000000006',
  version: '00000000-0000-4000-8000-000000000007',
}

const now = '2026-07-01T00:00:00.000Z'

function templateRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ids.systemTemplate,
    scope: 'system',
    organization_id: null,
    blueprint_key: 'system.client_invitation',
    name: 'Convite',
    description: null,
    category: 'access',
    email_kind: 'transactional',
    module_key: 'auth',
    trigger_key: 'client_invitation',
    status: 'draft',
    subject: 'Acesso {{company_name}}',
    preheader: null,
    body_html: '<p>Ola {{contact_name}}</p>',
    body_text: null,
    variables_schema: {},
    required_variables: ['contact_name'],
    editable_by_client: false,
    published_version_id: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  }
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

class FakeEmailTemplatePool {
  queries: Array<{ sql: string; params: unknown[] }> = []
  templates = new Map<string, any>([
    [ids.systemTemplate, templateRow()],
    [
      ids.invalidTemplate,
      templateRow({
        id: ids.invalidTemplate,
        subject: 'Acesso',
        required_variables: ['invite_url'],
      }),
    ],
    [
      ids.orgTemplate,
      templateRow({
        id: ids.orgTemplate,
        scope: 'organization',
        organization_id: ids.org,
        blueprint_key: null,
        editable_by_client: true,
      }),
    ],
    [
      ids.blueprint,
      templateRow({
        id: ids.blueprint,
        scope: 'blueprint',
        blueprint_key: 'growth.welcome',
        name: 'Boas-vindas',
        editable_by_client: true,
      }),
    ],
  ])

  async query(sql: string, params: unknown[] = []) {
    this.queries.push({ sql, params })

    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }

    if (sql.includes('FROM public.memberships')) {
      return {
        rows: [{
          id: 'membership-1',
          user_id: ids.user,
          organization_id: ids.org,
          role_key: 'client_admin',
          created_at: now,
          updated_at: now,
        }],
      }
    }

    if (sql.includes('FROM public.email_templates') && sql.includes('WHERE id = $1')) {
      const row = this.templates.get(params[0] as string)
      return { rows: row ? [row] : [] }
    }

    if (sql.includes('FROM public.email_templates') && sql.includes('scope = ANY')) {
      return {
        rows: Array.from(this.templates.values()).filter((row) => row.scope === 'system' || row.scope === 'blueprint'),
      }
    }

    if (sql.includes('FROM public.email_templates') && sql.includes('organization_id = $2')) {
      return {
        rows: Array.from(this.templates.values()).filter(
          (row) => row.scope === 'organization' && row.organization_id === params[1],
        ),
      }
    }

    if (sql.includes('INSERT INTO public.email_template_versions')) {
      const row = { ...this.templates.get(params[0] as string), status: 'published', published_version_id: ids.version }
      this.templates.set(params[0] as string, row)
      return { rows: [row] }
    }

    if (sql.includes('INSERT INTO public.email_send_requests')) {
      return {
        rows: [{
          id: 'send-request-1',
          template_id: params[1],
          template_version_id: params[2],
          recipient_email: params[5],
          email_kind: params[3],
          module_key: params[4],
          subject: params[6],
          status: params[11],
          protected_error: params[14],
          created_at: now,
          updated_at: now,
        }],
      }
    }

    if (sql.includes('FROM public.email_send_requests')) {
      return { rows: [] }
    }

    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() {
    return undefined
  }
}

const noopJobQueue: AppJobQueue = {
  async add() {
    return {}
  },
  async close() {
    return undefined
  },
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
  vi.clearAllMocks()
})

function sessionCookie(rawToken: string) {
  return `${testEnv.SESSION_COOKIE_NAME}=${rawToken}`
}

function buildAuthStore(role: string) {
  const token = `session-token-${role}`
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = {
    id: ids.user,
    email: `${role}@yux.com.br`,
    name: 'User',
    role,
  }

  return { authStore, token }
}

describe('email template repository helpers', () => {
  it('filters admin lists to system and blueprint scopes', () => {
    expect(buildTemplateListWhere({ mode: 'admin' })).toEqual({
      sql: 'WHERE scope = ANY($1)',
      values: [['system', 'blueprint']],
    })
  })

  it('filters portal lists to the selected organization', () => {
    expect(buildTemplateListWhere({ mode: 'portal', organizationId: 'org-1' })).toEqual({
      sql: 'WHERE scope = $1 AND organization_id = $2',
      values: ['organization', 'org-1'],
    })
  })

  it('maps snake_case rows to camelCase DTOs', () => {
    expect(mapEmailTemplateRow({
      id: 'template-1',
      scope: 'system',
      organization_id: null,
      blueprint_key: 'system.client_invitation',
      name: 'Convite',
      description: null,
      category: 'access',
      email_kind: 'transactional',
      module_key: 'auth',
      trigger_key: 'client_invitation',
      status: 'draft',
      subject: 'Acesso',
      preheader: null,
      body_html: '<p>Oi</p>',
      body_text: null,
      variables_schema: {},
      required_variables: ['invite_url'],
      editable_by_client: false,
      published_version_id: null,
      created_at: now,
      updated_at: now,
    })).toMatchObject({
      id: 'template-1',
      scope: 'system',
      organizationId: null,
      blueprintKey: 'system.client_invitation',
      requiredVariables: ['invite_url'],
    })
  })
})

describe('email template routes', () => {
  it('lists admin templates for an internal user', async () => {
    const { authStore, token } = buildAuthStore('yux_admin')
    const pool = new FakeEmailTemplatePool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'GET',
      url: '/api/email-templates/admin/templates',
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toHaveLength(3)
    expect(pool.queries.some((query) => query.sql.includes('scope = ANY($1)'))).toBe(true)
  })

  it('rejects client admin users from admin routes', async () => {
    const { authStore, token } = buildAuthStore('client_admin')
    app = await buildServer(testEnv, {
      authStore,
      pool: new FakeEmailTemplatePool() as never,
      jobQueue: noopJobQueue,
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/email-templates/admin/templates',
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'admin_forbidden' })
  })

  it('filters portal templates to the current client organization', async () => {
    const { authStore, token } = buildAuthStore('client_admin')
    const pool = new FakeEmailTemplatePool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'GET',
      url: '/api/email-templates/portal/templates',
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject([{ id: ids.orgTemplate, organizationId: ids.org }])
    expect(pool.queries.some((query) => query.params[0] === 'organization' && query.params[1] === ids.org)).toBe(true)
  })

  it('blocks publishing invalid template content', async () => {
    const { authStore, token } = buildAuthStore('yux_admin')
    app = await buildServer(testEnv, {
      authStore,
      pool: new FakeEmailTemplatePool() as never,
      jobQueue: noopJobQueue,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/email-templates/admin/templates/${ids.invalidTemplate}/publish`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({
      error: 'template_publish_invalid',
      validation: {
        ok: false,
        reason: 'required_variable_missing',
        missingVariables: ['invite_url'],
      },
    })
  })

  it('renders and sends test emails without exposing SMTP2GO internals', async () => {
    vi.mocked(sendConfiguredSmtp2GoEmail).mockResolvedValueOnce({
      sent: false,
      reason: 'smtp2go_request_failed',
      error: 'raw provider details with secret api-key',
    })

    const { authStore, token } = buildAuthStore('client_admin')
    app = await buildServer(testEnv, {
      authStore,
      pool: new FakeEmailTemplatePool() as never,
      jobQueue: noopJobQueue,
    })

    const response = await app.inject({
      method: 'POST',
      url: `/api/email-templates/portal/templates/${ids.orgTemplate}/test-send`,
      headers: { cookie: sessionCookie(token) },
      payload: {
        to: 'teste@yux.com.br',
        variables: { contact_name: 'Andre <script>alert(1)</script>', company_name: 'YUX' },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ sent: false, message: 'smtp2go_request_failed' })
    expect(response.body).not.toContain('api-key')
    expect(sendConfiguredSmtp2GoEmail).toHaveBeenCalledWith(
      expect.anything(),
      testEnv.SESSION_SECRET,
      expect.objectContaining({
        to: 'teste@yux.com.br',
        subject: expect.stringContaining('YUX'),
        htmlBody: expect.not.stringContaining('<script>'),
      }),
    )
  })
})
