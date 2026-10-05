import type { FastifyInstance } from 'fastify'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AuthStore, AuthUser } from '../src/auth/routes.js'
import { hashSessionToken } from '../src/auth/session.js'
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
  clientUser: '00000000-0000-4000-8000-000000000002',
  org: '00000000-0000-4000-8000-000000000003',
  campaign: '00000000-0000-4000-8000-000000000004',
  company: '00000000-0000-4000-8000-000000000005',
  opportunity: '00000000-0000-4000-8000-000000000006',
  diagnostic: '00000000-0000-4000-8000-000000000007',
  score: '00000000-0000-4000-8000-000000000008',
  message: '00000000-0000-4000-8000-000000000009',
  pipeline: '00000000-0000-4000-8000-000000000010',
  stage: '00000000-0000-4000-8000-000000000011',
  lead: '00000000-0000-4000-8000-000000000012',
  dataSource: '00000000-0000-4000-8000-000000000020',
  enrichmentRun: '00000000-0000-4000-8000-000000000021',
  candidate: '00000000-0000-4000-8000-000000000022',
  duplicate: '00000000-0000-4000-8000-000000000023',
}

const now = '2026-07-02T00:00:00.000Z'

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
    return this.user && this.sessionHash === sessionTokenHash ? this.user : null
  }
}

class FakeRadarPool {
  opportunityStatus = 'raw'
  latestScoreId: string | null = null
  latestDiagnosticId: string | null = null
  latestMessageSuggestionId: string | null = null
  convertedLeadId: string | null = null
  convertedAt: string | null = null
  convertedBy: string | null = null
  dataSourceEnabled = false
  protectedSourceType: string | null = null
  osmSnapshotActive = false
  osmInternalOrganization = true
  clientRadarAllowed = false
  osmSeenKeys: string[] = []
  candidateStatus = 'pending_review'
  sourceUnitsUsed = 0
  sourceCostUsed = 0
  existingDuplicateRows = false
  lastInteractionDescription: string | null = null
  queries: Array<{ sql: string; params: unknown[] }> = []

  async connect() {
    return { query: this.query.bind(this), release() {} }
  }

