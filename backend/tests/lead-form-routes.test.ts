import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppJobQueue } from '../src/server.js'
import { buildServer } from '../src/server.js'
import { hashLeadFormToken } from '../src/modules/lead-forms/repository.js'

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
  org: '00000000-0000-4000-8000-000000000002',
  page: '00000000-0000-4000-8000-000000000003',
  form: '00000000-0000-4000-8000-000000000004',
  pipeline: '00000000-0000-4000-8000-000000000005',
  stage: '00000000-0000-4000-8000-000000000006',
  source: '00000000-0000-4000-8000-000000000007',
  lead: '00000000-0000-4000-8000-000000000008',
  submission: '00000000-0000-4000-8000-000000000009',
  crmInstance: '00000000-0000-4000-8000-000000000011',
}

const token = 'lead-form-public-token-000000000000000000000000000000'

class FakeClient {
  submissions = new Map<string, {
    id: string
    lead_id: string
    status: string
    lead_name: string
    lead_email: string
    lead_phone: string | null
    lead_company: string | null
  }>()
  queryCount = 0
  leadInsertCount = 0
  lastSubmissionParams: unknown[] = []
  customFieldUpserts: unknown[][] = []
  publicFormQuerySql = ''
  leadInsertSql = ''
  lastLeadInsertParams: unknown[] = []
  stageResolutionSql = ''
  formPipelineId: string | null = ids.pipeline
  formLandingPageId: string | null = ids.page
  failPublicFormQuery = false

  async query(sql: string, params: unknown[] = []) {
    this.queryCount += 1
    if (sql.includes('FROM public.landing_page_forms f') && sql.includes('public_token_hash')) {
      this.publicFormQuerySql = sql
      if (this.failPublicFormQuery) throw new Error('sensitive database detail')
      return {
        rows: [{
          id: ids.form,
          landing_page_id: this.formLandingPageId,
          organization_id: ids.org,
          name: 'Formulário principal',
          submit_label: 'Enviar',
          success_message: 'Recebido',
          metadata: { requiresConsent: true },
          public_token_hash: hashLeadFormToken(token),
          is_active: true,
          allowed_origins: ['https://cliente.test'],
          public_token_rotated_at: null,
          submission_count: 0,
          last_submission_at: null,
          created_at: '2026-07-30T00:00:00.000Z',
          updated_at: '2026-07-30T00:00:00.000Z',
          contract_id: '00000000-0000-4000-8000-000000000010',
          pipeline_id: this.formPipelineId,
          initial_stage_id: ids.stage,
          status: 'active',
          landing_page_name: 'Página de campanha',
          landing_page_slug: 'campanha',
          crm_source_id: null,
        }],
      }
    }
    if (sql.includes('FROM public.landing_page_form_submissions')) {
      const row = this.submissions.get(String(params[1]))
      return { rows: row ? [row] : [] }
    }
    if (sql.includes('FROM public.landing_page_field_mappings')) {
      return {
        rows: [
          { id: 'mapping-name', form_id: ids.form, field_name: 'full_name', crm_field_key: 'name', required: true, created_at: '', updated_at: '' },
          { id: 'mapping-email', form_id: ids.form, field_name: 'email_address', crm_field_key: 'email', required: true, created_at: '', updated_at: '' },
          { id: 'mapping-specialty', form_id: ids.form, field_name: 'especialidade', crm_field_key: 'specialty', required: false, created_at: '', updated_at: '' },
        ],
      }
    }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [] }
    if (sql.includes('FROM public.leads')) return { rows: [] }
    if (sql.includes('FROM public.lead_sources')) return { rows: [] }
    if (sql.includes('INSERT INTO public.lead_sources')) return { rows: [{ id: ids.source }] }
    if (sql.includes('FROM public.crm_pipelines p')) {
      this.stageResolutionSql = sql
      return { rows: [{ pipeline_id: ids.pipeline, stage_id: ids.stage, crm_instance_id: ids.crmInstance, assignment_mode: 'queue' }] }
    }
    if (sql.includes('INSERT INTO public.leads')) {
      this.leadInsertCount += 1
      this.leadInsertSql = sql
      this.lastLeadInsertParams = params
      return { rows: [{ id: ids.lead }] }
    }
    if (sql.includes('INSERT INTO public.lead_custom_field_values')) {
      this.customFieldUpserts.push(params)
      return { rows: [] }
    }
    if (sql.includes('INSERT INTO public.landing_page_form_submissions')) {
      this.lastSubmissionParams = params
      this.submissions.set(String(params[3]), {
        id: ids.submission,
        lead_id: ids.lead,
        status: String(params[5]),
        lead_name: 'Ana Cliente',
        lead_email: 'ana@example.com',
        lead_phone: null,
        lead_company: null,
      })
      return { rows: [] }
    }
    if (sql.includes('INSERT INTO public.landing_page_events')) return { rows: [] }
    if (sql.includes('INSERT INTO public.lead_attribution_events')) return { rows: [] }
    if (sql.includes('UPDATE public.landing_page_forms')) return { rows: [] }
    if (sql.includes('UPDATE public.landing_pages')) return { rows: [] }
    throw new Error(`Unexpected SQL: ${sql}`)
  }

  async release() {}
}

