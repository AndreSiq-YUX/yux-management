import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'
import { resolveMissionCreation } from '../src/modules/workspace/context.js'

const internalOrganizationId = '00000000-0000-4000-8000-000000000001'
const clientOrganizationId = '00000000-0000-4000-8000-000000000002'
const otherClientOrganizationId = '00000000-0000-4000-8000-000000000003'
const userId = '00000000-0000-4000-8000-000000000010'
const contractId = '00000000-0000-4000-8000-000000000020'
const env = {
  NODE_ENV: 'test' as const, PORT: 4000, DATABASE_URL: 'postgresql://localhost/test', REDIS_URL: 'redis://localhost:6379',
  SESSION_COOKIE_NAME: 'yux_session', SESSION_SECRET: 'test-secret-value-with-at-least-32-chars', CORS_ORIGIN: 'http://localhost:3000',
  MISSION_CONVERSATIONS_ENABLED: true, MISSION_CONVERSATIONS_TENANT_ALLOWLIST: internalOrganizationId,
}

class Store implements AuthStore {
  hash = ''
  user: AuthUser | null = null
  async findActiveUserByEmail() { return null }
  async createSession() { return undefined }
  async deleteSession() { return undefined }
  async findUserBySession(hash: string) { return hash === this.hash ? this.user : null }
}

class Pool {
  constructor(
    private role: 'yux_admin' | 'yux_operator' | 'client_member',
    private organizationId: string,
    private technicalContractId: string | null = null,
  ) {}

  async query<T>(sql: string) {
    if (sql.includes('FROM public.memberships') && sql.includes('SELECT organization_id')) {
      return { rows: [{ organization_id: this.organizationId }] as T[] }
    }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [{ module_key: 'action_engine' }] as T[] }
    if (sql.includes('FROM public.organizations WHERE id')) {
      return { rows: [{
        id: this.organizationId,
        kind: this.organizationId === internalOrganizationId ? 'yux' : 'client',
        client_id: this.organizationId === internalOrganizationId
          ? (this.technicalContractId ? '00000000-0000-4000-8000-000000000030' : null)
          : '00000000-0000-4000-8000-000000000030',
        is_internal_growth_workspace: this.organizationId === internalOrganizationId,
      }] as T[] }
    }
    if (sql.includes('SELECT role_key FROM public.memberships')) return { rows: [{ role_key: this.role }] as T[] }
    if (sql.includes('FROM public.role_permissions')) {
      return { rows: (this.role === 'yux_admin'
        ? [{ permission_key: 'platform.manage' }, { permission_key: 'action_engine.write' }]
        : this.role === 'yux_operator'
          ? [{ permission_key: 'omnichannel.configure' }, { permission_key: 'action_engine.write' }]
        : [{ permission_key: 'action_engine.read' }]) as T[] }
    }
    if (sql.includes('FROM public.platform_modules')) {
      return { rows: [{ module_key: 'action_engine' }, { module_key: 'whatsapp_ai' }] as T[] }
    }
    if (sql.includes('LEFT JOIN LATERAL')) {
      return { rows: [{ contract_id: contractId, module_key: 'action_engine' }, { contract_id: contractId, module_key: 'whatsapp_ai' }] as T[] }
    }
    if (sql.includes('FROM public.contracts WHERE client_id')) {
      return { rows: (this.technicalContractId ? [{ id: this.technicalContractId }] : []) as T[] }
    }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() { return undefined }
}

const queue: AppJobQueue = { async add() { return {} }, async close() {} }
let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

function auth(role: 'yux_admin' | 'yux_operator' | 'client_member') {
  const token = `workspace-${role}`
  const store = new Store()
  store.hash = hashSessionToken(token)
  store.user = { id: userId, email: `${role}@example.com`, name: role, role }
  return { store, headers: { cookie: `${env.SESSION_COOKIE_NAME}=${token}` } }
}

describe('WorkspaceContextV1', () => {
  it('resolves the internal growth workspace without inventing a commercial contract', async () => {
    const session = auth('yux_admin')
    app = await buildServer(env, { authStore: session.store, pool: new Pool('yux_admin', internalOrganizationId) as never, jobQueue: queue })
    const response = await app.inject({
      method: 'GET', url: `/api/workspace/organizations/${internalOrganizationId}/context`, headers: session.headers,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      schemaVersion: 1, organizationId: internalOrganizationId, kind: 'internal_growth', contractId: null,
      role: 'yux_admin', missionCreation: { mode: 'conversation', reasonCode: null },
    })
    expect(response.json().moduleKeys).toContain('whatsapp_ai')
  })

  it('keeps a read-only client member out of mission creation', async () => {
    const session = auth('client_member')
    app = await buildServer(env, { authStore: session.store, pool: new Pool('client_member', clientOrganizationId) as never, jobQueue: queue })
    const response = await app.inject({
      method: 'GET', url: `/api/workspace/organizations/${clientOrganizationId}/context`, headers: session.headers,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      kind: 'client', contractId, role: 'client_member',
      missionCreation: { mode: 'unavailable', reasonCode: 'mission_write_not_permitted' },
    })
  })

  it('reuses an existing technical contract for an internal workspace without creating one', async () => {
    const session = auth('yux_admin')
    app = await buildServer(env, {
      authStore: session.store,
      pool: new Pool('yux_admin', internalOrganizationId, contractId) as never,
      jobQueue: queue,
    })
    const response = await app.inject({
      method: 'GET', url: `/api/workspace/organizations/${internalOrganizationId}/context`, headers: session.headers,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ kind: 'internal_growth', contractId })
  })

  it('maps the authenticated operator to the legacy manager permission catalog', async () => {
    const session = auth('yux_operator')
    app = await buildServer(env, {
      authStore: session.store,
      pool: new Pool('yux_operator', internalOrganizationId) as never,
      jobQueue: queue,
    })
    const response = await app.inject({
      method: 'GET', url: `/api/workspace/organizations/${internalOrganizationId}/context`, headers: session.headers,
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      role: 'yux_operator', canConfigure: true,
      missionCreation: { mode: 'conversation', reasonCode: null },
    })
  })

  it('rejects a client member from another organization before resolving context', async () => {
    const session = auth('client_member')
    app = await buildServer(env, {
      authStore: session.store,
      pool: new Pool('client_member', clientOrganizationId) as never,
      jobQueue: queue,
    })
    const response = await app.inject({
      method: 'GET', url: `/api/workspace/organizations/${otherClientOrganizationId}/context`, headers: session.headers,
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'forbidden' })
  })

  it('computes the flag and allowlist matrix on the backend', () => {
    expect(resolveMissionCreation(env, internalOrganizationId, true, true).mode).toBe('conversation')
    expect(resolveMissionCreation(env, clientOrganizationId, true, true)).toEqual({
      mode: 'form', reasonCode: 'mission_conversation_not_allowlisted',
    })
    expect(resolveMissionCreation({ ...env, MISSION_CONVERSATIONS_ENABLED: false }, internalOrganizationId, true, true)).toEqual({
      mode: 'form', reasonCode: 'mission_conversation_disabled',
    })
    expect(resolveMissionCreation(env, internalOrganizationId, true, false).mode).toBe('unavailable')
  })
})
