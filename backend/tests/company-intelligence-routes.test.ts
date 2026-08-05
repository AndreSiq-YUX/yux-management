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

const ids = {
  user: '00000000-0000-4000-8000-000000000001',
  org: '00000000-0000-4000-8000-000000000002',
  client: '00000000-0000-4000-8000-000000000003',
  contract: '00000000-0000-4000-8000-000000000004',
  profile: '00000000-0000-4000-8000-000000000005',
  brand: '00000000-0000-4000-8000-000000000006',
}

class FakeAuthStore implements AuthStore {
  user: AuthUser | null = null
  sessionHash: string | null = null
  async findActiveUserByEmail() { return null }
  async createSession() { return undefined }
  async deleteSession() { return undefined }
  async findUserBySession(sessionHash: string) {
    return this.user && this.sessionHash === sessionHash ? this.user : null
  }
}

class FakePool {
  profile = {
    id: ids.profile,
    organization_id: ids.org,
    organization_name: 'YUX',
    client_id: ids.client,
    legal_name: 'YUX Solucoes em IA',
    trade_name: 'YUX',
    description: 'Crescimento com IA.',
    website_url: 'https://yux.com.br',
    industry: 'Tecnologia',
    positioning: 'Parceira de crescimento',
    differentiators: ['estrategia'],
    emails: ['contato@yux.com.br'],
    phones: ['11999999999'],
    address: {},
    business_hours: {},
    service_regions: ['Brasil'],
    social_links: {},
    internal_notes: 'Nota interna',
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  }

  async query(sql: string, params: any[] = []): Promise<{ rows: any[] }> {
    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
    if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql)) return { rows: [] }
    if (sql.includes('SELECT client_id FROM public.organizations')) return { rows: [{ client_id: ids.client }] }
    if (sql.includes('INSERT INTO public.organization_company_profiles')) {
      this.profile = {
        ...this.profile,
        legal_name: params[1], trade_name: params[2], description: params[3], website_url: params[4],
        industry: params[5], positioning: params[6], differentiators: params[7], emails: params[8],
        phones: params[9], address: JSON.parse(params[10]), business_hours: JSON.parse(params[11]),
        service_regions: params[12], social_links: JSON.parse(params[13]), internal_notes: params[14],
      }
      return { rows: [] }
    }
    if (sql.includes('UPDATE public.clients SET')) return { rows: [] }
    if (sql.includes('FROM public.organizations organization') && sql.includes('organization_company_profiles')) {
      return { rows: [this.profile] }
    }
    if (sql.includes('JOIN public.contracts contract')) {
      return { rows: [{ client_id: ids.client, contract_id: ids.contract }] }
    }
    if (sql.includes('INSERT INTO public.marketing_brand_profiles')) {
      return { rows: [{
        id: ids.brand, organization_id: ids.org, client_id: ids.client, contract_id: ids.contract,
        tone_of_voice: params[3], persona: params[4], brand_voice_summary: params[5],
        vocabulary_do: params[6], vocabulary_dont: params[7], forbidden_topics: params[8],
        priority_topics: params[9], visual_identity: JSON.parse(params[10]), visual_guidelines: params[11], compliance_notes: params[12],
        status: params[13], created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z',
      }] }
    }
    if (sql.includes('FROM public.marketing_brand_profiles profile')) return { rows: [] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async connect() { return { query: this.query.bind(this), release: () => undefined } }
  async end() { return undefined }
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
})

function authenticatedStore(role = 'yux_admin') {
  const token = `company-intelligence-${role}`
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = { id: ids.user, email: 'admin@yux.com.br', name: 'Admin', role }
  return { authStore, token }
}

describe('company intelligence routes', () => {
  it('rejects unauthenticated access', async () => {
    app = await buildServer(testEnv, { authStore: new FakeAuthStore(), pool: new FakePool() as never })
    const response = await app.inject({ method: 'GET', url: `/api/company-intelligence/organizations/${ids.org}/profile` })
    expect(response.statusCode).toBe(401)
  })

  it('round-trips the editable company profile', async () => {
    const { authStore, token } = authenticatedStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })
    const response = await app.inject({
      method: 'PUT',
      url: `/api/company-intelligence/organizations/${ids.org}/profile`,
      headers: { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` },
      payload: {
        legalName: 'YUX Solucoes em IA Ltda', tradeName: 'YUX', description: 'Operacao YUX',
        websiteUrl: 'https://yux.com.br', industry: 'Tecnologia', positioning: 'IA aplicada',
        differentiators: ['Estratégia', 'estratégia'], emails: ['contato@yux.com.br'], phones: ['11999999999'],
        address: {}, businessHours: {}, serviceRegions: ['Brasil'], socialLinks: {}, internalNotes: 'Interno',
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ legalName: 'YUX Solucoes em IA Ltda', differentiators: ['Estratégia'] })
  })

  it('saves all brand guardrails', async () => {
    const { authStore, token } = authenticatedStore()
    app = await buildServer(testEnv, { authStore, pool: new FakePool() as never })
    const response = await app.inject({
      method: 'PUT',
      url: `/api/company-intelligence/organizations/${ids.org}/brand`,
      headers: { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` },
      payload: {
        contractId: ids.contract,
        toneOfVoice: 'consultivo e direto', persona: 'gestores de PMEs', brandVoiceSummary: 'Clara e prática',
        vocabularyDo: ['diagnóstico'], vocabularyDont: ['garantido'], forbiddenTopics: ['resultado garantido'],
        priorityTopics: ['crescimento'], visualIdentity: { logoUrl: 'https://yux.com.br/logo.svg', colors: ['#5519ff'] },
        visualGuidelines: 'minimalista', complianceNotes: 'Não prometer resultados', status: 'active',
      },
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({
      toneOfVoice: 'consultivo e direto',
      vocabularyDont: ['garantido'],
      forbiddenTopics: ['resultado garantido'],
      visualIdentity: expect.objectContaining({ logoUrl: 'https://yux.com.br/logo.svg', colors: ['#5519ff'] }),
      complianceNotes: 'Não prometer resultados',
      status: 'active',
    })
  })

  it('blocks company members from writing', async () => {
    const { authStore, token } = authenticatedStore('client_member')
    const pool = new FakePool()
    pool.query = async (sql: string, params: any[] = []) => {
      if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [{ organization_id: ids.org }] }
      if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
      return FakePool.prototype.query.call(pool, sql, params)
    }
    app = await buildServer(testEnv, { authStore, pool: pool as never })
    const response = await app.inject({
      method: 'PUT',
      url: `/api/company-intelligence/organizations/${ids.org}/brand`,
      headers: { cookie: `${testEnv.SESSION_COOKIE_NAME}=${token}` },
      payload: { toneOfVoice: '', persona: '', brandVoiceSummary: '', status: 'draft' },
    })
    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ error: 'company_intelligence_write_forbidden' })
  })
})
