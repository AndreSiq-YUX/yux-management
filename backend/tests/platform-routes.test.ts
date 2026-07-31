import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
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
    if (sql.includes('FROM public.contract_modules')) {
      return {
        rows: [{ contract_id: 'contract-1', module_key: 'crm', enabled: true }],
      }
    }

    if (sql.includes('FROM public.package_modules')) {
      return {
        rows: [{ package_id: 'package-1', module_key: 'crm' }],
      }
    }

    if (sql.includes('FROM public.contracts c')) {
      return {
        rows: [
          {
            id: 'contract-1',
            client_id: 'client-1',
            package_id: 'package-1',
            status: 'active',
            starts_at: '2026-01-01',
            ends_at: null,
            name: 'Contrato principal',
            value: '1200.50',
            billing_cycle: 'monthly',
            notes: null,
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
            package_key: 'growth',
            package_name: 'Growth',
            package_description: 'Pacote Growth',
            package_created_at: '2026-01-01T00:00:00.000Z',
            package_updated_at: '2026-01-02T00:00:00.000Z',
          },
        ],
      }
    }

    if (sql.includes('FROM public.blueprint_pipeline_stages')) {
      return {
        rows: [
          {
            id: 'stage-1',
            template_id: 'template-1',
            key: 'new',
            name: 'Novo',
            color: '#64748b',
            order_index: 1,
            is_won: false,
            is_lost: false,
          },
        ],
      }
    }

    if (sql.includes('FROM public.blueprint_pipeline_templates')) {
      return {
        rows: [
          {
            id: 'template-1',
            blueprint_id: 'blueprint-1',
            key: 'sales',
            name: 'Funil comercial',
            description: null,
          },
        ],
      }
    }

    if (sql.includes('FROM public.blueprint_custom_fields')) {
      return {
        rows: [
          {
            id: 'field-1',
            blueprint_id: 'blueprint-1',
            key: 'budget',
            label: 'Orcamento',
            field_type: 'number',
            required: true,
            options: [],
          },
        ],
      }
    }

    if (sql.includes('FROM public.blueprint_message_templates')) {
      return {
        rows: [
          {
            id: 'message-1',
            blueprint_id: 'blueprint-1',
            key: 'welcome',
            name: 'Boas-vindas',
            channel: 'whatsapp',
            body: 'Ola',
          },
        ],
      }
    }

    if (sql.includes('FROM public.blueprint_automation_templates')) {
      return {
        rows: [
          {
            id: 'automation-1',
            blueprint_id: 'blueprint-1',
            key: 'follow-up',
            name: 'Follow-up',
            trigger_event: 'lead.created',
            draft_payload: { delay: 1 },
          },
        ],
      }
    }

    if (sql.includes('FROM public.blueprint_report_presets')) {
      return {
        rows: [
          {
            id: 'report-1',
            blueprint_id: 'blueprint-1',
            key: 'overview',
            name: 'Visao geral',
            metric_keys: ['leads'],
          },
        ],
      }
    }

    if (sql.includes('FROM public.blueprint_application_runs')) {
      return {
        rows: [
          {
            id: 'run-1',
            blueprint_id: 'blueprint-1',
            contract_id: 'contract-1',
            status: 'succeeded',
            summary: { moduleCount: 1 },
            error: null,
            created_at: '2026-01-03T00:00:00.000Z',
            updated_at: '2026-01-04T00:00:00.000Z',
          },
        ],
      }
    }

    if (sql.includes('FROM public.blueprint_modules')) {
      return {
        rows: [{ blueprint_id: 'blueprint-1', module_key: 'crm' }],
      }
    }

    if (sql.includes('FROM public.blueprints')) {
      return {
        rows: [
          {
            id: 'blueprint-1',
            key: 'clinicas',
            name: 'Clinicas',
            sector: 'health',
            description: 'Modelo para clinicas',
            created_at: '2026-01-01T00:00:00.000Z',
            updated_at: '2026-01-02T00:00:00.000Z',
          },
        ],
      }
    }

    if (sql.includes('FROM public.memberships')) {
      return {
        rows: [
          {
            organization_id: 'org-1',
            organization_name: 'Cliente Demo',
            organization_slug: 'cliente-demo',
            organization_kind: 'client',
            role_key: 'client_admin',
          },
        ],
      }
    }

    if (sql.includes('FROM public.platform_modules')) {
      return {
        rows: [
          {
            key: 'crm',
            name: 'CRM',
            base: false,
            internal_route: '/crm',
            portal_route: '/portal/crm',
            required_permissions: ['crm.read'],
          },
          {
            key: 'omnichannel',
            name: 'Omnichannel',
            base: false,
            internal_route: '/omnichannel',
            portal_route: '/portal/omnichannel',
            required_permissions: ['omnichannel.read'],
          },
          {
            key: 'strategy',
            name: 'Strategy',
            base: false,
            internal_route: '/strategy',
            portal_route: null,
            required_permissions: ['platform.manage'],
          },
        ],
      }
    }

    if (sql.includes('FROM public.contracts')) {
      return {
        rows: [{ module_key: 'crm' }, { module_key: 'omnichannel' }],
      }
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

function sessionCookie(rawToken: string) {
  return `${testEnv.SESSION_COOKIE_NAME}=${rawToken}`
}

function buildAuthenticatedAuthStore() {
  const token = 'session-token'
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = {
    id: 'user-1',
    email: 'admin@yux.com.br',
    name: 'Admin YUX',
    role: 'yux_admin',
  }

  return { authStore, token }
}

describe('platform routes', () => {
  it('rejects unauthenticated platform context requests', async () => {
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never })

    const response = await app.inject({ method: 'GET', url: '/api/platform/context' })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'not_authenticated' })
  })

  it('returns platform context for an authenticated internal user', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })

    const response = await app.inject({
      method: 'GET',
      url: '/api/platform/context',
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      user: {
        id: 'user-1',
        email: 'admin@yux.com.br',
        name: 'Admin YUX',
        role: 'yux_admin',
      },
      memberships: [
        {
          organizationId: 'org-1',
          organizationName: 'Cliente Demo',
          organizationSlug: 'cliente-demo',
          organizationKind: 'client',
          roleKey: 'client_admin',
        },
      ],
      activeOrganizationId: 'org-1',
      enabledModuleKeys: ['crm', 'omnichannel', 'strategy'],
    })
  })

  it('returns platform modules from the backend schema', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })

    const response = await app.inject({
      method: 'GET',
      url: '/api/platform/modules',
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      {
        key: 'crm',
        name: 'CRM',
        base: false,
        internalRoute: '/crm',
        portalRoute: '/portal/crm',
        requiredPermissions: ['crm.read'],
      },
      {
        key: 'omnichannel',
        name: 'Omnichannel',
        base: false,
        internalRoute: '/omnichannel',
        portalRoute: '/portal/omnichannel',
        requiredPermissions: ['omnichannel.read'],
      },
      {
        key: 'strategy',
        name: 'Strategy',
        base: false,
        internalRoute: '/strategy',
        portalRoute: null,
        requiredPermissions: ['platform.manage'],
      },
    ])
  })

  it('returns contracts with package and module details', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })

    const response = await app.inject({
      method: 'GET',
      url: '/api/platform/contracts',
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      {
        id: 'contract-1',
        clientId: 'client-1',
        packageId: 'package-1',
        status: 'active',
        startsAt: '2026-01-01',
        name: 'Contrato principal',
        value: 1200.5,
        billingCycle: 'monthly',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
        package: {
          id: 'package-1',
          key: 'growth',
          name: 'Growth',
          description: 'Pacote Growth',
          moduleKeys: ['crm'],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-02T00:00:00.000Z',
        },
        modules: [{ contractId: 'contract-1', moduleKey: 'crm', enabled: true }],
      },
    ])
  })

  it('returns blueprints with nested setup templates', async () => {
    const { authStore, token } = buildAuthenticatedAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })

    const response = await app.inject({
      method: 'GET',
      url: '/api/platform/blueprints',
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual([
      {
        id: 'blueprint-1',
        key: 'clinicas',
        name: 'Clinicas',
        sector: 'health',
        description: 'Modelo para clinicas',
        moduleKeys: ['crm'],
        pipelineTemplate: {
          id: 'template-1',
          blueprintId: 'blueprint-1',
          key: 'sales',
          name: 'Funil comercial',
          stages: [
            {
              id: 'stage-1',
              templateId: 'template-1',
              key: 'new',
              name: 'Novo',
              color: '#64748b',
              orderIndex: 1,
              isWon: false,
              isLost: false,
            },
          ],
        },
        customFields: [
          {
            id: 'field-1',
            blueprintId: 'blueprint-1',
            key: 'budget',
            label: 'Orcamento',
            fieldType: 'number',
            required: true,
            options: [],
          },
        ],
        messageTemplates: [
          {
            id: 'message-1',
            blueprintId: 'blueprint-1',
            key: 'welcome',
            name: 'Boas-vindas',
            channel: 'whatsapp',
            body: 'Ola',
          },
        ],
        automationTemplates: [
          {
            id: 'automation-1',
            blueprintId: 'blueprint-1',
            key: 'follow-up',
            name: 'Follow-up',
            triggerEvent: 'lead.created',
            draftPayload: { delay: 1 },
          },
        ],
        reportPresets: [
          {
            id: 'report-1',
            blueprintId: 'blueprint-1',
            key: 'overview',
            name: 'Visao geral',
            metricKeys: ['leads'],
          },
        ],
        applicationRuns: [
          {
            id: 'run-1',
            blueprintId: 'blueprint-1',
            contractId: 'contract-1',
            status: 'succeeded',
            summary: { moduleCount: 1 },
            createdAt: '2026-01-03T00:00:00.000Z',
            updatedAt: '2026-01-04T00:00:00.000Z',
          },
        ],
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-02T00:00:00.000Z',
      },
    ])
  })
})
