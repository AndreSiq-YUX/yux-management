import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
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
  PUBLIC_APP_URL: 'https://app.yux.test',
}

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002',
  contract: '00000000-0000-4000-8000-000000000003',
  form: '00000000-0000-4000-8000-000000000004',
}

class FakeAuthStore implements AuthStore {
  sessionHash: string | null = null
  user: AuthUser | null = null
  async findActiveUserByEmail() { return null }
  async createSession() { return undefined }
  async deleteSession() { return undefined }
  async findUserBySession(hash: string) { return hash === this.sessionHash ? this.user : null }
}

class FakePool {
  form: Record<string, unknown> | null = null
  createParams: unknown[] = []

  async query(sql: string, params: unknown[] = []) {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [{ organization_id: ids.org }] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [{ module_key: 'landing_pages' }] }
    if (sql.includes('SELECT c.id, o.id AS organization_id')) {
      return { rows: [{ id: ids.contract, organization_id: ids.org, contract_id: ids.contract, pipeline_id: null, initial_stage_id: null, status: 'active' }] }
    }
    if (sql.includes('INSERT INTO public.landing_page_forms')) {
      this.createParams = params
      this.form = {
        id: ids.form,
        landing_page_id: null,
        organization_id: ids.org,
        contract_id: ids.contract,
        pipeline_id: null,
        initial_stage_id: null,
        name: params[5],
        submit_label: params[6],
        success_message: params[7],
        metadata: params[8],
        public_token_hash: params[9],
        is_active: true,
        allowed_origins: params[10],
        public_token_rotated_at: '2026-08-01T12:00:00.000Z',
        submission_count: 0,
        last_submission_at: null,
        created_at: '2026-08-01T12:00:00.000Z',
        updated_at: '2026-08-01T12:00:00.000Z',
      }
      return { rows: [this.form] }
    }
    if (sql.includes('INSERT INTO public.landing_page_field_mappings')) return { rows: [] }
    if (sql.includes('FROM public.landing_page_forms f') && sql.includes('LEFT JOIN public.landing_pages')) {
      return { rows: this.form ? [{ ...this.form, landing_page_name: null }] : [] }
    }
    if (sql.includes('FROM public.landing_page_field_mappings')) {
      return { rows: [
        { id: 'map-name', form_id: ids.form, field_name: 'name', crm_field_key: 'name', required: true, created_at: '', updated_at: '' },
        { id: 'map-email', form_id: ids.form, field_name: 'email', crm_field_key: 'email', required: true, created_at: '', updated_at: '' },
      ] }
    }
    if (sql.includes('ROW_NUMBER() OVER')) return { rows: [] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async end() { return undefined }
}

const queue: AppJobQueue = {
  async add() { return { id: 'job-1' } },
  async close() {},
}

let app: FastifyInstance | undefined
afterEach(async () => { await app?.close(); app = undefined })

function authenticatedStore() {
  const token = 'client-session'
  const store = new FakeAuthStore()
  store.sessionHash = hashSessionToken(token)
  store.user = { id: ids.user, email: 'cliente@yux.test', name: 'Cliente', role: 'client_admin' }
  return { store, token }
}

describe('external lead form management', () => {
  it('creates and lists a contract form without a landing page', async () => {
    const pool = new FakePool()
    const { store, token } = authenticatedStore()
    app = await buildServer(env, { pool: pool as never, authStore: store, jobQueue: queue })
    const headers = { cookie: `${env.SESSION_COOKIE_NAME}=${token}` }

    const created = await app.inject({
      method: 'POST',
      url: '/api/landing-pages/forms',
      headers,
      payload: { contractId: ids.contract, name: 'Formulário do site' },
    })

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ id: ids.form, contractId: ids.contract, name: 'Formulário do site' })
    expect(created.json()).not.toHaveProperty('landingPageId')
    expect(created.json().publicEndpoint).toContain('/api/public/lead-forms/')
    expect(pool.createParams[0]).toBeNull()

    const listed = await app.inject({
      method: 'GET',
      url: `/api/landing-pages/forms?contractId=${ids.contract}`,
      headers,
    })

    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toEqual([
      expect.objectContaining({ id: ids.form, contractId: ids.contract, recentSubmissions: [] }),
    ])
    expect(listed.json()[0]).not.toHaveProperty('landingPageId')
  })
})