  async query(sql: string, params: unknown[] = []) {
    this.queries.push({ sql, params })
    const normalized = sql.replace(/\s+/g, ' ').trim()

    if (sql.includes('SELECT organization_id') && sql.includes('FROM public.memberships')) return { rows: [] }
    if (sql.includes('JOIN public.memberships membership') && sql.includes("module.module_key = 'radar'")) return { rows: [{ allowed: this.clientRadarAllowed }] }
    if (normalized.includes("kind = 'yux' AND is_internal_growth_workspace")) return { rows: [{ allowed: this.osmInternalOrganization }] }
    if (sql.includes('SELECT DISTINCT cm.module_key')) return { rows: [] }

    if (normalized === 'BEGIN' || normalized === 'COMMIT' || normalized === 'ROLLBACK') return { rows: [] }
    if (normalized.includes('FROM public.radar_data_sources')) return { rows: [
      normalized.includes('SELECT source_type, default_cost_per_unit FROM') && this.protectedSourceType
        ? { source_type: this.protectedSourceType, default_cost_per_unit: '0' }
        : normalized.includes("source_key = 'osm_extract'") ? { ...dataSourceRow(this), source_key: 'osm_extract', source_type: 'osm_extract' } : dataSourceRow(this),
    ] }
    if (normalized.includes('FROM public.radar_osm_snapshots')) return { rows: this.osmSnapshotActive ? [{
      id: '00000000-0000-4000-8000-000000000024', municipality_code: '4113700', city: 'Londrina', state: 'PR',
      extracted_at: new Date().toISOString(), place_count: 2, attribution: '© OpenStreetMap contributors (ODbL)',
    }] : [] }
    if (normalized.includes('FROM public.radar_osm_places')) return { rows: [
      { osm_type: 'node', osm_id: '10', name: 'Clínica A', latitude: -23.3, longitude: -51.2,
        address: null, website: null, phone: null, email: null, source_url: 'https://www.openstreetmap.org/node/10', tags: { amenity: 'clinic' } },
      { osm_type: 'way', osm_id: '20', name: 'Clínica B', latitude: -23.4, longitude: -51.1,
        address: 'Rua A', website: 'https://clinicab.example', phone: null, email: null,
        source_url: 'https://www.openstreetmap.org/way/20', tags: { healthcare: 'clinic' } },
      { osm_type: 'way', osm_id: '21', name: 'Clínica A', latitude: -23.3001, longitude: -51.2001,
        address: null, website: null, phone: null, email: null,
        source_url: 'https://www.openstreetmap.org/way/21', tags: { healthcare: 'clinic' } },
    ] }
    if (normalized.includes('UPDATE public.radar_data_sources')) {
      return { rows: [{ ...dataSourceRow(this), enabled: params[1] ?? true, rate_limit_per_day: params[2] ?? 50 }] }
    }
    if (normalized.includes('SELECT daily_limit, budget_limit FROM public.radar_campaigns')) {
      return { rows: [{ daily_limit: 5, budget_limit: '100.00' }] }
    }
    if (normalized.includes('FROM public.radar_source_usage_counters')) {
      return { rows: [{ units: this.sourceUnitsUsed, estimated_cost: this.sourceCostUsed }] }
    }
    if (normalized.includes('INSERT INTO public.radar_source_usage_counters')) {
      this.sourceUnitsUsed += Number(params[4] ?? 0)
      this.sourceCostUsed += Number(params[5] ?? 0)
      return { rows: [] }
    }
    if (normalized.includes('SELECT * FROM public.radar_campaigns')) return { rows: [
      normalized.includes('FOR UPDATE') || normalized.includes('organization_id = $2 LIMIT 1')
        ? { ...campaignRow(), target_segment: 'Clínicas médicas' } : campaignRow(),
    ] }
    if (normalized.includes('SELECT id FROM public.radar_campaigns')) return { rows: [{ id: ids.campaign }] }
    if (normalized.includes("run_kind = 'analysis'") && normalized.includes("status IN ('pending', 'running')")) return { rows: [] }
    if (normalized.includes('FROM public.radar_enrichment_runs')) return { rows: [enrichmentRunRow()] }
    if (normalized.includes('row_to_json(c)::jsonb AS company')) {
      return {
        rows: [{
          ...opportunityRow(this),
          company: companyRow(),
          latest_score: this.latestScoreId ? scoreRow() : null,
          latest_diagnostic: this.latestDiagnosticId ? diagnosticRow() : null,
          latest_message_suggestion: this.latestMessageSuggestionId ? messageRow() : null,
        }],
      }
    }
    if (normalized.includes('COUNT(DISTINCT o.company_record_id) AS companies')) {
      return {
        rows: [{
          companies: 1,
          opportunities: 1,
          enriched: this.latestDiagnosticId ? 1 : 0,
          review_pending: this.opportunityStatus === 'review_pending' ? 1 : 0,
          approved: this.opportunityStatus === 'approved' ? 1 : 0,
          converted: this.opportunityStatus === 'converted' ? 1 : 0,
          opted_out: this.opportunityStatus === 'opted_out' ? 1 : 0,
          estimated_cost: '0.250000',
        }],
      }
    }
    if (normalized.includes('COUNT(DISTINCT c.id) AS companies')) {
      return {
        rows: [
          {
            source_type: 'manual',
            companies: 1,
            opportunities: 1,
            candidates: 0,
            converted: this.opportunityStatus === 'converted' ? 1 : 0,
            estimated_cost: '0.250000',
          },
          {
            source_type: 'jina_search',
            companies: 0,
            opportunities: 0,
            candidates: 2,
            converted: 0,
            estimated_cost: 0,
          },
        ],
      }
    }
    if (normalized.includes('INSERT INTO public.radar_campaigns')) return { rows: [params[2] === 'regional_b2b'
      ? { ...campaignRow(), name: params[1], campaign_type: 'regional_b2b', target_city: null, target_state: null,
        target_states: params[9], product_focus: params[10] }
      : campaignRow()] }
    if (normalized.includes('INSERT INTO public.radar_enrichment_runs')) return { rows: [{ id: ids.enrichmentRun }] }
    if (normalized.includes('UPDATE public.radar_enrichment_runs')) return { rows: [] }
    if (normalized.includes('INSERT INTO public.radar_candidate_records')) {
      if (normalized.includes("'osm_extract'")) {
        this.osmSeenKeys.push(params[8] as string)
        return { rows: [candidateRow({ sourceType: 'osm_extract', title: params[4] as string,
          snippet: params[5] as string, dedupeKey: params[8] as string, status: 'pending_review' })] }
      }
      return { rows: [candidateRow({ sourceType: params[3] as string, title: params[5] as string, snippet: params[6] as string, dedupeKey: params[9] as string, status: params[10] as string })] }
    }
    if (normalized.includes('COUNT(*)::text AS candidates') && normalized.includes("source_type = 'osm_extract'"))
      return { rows: [{ candidates: '2', with_site: '1', verified_sites: '0', with_phone: '0', with_email: '0', duplicates: '0', imported: '0' }] }
    if (normalized.includes('SELECT dedupe_key FROM public.radar_candidate_records')) return { rows: this.osmSeenKeys.map(dedupe_key => ({ dedupe_key })) }
    if (normalized.includes('SELECT * FROM public.radar_candidate_records WHERE id = $1')) return { rows: [candidateRow({ status: this.candidateStatus })] }
    if (normalized.includes('FROM public.radar_candidate_records')) return { rows: [candidateRow({ status: this.candidateStatus })] }
    if (normalized.includes("SET status = 'imported'")) {
      this.candidateStatus = 'imported'
      return { rows: [candidateRow({ status: 'imported', importedCompanyRecordId: params[1] as string, importedOpportunityId: params[2] as string })] }
    }
    if (normalized.includes("SET status = 'discarded'")) {
      this.candidateStatus = 'discarded'
      return { rows: [candidateRow({ status: 'discarded' })] }
    }
    if (normalized.includes('INSERT INTO public.radar_duplicate_candidates')) return { rows: [] }
    if (normalized.includes('FROM public.radar_duplicate_candidates')) return { rows: [duplicateRow()] }
    if (normalized.includes('UPDATE public.radar_duplicate_candidates')) return { rows: [{ ...duplicateRow(), status: params[1] }] }
    if (normalized.includes('INSERT INTO public.radar_company_records')) return { rows: [companyRow()] }
    if (normalized.includes('FROM public.radar_company_records') && !normalized.includes('JOIN public.radar_company_records')) {
      return { rows: this.existingDuplicateRows ? [{ ...companyRow(), id: '00000000-0000-4000-8000-000000000099' }] : [] }
    }
    if (normalized.includes('UPDATE public.radar_company_records SET dedupe_status')) return { rows: [] }
    if (normalized.includes('INSERT INTO public.radar_opportunities')) return { rows: [opportunityRow(this)] }
    if (normalized.includes('SELECT * FROM public.radar_opportunities') && normalized.includes('FOR UPDATE')) {
      return { rows: [opportunityRow(this)] }
    }
    if (normalized.includes("SET status = 'diagnosing'")) {
      this.opportunityStatus = 'diagnosing'
      return { rows: [] }
    }
    if (normalized.includes('UPDATE public.radar_opportunities SET status = CASE')) {
      this.opportunityStatus = 'enriched'
      return { rows: [{ ...opportunityRow(this), status: 'enriched' }] }
    }
    if (normalized.includes('INSERT INTO public.radar_company_enrichment')) return { rows: [] }
    if (normalized.includes('SELECT o.*, c.trade_name, c.legal_name, c.city, c.state, c.website_url')) {
      return { rows: [{ ...opportunityRow(this), ...companyJoinRow() }] }
    }
    if (normalized.includes('INSERT INTO public.radar_diagnostics')) {
      this.latestDiagnosticId = ids.diagnostic
      return { rows: [{ id: ids.diagnostic }] }
    }
    if (normalized.includes('INSERT INTO public.radar_scores')) {
      this.latestScoreId = ids.score
      return { rows: [{ id: ids.score }] }
    }
    if (normalized.includes('INSERT INTO public.radar_message_suggestions')) {
      this.latestMessageSuggestionId = ids.message
      return { rows: [{ id: ids.message }] }
    }
    if (normalized.includes("SET status = 'review_pending'")) {
      this.opportunityStatus = 'review_pending'
      this.latestDiagnosticId = params[1] as string
      this.latestScoreId = params[2] as string
      this.latestMessageSuggestionId = params[3] as string
      return { rows: [opportunityRow(this)] }
    }
    if (normalized.includes('SET status = $2')) {
      this.opportunityStatus = params[1] as string
      return { rows: [opportunityRow(this)] }
    }
    if (normalized.includes("SET status = 'opted_out'")) {
      this.opportunityStatus = 'opted_out'
      return { rows: [opportunityRow(this)] }
    }
    if (normalized.includes('SELECT o.*, c.trade_name, c.legal_name, c.email_raw')) {
      return {
        rows: [{
          ...opportunityRow(this),
          ...companyJoinRow(),
          email_raw: 'contato@boavida.com.br',
          phone_raw: '(43) 99999-0000',
          summary: 'Analise da oportunidade para Boa Vida.',
          evidence_json: [{ label: 'Fonte publica', value: 'https://boavida.com.br' }],
          total_score: 72,
          score_explanation: 'Score inicial.',
          message_body: 'Mensagem aprovada.',
          evidence_used: [{ label: 'Fonte publica', value: 'https://boavida.com.br' }],
        }],
      }
    }
    if (normalized.includes('FROM public.crm_pipelines p')) {
      return { rows: [{ pipeline_id: ids.pipeline, stage_id: ids.stage }] }
    }
    if (normalized.includes('INSERT INTO public.leads')) return { rows: [{ id: ids.lead }] }
    if (normalized.includes('INSERT INTO public.interactions')) {
      this.lastInteractionDescription = params[2] as string
      return { rows: [] }
    }
    if (normalized.includes("SET status = 'converted'")) {
      this.opportunityStatus = 'converted'
      this.convertedLeadId = params[1] as string
      this.convertedAt = now
      this.convertedBy = params[2] as string
      return { rows: [opportunityRow(this)] }
    }
    if (normalized.includes('INSERT INTO public.radar_outreach_events')) return { rows: [] }
    if (normalized.includes('INSERT INTO public.radar_compliance_logs')) return { rows: [] }
    if (normalized.includes('INSERT INTO public.radar_cost_logs')) return { rows: [] }
    if (normalized.includes('UPDATE public.radar_compliance_logs')) return { rows: [] }
    if (normalized.includes('UPDATE public.radar_message_suggestions')) return { rows: [] }

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
  vi.unstubAllGlobals()
})