class FakePool {
  client = new FakeClient()

  async connect() {
    return {
      query: async (sql: string, params?: unknown[]) => {
        if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] }
        return this.client.query(sql, params)
      },
      release: () => undefined,
    }
  }

  async query(sql: string) {
    if (sql.includes('FROM public.memberships')) return { rows: [] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }
    throw new Error(`Unexpected pool SQL: ${sql}`)
  }

  async end() {}
}

const jobQueue: AppJobQueue & { jobs: Array<{ name: string; data: any }>; failNext: boolean } = {
  jobs: [],
  failNext: false,
  async add(name, data) {
    if (this.failNext) {
      this.failNext = false
      throw new Error('queue unavailable')
    }
    this.jobs.push({ name, data })
    return { id: 'job-1' }
  },
  async close() {},
}

let app: FastifyInstance | undefined

afterEach(async () => {
  await app?.close()
  app = undefined
  jobQueue.jobs = []
  jobQueue.failNext = false
})

describe('public lead form routes', () => {
  it('creates a lead, records the form submission and dispatches lead.created', async () => {
    const pool = new FakePool()
    app = await buildServer(env, { pool: pool as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/public/lead-forms/${token}/submissions`,
      headers: {
        origin: 'https://cliente.test',
        referer: 'https://cliente.test/campanha',
        'accept-language': 'pt-BR,pt;q=0.9',
        'idempotency-key': 'external-1',
        'content-type': 'application/json',
      },
      payload: {
        full_name: 'Ana Cliente',
        email_address: 'ana@example.com',
        consent_lgpd: true,
        consent_code: 'newsletter_and_sales',
        consent_version: '2.1',
        privacy_policy_version: '2026-07',
        profile: 'decisor',
        country: 'BR',
        fit_score: 82,
        intent_score: 67,
        crm_contact_id: 'crm-ana-123',
        especialidade: 'Dermatologia',
        page_url: 'https://cliente.test/campanha',
        utm_source: 'google',
        utm_medium: 'cpc',
        utm_campaign: 'jul-2026',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toEqual({
      accepted: true,
      duplicate: false,
      leadId: ids.lead,
      formId: ids.form,
    })
    expect(jobQueue.jobs).toHaveLength(1)
    expect(jobQueue.jobs[0].name).toBe('automation.dispatch')
    expect(jobQueue.jobs[0].data.event.type).toBe('lead.created')
    expect(jobQueue.jobs[0].data.event.payload).toMatchObject({
      profile: 'decisor',
      country: 'BR',
      fitScore: 82,
      intentScore: 67,
      crmContactId: 'crm-ana-123',
      consentVersion: '2.1',
    })
    expect(pool.client.lastSubmissionParams[10]).toBe('pt-BR')
    expect(pool.client.lastSubmissionParams[11]).toBe('https://cliente.test/campanha')
    expect(pool.client.lastSubmissionParams[18]).toBe('newsletter_and_sales')
    expect(pool.client.lastSubmissionParams[19]).toBe('2.1')
    expect(pool.client.lastSubmissionParams[20]).toBe('2026-07')
    expect(pool.client.customFieldUpserts).toHaveLength(1)
    expect(pool.client.customFieldUpserts[0].slice(2, 4)).toEqual(['specialty', 'especialidade'])
    expect(pool.client.publicFormQuerySql).toContain('FOR UPDATE OF f')
    expect(pool.client.leadInsertSql).toContain('organization_id, crm_instance_id, pipeline_id')
    expect(pool.client.lastLeadInsertParams[1]).toBe(ids.crmInstance)
    expect(pool.client.lastLeadInsertParams.at(-1)).toBe('queue')
  })

  it('rejects submissions from an origin not configured for the form', async () => {
    app = await buildServer(env, { pool: new FakePool() as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/public/lead-forms/${token}/submissions`,
      headers: { origin: 'https://outro-site.test', 'content-type': 'application/json' },
      payload: { name: 'Ana', email: 'ana@example.com', consent_lgpd: true },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toEqual({ accepted: false, error: 'lead_form_origin_not_allowed' })
    expect(jobQueue.jobs).toHaveLength(0)
  })

  it('links standalone form leads to the CRM instance selected with the fallback pipeline', async () => {
    const pool = new FakePool()
    pool.client.formPipelineId = null
    pool.client.formLandingPageId = null
    app = await buildServer(env, { pool: pool as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/public/lead-forms/${token}/submissions`,
      headers: {
        origin: 'https://cliente.test',
        'idempotency-key': 'standalone-form-1',
        'content-type': 'application/json',
      },
      payload: { full_name: 'Lead externo', email_address: 'lead@example.com', consent_lgpd: true },
    })

    expect(response.statusCode).toBe(201)
    expect(pool.client.stageResolutionSql).toContain('ci.contract_id = $2')
    expect(pool.client.lastLeadInsertParams[1]).toBe(ids.crmInstance)
  })

  it('does not expose internal database errors in the public response', async () => {
    const pool = new FakePool()
    pool.client.failPublicFormQuery = true
    app = await buildServer(env, { pool: pool as never, jobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/public/lead-forms/${token}/submissions`,
      headers: { origin: 'https://cliente.test', 'content-type': 'application/json' },
      payload: { name: 'Ana', email: 'ana@example.com', consent_lgpd: true },
    })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({ accepted: false, error: 'lead_form_submission_failed' })
  })

  it('re-dispatches a processed idempotent submission after a temporary queue failure', async () => {
    const pool = new FakePool()
    jobQueue.failNext = true
    app = await buildServer(env, { pool: pool as never, jobQueue })
    const request = {
      method: 'POST' as const,
      url: `/api/public/lead-forms/${token}/submissions`,
      headers: {
        origin: 'https://cliente.test',
        'idempotency-key': 'external-retry-1',
        'content-type': 'application/json',
      },
      payload: { full_name: 'Ana Cliente', email_address: 'ana@example.com', consent_lgpd: true },
    }

    const firstResponse = await app.inject(request)
    expect(firstResponse.statusCode).toBe(503)
    expect(pool.client.leadInsertCount).toBe(1)

    const retryResponse = await app.inject(request)
    expect(retryResponse.statusCode).toBe(200)
    expect(retryResponse.json().duplicate).toBe(true)
    expect(pool.client.leadInsertCount).toBe(1)
    expect(jobQueue.jobs).toHaveLength(1)
    expect(jobQueue.jobs[0].data.event.eventId).toBe(`${ids.form}:external-retry-1`)
  })
})