function stubRadarJinaFetch() {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
    ok: true,
    json: async () => {
      if (url.startsWith('https://s.jina.ai/')) {
        return {
          data: [
            {
              title: 'Clinica Boa Vida',
              url: 'https://boavida.com.br',
              description: 'Clinica local em Londrina com WhatsApp publico.',
              content: 'Clinica local em Londrina. Contato contato@boavida.com.br WhatsApp (43) 99999-0000.',
            },
            {
              title: 'Clinica Centro',
              url: 'https://clinicacentro.com.br',
              description: 'Atendimento clinico no centro.',
              content: 'Agende consulta pelo contato@clinicacentro.com.br.',
            },
          ],
        }
      }
      return {
        data: {
          title: 'Clinica Boa Vida',
          url: 'https://boavida.com.br',
          content: '# Clinica Boa Vida\n\nAgende consulta pelo contato@boavida.com.br ou WhatsApp (43) 99999-0000.',
        },
      }
    },
  })))
}

function campaignRow() {
  return {
    id: ids.campaign,
    organization_id: ids.org,
    name: 'Clinicas Londrina',
    campaign_type: 'local_niche',
    target_segment: 'Clinicas',
    target_city: 'Londrina',
    target_state: 'PR',
    target_keywords: ['clinica'],
    target_cnaes: [],
    offer_type: 'Diagnostico YUX 48h',
    status: 'draft',
    owner_id: ids.user,
    budget_limit: '100.00',
    daily_limit: 5,
    automation_level: 'human_review_required',
    strategy_profile_key: 'ai_sdr_comercial_1',
    created_by: ids.user,
    created_at: now,
    updated_at: now,
  }
}

function companyRow() {
  return {
    id: ids.company,
    organization_id: ids.org,
    cnpj: null,
    legal_name: 'Clinica Boa Vida',
    trade_name: 'Boa Vida',
    cnae_main: null,
    city: 'Londrina',
    state: 'PR',
    address: null,
    phone_raw: '(43) 99999-0000',
    email_raw: 'contato@boavida.com.br',
    website_url: 'https://boavida.com.br',
    source_type: 'manual',
    source_url: null,
    source_collected_at: now,
    dedupe_key: 'domain:boavida.com.br',
    dedupe_status: 'unique',
    record_status: 'active',
    created_at: now,
    updated_at: now,
  }
}

function dataSourceRow(pool?: Pick<FakeRadarPool, 'dataSourceEnabled'>) {
  return {
    id: ids.dataSource,
    organization_id: null,
    source_key: 'jina_reader',
    source_type: 'jina_reader',
    display_name: 'Jina Reader',
    enabled: pool?.dataSourceEnabled ?? false,
    is_paid: false,
    requires_secret: false,
    terms_notes: 'Leitura publica provider-neutral.',
    default_cost_per_unit: '0.000000',
    rate_limit_per_day: 50,
    created_at: now,
    updated_at: now,
  }
}

function enrichmentRunRow() {
  return {
    id: ids.enrichmentRun,
    organization_id: ids.org,
    campaign_id: ids.campaign,
    company_record_id: ids.company,
    opportunity_id: ids.opportunity,
    data_source_id: null,
    agent_execution_run_id: null,
    status: 'succeeded',
    provider: 'manual',
    input_payload: { sourceType: 'manual' },
    output_payload: { accepted: true },
    error_message: null,
    started_at: now,
    completed_at: now,
    created_at: now,
    updated_at: now,
  }
}

function candidateRow(overrides: {
  sourceType?: string
  title?: string
  snippet?: string
  dedupeKey?: string
  status?: string
  importedCompanyRecordId?: string
  importedOpportunityId?: string
} = {}) {
  const title = overrides.title ?? 'Clinicas Londrina candidato 1'
  return {
    id: ids.candidate,
    organization_id: ids.org,
    campaign_id: ids.campaign,
    enrichment_run_id: ids.enrichmentRun,
    source_type: overrides.sourceType ?? 'jina_search',
    source_url: null,
    title,
    snippet: overrides.snippet ?? 'Resultado assistido para clinicas',
    raw_payload: { generated: true },
    normalized_payload: { tradeName: title, city: 'Londrina', state: 'PR' },
    dedupe_key: overrides.dedupeKey ?? 'search:clinicas-londrina-candidato-1',
    status: overrides.status ?? 'pending_review',
    imported_company_record_id: overrides.importedCompanyRecordId ?? null,
    imported_opportunity_id: overrides.importedOpportunityId ?? null,
    error_message: null,
    reviewed_by: overrides.status && overrides.status !== 'pending_review' ? ids.user : null,
    reviewed_at: overrides.status && overrides.status !== 'pending_review' ? now : null,
    created_at: now,
    updated_at: now,
  }
}

function duplicateRow() {
  return {
    id: ids.duplicate,
    organization_id: ids.org,
    campaign_id: ids.campaign,
    company_record_id: ids.company,
    duplicate_company_record_id: ids.company,
    confidence_score: 90,
    reason: 'Mesmo dominio',
    status: 'pending',
    created_at: now,
    updated_at: now,
  }
}

function opportunityRow(pool: FakeRadarPool) {
  return {
    id: ids.opportunity,
    organization_id: ids.org,
    campaign_id: ids.campaign,
    company_record_id: ids.company,
    status: pool.opportunityStatus,
    owner_id: ids.user,
    priority: 'medium',
    latest_score_id: pool.latestScoreId,
    latest_diagnostic_id: pool.latestDiagnosticId,
    latest_message_suggestion_id: pool.latestMessageSuggestionId,
    converted_lead_id: pool.convertedLeadId,
    converted_at: pool.convertedAt,
    converted_by: pool.convertedBy,
    created_at: now,
    updated_at: now,
  }
}

function companyJoinRow() {
  return {
    trade_name: 'Boa Vida',
    legal_name: 'Clinica Boa Vida',
    city: 'Londrina',
    state: 'PR',
    website_url: 'https://boavida.com.br',
    source_type: 'jina_reader',
    source_url: 'https://boavida.com.br',
  }
}

function scoreRow() {
  return {
    id: ids.score,
    total_score: 72,
    fit_score: 75,
    timing_score: 65,
    pain_score: 70,
    contactability_score: 70,
    budget_score: 60,
    personalization_score: 80,
    explanation: 'Score inicial.',
    created_at: now,
  }
}

function diagnosticRow() {
  return {
    id: ids.diagnostic,
    summary: 'Analise da oportunidade para Boa Vida.',
    detected_services: [],
    detected_channels: [],
    pain_hypotheses: ['Follow-up'],
    recommended_offer: 'Diagnostico YUX 48h',
    evidence_json: [{ label: 'Fonte publica', value: 'https://boavida.com.br' }],
    risk_flags: [],
    strategy_profile_key: 'ai_sdr_comercial_1',
    ai_cost_estimate: '0.250000',
    created_at: now,
  }
}

function messageRow() {
  return {
    id: ids.message,
    channel: 'email',
    subject: 'Analise rapida para Boa Vida',
    body: 'Mensagem aprovada.',
    personalization_notes: 'Revisao humana obrigatoria.',
    evidence_used: [{ label: 'Fonte publica', value: 'https://boavida.com.br' }],
    policy_decision: {
      status: 'requires_human_approval',
      canSendAutomatically: false,
      canConvertToLead: true,
      blockedReasons: [],
      requiredReviewFields: ['message', 'evidence', 'risk_flags'],
    },
    status: 'approved',
    approved_by: ids.user,
    approved_at: now,
    created_at: now,
    updated_at: now,
  }
}

function buildAuthStore(role = 'yux_admin') {
  const token = `session-token-${role}`
  const authStore = new FakeAuthStore()
  authStore.sessionHash = hashSessionToken(token)
  authStore.user = {
    id: role.startsWith('client') ? ids.clientUser : ids.user,
    email: `${role}@yux.com.br`,
    name: 'User',
    role,
  }

  return { authStore, token }
}

function sessionCookie(rawToken: string) {
  return `${testEnv.SESSION_COOKIE_NAME}=${rawToken}`
}

describe('radar routes', () => {
  it('rejects unauthenticated radar requests', async () => {
    app = await buildServer(testEnv, {
      authStore: new FakeAuthStore(),
      pool: new FakeRadarPool() as never,
      jobQueue: noopJobQueue,
    })

    const response = await app.inject({ method: 'GET', url: `/api/radar/campaigns?organizationId=${ids.org}` })

    expect(response.statusCode).toBe(401)
    expect(response.json()).toEqual({ error: 'not_authenticated' })
  })

  it('denies clients without an active Radar entitlement', async () => {
    const { authStore, token } = buildAuthStore('client_admin')
    app = await buildServer(testEnv, { authStore, pool: new FakeRadarPool() as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'GET',
      url: `/api/radar/campaigns?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(403)
    expect(response.json()).toMatchObject({ error: 'radar_forbidden' })
  })

  it('allows the contracted client to list campaigns and revokes access when disabled', async () => {
    const { authStore, token } = buildAuthStore('client_admin')
    const pool = new FakeRadarPool()
    pool.clientRadarAllowed = true
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const request = { method: 'GET' as const, url: `/api/radar/campaigns?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) } }
    expect((await app.inject(request)).statusCode).toBe(200)
    pool.clientRadarAllowed = false
    expect((await app.inject(request)).statusCode).toBe(403)
  })

  it('creates and lists radar campaigns', async () => {
    const { authStore, token } = buildAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakeRadarPool() as never, jobQueue: noopJobQueue })

    const created = await app.inject({
      method: 'POST',
      url: '/api/radar/campaigns',
      headers: { cookie: sessionCookie(token) },
      payload: {
        organizationId: ids.org,
        name: 'Clinicas Londrina',
        targetSegment: 'Clinicas',
        targetCity: 'Londrina',
        targetState: 'PR',
        offerType: 'Diagnostico YUX 48h',
        dailyLimit: 5,
      },
    })
    const listed = await app.inject({
      method: 'GET',
      url: `/api/radar/campaigns?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ id: ids.campaign, organizationId: ids.org, targetCity: 'Londrina' })
    expect(listed.statusCode).toBe(200)
    expect(listed.json()).toEqual([expect.objectContaining({ id: ids.campaign, dailyLimit: 5 })])
  })

  it('creates a three-state industrial-kitchen campaign without inventing a city', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method: 'POST', url: '/api/radar/campaigns',
      headers: { cookie: sessionCookie(token) }, payload: { organizationId: ids.org,
        name: 'Cozinhas industriais', campaignType: 'regional_b2b', targetSegment: 'Cozinhas industriais',
        targetStates: ['MG', 'SP', 'PR'], productFocus: ['massas frescas', 'massas congeladas'],
        offerType: 'Fornecimento de massas', dailyLimit: 10 } })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ campaignType: 'regional_b2b', targetStates: ['MG', 'SP', 'PR'], targetCity: '' })
    const insert = pool.queries.find(query => query.sql.includes('INSERT INTO public.radar_campaigns'))
    expect(insert?.params).toContainEqual(['MG', 'SP', 'PR'])
  })

  it.each([{states:['BA']},{states:['BA','SC']}])('creates a configurable statewide campaign for $states', async ({states}) => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method:'POST',url:'/api/radar/campaigns',
      headers:{cookie:sessionCookie(token)},payload:{organizationId:ids.org,name:'Pesquisa editável',
        campaignType:'regional_b2b',targetSegment:'Empresas',targetStates:states,
        offerType:'Consultoria',searchConfiguration:{cities:[]} } })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({targetStates:states,targetCity:''})
    const insert = pool.queries.find(query => query.sql.includes('INSERT INTO public.radar_campaigns'))!
    expect(insert.params[9]).toEqual(states)
    expect(JSON.parse(insert.params[14] as string).cities).toEqual([])
  })

  it('lists and updates governed radar data sources', async () => {
    const { authStore, token } = buildAuthStore()
    app = await buildServer(testEnv, { authStore, pool: new FakeRadarPool() as never, jobQueue: noopJobQueue })

    const list = await app.inject({
      method: 'GET',
      url: `/api/radar/data-sources?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) },
    })
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/radar/data-sources/${ids.dataSource}`,
      headers: { cookie: sessionCookie(token) },
      payload: { enabled: true, rateLimitPerDay: 10 },
    })

    expect(list.statusCode).toBe(200)
    expect(list.json()[0]).toMatchObject({ sourceKey: 'jina_reader', enabled: false })
    expect(update.statusCode).toBe(200)
    expect(update.json()).toMatchObject({ sourceKey: 'jina_reader', enabled: true, rateLimitPerDay: 10 })
  })

  it('prevents operators from enabling CNPJa even when they can manage Radar', async () => {
    const { authStore, token } = buildAuthStore('yux_operator')
    const pool = new FakeRadarPool()
    pool.protectedSourceType = 'cnpja_advanced_search'
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method: 'PATCH', url: `/api/radar/data-sources/${ids.dataSource}`,
      headers: { cookie: sessionCookie(token) }, payload: { enabled: true } })
    expect(response.statusCode).toBe(403)
    expect(pool.queries.some(query => query.sql.includes('UPDATE public.radar_data_sources'))).toBe(false)
  })

  it('blocks CNPJa discovery outside the YUX internal organization before reading provider credentials', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.osmInternalOrganization = false
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method: 'POST', url: `/api/radar/campaigns/${ids.campaign}/search-cnpja`,
      headers: { cookie: sessionCookie(token) }, payload: { organizationId: ids.org, city: 'Curitiba', state: 'PR', limit: 2 } })
    expect(response.statusCode).toBe(403)
    expect(pool.queries.some(query => query.sql.includes('FROM public.platform_provider_connections'))).toBe(false)
  })

  it('rejects a CNPJa city without UF before consuming provider credits', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method: 'POST', url: `/api/radar/campaigns/${ids.campaign}/search-cnpja`,
      headers: { cookie: sessionCookie(token) }, payload: { organizationId: ids.org, city: 'Curitiba', limit: 2 } })
    expect(response.statusCode).toBe(400)
    expect(pool.queries.some(query => query.sql.includes('FROM public.platform_provider_connections'))).toBe(false)
  })

  it('keeps local place previews disabled until the catalog is enabled', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method: 'POST', url: `/api/radar/campaigns/${ids.campaign}/preview-places`,
      headers: { cookie: sessionCookie(token) }, payload: { organizationId: ids.org,
        sourceType: 'brave_place_search', query: 'clínicas', city: 'Curitiba', state: 'PR', limit: 2 } })
    expect(response.statusCode).toBe(409)
    expect(response.json()).toMatchObject({ error: 'radar_source_disabled' })
    expect(pool.queries.some(query => query.sql.includes('INSERT INTO public.radar_candidate_records'))).toBe(false)
  })

  it('requires an approved estimated unit cost before activating a paid place source', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.protectedSourceType = 'serper_places'
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method: 'PATCH', url: `/api/radar/data-sources/${ids.dataSource}`,
      headers: { cookie: sessionCookie(token) }, payload: { enabled: true } })
    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: 'radar_source_cost_approval_required' })
  })

  it('adds a company to a radar campaign', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/campaigns/${ids.campaign}/companies`,
      headers: { cookie: sessionCookie(token) },
      payload: {
        organizationId: ids.org,
        tradeName: 'Boa Vida',
        legalName: 'Clinica Boa Vida',
        city: 'Londrina',
        state: 'PR',
        emailRaw: 'contato@boavida.com.br',
        websiteUrl: 'https://boavida.com.br',
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      company: { id: ids.company, dedupeKey: 'domain:boavida.com.br' },
      opportunity: { id: ids.opportunity, status: 'raw', company: { tradeName: 'Boa Vida' } },
    })
    expect(pool.queries.some(query => query.sql.includes('INSERT INTO public.radar_enrichment_runs'))).toBe(true)
    expect(pool.queries.some(query => query.sql.includes('INSERT INTO public.radar_cost_logs'))).toBe(true)
  })

  it('imports radar companies from a small CSV batch', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/campaigns/${ids.campaign}/import-csv`,
      headers: { cookie: sessionCookie(token) },
      payload: {
        organizationId: ids.org,
        csv: 'trade_name,city,state,website_url\nBoa Vida,Londrina,PR,https://boavida.com.br\n,Londrina,PR,',
        analyzeAfterImport: true,
      },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      imported: [expect.objectContaining({ id: ids.opportunity })],
      analyzed: [expect.objectContaining({ id: ids.opportunity, status: 'diagnosing' })],
      analysisRequests: [expect.objectContaining({ runId: ids.enrichmentRun, opportunityId: ids.opportunity })],
      issues: [expect.objectContaining({ code: 'missing_name_or_site' })],
      runId: ids.enrichmentRun,
    })
    expect(pool.queries.some(query => query.sql.includes("'analysis','pending','yux_agent_runtime'"))).toBe(true)
  })

  it('blocks url import when Jina Reader source is disabled', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.dataSourceEnabled = false
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/campaigns/${ids.campaign}/import-urls`,
      headers: { cookie: sessionCookie(token) },
      payload: { organizationId: ids.org, urls: ['https://boavida.com.br'] },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      imported: [],
      issues: [expect.objectContaining({ code: 'source_disabled' })],
      runId: ids.enrichmentRun,
    })
  })

  it('imports urls when Jina Reader source is enabled', async () => {
    const { authStore, token } = buildAuthStore()
    stubRadarJinaFetch()
    const pool = new FakeRadarPool()
    pool.dataSourceEnabled = true
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/campaigns/${ids.campaign}/import-urls`,
      headers: { cookie: sessionCookie(token) },
      payload: { organizationId: ids.org, urls: ['https://boavida.com.br'] },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      imported: [expect.objectContaining({ id: ids.opportunity })],
      issues: [],
      runId: ids.enrichmentRun,
    })
    expect(pool.queries.some(query => query.sql.includes('INSERT INTO public.radar_company_enrichment'))).toBe(true)
  })

  it('creates pending candidates from assisted web search', async () => {
    const { authStore, token } = buildAuthStore()
    stubRadarJinaFetch()
    const pool = new FakeRadarPool()
    pool.dataSourceEnabled = true
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/campaigns/${ids.campaign}/search-web`,
      headers: { cookie: sessionCookie(token) },
      payload: { organizationId: ids.org, query: 'clinicas', city: 'Londrina', state: 'PR', sourceType: 'jina_search', limit: 2 },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      candidates: [
        expect.objectContaining({ status: 'pending_review', sourceType: 'jina_search' }),
        expect.objectContaining({ status: 'pending_review', sourceType: 'jina_search' }),
      ],
      issues: [],
      runId: ids.enrichmentRun,
    })
  })

  it('returns an issue when assisted search source is disabled', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.dataSourceEnabled = false
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/campaigns/${ids.campaign}/search-web`,
      headers: { cookie: sessionCookie(token) },
      payload: { organizationId: ids.org, query: 'clinicas', sourceType: 'web_search', limit: 2 },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      candidates: [],
      issues: [expect.objectContaining({ code: 'source_disabled' })],
      runId: ids.enrichmentRun,
    })
  })

  it('keeps OSM discovery blocked without a loaded municipal snapshot', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.dataSourceEnabled = true
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method: 'POST', url: `/api/radar/campaigns/${ids.campaign}/search-osm`,
      headers: { cookie: sessionCookie(token) }, payload: { organizationId: ids.org, limit: 2 } })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ candidates: [], issues: [expect.objectContaining({ code: 'snapshot_missing' })] })
    expect(pool.queries.some(query => query.sql.includes('FROM public.radar_osm_places'))).toBe(false)
  })

  it('does not expose the OSM pilot to client organizations', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.dataSourceEnabled = true
    pool.osmSnapshotActive = true
    pool.osmInternalOrganization = false
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const response = await app.inject({ method: 'POST', url: `/api/radar/campaigns/${ids.campaign}/search-osm`,
      headers: { cookie: sessionCookie(token) }, payload: { organizationId: ids.org, limit: 2 } })
    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({ candidates: [], issues: [expect.objectContaining({ code: 'pilot_internal_only' })] })
    expect(pool.queries.some(query => query.sql.includes('FROM public.radar_osm_places'))).toBe(false)
  })

  it('discovers OSM candidates without calling any external provider and does not repeat them', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.dataSourceEnabled = true
    pool.osmSnapshotActive = true
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })
    const request = () => app!.inject({ method: 'POST', url: `/api/radar/campaigns/${ids.campaign}/search-osm`,
      headers: { cookie: sessionCookie(token) }, payload: { organizationId: ids.org, limit: 2 } })
    const first = await request()
    const second = await request()
    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({ candidates: [
      expect.objectContaining({ sourceType: 'osm_extract', status: 'pending_review' }),
      expect.objectContaining({ sourceType: 'osm_extract', status: 'pending_review' }),
    ], issues: [] })
    expect(second.json().candidates).toEqual([])
    expect(pool.queries.some(query => query.sql.includes('FROM public.radar_osm_places'))).toBe(true)
    expect(pool.queries.some(query => query.sql.includes("'osm_extract'")
      && query.sql.includes('INSERT INTO public.radar_candidate_records')
      && (JSON.parse(query.params[6] as string) as { osmSources: unknown[] }).osmSources.length === 2)).toBe(true)
    expect(pool.queries.some(query => /jina|cnpja/i.test(query.sql))).toBe(false)
    const report = await app.inject({ method: 'GET', url: `/api/radar/campaigns/${ids.campaign}/osm-report?organizationId=${ids.org}`,
      headers: { cookie: sessionCookie(token) } })
    expect(report.statusCode).toBe(200)
    expect(report.json()).toMatchObject({ candidates: 2, withSite: 1, verifiedSites: 0, estimatedApiCostUsd: 0 })
  })

  it('lists imports and discards radar candidates', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const candidateList = await app.inject({
      method: 'GET',
      url: `/api/radar/campaigns/${ids.campaign}/candidates`,
      headers: { cookie: sessionCookie(token) },
    })
    const importResponse = await app.inject({
      method: 'POST',
      url: `/api/radar/candidates/${ids.candidate}/import`,
      headers: { cookie: sessionCookie(token) },
      payload: { analyzeAfterImport: true },
    })
    pool.candidateStatus = 'pending_review'
    const discardResponse = await app.inject({
      method: 'POST',
      url: `/api/radar/candidates/${ids.candidate}/discard`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(candidateList.statusCode).toBe(200)
    expect(candidateList.json()[0]).toMatchObject({ id: ids.candidate, status: 'pending_review' })
    expect(importResponse.statusCode).toBe(200)
    expect(importResponse.json()).toMatchObject({
      candidate: { status: 'imported', importedOpportunityId: ids.opportunity },
      opportunity: { id: ids.opportunity, status: 'diagnosing' },
      analyzed: [expect.objectContaining({ id: ids.opportunity, status: 'diagnosing' })],
      analysisRequests: [expect.objectContaining({ runId: ids.enrichmentRun })],
    })
    expect(discardResponse.statusCode).toBe(200)
    expect(discardResponse.json()).toMatchObject({ status: 'discarded' })
  })

  it('lists and updates duplicate candidates', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const list = await app.inject({
      method: 'GET',
      url: `/api/radar/campaigns/${ids.campaign}/duplicates`,
      headers: { cookie: sessionCookie(token) },
    })
    const update = await app.inject({
      method: 'PATCH',
      url: `/api/radar/duplicates/${ids.duplicate}`,
      headers: { cookie: sessionCookie(token) },
      payload: { status: 'dismissed' },
    })

    expect(list.statusCode).toBe(200)
    expect(list.json()[0]).toMatchObject({ id: ids.duplicate, status: 'pending' })
    expect(update.statusCode).toBe(200)
    expect(update.json()).toMatchObject({ id: ids.duplicate, status: 'dismissed' })
  })

  it('lists radar opportunities campaign metrics and enrichment runs', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.opportunityStatus = 'review_pending'
    pool.latestDiagnosticId = ids.diagnostic
    pool.latestScoreId = ids.score
    pool.latestMessageSuggestionId = ids.message
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const opportunities = await app.inject({
      method: 'GET',
      url: `/api/radar/campaigns/${ids.campaign}/opportunities`,
      headers: { cookie: sessionCookie(token) },
    })
    const metrics = await app.inject({
      method: 'GET',
      url: `/api/radar/campaigns/${ids.campaign}/metrics`,
      headers: { cookie: sessionCookie(token) },
    })
    const runs = await app.inject({
      method: 'GET',
      url: `/api/radar/campaigns/${ids.campaign}/runs`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(opportunities.statusCode).toBe(200)
    expect(opportunities.json()).toEqual([
      expect.objectContaining({
        id: ids.opportunity,
        company: expect.objectContaining({ tradeName: 'Boa Vida' }),
        latestScore: expect.objectContaining({ totalScore: 72 }),
        latestMessageSuggestion: expect.objectContaining({
          policyDecision: expect.objectContaining({ canSendAutomatically: false }),
        }),
      }),
    ])
    expect(metrics.statusCode).toBe(200)
    expect(metrics.json()).toMatchObject({
      companies: 1,
      opportunities: 1,
      reviewPending: 1,
      estimatedCost: 0.25,
      sourceBreakdown: [
        expect.objectContaining({ sourceType: 'manual', companies: 1, opportunities: 1 }),
        expect.objectContaining({ sourceType: 'jina_search', candidates: 2 }),
      ],
    })
    expect(runs.statusCode).toBe(200)
    expect(runs.json()[0]).toMatchObject({ provider: 'manual', status: 'succeeded' })
  })

  it('queues provider-neutral analysis and marks the opportunity as diagnosing', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/opportunities/${ids.opportunity}/run-analysis`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({
      runId: ids.enrichmentRun,
      opportunityId: ids.opportunity,
      status: 'pending',
      opportunity: { id: ids.opportunity, status: 'diagnosing' },
    })
    expect(
      pool.queries.some((query) => query.sql.includes("'analysis','pending','yux_agent_runtime'")),
    ).toBe(true)
  })

  it('enforces small batch limits and enriches opportunity batches', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const tooLarge = await app.inject({
      method: 'POST',
      url: '/api/radar/opportunities/batch/enrich',
      headers: { cookie: sessionCookie(token) },
      payload: { opportunityIds: Array.from({ length: 11 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`) },
    })
    const success = await app.inject({
      method: 'POST',
      url: '/api/radar/opportunities/batch/enrich',
      headers: { cookie: sessionCookie(token) },
      payload: { opportunityIds: [ids.opportunity] },
    })

    expect(tooLarge.statusCode).toBe(400)
    expect(success.statusCode).toBe(200)
    expect(success.json()).toMatchObject({ enriched: [expect.objectContaining({ id: ids.opportunity, status: 'enriched' })] })
  })

  it('queues opportunity batches while preserving the analysis ledger', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: '/api/radar/opportunities/batch/analyze',
      headers: { cookie: sessionCookie(token) },
      payload: { opportunityIds: [ids.opportunity] },
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({
      analyzed: [expect.objectContaining({ id: ids.opportunity, status: 'diagnosing' })],
      requests: [expect.objectContaining({ runId: ids.enrichmentRun, opportunityId: ids.opportunity })],
    })
    expect(
      pool.queries.some((query) => query.sql.includes("'analysis','pending','yux_agent_runtime'")),
    ).toBe(true)
  })

  it('reviews and opts out radar opportunities', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const review = await app.inject({
      method: 'PATCH',
      url: `/api/radar/opportunities/${ids.opportunity}/review`,
      headers: { cookie: sessionCookie(token) },
      payload: { status: 'approved' },
    })
    const optOut = await app.inject({
      method: 'POST',
      url: `/api/radar/opportunities/${ids.opportunity}/opt-out`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(review.statusCode).toBe(200)
    expect(review.json()).toMatchObject({ id: ids.opportunity, status: 'approved' })
    expect(optOut.statusCode).toBe(200)
    expect(optOut.json()).toMatchObject({ id: ids.opportunity, status: 'opted_out' })
  })

  it('converts approved radar opportunities to CRM leads', async () => {
    const { authStore, token } = buildAuthStore()
    const pool = new FakeRadarPool()
    pool.opportunityStatus = 'approved'
    pool.latestDiagnosticId = ids.diagnostic
    pool.latestScoreId = ids.score
    pool.latestMessageSuggestionId = ids.message
    app = await buildServer(testEnv, { authStore, pool: pool as never, jobQueue: noopJobQueue })

    const response = await app.inject({
      method: 'POST',
      url: `/api/radar/opportunities/${ids.opportunity}/convert-to-lead`,
      headers: { cookie: sessionCookie(token) },
    })

    expect(response.statusCode).toBe(201)
    expect(response.json()).toMatchObject({
      leadId: ids.lead,
      opportunity: {
        id: ids.opportunity,
        status: 'converted',
        convertedLeadId: ids.lead,
        convertedBy: ids.user,
      },
    })
    const leadInsert = pool.queries.find(query => query.sql.includes('INSERT INTO public.leads'))
    const attribution = JSON.parse(leadInsert?.params[8] as string)
    expect(attribution).toMatchObject({
      source: 'radar_comercial',
      radarOpportunityId: ids.opportunity,
      sourceType: 'jina_reader',
      sourceUrl: 'https://boavida.com.br',
      score: 72,
      convertedBy: ids.user,
    })
    expect(attribution.evidence).toContain('Fonte publica: https://boavida.com.br')
    expect(pool.lastInteractionDescription ?? '').toContain('Origem: Radar Comercial')
    expect(pool.lastInteractionDescription ?? '').toContain('Fonte: jina_reader (https://boavida.com.br)')
    expect(pool.lastInteractionDescription ?? '').toContain('Evidencias:')
  })
})
